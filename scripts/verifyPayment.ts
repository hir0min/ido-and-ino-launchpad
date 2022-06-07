import hre from "hardhat";

import * as dotenv from "dotenv";
dotenv.config();

async function main() {
  console.log("Verify USDT contract......");
  await hre.run("verify:verify", {
    address: process.env.USDT,
    constructorArguments: ["Tether USDT", "USDT"],
  });

  console.log("Verify Complete");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
