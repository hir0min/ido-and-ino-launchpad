import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { ERC20Test, Tier, Pool } from "../typechain";

async function increaseTime(duration: number): Promise<void> {
  ethers.provider.send("evm_increaseTime", [duration]);
  ethers.provider.send("evm_mine", []);
}

describe("Tier contract", () => {
  let lockToken: ERC20Test;
  let pool: Pool;
  let tier: Tier;
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

    const poolFactory = await ethers.getContractFactory("Pool", admin);

    pool = (await upgrades.deployProxy(poolFactory, [lockToken.address], {
      initializer: "init",
    })) as Pool;
    await pool.deployed();

    for (const user of users) {
      await lockToken.mint(user.address, prefund);
      await lockToken.connect(user).approve(pool.address, allowance);
    }

    const tierFactory = await ethers.getContractFactory("Tier", admin);
    tier = await tierFactory.deploy(pool.address);
  });

  it("should update pool contract address", async () => {
    await tier.updatePoolContract(pool.address);

    const address = await tier.pool();
    expect(pool.address).deep.equal(address);
  });

  it("should fail to update pool contract address if caller is not contract owner", async () => {
    await expect(
      tier
        .connect(users[0])
        .updatePoolContract(ethers.Wallet.createRandom().address)
    ).to.revertedWith("Ownable: caller is not the owner");

    const address = await tier.pool();
    expect(pool.address).deep.equal(address);
  });

  it("should fail to create event if number of tiers is equal to zero", async () => {
    const eventId = 1;
    const numOfTiers = 0;
    const now = (await ethers.provider.getBlock("latest")).timestamp;

    await expect(
      tier
        .connect(admin)
        .createEvent(eventId, numOfTiers, now, now + 15 * 60 * 1000)
    ).to.be.revertedWith("_numOfTiers is 0");
  });

  it("should fail to create event if start date greater than end date", async () => {
    const eventId = 1;
    const numOfTiers = 3;
    const now = (await ethers.provider.getBlock("latest")).timestamp;

    await expect(
      tier
        .connect(admin)
        .createEvent(eventId, numOfTiers, now, now - 15 * 60 * 1000)
    ).to.be.revertedWith("Invalid ending event");
  });

  it("should fail to create event if start time is less than current block timestamp", async () => {
    const eventId = 1;
    const numOfTiers = 3;
    const now = (await ethers.provider.getBlock("latest")).timestamp;

    await expect(
      tier
        .connect(admin)
        .createEvent(
          eventId,
          numOfTiers,
          now - 10 * 60 * 1000,
          now + 15 * 60 * 1000
        )
    ).to.be.revertedWith("Invalid starting event");
  });

  it("should create event", async () => {
    const eventId = 1;
    const numOfTiers = 3;
    const now = (await ethers.provider.getBlock("latest")).timestamp;
    const startAt = now + 10 * 60 * 1000;
    const endAt = now + 15 * 60 * 1000;

    await expect(
      tier.connect(admin).createEvent(eventId, numOfTiers, startAt, endAt)
    )
      .to.emit(tier, "EventCreated")
      .withArgs(eventId, numOfTiers, startAt, endAt);

    const res = await tier.events(eventId);
    expect(res.numOfTiers).deep.equal(numOfTiers);
    expect(res.startAt).deep.equal(startAt);
    expect(res.endAt).deep.equal(endAt);
  });

  it("should fail to create event if event id has already existed", async () => {
    const eventId = 1;
    const numOfTiers = 3;
    const now = (await ethers.provider.getBlock("latest")).timestamp;

    await expect(
      tier
        .connect(admin)
        .createEvent(
          eventId,
          numOfTiers,
          now + 10 * 60 * 1000,
          now + 15 * 60 * 1000
        )
    ).to.be.revertedWith("Invalid event id");
  });

  it("should fail to set requirements by tier if requirements are invalid", async () => {
    const eventId = 1;
    const requirements = [25000, 50000, 100000, 4000000];

    await expect(
      tier.setRequirementsByTier(eventId, requirements)
    ).to.be.revertedWith("Invalid setting");
  });

  it("should fail to set requirements by tier if event has already ended", async () => {
    const eventId = 1;
    const requirements = [25000, 50000, 100000];

    await increaseTime(30 * 60 * 1000);

    await expect(
      tier.setRequirementsByTier(eventId, requirements)
    ).to.be.revertedWith("Event already ended");
  });

  it("should set requirements by tier", async () => {
    const eventId = 2;
    const numOfTiers = 3;
    const now = (await ethers.provider.getBlock("latest")).timestamp;
    const startAt = now + 5 * 60 * 1000;
    const endAt = now + 15 * 60 * 1000;
    const requirements = [25000, 50000, 100000];

    await tier.connect(admin).createEvent(eventId, numOfTiers, startAt, endAt);

    await tier.setRequirementsByTier(eventId, requirements);

    for (let i = 0; i < numOfTiers; i++) {
      const setting = await tier.settings(eventId, i + 1);
      expect(setting).deep.equal(requirements[i]);
    }
  });

  it("should get whitelist", async () => {
    const eventId = 2;

    // Total locked do not meet the lowest requirement = 25000
    await pool.connect(users[0]).lock(24000);
    await pool.connect(users[1]).lock(1000);

    // Tier 1 = [25000, 50000)
    await pool.connect(users[2]).lock(30000);
    await pool.connect(users[3]).lock(45000);
    await pool.connect(users[4]).lock(25000);

    // Tier 2 = [50000, 100000)
    await pool.connect(users[5]).lock(99000);

    // Tier3 = [100000, +)
    await pool.connect(users[6]).lock(999999);

    const whitelistInfo = await tier.getWhitelist(
      eventId,
      users.map((u) => u.address)
    );

    for (let i = 0; i < users.length; i++) {
      const tier = whitelistInfo[0][i];
      const amount = whitelistInfo[1][i];
      if (amount.gte(100000)) {
        expect(tier).deep.equal(3);
      } else if (amount.lt(100000) && amount.gte(50000)) {
        expect(tier).deep.equal(2);
      } else if (amount.lt(50000) && amount.gte(25000)) {
        expect(tier).deep.equal(1);
      } else expect(tier).deep.equal(0);
    }
  });

  it("should fail to get whitelist if list of address is empty", async () => {
    const eventId = 2;
    await expect(tier.getWhitelist(eventId, [])).to.revertedWith("Empty list");
  });
});
