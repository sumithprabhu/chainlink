/**
 * Sepolia testnet deployment.
 * Usage: npm run deploy:sepolia (from contract/)
 * Requires: SEPOLIA_RPC_URL, PRIVATE_KEY in .env
 */
import { ethers } from "hardhat";

async function main() {
  const network = await ethers.provider.getNetwork();
  if (Number(network.chainId) !== 11155111) {
    throw new Error("Expected chainId 11155111 (Sepolia)");
  }
  const [deployer] = await ethers.getSigners();
  const engineAddress = process.env.ENGINE_ADDRESS ?? deployer.address;
  const protocolFeeRecipient = process.env.PROTOCOL_FEE_RECIPIENT ?? deployer.address;
  const Engine = await ethers.getContractFactory("ConfidentialExecutionEngine");
  const engine = await Engine.deploy(engineAddress, protocolFeeRecipient);
  await engine.waitForDeployment();
  const address = await engine.getAddress();
  const tx = engine.deploymentTransaction();
  if (tx) {
    const receipt = await tx.wait(2);
    if (!receipt) throw new Error("Deployment tx receipt missing");
  }
  console.log("DEPLOYED_ADDRESS:", address);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
