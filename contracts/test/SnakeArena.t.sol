// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {SnakeArena} from "../src/SnakeArena.sol";
import {PrizeDistributor} from "../src/PrizeDistributor.sol";
import {IPrizeDistributor} from "../src/interfaces/IPrizeDistributor.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";

contract SnakeArenaTest is Test {
    SnakeArena internal arena;
    PrizeDistributor internal distributor;
    MockUSDC internal usdc;

    uint256 internal constant SIGNER_KEY = 0xA11CE;
    uint256 internal constant WRONG_KEY = 0xBAD;
    uint256 internal constant ONE_USD = 1e6;
    // Realistic timestamp so UTC-boundary alignment math is exercised.
    uint256 internal constant T0 = 1_780_000_000;

    SnakeArena.TournamentTier internal constant TIER_1D = SnakeArena.TournamentTier.ONE_USD_DAILY;
    SnakeArena.TournamentTier internal constant TIER_5D = SnakeArena.TournamentTier.FIVE_USD_DAILY;
    SnakeArena.TournamentTier internal constant TIER_25D = SnakeArena.TournamentTier.TWENTYFIVE_USD_DAILY;
    SnakeArena.TournamentTier internal constant TIER_1H = SnakeArena.TournamentTier.ONE_USD_HOURLY;

    address internal signer;
    address internal treasury;
    address internal alice;
    address internal bob;
    address internal carol;
    address internal dave;
    address internal keeper;

    event TournamentStarted(uint256 indexed id, SnakeArena.TournamentTier tier, uint256 endTime);
    event EnteredTournament(uint256 indexed tournamentId, address indexed player, uint256 entryNumber);
    event ScoreSubmitted(uint256 indexed tournamentId, address indexed player, uint256 score);
    event TournamentFinalized(uint256 indexed tournamentId, address[] winners, uint256[] payouts);
    event UsernameSet(address indexed player, string username);

    function setUp() public {
        vm.warp(T0);

        signer = vm.addr(SIGNER_KEY);
        treasury = makeAddr("treasury");
        alice = makeAddr("alice");
        bob = makeAddr("bob");
        carol = makeAddr("carol");
        dave = makeAddr("dave");
        keeper = makeAddr("keeper");

        usdc = new MockUSDC();
        distributor = new PrizeDistributor();
        arena = new SnakeArena(
            IERC20(address(usdc)), signer, treasury, IPrizeDistributor(address(distributor))
        );
        distributor.setArena(address(arena));

        address[4] memory players = [alice, bob, carol, dave];
        for (uint256 i = 0; i < players.length; i++) {
            usdc.mint(players[i], 1_000 * ONE_USD);
            vm.prank(players[i]);
            usdc.approve(address(arena), type(uint256).max);
        }
    }

    // ---------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------

    function _enter(address player, SnakeArena.TournamentTier tier, string memory username)
        internal
        returns (uint256 tournamentId)
    {
        tournamentId = arena.currentTournamentId(tier);
        vm.prank(player);
        arena.enterTournament(tier, username);
    }

    function _signScore(uint256 tournamentId, address player, uint256 score, bytes32 nonce, uint256 key)
        internal
        view
        returns (bytes memory)
    {
        bytes32 digest =
            keccak256(abi.encode(tournamentId, player, score, nonce, address(arena), block.chainid));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, MessageHashUtils.toEthSignedMessageHash(digest));
        return abi.encodePacked(r, s, v);
    }

    function _submit(address player, uint256 tournamentId, uint256 score, bytes32 nonce) internal {
        bytes memory sig = _signScore(tournamentId, player, score, nonce, SIGNER_KEY);
        vm.prank(player);
        arena.submitScore(tournamentId, score, nonce, sig);
    }

    function _endTimeOf(uint256 tournamentId) internal view returns (uint256) {
        return arena.getTournament(tournamentId).endTime;
    }

    // ---------------------------------------------------------------------
    // Deployment
    // ---------------------------------------------------------------------

    function testInitialTournamentsStartedForAllTiers() public view {
        assertEq(arena.currentTournamentId(TIER_1D), 1);
        assertEq(arena.currentTournamentId(TIER_5D), 2);
        assertEq(arena.currentTournamentId(TIER_25D), 3);
        assertEq(arena.currentTournamentId(TIER_1H), 4);

        SnakeArena.Tournament memory daily = arena.getActiveTournament(TIER_1D);
        assertEq(daily.entryFee, ONE_USD);
        assertEq(daily.startTime, T0 - (T0 % 24 hours)); // aligned to UTC midnight
        assertEq(daily.endTime, daily.startTime + 24 hours);
        assertFalse(daily.finalized);

        SnakeArena.Tournament memory whale = arena.getActiveTournament(TIER_25D);
        assertEq(whale.entryFee, 25 * ONE_USD);

        SnakeArena.Tournament memory hourly = arena.getActiveTournament(TIER_1H);
        assertEq(hourly.entryFee, ONE_USD);
        assertEq(hourly.startTime, T0 - (T0 % 1 hours)); // aligned to the hour
        assertEq(hourly.endTime, hourly.startTime + 1 hours);
    }

    // ---------------------------------------------------------------------
    // enterTournament
    // ---------------------------------------------------------------------

    function testEnterTournament_success() public {
        uint256 tournamentId = arena.currentTournamentId(TIER_1D);
        uint256 balanceBefore = usdc.balanceOf(alice);

        vm.expectEmit(true, true, false, true);
        emit EnteredTournament(tournamentId, alice, 1);
        vm.prank(alice);
        arena.enterTournament(TIER_1D, "alice");

        assertEq(usdc.balanceOf(alice), balanceBefore - ONE_USD);
        assertEq(usdc.balanceOf(address(arena)), ONE_USD);
        assertEq(arena.getPrizePool(tournamentId), ONE_USD);

        (address wallet, uint256 bestScore, uint256 lastSubmissionTime, uint256 entryCount) =
            arena.entries(tournamentId, alice);
        assertEq(wallet, alice);
        assertEq(bestScore, 0);
        assertEq(lastSubmissionTime, 0);
        assertEq(entryCount, 1);
        assertEq(arena.getTournament(tournamentId).players.length, 1);
    }

    function testEnterTournament_multipleEntriesBySamePlayer() public {
        uint256 tournamentId = arena.currentTournamentId(TIER_1D);

        _enter(alice, TIER_1D, "alice");

        vm.expectEmit(true, true, false, true);
        emit EnteredTournament(tournamentId, alice, 2);
        vm.prank(alice);
        arena.enterTournament(TIER_1D, "alice");

        _enter(alice, TIER_1D, "alice");

        (,,, uint256 entryCount) = arena.entries(tournamentId, alice);
        assertEq(entryCount, 3);
        assertEq(arena.getPrizePool(tournamentId), 3 * ONE_USD);
        // Still a single unique player.
        assertEq(arena.getTournament(tournamentId).players.length, 1);
    }

    function testEnterTournament_revertIfPaused() public {
        arena.pause();
        vm.expectRevert(Pausable.EnforcedPause.selector);
        vm.prank(alice);
        arena.enterTournament(TIER_1D, "alice");
    }

    function testEnterTournament_revertAfterEndTime() public {
        uint256 tournamentId = arena.currentTournamentId(TIER_1H);
        vm.warp(_endTimeOf(tournamentId));
        vm.expectRevert(SnakeArena.TournamentNotActive.selector);
        vm.prank(alice);
        arena.enterTournament(TIER_1H, "alice");
    }

    function testEnterTournament_setsUsernameOnFirstEntry() public {
        vm.expectEmit(true, false, false, true);
        emit UsernameSet(alice, "alice_gamer");
        _enter(alice, TIER_1D, "alice_gamer");
        assertEq(arena.usernames(alice), "alice_gamer");

        // Later entries cannot rename the wallet.
        _enter(alice, TIER_1D, "totally_new_name");
        assertEq(arena.usernames(alice), "alice_gamer");

        // Username is global across tiers, not per tournament.
        _enter(alice, TIER_1H, "another_name");
        assertEq(arena.usernames(alice), "alice_gamer");
    }

    // ---------------------------------------------------------------------
    // submitScore
    // ---------------------------------------------------------------------

    function testSubmitScore_validSignature() public {
        uint256 tournamentId = _enter(alice, TIER_1D, "alice");
        vm.warp(block.timestamp + 5 minutes);

        bytes32 nonce = keccak256("game-1");
        vm.expectEmit(true, true, false, true);
        emit ScoreSubmitted(tournamentId, alice, 420);
        _submit(alice, tournamentId, 420, nonce);

        (, uint256 bestScore, uint256 lastSubmissionTime,) = arena.entries(tournamentId, alice);
        assertEq(bestScore, 420);
        assertEq(lastSubmissionTime, block.timestamp);
        assertTrue(arena.usedNonces(nonce));
    }

    function testSubmitScore_revertOnReplayedNonce() public {
        uint256 tournamentId = _enter(alice, TIER_1D, "alice");
        bytes32 nonce = keccak256("game-1");
        _submit(alice, tournamentId, 100, nonce);

        // Same nonce, even with a fresh valid signature for a new score, must fail.
        bytes memory sig = _signScore(tournamentId, alice, 999, nonce, SIGNER_KEY);
        vm.expectRevert(SnakeArena.NonceAlreadyUsed.selector);
        vm.prank(alice);
        arena.submitScore(tournamentId, 999, nonce, sig);
    }

    function testSubmitScore_revertOnWrongSigner() public {
        uint256 tournamentId = _enter(alice, TIER_1D, "alice");
        bytes memory sig = _signScore(tournamentId, alice, 100, keccak256("n"), WRONG_KEY);
        vm.expectRevert(SnakeArena.InvalidSignature.selector);
        vm.prank(alice);
        arena.submitScore(tournamentId, 100, keccak256("n"), sig);
    }

    function testSubmitScore_revertWhenSignatureBoundToAnotherPlayer() public {
        uint256 tournamentId = _enter(alice, TIER_1D, "alice");
        _enter(bob, TIER_1D, "bob");

        // Bob steals a signature issued for Alice; digest commits to msg.sender.
        bytes memory sig = _signScore(tournamentId, alice, 9_999, keccak256("n"), SIGNER_KEY);
        vm.expectRevert(SnakeArena.InvalidSignature.selector);
        vm.prank(bob);
        arena.submitScore(tournamentId, 9_999, keccak256("n"), sig);
    }

    function testSubmitScore_revertIfNotEntered() public {
        uint256 tournamentId = arena.currentTournamentId(TIER_1D);
        bytes memory sig = _signScore(tournamentId, alice, 100, keccak256("n"), SIGNER_KEY);
        vm.expectRevert(SnakeArena.NotEntered.selector);
        vm.prank(alice);
        arena.submitScore(tournamentId, 100, keccak256("n"), sig);
    }

    function testSubmitScore_revertIfPaused() public {
        uint256 tournamentId = _enter(alice, TIER_1D, "alice");
        bytes memory sig = _signScore(tournamentId, alice, 100, keccak256("n"), SIGNER_KEY);
        arena.pause();
        vm.expectRevert(Pausable.EnforcedPause.selector);
        vm.prank(alice);
        arena.submitScore(tournamentId, 100, keccak256("n"), sig);
    }

    function testSubmitScore_onlyUpdatesIfHigher() public {
        uint256 tournamentId = _enter(alice, TIER_1D, "alice");

        _submit(alice, tournamentId, 100, keccak256("n1"));
        (, uint256 best, uint256 timeOfBest,) = arena.entries(tournamentId, alice);
        assertEq(best, 100);

        // Lower score is accepted but changes nothing (timestamp keeps tie-break spot).
        vm.warp(block.timestamp + 10 minutes);
        _submit(alice, tournamentId, 50, keccak256("n2"));
        (, uint256 bestAfterLower, uint256 timeAfterLower,) = arena.entries(tournamentId, alice);
        assertEq(bestAfterLower, 100);
        assertEq(timeAfterLower, timeOfBest);

        // Equal score also changes nothing.
        vm.warp(block.timestamp + 10 minutes);
        _submit(alice, tournamentId, 100, keccak256("n3"));
        (, uint256 bestAfterEqual, uint256 timeAfterEqual,) = arena.entries(tournamentId, alice);
        assertEq(bestAfterEqual, 100);
        assertEq(timeAfterEqual, timeOfBest);

        // Higher score updates both fields.
        vm.warp(block.timestamp + 10 minutes);
        _submit(alice, tournamentId, 150, keccak256("n4"));
        (, uint256 bestAfterHigher, uint256 timeAfterHigher,) = arena.entries(tournamentId, alice);
        assertEq(bestAfterHigher, 150);
        assertEq(timeAfterHigher, block.timestamp);
    }

    // ---------------------------------------------------------------------
    // finalizeTournament — prize distribution
    // ---------------------------------------------------------------------

    function testFinalize_threePlayersDistributes45_25_20_10() public {
        uint256 tournamentId = _enter(alice, TIER_1D, "alice");
        _enter(bob, TIER_1D, "bob");
        _enter(carol, TIER_1D, "carol");

        _submit(alice, tournamentId, 300, keccak256("a"));
        _submit(bob, tournamentId, 200, keccak256("b"));
        _submit(carol, tournamentId, 100, keccak256("c"));

        uint256 pool = 3 * ONE_USD;
        assertEq(arena.getPrizePool(tournamentId), pool);

        uint256 aliceBefore = usdc.balanceOf(alice);
        uint256 bobBefore = usdc.balanceOf(bob);
        uint256 carolBefore = usdc.balanceOf(carol);

        vm.warp(_endTimeOf(tournamentId));
        vm.prank(keeper); // anyone can finalize
        arena.finalizeTournament(tournamentId);

        assertEq(usdc.balanceOf(alice) - aliceBefore, 1_350_000); // 45% of $3
        assertEq(usdc.balanceOf(bob) - bobBefore, 750_000); // 25%
        assertEq(usdc.balanceOf(carol) - carolBefore, 600_000); // 20%
        assertEq(usdc.balanceOf(treasury), 300_000); // 10%
        assertEq(usdc.balanceOf(address(arena)), 0);
        assertEq(usdc.balanceOf(address(distributor)), 0);
        assertTrue(arena.getTournament(tournamentId).finalized);
    }

    function testFinalize_twoPlayersWinnerTakes90() public {
        uint256 tournamentId = _enter(alice, TIER_1D, "alice");
        _enter(bob, TIER_1D, "bob");

        _submit(alice, tournamentId, 50, keccak256("a"));
        _submit(bob, tournamentId, 500, keccak256("b"));

        uint256 aliceBefore = usdc.balanceOf(alice);
        uint256 bobBefore = usdc.balanceOf(bob);

        vm.warp(_endTimeOf(tournamentId));
        arena.finalizeTournament(tournamentId);

        assertEq(usdc.balanceOf(bob) - bobBefore, 1_800_000); // 90% of $2
        assertEq(usdc.balanceOf(alice) - aliceBefore, 0); // runner-up gets nothing
        assertEq(usdc.balanceOf(treasury), 200_000); // 10%
        assertEq(usdc.balanceOf(address(arena)), 0);
        assertEq(usdc.balanceOf(address(distributor)), 0);
    }

    function testFinalize_onePlayerWinnerTakes90() public {
        uint256 tournamentId = _enter(alice, TIER_1D, "alice");
        _submit(alice, tournamentId, 7, keccak256("a"));

        uint256 aliceBefore = usdc.balanceOf(alice);

        vm.warp(_endTimeOf(tournamentId));
        arena.finalizeTournament(tournamentId);

        assertEq(usdc.balanceOf(alice) - aliceBefore, 900_000); // 90% of $1
        assertEq(usdc.balanceOf(treasury), 100_000); // 10%
        assertEq(usdc.balanceOf(address(arena)), 0);
    }

    function testFinalize_tieBreakerByTimestamp() public {
        uint256 tournamentId = _enter(alice, TIER_1D, "alice");
        _enter(bob, TIER_1D, "bob");
        _enter(carol, TIER_1D, "carol");

        // Bob and Alice tie on score; Alice submitted earlier so she ranks 1st.
        _submit(alice, tournamentId, 100, keccak256("a"));
        vm.warp(block.timestamp + 1 hours);
        _submit(bob, tournamentId, 100, keccak256("b"));
        _submit(carol, tournamentId, 40, keccak256("c"));

        uint256 aliceBefore = usdc.balanceOf(alice);
        uint256 bobBefore = usdc.balanceOf(bob);
        uint256 carolBefore = usdc.balanceOf(carol);

        vm.warp(_endTimeOf(tournamentId));
        arena.finalizeTournament(tournamentId);

        assertEq(usdc.balanceOf(alice) - aliceBefore, 1_350_000); // 45%: earlier tie wins
        assertEq(usdc.balanceOf(bob) - bobBefore, 750_000); // 25%
        assertEq(usdc.balanceOf(carol) - carolBefore, 600_000); // 20%
    }

    function testFinalize_fourPlayersOnlyTopThreePaid() public {
        uint256 tournamentId = _enter(alice, TIER_1D, "alice");
        _enter(bob, TIER_1D, "bob");
        _enter(carol, TIER_1D, "carol");
        _enter(dave, TIER_1D, "dave");

        _submit(alice, tournamentId, 100, keccak256("a"));
        _submit(bob, tournamentId, 400, keccak256("b"));
        _submit(carol, tournamentId, 300, keccak256("c"));
        _submit(dave, tournamentId, 200, keccak256("d"));

        uint256 pool = 4 * ONE_USD;
        uint256 aliceBefore = usdc.balanceOf(alice);
        uint256 bobBefore = usdc.balanceOf(bob);
        uint256 carolBefore = usdc.balanceOf(carol);
        uint256 daveBefore = usdc.balanceOf(dave);

        vm.warp(_endTimeOf(tournamentId));
        arena.finalizeTournament(tournamentId);

        assertEq(usdc.balanceOf(bob) - bobBefore, (pool * 45) / 100);
        assertEq(usdc.balanceOf(carol) - carolBefore, (pool * 25) / 100);
        assertEq(usdc.balanceOf(dave) - daveBefore, (pool * 20) / 100);
        assertEq(usdc.balanceOf(alice) - aliceBefore, 0); // 4th place unpaid
        assertEq(usdc.balanceOf(treasury), (pool * 10) / 100);
    }

    // ---------------------------------------------------------------------
    // finalizeTournament — lifecycle
    // ---------------------------------------------------------------------

    function testFinalize_revertIfBeforeEndTime() public {
        uint256 tournamentId = _enter(alice, TIER_1D, "alice");
        vm.warp(_endTimeOf(tournamentId) - 1);
        vm.expectRevert(SnakeArena.TournamentNotEnded.selector);
        arena.finalizeTournament(tournamentId);
    }

    function testFinalize_revertIfAlreadyFinalized() public {
        uint256 tournamentId = _enter(alice, TIER_1D, "alice");
        vm.warp(_endTimeOf(tournamentId));
        arena.finalizeTournament(tournamentId);
        vm.expectRevert(SnakeArena.TournamentAlreadyFinalized.selector);
        arena.finalizeTournament(tournamentId);
    }

    function testFinalize_revertIfUnknownTournament() public {
        vm.expectRevert(SnakeArena.TournamentNotFound.selector);
        arena.finalizeTournament(999);
    }

    function testFinalize_revertIfPaused() public {
        uint256 tournamentId = _enter(alice, TIER_1D, "alice");
        vm.warp(_endTimeOf(tournamentId));
        arena.pause();
        vm.expectRevert(Pausable.EnforcedPause.selector);
        arena.finalizeTournament(tournamentId);
    }

    function testFinalize_autoStartsNextTournament() public {
        uint256 tournamentId = _enter(alice, TIER_1D, "alice");
        uint256 endTime = _endTimeOf(tournamentId);
        vm.warp(endTime);

        // ids 1-4 were created at deployment, so the rollover tournament gets id 5.
        vm.expectEmit(true, false, false, true);
        emit TournamentStarted(5, TIER_1D, endTime + 24 hours);
        arena.finalizeTournament(tournamentId);

        assertEq(arena.currentTournamentId(TIER_1D), 5);
        SnakeArena.Tournament memory next = arena.getTournament(5);
        assertEq(next.startTime, endTime); // seamless window chaining
        assertEq(next.endTime, endTime + 24 hours);
        assertEq(next.prizePool, 0);
        assertEq(next.entryFee, ONE_USD);
        assertEq(uint256(next.tier), uint256(TIER_1D));
        assertFalse(next.finalized);
        assertEq(next.players.length, 0);

        // The new tournament accepts entries immediately.
        _enter(bob, TIER_1D, "bob");
        assertEq(arena.getPrizePool(5), ONE_USD);
    }

    function testFinalize_zeroPlayersRollsOverWithNoPayouts() public {
        uint256 tournamentId = arena.currentTournamentId(TIER_1H);
        vm.warp(_endTimeOf(tournamentId));

        vm.expectEmit(true, false, false, true);
        emit TournamentFinalized(tournamentId, new address[](0), new uint256[](0));
        arena.finalizeTournament(tournamentId);

        assertEq(usdc.balanceOf(treasury), 0);
        assertEq(arena.currentTournamentId(TIER_1H), 5);
    }

    function testFinalize_lateFinalizationFastForwardsNextWindow() public {
        uint256 tournamentId = arena.currentTournamentId(TIER_1H);
        uint256 endTime = _endTimeOf(tournamentId);

        // Cron was down for 2.5 hours past endTime.
        vm.warp(endTime + 2 hours + 30 minutes);
        arena.finalizeTournament(tournamentId);

        SnakeArena.Tournament memory next = arena.getTournament(arena.currentTournamentId(TIER_1H));
        // Window fast-forwarded to the aligned hour containing `now`, not an already-dead one.
        assertEq(next.startTime, endTime + 2 hours);
        assertEq(next.endTime, endTime + 3 hours);
        assertGt(next.endTime, block.timestamp);
    }

    function testSubmitScore_revertAfterFinalized() public {
        uint256 tournamentId = _enter(alice, TIER_1D, "alice");
        vm.warp(_endTimeOf(tournamentId));
        arena.finalizeTournament(tournamentId);

        bytes memory sig = _signScore(tournamentId, alice, 100, keccak256("n"), SIGNER_KEY);
        vm.expectRevert(SnakeArena.TournamentAlreadyFinalized.selector);
        vm.prank(alice);
        arena.submitScore(tournamentId, 100, keccak256("n"), sig);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    function testGetLeaderboard_ranksAndTruncates() public {
        uint256 tournamentId = _enter(alice, TIER_1D, "alice");
        _enter(bob, TIER_1D, "bob");
        _enter(carol, TIER_1D, "carol");

        _submit(alice, tournamentId, 100, keccak256("a"));
        _submit(bob, tournamentId, 300, keccak256("b"));
        _submit(carol, tournamentId, 200, keccak256("c"));

        SnakeArena.PlayerEntry[] memory board = arena.getLeaderboard(tournamentId, 10);
        assertEq(board.length, 3);
        assertEq(board[0].wallet, bob);
        assertEq(board[1].wallet, carol);
        assertEq(board[2].wallet, alice);

        SnakeArena.PlayerEntry[] memory topTwo = arena.getLeaderboard(tournamentId, 2);
        assertEq(topTwo.length, 2);
        assertEq(topTwo[0].wallet, bob);
        assertEq(topTwo[1].wallet, carol);
    }

    // ---------------------------------------------------------------------
    // Admin
    // ---------------------------------------------------------------------

    function testSetTrustedSigner_onlyOwner() public {
        address newSigner = vm.addr(0xC0FFEE);

        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        vm.prank(alice);
        arena.setTrustedSigner(newSigner);

        arena.setTrustedSigner(newSigner);
        assertEq(arena.trustedSigner(), newSigner);

        // Old key's signatures stop working; new key's signatures verify.
        uint256 tournamentId = _enter(alice, TIER_1D, "alice");
        bytes memory oldSig = _signScore(tournamentId, alice, 100, keccak256("n1"), SIGNER_KEY);
        vm.expectRevert(SnakeArena.InvalidSignature.selector);
        vm.prank(alice);
        arena.submitScore(tournamentId, 100, keccak256("n1"), oldSig);

        bytes memory newSig = _signScore(tournamentId, alice, 100, keccak256("n2"), 0xC0FFEE);
        vm.prank(alice);
        arena.submitScore(tournamentId, 100, keccak256("n2"), newSig);
        (, uint256 best,,) = arena.entries(tournamentId, alice);
        assertEq(best, 100);
    }

    function testSetTrustedSigner_revertOnZeroAddress() public {
        vm.expectRevert(SnakeArena.ZeroAddress.selector);
        arena.setTrustedSigner(address(0));
    }

    function testPauseUnpause_onlyOwner() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        vm.prank(alice);
        arena.pause();

        arena.pause();
        assertTrue(arena.paused());

        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        vm.prank(alice);
        arena.unpause();

        arena.unpause();
        assertFalse(arena.paused());

        // Entries work again after unpausing.
        _enter(alice, TIER_1D, "alice");
    }
}
