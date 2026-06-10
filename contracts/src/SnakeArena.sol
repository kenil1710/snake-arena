// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {IPrizeDistributor} from "./interfaces/IPrizeDistributor.sol";

/// @title SnakeArena
/// @notice Rolling Snake tournaments on Base. Players pay a USDC entry fee per game
///         attempt, the server-authoritative backend signs verified final scores, and
///         when a tournament ends the prize pool is split between the top scorers and
///         the treasury, with the next tournament of the same tier starting in the
///         same transaction.
///
///         Four tiers run in parallel:
///         - ONE_USD_DAILY        $1  entry, 24h window
///         - FIVE_USD_DAILY       $5  entry, 24h window
///         - TWENTYFIVE_USD_DAILY $25 entry, 24h window
///         - ONE_USD_HOURLY       $1  entry, 1h window
///
/// @dev    Anti-cheat: the contract never trusts client scores. `submitScore` requires
///         an ECDSA signature from `trustedSigner` (the backend) over
///         `keccak256(abi.encode(tournamentId, player, score, nonce, address(this), block.chainid))`
///         (EIP-191 prefixed), which binds the signature to this player, tournament,
///         contract, and chain. Single-use nonces prevent replay.
contract SnakeArena is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    // ---------------------------------------------------------------------
    // Types
    // ---------------------------------------------------------------------

    /// @notice The four tournament products running in parallel.
    enum TournamentTier {
        ONE_USD_DAILY,
        FIVE_USD_DAILY,
        TWENTYFIVE_USD_DAILY,
        ONE_USD_HOURLY
    }

    struct Tournament {
        uint256 id;
        TournamentTier tier;
        uint256 startTime;
        uint256 endTime;
        uint256 prizePool; // total USDC collected from entries (6 decimals)
        uint256 entryFee; // USDC per entry (6 decimals)
        bool finalized;
        address[] players; // unique players, in order of first entry
    }

    struct PlayerEntry {
        address wallet;
        uint256 bestScore;
        uint256 lastSubmissionTime; // when bestScore was set; tie-breaker (earlier wins)
        uint256 entryCount;
    }

    // ---------------------------------------------------------------------
    // Constants
    // ---------------------------------------------------------------------

    /// @dev USDC has 6 decimals, so $1 == 1e6 units.
    uint256 private constant ONE_USD = 1e6;
    uint256 private constant DAILY_DURATION = 24 hours;
    uint256 private constant HOURLY_DURATION = 1 hours;
    /// @dev At most 3 players are paid out of a prize pool.
    uint256 private constant MAX_WINNERS = 3;

    // ---------------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------------

    /// @notice Payment token (USDC on Base).
    IERC20 public immutable usdc;

    /// @notice Helper contract that splits prize pools on finalization.
    IPrizeDistributor public immutable prizeDistributor;

    /// @notice Backend key whose signatures authenticate submitted scores.
    address public trustedSigner;

    /// @notice Receiver of the platform's 10% cut of every prize pool.
    address public treasury;

    /// @notice Next tournament id to assign (ids start at 1; 0 means "no tournament").
    uint256 public nextTournamentId = 1;

    /// @notice Tournament data by id. The auto-getter omits the `players` array;
    ///         use `getTournament` to read it.
    mapping(uint256 tournamentId => Tournament) public tournaments;

    /// @notice Per-tournament player state.
    mapping(uint256 tournamentId => mapping(address player => PlayerEntry)) public entries;

    /// @notice Display name bound to a wallet on its first-ever entry.
    mapping(address player => string) public usernames;

    /// @notice The live tournament id for each tier.
    mapping(TournamentTier tier => uint256 tournamentId) public currentTournamentId;

    /// @notice Score-signature nonces that have been consumed (global, single-use).
    mapping(bytes32 nonce => bool used) public usedNonces;

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

    event TournamentStarted(uint256 indexed id, TournamentTier tier, uint256 endTime);
    event EnteredTournament(uint256 indexed tournamentId, address indexed player, uint256 entryNumber);
    event ScoreSubmitted(uint256 indexed tournamentId, address indexed player, uint256 score);
    event TournamentFinalized(uint256 indexed tournamentId, address[] winners, uint256[] payouts);
    event UsernameSet(address indexed player, string username);
    event TrustedSignerUpdated(address indexed previousSigner, address indexed newSigner);
    event TreasuryUpdated(address indexed previousTreasury, address indexed newTreasury);

    // ---------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------

    error ZeroAddress();
    error TournamentNotFound();
    error TournamentNotActive();
    error TournamentNotEnded();
    error TournamentAlreadyFinalized();
    error NotEntered();
    error NonceAlreadyUsed();
    error InvalidSignature();

    // ---------------------------------------------------------------------
    // Constructor
    // ---------------------------------------------------------------------

    /// @notice Deploys the arena and immediately starts the first tournament of every
    ///         tier, aligned to its natural UTC window (midnight for dailies, the top
    ///         of the hour for hourlies).
    /// @param usdc_             USDC token address.
    /// @param trustedSigner_    Backend score-signing address.
    /// @param treasury_         Platform fee receiver (should be the multisig).
    /// @param prizeDistributor_ Deployed PrizeDistributor (its `setArena` must be
    ///                          pointed at this contract after deployment).
    constructor(IERC20 usdc_, address trustedSigner_, address treasury_, IPrizeDistributor prizeDistributor_)
        Ownable(msg.sender)
    {
        if (
            address(usdc_) == address(0) || trustedSigner_ == address(0) || treasury_ == address(0)
                || address(prizeDistributor_) == address(0)
        ) revert ZeroAddress();

        usdc = usdc_;
        trustedSigner = trustedSigner_;
        treasury = treasury_;
        prizeDistributor = prizeDistributor_;

        for (uint256 i = 0; i < 4; i++) {
            TournamentTier tier = TournamentTier(i);
            uint256 duration = _tierDuration(tier);
            // Anchor the first window to the period boundary containing `now`.
            _startTournament(tier, block.timestamp - (block.timestamp % duration));
        }
    }

    // ---------------------------------------------------------------------
    // Core
    // ---------------------------------------------------------------------

    /// @notice Enters the live tournament of `tier`, paying its USDC entry fee.
    ///         Each entry buys one fresh game attempt; players may enter as many
    ///         times as they like, and only their best score counts.
    /// @dev Pulls `entryFee` USDC from the caller (requires prior approval), registers
    ///      the player on first entry, and binds `username` to the wallet on the
    ///      wallet's first-ever entry (immutable afterwards; ignored on later entries).
    /// @param tier     Tournament tier to enter.
    /// @param username Desired display name; only used on the wallet's first entry,
    ///                 and ignored if empty.
    function enterTournament(TournamentTier tier, string calldata username) external whenNotPaused {
        uint256 tournamentId = currentTournamentId[tier];
        Tournament storage tournament = tournaments[tournamentId];

        // The window must still be open. If it has lapsed, the keeper/cron needs to
        // finalize it, which starts the next one.
        if (block.timestamp >= tournament.endTime) revert TournamentNotActive();

        usdc.safeTransferFrom(msg.sender, address(this), tournament.entryFee);
        tournament.prizePool += tournament.entryFee;

        PlayerEntry storage entry = entries[tournamentId][msg.sender];
        if (entry.entryCount == 0) {
            entry.wallet = msg.sender;
            tournament.players.push(msg.sender);
        }
        entry.entryCount += 1;

        if (bytes(usernames[msg.sender]).length == 0 && bytes(username).length != 0) {
            usernames[msg.sender] = username;
            emit UsernameSet(msg.sender, username);
        }

        emit EnteredTournament(tournamentId, msg.sender, entry.entryCount);
    }

    /// @notice Submits a backend-signed final score for the caller.
    /// @dev The signature must be produced by `trustedSigner` over the EIP-191 prefixed
    ///      hash of `abi.encode(tournamentId, msg.sender, score, nonce, address(this), block.chainid)`.
    ///      The nonce is single-use (global). The entry's `bestScore` only moves up:
    ///      lower or equal scores are accepted (their nonce is still consumed) but
    ///      change nothing, preserving the earlier tie-breaker timestamp.
    ///      Submissions are accepted until the tournament is finalized so that game
    ///      sessions straddling `endTime` still count.
    /// @param tournamentId Tournament the score belongs to.
    /// @param score        Final score validated by the game server.
    /// @param nonce        Single-use value chosen by the backend.
    /// @param signature    65-byte ECDSA signature from `trustedSigner`.
    function submitScore(uint256 tournamentId, uint256 score, bytes32 nonce, bytes calldata signature)
        external
        whenNotPaused
    {
        Tournament storage tournament = tournaments[tournamentId];
        if (tournament.endTime == 0) revert TournamentNotFound();
        if (tournament.finalized) revert TournamentAlreadyFinalized();

        PlayerEntry storage entry = entries[tournamentId][msg.sender];
        if (entry.entryCount == 0) revert NotEntered();
        if (usedNonces[nonce]) revert NonceAlreadyUsed();

        bytes32 digest =
            keccak256(abi.encode(tournamentId, msg.sender, score, nonce, address(this), block.chainid));
        if (digest.toEthSignedMessageHash().recover(signature) != trustedSigner) revert InvalidSignature();

        usedNonces[nonce] = true;

        if (score > entry.bestScore) {
            entry.bestScore = score;
            entry.lastSubmissionTime = block.timestamp;
        }

        emit ScoreSubmitted(tournamentId, msg.sender, score);
    }

    /// @notice Finalizes an ended tournament: pays the winners and the treasury via the
    ///         PrizeDistributor, then starts the next tournament of the same tier in
    ///         the same transaction.
    /// @dev Callable by anyone once `block.timestamp >= endTime` (a cron keeper calls it
    ///      every minute in practice). Ranking is a single O(n) pass selecting the top 3
    ///      by best score, with earlier `lastSubmissionTime` breaking ties and players
    ///      who never submitted ranking last among equal scores. If the call is late by
    ///      one or more full periods, the next window fast-forwards to the period
    ///      containing `now` (boundaries stay aligned).
    /// @param tournamentId Tournament to finalize.
    function finalizeTournament(uint256 tournamentId) external whenNotPaused nonReentrant {
        Tournament storage tournament = tournaments[tournamentId];
        if (tournament.endTime == 0) revert TournamentNotFound();
        if (tournament.finalized) revert TournamentAlreadyFinalized();
        if (block.timestamp < tournament.endTime) revert TournamentNotEnded();

        tournament.finalized = true;

        address[] memory winners = new address[](0);
        uint256[] memory payouts = new uint256[](0);
        uint256 pool = tournament.prizePool;

        if (pool > 0 && tournament.players.length > 0) {
            address[] memory ranked = _rankTopPlayers(tournamentId);
            usdc.safeTransfer(address(prizeDistributor), pool);
            (winners, payouts) = prizeDistributor.distribute(usdc, ranked, pool, treasury);
        }

        emit TournamentFinalized(tournamentId, winners, payouts);

        // Only the current tournament of a tier can ever be unfinalized, so finalizing
        // always rolls the tier over to a fresh window anchored at the old endTime.
        _startTournament(tournament.tier, tournament.endTime);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    /// @notice Returns the live tournament for a tier (including its players array).
    /// @param tier Tier to query.
    function getActiveTournament(TournamentTier tier) external view returns (Tournament memory) {
        return tournaments[currentTournamentId[tier]];
    }

    /// @notice Returns a tournament by id (including its players array).
    /// @param tournamentId Tournament to query.
    function getTournament(uint256 tournamentId) external view returns (Tournament memory) {
        return tournaments[tournamentId];
    }

    /// @notice Returns the top `topN` entries of a tournament, ranked best-first using
    ///         the same ordering as finalization.
    /// @dev O(n * topN) partial selection sort over a memory copy — intended for
    ///      off-chain reads, not for on-chain callers.
    /// @param tournamentId Tournament to rank.
    /// @param topN         Maximum number of entries to return.
    /// @return top Ranked entries, length `min(topN, playerCount)`.
    function getLeaderboard(uint256 tournamentId, uint256 topN)
        external
        view
        returns (PlayerEntry[] memory top)
    {
        address[] storage players = tournaments[tournamentId].players;
        uint256 playerCount = players.length;
        uint256 resultCount = topN < playerCount ? topN : playerCount;

        PlayerEntry[] memory all = new PlayerEntry[](playerCount);
        for (uint256 i = 0; i < playerCount; i++) {
            all[i] = entries[tournamentId][players[i]];
        }

        for (uint256 i = 0; i < resultCount; i++) {
            uint256 best = i;
            for (uint256 j = i + 1; j < playerCount; j++) {
                if (
                    _outranks(
                        all[j].bestScore, all[j].lastSubmissionTime, all[best].bestScore, all[best].lastSubmissionTime
                    )
                ) {
                    best = j;
                }
            }
            if (best != i) {
                (all[i], all[best]) = (all[best], all[i]);
            }
        }

        top = new PlayerEntry[](resultCount);
        for (uint256 i = 0; i < resultCount; i++) {
            top[i] = all[i];
        }
    }

    /// @notice Returns the current prize pool of a tournament, in USDC units.
    /// @param tournamentId Tournament to query.
    function getPrizePool(uint256 tournamentId) external view returns (uint256) {
        return tournaments[tournamentId].prizePool;
    }

    // ---------------------------------------------------------------------
    // Admin
    // ---------------------------------------------------------------------

    /// @notice Rotates the backend score-signing key.
    /// @dev Owner-only. Pending signatures from the old key become invalid immediately.
    /// @param newSigner New trusted signer; must be non-zero.
    function setTrustedSigner(address newSigner) external onlyOwner {
        if (newSigner == address(0)) revert ZeroAddress();
        emit TrustedSignerUpdated(trustedSigner, newSigner);
        trustedSigner = newSigner;
    }

    /// @notice Updates the treasury that receives the platform's prize-pool cut.
    /// @dev Owner-only.
    /// @param newTreasury New treasury; must be non-zero.
    function setTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert ZeroAddress();
        emit TreasuryUpdated(treasury, newTreasury);
        treasury = newTreasury;
    }

    /// @notice Circuit breaker: halts entries, score submissions, and finalizations.
    /// @dev Owner-only. Funds stay in the contract until unpaused.
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Lifts the circuit breaker.
    /// @dev Owner-only.
    function unpause() external onlyOwner {
        _unpause();
    }

    // ---------------------------------------------------------------------
    // Internals
    // ---------------------------------------------------------------------

    /// @dev Starts the next tournament of `tier`. `anchorStart` must be a period
    ///      boundary at or before `now`; if more than one full period has elapsed
    ///      since then, the window fast-forwards to the period containing `now` so a
    ///      late finalization never spawns an already-ended tournament.
    function _startTournament(TournamentTier tier, uint256 anchorStart) private returns (uint256 id) {
        uint256 duration = _tierDuration(tier);
        uint256 startTime = anchorStart;
        if (block.timestamp >= startTime + duration) {
            startTime += ((block.timestamp - startTime) / duration) * duration;
        }

        id = nextTournamentId++;
        Tournament storage tournament = tournaments[id];
        tournament.id = id;
        tournament.tier = tier;
        tournament.startTime = startTime;
        tournament.endTime = startTime + duration;
        tournament.entryFee = _tierEntryFee(tier);
        currentTournamentId[tier] = id;

        emit TournamentStarted(id, tier, tournament.endTime);
    }

    /// @dev Single O(n) pass over the tournament's players selecting the top
    ///      `min(3, playerCount)` addresses, ranked best-first.
    function _rankTopPlayers(uint256 tournamentId) private view returns (address[] memory ranked) {
        address[] storage players = tournaments[tournamentId].players;
        uint256 playerCount = players.length;
        uint256 winnerCount = playerCount < MAX_WINNERS ? playerCount : MAX_WINNERS;

        address[MAX_WINNERS] memory top;
        uint256 filled;

        for (uint256 i = 0; i < playerCount; i++) {
            address candidate = players[i];
            PlayerEntry storage candidateEntry = entries[tournamentId][candidate];
            uint256 score = candidateEntry.bestScore;
            uint256 time = candidateEntry.lastSubmissionTime;

            uint256 pos;
            if (filled < MAX_WINNERS) {
                pos = filled;
                top[pos] = candidate;
                filled++;
            } else {
                PlayerEntry storage third = entries[tournamentId][top[MAX_WINNERS - 1]];
                if (!_outranks(score, time, third.bestScore, third.lastSubmissionTime)) continue;
                pos = MAX_WINNERS - 1;
                top[pos] = candidate;
            }

            // Bubble the candidate up while it outranks its predecessor. Ties keep the
            // incumbent ahead, so earlier entrants win exact ties deterministically.
            while (pos > 0) {
                PlayerEntry storage prev = entries[tournamentId][top[pos - 1]];
                if (!_outranks(score, time, prev.bestScore, prev.lastSubmissionTime)) break;
                (top[pos - 1], top[pos]) = (top[pos], top[pos - 1]);
                pos--;
            }
        }

        ranked = new address[](winnerCount);
        for (uint256 i = 0; i < winnerCount; i++) {
            ranked[i] = top[i];
        }
    }

    /// @dev Ranking comparator: higher score wins; on equal scores the earlier
    ///      submission wins, and players who never submitted (time == 0) rank last.
    ///      Returns false on exact ties so ordering stays stable.
    function _outranks(uint256 scoreA, uint256 timeA, uint256 scoreB, uint256 timeB)
        private
        pure
        returns (bool)
    {
        if (scoreA != scoreB) return scoreA > scoreB;
        if (timeA == 0) return false;
        if (timeB == 0) return true;
        return timeA < timeB;
    }

    /// @dev Window length per tier.
    function _tierDuration(TournamentTier tier) private pure returns (uint256) {
        return tier == TournamentTier.ONE_USD_HOURLY ? HOURLY_DURATION : DAILY_DURATION;
    }

    /// @dev Entry fee per tier, in USDC units (6 decimals).
    function _tierEntryFee(TournamentTier tier) private pure returns (uint256) {
        if (tier == TournamentTier.FIVE_USD_DAILY) return 5 * ONE_USD;
        if (tier == TournamentTier.TWENTYFIVE_USD_DAILY) return 25 * ONE_USD;
        return ONE_USD; // ONE_USD_DAILY and ONE_USD_HOURLY
    }
}
