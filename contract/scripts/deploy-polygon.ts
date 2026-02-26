/**
 * Polygon mainnet deployment.
 * Usage: npx hardhat run scripts/deploy-polygon.ts --network polygon
 */
import { ethers } from "hardhat";

async function main() {
  const network = await ethers.provider.getNetwork();
  console.log("Network: Polygon, chainId:", network.chainId);

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
