import { ethers, upgrades } from "hardhat";

import * as dotenv from "dotenv";
dotenv.config();

async function main() {
  const factory721Factory = await ethers.getContractFactory("Factory721");
  const new721Factory = await upgrades.upgradeProxy(
    process.env.FACTORY721_ADDRESS || "",
    factory721Factory
  );

  console.log("Factory 721 upgraded to : ", new721Factory.address);

  const factory1155Factory = await ethers.getContractFactory("Factory1155");
  const new1155Factory = await upgrades.upgradeProxy(
    process.env.FACTORY1155_ADDRESS || "",
    factory1155Factory
  );

  console.log("Factory 1155 upgraded to : ", new1155Factory.address);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
