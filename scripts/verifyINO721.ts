import hre from "hardhat";

import * as dotenv from "dotenv";
dotenv.config();

async function main() {
  console.log("Verify INO721 contract......");
  const governance = "0xDb3093d1D8150E05c84dE290C94ae5879EDa0d0e";
  const admin = "0xE744B732c5C0d3a111b32f83341FE3e1e9fe3Dab";
  const campaignId = 1000;
  const startAt = 1645028450;
  const endAt = 1645030250;
  const paymentToken = "0xdd1c2a314980823185Fb88340fdE978557f138B2";
  const name = "Test 1";
  const symbol = "Test 1";
  const uri =
    "https://api-launchpad2.spores.dev/api/campaigns/620d034dd8203c2f6a8968ea/metadata";
  await hre.run("verify:verify", {
    address: "0x0e8Be8fE9B69032ABE01b02195c3f4455ae907CF",
    constructorArguments: [
      governance,
      admin,
      campaignId,
      startAt,
      endAt,
      paymentToken,
      name,
      symbol,
      uri,
    ],
  });

  console.log("Verify Complete");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
