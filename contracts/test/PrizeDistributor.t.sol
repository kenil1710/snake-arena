// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {PrizeDistributor} from "../src/PrizeDistributor.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";

contract PrizeDistributorTest is Test {
    PrizeDistributor internal distributor;
    MockUSDC internal usdc;

    address internal arena;
    address internal treasury;
    address internal first;
    address internal second;
    address internal third;

    function setUp() public {
        arena = makeAddr("arena");
        treasury = makeAddr("treasury");
        first = makeAddr("first");
        second = makeAddr("second");
        third = makeAddr("third");

        usdc = new MockUSDC();
        distributor = new PrizeDistributor();
        distributor.setArena(arena);
    }

    function _ranked(uint256 count) internal view returns (address[] memory players) {
        players = new address[](count);
        if (count > 0) players[0] = first;
        if (count > 1) players[1] = second;
        if (count > 2) players[2] = third;
    }

    /// @dev Funds the distributor (as the arena does pre-call) and distributes.
    function _distribute(uint256 pool, uint256 playerCount)
        internal
        returns (address[] memory winners, uint256[] memory payouts)
    {
        usdc.mint(address(distributor), pool);
        vm.prank(arena);
        (winners, payouts) = distributor.distribute(IERC20(address(usdc)), _ranked(playerCount), pool, treasury);
    }

    // ---------------------------------------------------------------------
    // computePayouts — exact wei math
    // ---------------------------------------------------------------------

    function testComputePayouts_threePlayers_exactSplit() public view {
        uint256 pool = 10e6; // $10, divides evenly
        (uint256[] memory payouts, uint256 treasuryAmount) = distributor.computePayouts(pool, 3);

        assertEq(payouts.length, 3);
        assertEq(payouts[0], 4_500_000); // 45%
        assertEq(payouts[1], 2_500_000); // 25%
        assertEq(payouts[2], 2_000_000); // 20%
        assertEq(treasuryAmount, 1_000_000); // 10%
        assertEq(payouts[0] + payouts[1] + payouts[2] + treasuryAmount, pool); // 100%, to the wei
    }

    function testComputePayouts_threePlayers_treasuryAbsorbsDust() public view {
        // 1_000_001 doesn't divide evenly: every winner share rounds down and the
        // treasury picks up the 1-unit remainder, so nothing is lost.
        uint256 pool = 1_000_001;
        (uint256[] memory payouts, uint256 treasuryAmount) = distributor.computePayouts(pool, 3);

        assertEq(payouts[0], 450_000); // floor(45.000045%...)
        assertEq(payouts[1], 250_000);
        assertEq(payouts[2], 200_000);
        assertEq(treasuryAmount, 100_001); // 10% + dust
        assertEq(payouts[0] + payouts[1] + payouts[2] + treasuryAmount, pool);

        // Pathologically tiny pool: winners round to near-zero, treasury takes the rest.
        (uint256[] memory tinyPayouts, uint256 tinyTreasury) = distributor.computePayouts(7, 3);
        assertEq(tinyPayouts[0], 3); // floor(7 * 45%)
        assertEq(tinyPayouts[1], 1); // floor(7 * 25%)
        assertEq(tinyPayouts[2], 1); // floor(7 * 20%)
        assertEq(tinyTreasury, 2);
        assertEq(tinyPayouts[0] + tinyPayouts[1] + tinyPayouts[2] + tinyTreasury, 7);
    }

    function testComputePayouts_onePlayer_exactSplit() public view {
        (uint256[] memory payouts, uint256 treasuryAmount) = distributor.computePayouts(1e6, 1);
        assertEq(payouts.length, 1);
        assertEq(payouts[0], 900_000); // 90%
        assertEq(treasuryAmount, 100_000); // 10%
        assertEq(payouts[0] + treasuryAmount, 1e6);
    }

    function testComputePayouts_twoPlayers_winnerTakes90TreasuryAbsorbsDust() public view {
        // Two players still pay a single winner 90%.
        uint256 pool = 999_999;
        (uint256[] memory payouts, uint256 treasuryAmount) = distributor.computePayouts(pool, 2);
        assertEq(payouts.length, 1);
        assertEq(payouts[0], 899_999); // floor(999_999 * 90%)
        assertEq(treasuryAmount, 100_000); // 10% + dust
        assertEq(payouts[0] + treasuryAmount, pool);
    }

    function testComputePayouts_manyPlayersSameAsThree() public view {
        (uint256[] memory forThree,) = distributor.computePayouts(50e6, 3);
        (uint256[] memory forFifty, uint256 treasuryAmount) = distributor.computePayouts(50e6, 50);
        assertEq(forFifty.length, 3);
        assertEq(forFifty[0], forThree[0]);
        assertEq(forFifty[1], forThree[1]);
        assertEq(forFifty[2], forThree[2]);
        assertEq(forFifty[0] + forFifty[1] + forFifty[2] + treasuryAmount, 50e6);
    }

    /// @notice No distribution may ever create or destroy funds, for any pool size or
    ///         player count: payouts + treasury == pool exactly.
    function testFuzz_noRoundingLoss(uint256 pool, uint256 playerCount) public view {
        pool = bound(pool, 1, 1e16); // up to $10B USDC
        playerCount = bound(playerCount, 1, 10_000);

        (uint256[] memory payouts, uint256 treasuryAmount) = distributor.computePayouts(pool, playerCount);

        uint256 sum = treasuryAmount;
        for (uint256 i = 0; i < payouts.length; i++) {
            sum += payouts[i];
        }
        assertEq(sum, pool);
        assertEq(payouts.length, playerCount >= 3 ? 3 : 1);
        if (payouts.length == 3) {
            assertGe(payouts[0], payouts[1]); // 1st >= 2nd >= 3rd always
            assertGe(payouts[1], payouts[2]);
        }
    }

    // ---------------------------------------------------------------------
    // distribute — actual transfers
    // ---------------------------------------------------------------------

    function testDistribute_threePlayers_transfersExactAmounts() public {
        uint256 pool = 3_000_001; // includes dust
        (address[] memory winners, uint256[] memory payouts) = _distribute(pool, 3);

        assertEq(winners.length, 3);
        assertEq(winners[0], first);
        assertEq(winners[1], second);
        assertEq(winners[2], third);

        assertEq(usdc.balanceOf(first), 1_350_000);
        assertEq(usdc.balanceOf(second), 750_000);
        assertEq(usdc.balanceOf(third), 600_000);
        assertEq(usdc.balanceOf(treasury), 300_001); // 10% + dust
        assertEq(payouts[0], 1_350_000);
        assertEq(payouts[1], 750_000);
        assertEq(payouts[2], 600_000);

        // Every unit left the distributor: nothing stranded, nothing minted.
        assertEq(usdc.balanceOf(address(distributor)), 0);
        assertEq(
            usdc.balanceOf(first) + usdc.balanceOf(second) + usdc.balanceOf(third) + usdc.balanceOf(treasury),
            pool
        );
    }

    function testDistribute_twoPlayers_singleWinnerPaid() public {
        uint256 pool = 2e6;
        (address[] memory winners, uint256[] memory payouts) = _distribute(pool, 2);

        assertEq(winners.length, 1);
        assertEq(winners[0], first);
        assertEq(payouts[0], 1_800_000);

        assertEq(usdc.balanceOf(first), 1_800_000); // 90%
        assertEq(usdc.balanceOf(second), 0); // runner-up unpaid
        assertEq(usdc.balanceOf(treasury), 200_000); // 10%
        assertEq(usdc.balanceOf(address(distributor)), 0);
        assertEq(usdc.balanceOf(first) + usdc.balanceOf(treasury), pool);
    }

    function testDistribute_onePlayer_singleWinnerPaid() public {
        uint256 pool = 1e6;
        (address[] memory winners,) = _distribute(pool, 1);

        assertEq(winners.length, 1);
        assertEq(usdc.balanceOf(first), 900_000);
        assertEq(usdc.balanceOf(treasury), 100_000);
        assertEq(usdc.balanceOf(address(distributor)), 0);
    }

    // ---------------------------------------------------------------------
    // Access control + validation
    // ---------------------------------------------------------------------

    function testDistribute_revertIfNotArena() public {
        usdc.mint(address(distributor), 1e6);
        vm.expectRevert(PrizeDistributor.NotArena.selector);
        vm.prank(makeAddr("attacker"));
        distributor.distribute(IERC20(address(usdc)), _ranked(1), 1e6, treasury);
    }

    function testDistribute_revertOnEmptyPlayers() public {
        vm.expectRevert(PrizeDistributor.NoPlayers.selector);
        vm.prank(arena);
        distributor.distribute(IERC20(address(usdc)), new address[](0), 1e6, treasury);
    }

    function testDistribute_revertOnZeroPool() public {
        vm.expectRevert(PrizeDistributor.NothingToDistribute.selector);
        vm.prank(arena);
        distributor.distribute(IERC20(address(usdc)), _ranked(1), 0, treasury);
    }

    function testSetArena_onlyOwner() public {
        address rando = makeAddr("rando");
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, rando));
        vm.prank(rando);
        distributor.setArena(rando);

        distributor.setArena(makeAddr("newArena"));
        assertEq(distributor.arena(), makeAddr("newArena"));
    }
}
