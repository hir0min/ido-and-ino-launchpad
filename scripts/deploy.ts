import { ethers, upgrades } from "hardhat";

import * as dotenv from "dotenv";
dotenv.config();

async function main() {
  const governanceFactory = await ethers.getContractFactory("Governance");
  const governance = await governanceFactory.deploy(
    process.env.TREASURY,
    process.env.VERIFIER,
    process.env.MANAGER,
    process.env.PAYMENT_TOKENS !== undefined
      ? process.env.PAYMENT_TOKENS?.split(",")
      : []
  );

  console.log("Governance deployed to: ", governance.address);

  const factory721Factory = await ethers.getContractFactory("Factory721");
  const factory721 = await upgrades.deployProxy(
    factory721Factory,
    [governance.address],
    { initializer: "init" }
  );
  await factory721.deployed();

  console.log("Factory 721 deployed to: ", factory721.address);

  const factory1155Factory = await ethers.getContractFactory("Factory1155");
  const factory1155 = await upgrades.deployProxy(
    factory1155Factory,
    [governance.address],
    { initializer: "init" }
  );
  await factory1155.deployed();

  console.log("Factory 1155 deployed to: ", factory1155.address);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
