import { ethers } from "hardhat";

import * as dotenv from "dotenv";
dotenv.config();

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const factory = await ethers.getContractAt(
    "Factory1155",
    process.env.FACTORY1155_ADDRESS || ""
  );
  await factory.createCampaign(parseInt(process.env.CAMPAIGN_ID || ""), {
    startAt: parseInt(process.env.START_AT || ""),
    endAt: parseInt(process.env.END_AT || ""),
    paymentToken: process.env.PAYMENT_TOKEN_ADDR,
    name: "",
    symbol: "",
    uri: process.env.TOKEN_BASE_URI,
  });

  await sleep(5000); // wait for confirmation

  const ino1155 = await factory.campaigns(
    parseInt(process.env.CAMPAIGN_ID || "")
  );
  console.log("Campaign created at: ", ino1155);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
