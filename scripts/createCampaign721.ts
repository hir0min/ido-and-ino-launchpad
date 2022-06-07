import { ethers } from "hardhat";

import * as dotenv from "dotenv";
dotenv.config();

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  //  Add MANAGER_KEY to the .env
  const [manager] = await ethers.getSigners();
  const factory = await ethers.getContractAt(
    "Factory721",
    process.env.FACTORY721_ADDRESS || ""
  );
  await factory
    .connect(manager)
    .createCampaign(parseInt(process.env.CAMPAIGN_ID || ""), {
      startAt: parseInt(process.env.START_AT || ""),
      endAt: parseInt(process.env.END_AT || ""),
      paymentToken: process.env.PAYMENT_TOKEN_ADDR,
      name: process.env.TOKEN_NAME,
      symbol: process.env.TOKEN_SYMBOL,
      uri: process.env.TOKEN_BASE_URI,
    });

  await sleep(5000); // wait for confirmation

  const ino721 = await factory.campaigns(
    parseInt(process.env.CAMPAIGN_ID || "")
  );
  console.log("Campaign created at: ", ino721);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
