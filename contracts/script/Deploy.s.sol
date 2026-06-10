// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SnakeArena} from "../src/SnakeArena.sol";
import {PowerUpStore} from "../src/PowerUpStore.sol";
import {PrizeDistributor} from "../src/PrizeDistributor.sol";
import {IPrizeDistributor} from "../src/interfaces/IPrizeDistributor.sol";

/// @notice Deploys the full SnakeArena protocol and wires the contracts together.
///
/// Required environment variables:
///   DEPLOYER_PRIVATE_KEY     Deployer key (becomes owner of all three contracts).
///   TRUSTED_SIGNER_ADDRESS   Backend score-signing address.
///   TREASURY_ADDRESS         Platform fee receiver (use the multisig).
///   USDC_BASE_SEPOLIA        USDC token address on the target network.
///
/// Usage (dry run, no broadcast):
///   forge script script/Deploy.s.sol --rpc-url $BASE_SEPOLIA_RPC_URL
/// Add --broadcast --verify to actually deploy.
contract Deploy is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address trustedSigner = vm.envAddress("TRUSTED_SIGNER_ADDRESS");
        address treasury = vm.envAddress("TREASURY_ADDRESS");
        IERC20 usdc = IERC20(vm.envAddress("USDC_BASE_SEPOLIA"));

        vm.startBroadcast(deployerKey);

        // 1. Prize-splitting helper (arena wired below, after it exists).
        PrizeDistributor prizeDistributor = new PrizeDistributor();

        // 2. In-game power-up checkout; revenue goes straight to the treasury.
        PowerUpStore powerUpStore = new PowerUpStore(usdc, treasury);

        // 3. Main tournament contract; starts the first tournament of every tier.
        SnakeArena snakeArena =
            new SnakeArena(usdc, trustedSigner, treasury, IPrizeDistributor(address(prizeDistributor)));

        // 4. Allow the arena to trigger distributions.
        prizeDistributor.setArena(address(snakeArena));

        vm.stopBroadcast();

        console.log("=== SnakeArena deployment ===");
        console.log("PrizeDistributor: %s", address(prizeDistributor));
        console.log("PowerUpStore:     %s", address(powerUpStore));
        console.log("SnakeArena:       %s", address(snakeArena));
        console.log("=============================");
        console.log("Trusted signer:   %s", trustedSigner);
        console.log("Treasury:         %s", treasury);
        console.log("USDC:             %s", address(usdc));
    }
}
