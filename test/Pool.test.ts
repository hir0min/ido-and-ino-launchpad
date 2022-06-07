import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { ERC20Test, Pool } from "../typechain";

describe("Pool contract", () => {
  let lockToken: ERC20Test;
  let pool: Pool;
  let admin: SignerWithAddress;
  let users: SignerWithAddress[];

  const prefund = 10 ** 9;
  const allowance = 10 ** 6;

  before(async () => {
    [admin, ...users] = await ethers.getSigners();

    const erc20TestFactory = await ethers.getContractFactory(
      "ERC20Test",
      admin
    );
    lockToken = await erc20TestFactory.deploy("Spores", "SPO");

    for (const user of users) await lockToken.mint(user.address, prefund);
  });

  it("should deploy pool contract using proxy pattern", async () => {
    const poolFactory = await ethers.getContractFactory("Pool", admin);

    pool = (await upgrades.deployProxy(poolFactory, [lockToken.address], {
      initializer: "init",
    })) as Pool;
    await pool.deployed();
  });

  it("should lock tokens into pool", async () => {
    const currentBids = [];
    const numOfPartitipants = 3;
    for (let i = 0; i < numOfPartitipants; i++) {
      const participant = users[i];
      const bid = (i + 1) * 10 ** 5;

      await lockToken.connect(participant).approve(pool.address, allowance);
      await expect(pool.connect(participant).lock(bid))
        .to.emit(pool, "TokenLock")
        .withArgs(participant.address, 0, bid);

      currentBids.push(bid);

      const balance = await lockToken.balanceOf(participant.address);
      expect(balance).deep.equal(prefund - bid);

      const lockedAmount = await pool.lockedAmt(participant.address);
      expect(lockedAmount).deep.equal(bid);
    }

    for (let i = 0; i < numOfPartitipants; i++) {
      const participant = users[i];
      const newBid = 20000;

      await lockToken.connect(participant).approve(pool.address, allowance);
      await expect(pool.connect(participant).lock(newBid))
        .to.emit(pool, "TokenLock")
        .withArgs(participant.address, currentBids[i], currentBids[i] + newBid);

      const lockedAmount = await pool.lockedAmt(participant.address);
      expect(lockedAmount).deep.equal(currentBids[i] + newBid);
    }

    const totalParticipants = await pool.totalUsers();
    expect(totalParticipants).deep.equal(numOfPartitipants);
  });

  it("should fail to lock tokens into pool if user does not set approval for pool contract", async () => {
    const currentNumOfParticipants = await pool.totalUsers();

    for (let i = 3; i < users.length; i++) {
      const bid = (i + 1) * 10 ** 5;
      await expect(pool.connect(users[i]).lock(bid)).to.be.revertedWith(
        "ERC20: insufficient allowance"
      );
    }

    const totalParticipants = await pool.totalUsers();
    expect(totalParticipants).deep.equal(currentNumOfParticipants);
  });

  it("should fail to lock tokens into pool if the bid exceed max allowance of user", async () => {
    const currentNumOfParticipants = await pool.totalUsers();

    for (let i = 0; i < users.length; i++) {
      const bid = (i + 1) * 10 ** 9;

      await lockToken.connect(users[i]).approve(pool.address, allowance);
      await expect(pool.connect(users[i]).lock(bid)).to.be.revertedWith(
        "ERC20: insufficient allowance"
      );
    }

    const totalParticipants = await pool.totalUsers();
    expect(totalParticipants).deep.equal(currentNumOfParticipants);
  });

  it("should withdraw locked tokens from pool contract", async () => {
    let currentNumOfParticipants = await pool.totalUsers();

    let locked = await pool.lockedAmt(users[0].address);
    await expect(pool.connect(users[0]).withdraw(locked))
      .to.emit(pool, "TokenWithdrawal")
      .withArgs(users[0].address, locked, 0);

    let totalParticipants = await pool.totalUsers();
    expect(totalParticipants).deep.equal(currentNumOfParticipants.sub(1));

    currentNumOfParticipants = totalParticipants;

    locked = await pool.lockedAmt(users[1].address);
    const withdrawal = 10000;
    await expect(pool.connect(users[1]).withdraw(withdrawal))
      .to.emit(pool, "TokenWithdrawal")
      .withArgs(users[1].address, locked, locked.sub(withdrawal));

    totalParticipants = await pool.totalUsers();
    expect(totalParticipants).deep.equal(currentNumOfParticipants);
  });

  it("should fail to withdraw locked tokens if user's locked balance is insufficient", async () => {
    const currentNumOfParticipants = await pool.totalUsers();

    for (const user of users) {
      const withdrawal = 10 ** 10;
      await expect(pool.connect(user).withdraw(withdrawal)).to.be.revertedWith(
        "LockPool: Insufficient balance"
      );
    }

    const totalParticipants = await pool.totalUsers();
    expect(totalParticipants).deep.equal(currentNumOfParticipants);
  });

  it("should get list of locked balances by address", async () => {
    const lockedAmounts = await pool.getLockedAmounts(
      users.map((u) => u.address)
    );

    for (let i = 0; i < users.length; i++) {
      const locked = await pool.lockedAmt(users[i].address);
      expect(locked).deep.equal(lockedAmounts[i]);
    }
  });
});
