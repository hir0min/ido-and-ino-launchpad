import hre from "hardhat";

import * as dotenv from "dotenv";
dotenv.config();

async function main() {
  console.log("Verify Governance contract......");
  const governance = "0x775c4DA16b4A1f0e83B92ce78a1A541a9e714F13";
  await hre.run("verify:verify", {
    address: governance,
    constructorArguments: [
      process.env.TREASURY,
      process.env.VERIFIER,
      process.env.MANAGER,
      process.env.PAYMENT_TOKENS !== undefined
        ? process.env.PAYMENT_TOKENS?.split(",")
        : [],
    ],
  });

  const factory721 = "0x367487028a1EA5CC7d51a1572E67DDD5C0207124";
  console.log("Verify Factory721 contract......");
  await hre.run("verify:verify", {
    address: factory721,
    constructorArguments: [],
  });

  const factory1155 = "0x4Fa1dA425Fa96603922b3F730518d1cF5f27ac60";
  console.log("Verify Factory1155 contract......");
  await hre.run("verify:verify", {
    address: factory1155,
    constructorArguments: [],
  });

  console.log("Verify Complete");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
