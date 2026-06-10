// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IPrizeDistributor} from "./interfaces/IPrizeDistributor.sol";

/// @title PrizeDistributor
/// @notice Splits SnakeArena tournament prize pools between winners and the treasury.
///
///         Distribution rules (in basis points of the prize pool):
///         - 3+ players: 1st = 45%, 2nd = 25%, 3rd = 20%, treasury = 10%
///         - 1-2 players: winner = 90%, treasury = 10%
///
///         Winner shares are rounded down; the treasury receives the remainder, so the
///         sum of all transfers always equals the prize pool exactly (no dust is ever
///         stranded in this contract by a distribution).
/// @dev    Only the configured `arena` may trigger distributions. The arena transfers
///         the pool to this contract and calls `distribute` within the same transaction.
contract PrizeDistributor is IPrizeDistributor, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Basis-points denominator (100% == 10_000).
    uint256 public constant BPS_DENOMINATOR = 10_000;
    /// @notice 1st-place share when 3+ players entered (45%).
    uint256 public constant FIRST_PLACE_BPS = 4_500;
    /// @notice 2nd-place share when 3+ players entered (25%).
    uint256 public constant SECOND_PLACE_BPS = 2_500;
    /// @notice 3rd-place share when 3+ players entered (20%).
    uint256 public constant THIRD_PLACE_BPS = 2_000;
    /// @notice Winner share when only 1-2 players entered (90%).
    uint256 public constant SOLO_WINNER_BPS = 9_000;

    /// @notice The only address allowed to call `distribute` (the SnakeArena contract).
    address public arena;

    event ArenaUpdated(address indexed previousArena, address indexed newArena);
    event PrizesDistributed(
        address indexed token,
        uint256 prizePool,
        address[] winners,
        uint256[] payouts,
        address indexed treasury,
        uint256 treasuryAmount
    );

    error NotArena();
    error ZeroAddress();
    error NoPlayers();
    error NothingToDistribute();

    constructor() Ownable(msg.sender) {}

    /// @notice Restricts `distribute` to the SnakeArena contract.
    modifier onlyArena() {
        if (msg.sender != arena) revert NotArena();
        _;
    }

    /// @notice Points the distributor at the SnakeArena contract allowed to distribute.
    /// @dev Owner-only. Must be called after SnakeArena is deployed (the arena takes
    ///      this contract's address as a constructor argument, so it deploys second).
    /// @param newArena The SnakeArena contract address.
    function setArena(address newArena) external onlyOwner {
        if (newArena == address(0)) revert ZeroAddress();
        emit ArenaUpdated(arena, newArena);
        arena = newArena;
    }

    /// @inheritdoc IPrizeDistributor
    function distribute(
        IERC20 token,
        address[] calldata rankedPlayers,
        uint256 prizePool,
        address treasury
    ) external onlyArena nonReentrant returns (address[] memory winners, uint256[] memory payouts) {
        if (rankedPlayers.length == 0) revert NoPlayers();
        if (prizePool == 0) revert NothingToDistribute();
        if (treasury == address(0)) revert ZeroAddress();

        uint256 treasuryAmount;
        (payouts, treasuryAmount) = computePayouts(prizePool, rankedPlayers.length);

        winners = new address[](payouts.length);
        for (uint256 i = 0; i < payouts.length; i++) {
            winners[i] = rankedPlayers[i];
            token.safeTransfer(rankedPlayers[i], payouts[i]);
        }
        if (treasuryAmount > 0) {
            token.safeTransfer(treasury, treasuryAmount);
        }

        emit PrizesDistributed(address(token), prizePool, winners, payouts, treasury, treasuryAmount);
    }

    /// @notice Pure payout math: how a pool of `prizePool` is split for `playerCount` players.
    /// @dev Winner shares round down; the treasury amount is the exact remainder, so
    ///      `sum(payouts) + treasuryAmount == prizePool` always holds.
    /// @param prizePool   Total pool to split, in token units.
    /// @param playerCount Number of players that entered the tournament.
    /// @return payouts        Winner payouts ranked best-first (length 3 for 3+ players,
    ///                        length 1 for 1-2 players, length 0 for 0 players).
    /// @return treasuryAmount Amount sent to the treasury (10% plus rounding dust).
    function computePayouts(uint256 prizePool, uint256 playerCount)
        public
        pure
        returns (uint256[] memory payouts, uint256 treasuryAmount)
    {
        if (playerCount == 0) {
            return (new uint256[](0), prizePool);
        }
        if (playerCount >= 3) {
            payouts = new uint256[](3);
            payouts[0] = (prizePool * FIRST_PLACE_BPS) / BPS_DENOMINATOR;
            payouts[1] = (prizePool * SECOND_PLACE_BPS) / BPS_DENOMINATOR;
            payouts[2] = (prizePool * THIRD_PLACE_BPS) / BPS_DENOMINATOR;
            treasuryAmount = prizePool - payouts[0] - payouts[1] - payouts[2];
        } else {
            // 1 or 2 players: only the top player is paid.
            payouts = new uint256[](1);
            payouts[0] = (prizePool * SOLO_WINNER_BPS) / BPS_DENOMINATOR;
            treasuryAmount = prizePool - payouts[0];
        }
    }

    /// @notice Recovers tokens accidentally sent to this contract.
    /// @dev Owner-only. Distributions always sweep the full pool in the same tx, so any
    ///      lingering balance here is a mistake (e.g. a direct transfer).
    /// @param token  Token to recover.
    /// @param to     Receiver of the recovered tokens.
    /// @param amount Amount to recover.
    function rescueERC20(IERC20 token, address to, uint256 amount) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        token.safeTransfer(to, amount);
    }
}
