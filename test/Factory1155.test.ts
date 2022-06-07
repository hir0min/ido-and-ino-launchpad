import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Factory1155, Governance, ERC20Test } from "../typechain";

async function increaseTime(duration: number): Promise<void> {
  ethers.provider.send("evm_increaseTime", [duration]);
  ethers.provider.send("evm_mine", []);
}

async function decreaseTime(duration: number): Promise<void> {
  ethers.provider.send("evm_increaseTime", [duration * -1]);
  ethers.provider.send("evm_mine", []);
}

describe("Factory1155 contract", () => {
  let admin: SignerWithAddress;
  let users: SignerWithAddress[];
  let verifier: SignerWithAddress;
  let treasury: SignerWithAddress;
  let manager: SignerWithAddress;

  let factory: Factory1155;
  let governance: Governance;
  let paymentToken: ERC20Test;

  const balance = 1000000;
  const uri = "https://ino.example/token/";
  const days = 24 * 3600;

  before(async () => {
    [admin, treasury, verifier, manager, ...users] = await ethers.getSigners();

    const erc20TestFactory = await ethers.getContractFactory(
      "ERC20Test",
      admin
    );
    paymentToken = await erc20TestFactory.deploy("PaymentToken", "PMT");

    for (const u of users) await paymentToken.mint(u.address, balance);

    const governanceFactory = await ethers.getContractFactory(
      "Governance",
      admin
    );
    governance = await governanceFactory.deploy(
      treasury.address,
      verifier.address,
      manager.address,
      [paymentToken.address]
    );
  });

  it("should deploy factory contract using proxy pattern", async () => {
    const contractFactory = await ethers.getContractFactory(
      "Factory1155",
      admin
    );

    factory = (await upgrades.deployProxy(
      contractFactory,
      [governance.address],
      {
        initializer: "init",
      }
    )) as Factory1155;
    await factory.deployed();
  });

  it("should update governance if caller is contract owner", async () => {
    const updateAddr = ethers.Wallet.createRandom().address;
    await factory.connect(admin).updateGovernance(updateAddr);

    let res = await factory.governance();
    expect(res).deep.equal(updateAddr);

    await factory.connect(admin).updateGovernance(governance.address);

    res = await factory.governance();
    expect(res).deep.equal(governance.address);
  });

  it("should fail to update governance if caller is not contract owner", async () => {
    const updateAddr = ethers.Wallet.createRandom().address;
    await expect(
      factory.connect(users[0]).updateGovernance(updateAddr)
    ).to.revertedWith("Ownable: caller is not the owner");
  });

  it("should fail to update governance if input address is invalid", async () => {
    const updateAddr = ethers.constants.AddressZero;
    await expect(
      factory.connect(admin).updateGovernance(updateAddr)
    ).to.revertedWith("Set zero address");
  });

  it("should create campaign if caller is campaign manager", async () => {
    const now = (await ethers.provider.getBlock("latest")).timestamp;
    const campaignId = 1;
    const setting = {
      startAt: now + 10 * days,
      endAt: now + 90 * days,
      paymentToken: paymentToken.address,
      name: "",
      symbol: "",
      uri,
    };

    const addr = await factory
      .connect(manager)
      .callStatic.createCampaign(campaignId, setting);

    await expect(factory.connect(manager).createCampaign(campaignId, setting))
      .emit(factory, "NewCampaign")
      .withArgs(campaignId, addr, setting.startAt, setting.endAt);

    let res: any = await factory.campaigns(campaignId);
    expect(res).deep.equal(addr);

    const ino1155 = await ethers.getContractAt("INO1155", addr);
    res = await ino1155.campaignId();
    expect(res).deep.equal(campaignId);

    res = await ino1155.startAt();
    expect(res).deep.equal(setting.startAt);

    res = await ino1155.endAt();
    expect(res).deep.equal(setting.endAt);

    res = await ino1155.governance();
    expect(res).deep.equal(governance.address);
  });

  it("should fail to create campaign if caller is not campaign manager", async () => {
    const now = (await ethers.provider.getBlock("latest")).timestamp;
    const campaignId = 2;
    const setting = {
      startAt: now + 10 * days,
      endAt: now + 90 * days,
      paymentToken: paymentToken.address,
      name: "",
      symbol: "",
      uri,
    };

    await expect(
      factory.connect(admin).createCampaign(campaignId, setting)
    ).to.revertedWith("Only Campaign Manager");
  });

  it("Should revert to create a Campaign when starting time of campaign has passed", async () => {
    const now = (await ethers.provider.getBlock("latest")).timestamp;
    const campaignId = 2;
    const setting = {
      startAt: now + 10 * days,
      endAt: now + 90 * days,
      paymentToken: paymentToken.address,
      name: "",
      symbol: "",
      uri,
    };

    await increaseTime(11 * days);
    await expect(
      factory.connect(manager).createCampaign(campaignId, setting)
    ).to.revertedWith("Invalid settings");
    await decreaseTime(11 * days);
  });

  it("Should revert to create a Campaign when ending time is greater than starting time", async () => {
    const now = (await ethers.provider.getBlock("latest")).timestamp;
    const campaignId = 2;
    const setting = {
      startAt: now + 30 * days,
      endAt: now + 10 * days,
      paymentToken: paymentToken.address,
      name: "",
      symbol: "",
      uri,
    };

    await expect(
      factory.connect(manager).createCampaign(campaignId, setting)
    ).to.revertedWith("Invalid settings");
  });

  it("should fail to create campaign if campaign already existed", async () => {
    const now = (await ethers.provider.getBlock("latest")).timestamp;
    const campaignId = 1;
    const setting = {
      startAt: now + 10 * days,
      endAt: now + 90 * days,
      paymentToken: paymentToken.address,
      name: "",
      symbol: "",
      uri,
    };

    await expect(
      factory.connect(manager).createCampaign(campaignId, setting)
    ).to.revertedWith("Campaign already existed");
  });

  it("should fail to create campaign if payment token is not registered", async () => {
    const now = (await ethers.provider.getBlock("latest")).timestamp;
    const campaignId = 2;
    const setting = {
      startAt: now + 10 * days,
      endAt: now + 30 * days,
      paymentToken: ethers.Wallet.createRandom().address,
      name: "",
      symbol: "",
      uri,
    };

    await expect(
      factory.connect(manager).createCampaign(campaignId, setting)
    ).to.revertedWith("Invalid payment token");
  });

  it("should set up wave if caller is campaign manager", async () => {
    const now = (await ethers.provider.getBlock("latest")).timestamp;
    const campaignId = 1;
    const waveId = 1;
    const limit = 2500;
    const startAt = now + 11 * days;
    const endAt = now + 20 * days;

    await increaseTime(10 * days);

    await factory
      .connect(manager)
      .setWave(campaignId, waveId, limit, startAt, endAt);
    const addr = await factory.campaigns(campaignId);

    const ino1155 = await ethers.getContractAt("INO1155", addr);
    const wave = await ino1155.waves(waveId);
    expect(wave.limit).deep.equal(limit);
    expect(wave.startAt).deep.equal(startAt);
    expect(wave.endAt).deep.equal(endAt);
    await decreaseTime(10 * days);
  });

  it("should fail to set up wave if caller is not campaign manager", async () => {
    const now = (await ethers.provider.getBlock("latest")).timestamp;
    const campaignId = 1;
    const waveId = 2;
    const limit = 2500;
    const startAt = now + 12 * days;
    const endAt = now + 20 * days;

    await increaseTime(10 * days);
    await expect(
      factory.connect(admin).setWave(campaignId, waveId, limit, startAt, endAt)
    ).to.revertedWith("Only Campaign Manager");
    await decreaseTime(10 * days);
  });

  it("should fail to set up wave if campaignId does not exist", async () => {
    const now = (await ethers.provider.getBlock("latest")).timestamp;
    const campaignId = 2;
    const waveId = 2;
    const limit = 2500;
    const startAt = now + 11 * days;
    const endAt = now + 20 * days;

    await increaseTime(10 * days);
    await expect(
      factory
        .connect(manager)
        .setWave(campaignId, waveId, limit, startAt, endAt)
    ).to.revertedWith("Campaign not exist");
    await decreaseTime(10 * days);
  });

  it("should fail to set up wave if waveId already set", async () => {
    const now = (await ethers.provider.getBlock("latest")).timestamp;
    const campaignId = 1;
    const waveId = 1;
    const limit = 2500;
    const startAt = now + 11 * days;
    const endAt = now + 20 * days;

    await increaseTime(10 * days);
    await expect(
      factory
        .connect(manager)
        .setWave(campaignId, waveId, limit, startAt, endAt)
    ).to.revertedWith("Wave already set");
    await decreaseTime(10 * days);
  });

  it("should fail to set up wave if campaign ended", async () => {
    const now = (await ethers.provider.getBlock("latest")).timestamp;
    const campaignId = 1;
    const waveId = 2;
    const limit = 3500;
    const startAt = now + 11 * days;
    const endAt = now + 20 * days;

    await increaseTime(100 * days); // campaign already ended
    await expect(
      factory
        .connect(manager)
        .setWave(campaignId, waveId, limit, startAt, endAt)
    ).to.revertedWith("Campaign ended");

    await decreaseTime(100 * days); // revert to current evm_time
  });

  it("should fail to set up wave if wave limit is zero", async () => {
    const now = (await ethers.provider.getBlock("latest")).timestamp;
    const campaignId = 1;
    const waveId = 2;
    const limit = 0;
    const startAt = now + 11 * days;
    const endAt = now + 20 * days;

    await increaseTime(10 * days);
    await expect(
      factory
        .connect(manager)
        .setWave(campaignId, waveId, limit, startAt, endAt)
    ).to.revertedWith("Invalid settings");
    await decreaseTime(10 * days);
  });

  it("should fail to set up wave if wave times is invalid - Time to start wave has passed", async () => {
    const now = (await ethers.provider.getBlock("latest")).timestamp;
    const campaignId = 1;
    const waveId = 2;
    const limit = 0;
    const startAt = now + 11 * days;
    const endAt = now + 20 * days;

    await increaseTime(12 * days);
    await expect(
      factory
        .connect(manager)
        .setWave(campaignId, waveId, limit, startAt, endAt)
    ).to.revertedWith("Invalid settings");

    await decreaseTime(12 * days); // revert to current evm_time
  });

  it("should fail to set up wave if wave times is invalid - Starting time greater than ending time", async () => {
    const now = (await ethers.provider.getBlock("latest")).timestamp;
    const campaignId = 1;
    const waveId = 2;
    const limit = 0;
    const startAt = now + 20 * days;
    const endAt = now + 11 * days;

    await increaseTime(10 * days);
    await expect(
      factory
        .connect(manager)
        .setWave(campaignId, waveId, limit, startAt, endAt)
    ).to.revertedWith("Invalid settings");
    await increaseTime(10 * days);
  });

  it("should fail to set up wave if wave times is invalid - Wave's ending time greater than campaign's ending time", async () => {
    const now = (await ethers.provider.getBlock("latest")).timestamp;
    const campaignId = 1;
    const waveId = 2;
    const limit = 0;
    const startAt = now + 20 * days;
    const endAt = now + 100 * days;

    await increaseTime(10 * days);
    await expect(
      factory
        .connect(manager)
        .setWave(campaignId, waveId, limit, startAt, endAt)
    ).to.revertedWith("Invalid settings");
    await increaseTime(10 * days);
  });
});
