// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {PowerUpStore} from "../src/PowerUpStore.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";

contract PowerUpStoreTest is Test {
    PowerUpStore internal store;
    MockUSDC internal usdc;

    address internal treasury;
    address internal alice;

    bytes32 internal constant SESSION_ID = keccak256("session-42");

    event PowerUpPurchased(
        address indexed player,
        bytes32 indexed sessionId,
        PowerUpStore.PowerUpType powerUpType,
        uint256 timestamp
    );
    event PriceUpdated(PowerUpStore.PowerUpType indexed powerUpType, uint256 previousPrice, uint256 newPrice);

    function setUp() public {
        treasury = makeAddr("treasury");
        alice = makeAddr("alice");

        usdc = new MockUSDC();
        store = new PowerUpStore(IERC20(address(usdc)), treasury);

        usdc.mint(alice, 100e6);
        vm.prank(alice);
        usdc.approve(address(store), type(uint256).max);
    }

    function _buyAndAssert(PowerUpStore.PowerUpType powerUpType, uint256 expectedPrice) internal {
        uint256 treasuryBefore = usdc.balanceOf(treasury);
        uint256 aliceBefore = usdc.balanceOf(alice);

        vm.expectEmit(true, true, false, true);
        emit PowerUpPurchased(alice, SESSION_ID, powerUpType, block.timestamp);
        vm.prank(alice);
        store.buyPowerUp(SESSION_ID, powerUpType);

        assertEq(usdc.balanceOf(treasury) - treasuryBefore, expectedPrice);
        assertEq(aliceBefore - usdc.balanceOf(alice), expectedPrice);
    }

    // ---------------------------------------------------------------------
    // Purchases — events + payment for all 4 power-ups
    // ---------------------------------------------------------------------

    function testBuyPowerUp_shield() public {
        _buyAndAssert(PowerUpStore.PowerUpType.SHIELD, 250_000);
    }

    function testBuyPowerUp_multiplier2x() public {
        _buyAndAssert(PowerUpStore.PowerUpType.MULTIPLIER_2X, 500_000);
    }

    function testBuyPowerUp_slowMo() public {
        _buyAndAssert(PowerUpStore.PowerUpType.SLOW_MO, 250_000);
    }

    function testBuyPowerUp_revive() public {
        _buyAndAssert(PowerUpStore.PowerUpType.REVIVE, 500_000);
    }

    // ---------------------------------------------------------------------
    // Prices
    // ---------------------------------------------------------------------

    function testPrices_matchSpec() public view {
        assertEq(store.prices(PowerUpStore.PowerUpType.SHIELD), 250_000); // $0.25
        assertEq(store.prices(PowerUpStore.PowerUpType.MULTIPLIER_2X), 500_000); // $0.50
        assertEq(store.prices(PowerUpStore.PowerUpType.SLOW_MO), 250_000); // $0.25
        assertEq(store.prices(PowerUpStore.PowerUpType.REVIVE), 500_000); // $0.50
    }

    function testSetPrice_onlyOwner() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        vm.prank(alice);
        store.setPrice(PowerUpStore.PowerUpType.SHIELD, 1);

        vm.expectEmit(true, false, false, true);
        emit PriceUpdated(PowerUpStore.PowerUpType.SHIELD, 250_000, 300_000);
        store.setPrice(PowerUpStore.PowerUpType.SHIELD, 300_000);
        assertEq(store.prices(PowerUpStore.PowerUpType.SHIELD), 300_000);

        // Purchases charge the updated price.
        _buyAndAssert(PowerUpStore.PowerUpType.SHIELD, 300_000);
    }

    // ---------------------------------------------------------------------
    // Pause
    // ---------------------------------------------------------------------

    function testBuyPowerUp_revertWhenPaused() public {
        store.pause();

        vm.expectRevert(Pausable.EnforcedPause.selector);
        vm.prank(alice);
        store.buyPowerUp(SESSION_ID, PowerUpStore.PowerUpType.SHIELD);

        // Works again after unpause.
        store.unpause();
        _buyAndAssert(PowerUpStore.PowerUpType.SHIELD, 250_000);
    }

    function testPauseUnpause_onlyOwner() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        vm.prank(alice);
        store.pause();

        store.pause();
        assertTrue(store.paused());

        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        vm.prank(alice);
        store.unpause();

        store.unpause();
        assertFalse(store.paused());
    }
}
