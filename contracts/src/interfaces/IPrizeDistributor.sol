// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title IPrizeDistributor
/// @notice Interface for the prize-splitting helper used by SnakeArena when a
///         tournament is finalized.
interface IPrizeDistributor {
    /// @notice Splits `prizePool` between the ranked winners and the treasury and
    ///         transfers the funds out of this contract's balance.
    /// @dev The caller must have transferred `prizePool` of `token` to the
    ///      distributor before calling.
    /// @param token         The ERC20 token the prize pool is denominated in (USDC).
    /// @param rankedPlayers Players ranked best-first; only the first one (1-2 players)
    ///                      or first three (3+ players) receive a payout.
    /// @param prizePool     Total amount to distribute, in token units.
    /// @param treasury      Receiver of the platform fee (and any rounding dust).
    /// @return winners The players that actually received a payout, ranked best-first.
    /// @return payouts The amount paid to each corresponding winner.
    function distribute(
        IERC20 token,
        address[] calldata rankedPlayers,
        uint256 prizePool,
        address treasury
    ) external returns (address[] memory winners, uint256[] memory payouts);
}
