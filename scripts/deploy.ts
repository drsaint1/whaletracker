import pkg from "hardhat";
const { ethers } = pkg;

async function main() {
  // Default whale threshold: 1000 tokens (with 18 decimals)
  const whaleThreshold = ethers.parseEther("1000");

  console.log("Deploying WhaleHandler with threshold:", whaleThreshold.toString());

  const WhaleHandler = await ethers.getContractFactory("WhaleHandler");
  const handler = await WhaleHandler.deploy(whaleThreshold);
  await handler.waitForDeployment();

  const handlerAddress = await handler.getAddress();
  console.log("WhaleHandler deployed to:", handlerAddress);

  console.log("\nDeploying WhaleSummary...");

  const WhaleSummary = await ethers.getContractFactory("WhaleSummary");
  const summary = await WhaleSummary.deploy(handlerAddress);
  await summary.waitForDeployment();

  const summaryAddress = await summary.getAddress();
  console.log("WhaleSummary deployed to:", summaryAddress);

  console.log("\n--- Add these to your .env ---");
  console.log(`NEXT_PUBLIC_WHALE_HANDLER_ADDRESS=${handlerAddress}`);
  console.log(`NEXT_PUBLIC_WHALE_SUMMARY_ADDRESS=${summaryAddress}`);
  console.log("\nNext steps:");
  console.log("1. Fund BOTH contracts with at least 32 STT each for on-chain subscriptions");
  console.log("2. Run: npm run subscribe");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
