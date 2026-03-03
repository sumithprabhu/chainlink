/**
 * Arbitrum One deployment.
 * Usage: npx hardhat run scripts/deploy-arbitrum.ts --network arbitrum
 */
import { ethers } from "hardhat";

async function main() {
  const network = await ethers.provider.getNetwork();
  console.log("Network: Arbitrum One, chainId:", network.chainId);

  const [deployer] = await ethers.getSigners();
  const protocolFeeRecipient = process.env.PROTOCOL_FEE_RECIPIENT ?? deployer.address;
  const Engine = await ethers.getContractFactory("ConfidentialExecutionEngine");
  const engine = await Engine.deploy(deployer.address, protocolFeeRecipient);
  await engine.waitForDeployment();
  console.log("ConfidentialExecutionEngine:", await engine.getAddress());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
