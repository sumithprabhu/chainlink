import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Deploying with account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(balance), "ETH");

  const Engine = await ethers.getContractFactory("ConfidentialExecutionEngine");
  const engine = await Engine.deploy();
  await engine.waitForDeployment();
  const address = await engine.getAddress();
  console.log("ConfidentialExecutionEngine deployed to:", address);
  console.log("Domain separator:", await engine.domainSeparator());
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
