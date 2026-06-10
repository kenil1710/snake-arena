// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/// @title PowerUpStore
/// @notice On-chain checkout for in-game SnakeArena power-ups, paid in USDC.
///
///         The contract only records payments: USDC flows straight from the player to
///         the treasury and a `PowerUpPurchased` event is emitted. The game backend
///         watches these events (or verifies the tx hash) and activates the power-up
///         in the off-chain session identified by `sessionId`.
///
///         Default prices (USDC, 6 decimals):
///         - SHIELD        $0.25
///         - MULTIPLIER_2X $0.50
///         - SLOW_MO       $0.25
///         - REVIVE        $0.50
/// @dev    Purchases are meant to be sent via smart-wallet session keys + paymaster so
///         they execute mid-game without popups.
contract PowerUpStore is Ownable, Pausable {
    using SafeERC20 for IERC20;

    /// @notice The purchasable power-up kinds.
    enum PowerUpType {
        SHIELD,
        MULTIPLIER_2X,
        SLOW_MO,
        REVIVE
    }

    /// @notice Payment token (USDC on Base, 6 decimals).
    IERC20 public immutable usdc;

    /// @notice Receiver of all power-up revenue.
    address public treasury;

    /// @notice Price per power-up type, in USDC units (6 decimals).
    mapping(PowerUpType => uint256) public prices;

    event PowerUpPurchased(
        address indexed player,
        bytes32 indexed sessionId,
        PowerUpType powerUpType,
        uint256 timestamp
    );
    event PriceUpdated(PowerUpType indexed powerUpType, uint256 previousPrice, uint256 newPrice);
    event TreasuryUpdated(address indexed previousTreasury, address indexed newTreasury);

    error ZeroAddress();

    /// @param usdc_     USDC token address.
    /// @param treasury_ Receiver of power-up revenue.
    constructor(IERC20 usdc_, address treasury_) Ownable(msg.sender) {
        if (address(usdc_) == address(0) || treasury_ == address(0)) revert ZeroAddress();
        usdc = usdc_;
        treasury = treasury_;

        prices[PowerUpType.SHIELD] = 250_000; // $0.25
        prices[PowerUpType.MULTIPLIER_2X] = 500_000; // $0.50
        prices[PowerUpType.SLOW_MO] = 250_000; // $0.25
        prices[PowerUpType.REVIVE] = 500_000; // $0.50
    }

    /// @notice Buys a power-up for an active game session.
    /// @dev Pulls the USDC price from the caller directly to the treasury and emits
    ///      `PowerUpPurchased`. The backend correlates `sessionId` with the player's
    ///      live game session and activates the effect server-side.
    /// @param sessionId   Off-chain game session identifier the power-up applies to.
    /// @param powerUpType Which power-up is being bought.
    function buyPowerUp(bytes32 sessionId, PowerUpType powerUpType) external whenNotPaused {
        usdc.safeTransferFrom(msg.sender, treasury, prices[powerUpType]);
        emit PowerUpPurchased(msg.sender, sessionId, powerUpType, block.timestamp);
    }

    /// @notice Updates the price of a power-up.
    /// @dev Owner-only.
    /// @param powerUpType Power-up to reprice.
    /// @param newPrice    New price in USDC units (6 decimals).
    function setPrice(PowerUpType powerUpType, uint256 newPrice) external onlyOwner {
        emit PriceUpdated(powerUpType, prices[powerUpType], newPrice);
        prices[powerUpType] = newPrice;
    }

    /// @notice Updates the treasury that receives power-up revenue.
    /// @dev Owner-only.
    /// @param newTreasury New revenue receiver; must be non-zero.
    function setTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert ZeroAddress();
        emit TreasuryUpdated(treasury, newTreasury);
        treasury = newTreasury;
    }

    /// @notice Circuit breaker: halts all purchases.
    /// @dev Owner-only.
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Lifts the circuit breaker.
    /// @dev Owner-only.
    function unpause() external onlyOwner {
        _unpause();
    }
}
