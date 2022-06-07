import { ethers } from "hardhat";

import * as dotenv from "dotenv";
dotenv.config();

async function main() {
  const erc20 = await ethers.getContractFactory("ERC20Test");

  const usdt = await erc20.deploy("Tether USDT", "USDT");
  console.log("USDT: ", usdt.address);

  const usdc = await erc20.deploy("Coin USD", "USDC");
  console.log("USDC: ", usdc.address);

  const weth = await erc20.deploy("Wrapped ETH", "WETH");
  console.log("WETH: ", weth.address);

  const spo = await erc20.deploy("Spores", "SPO");
  console.log("SPO: ", spo.address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
