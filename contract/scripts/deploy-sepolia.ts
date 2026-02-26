/**
 * Sepolia testnet deployment.
 * Usage: npx hardhat run scripts/deploy-sepolia.ts --network sepolia
 */
import { ethers } from "hardhat";

async function main() {
  const network = await ethers.provider.getNetwork();
  console.log("Network: Sepolia, chainId:", network.chainId);

  const [deployer] = await ethers.getSigners();
  const Engine = await ethers.getContractFactory("ConfidentialExecutionEngine");
  const engine = await Engine.deploy();
  await engine.waitForDeployment();
  console.log("ConfidentialExecutionEngine:", await engine.getAddress());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
