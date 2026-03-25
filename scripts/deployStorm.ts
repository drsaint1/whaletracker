import pkg from "hardhat";
const { ethers } = pkg;

async function main() {
  const handlerAddress = process.env.NEXT_PUBLIC_WHALE_HANDLER_ADDRESS;
  if (!handlerAddress) throw new Error("Set NEXT_PUBLIC_WHALE_HANDLER_ADDRESS in .env");

  const stormThreshold = ethers.parseEther("10000");
  console.log("Deploying WhaleStorm with threshold:", stormThreshold.toString());
  console.log("WhaleHandler address:", handlerAddress);

  const WhaleStorm = await ethers.getContractFactory("WhaleStorm");
  const storm = await WhaleStorm.deploy(handlerAddress, stormThreshold);
  await storm.waitForDeployment();

  const stormAddress = await storm.getAddress();
  console.log("WhaleStorm deployed to:", stormAddress);
  console.log(`\nAdd to .env:\nNEXT_PUBLIC_WHALE_STORM_ADDRESS=${stormAddress}`);
  console.log("\nFund with 32 STT, then run: npm run subscribe-storm");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
