import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Factory721, Governance, ERC20Test } from "../typechain";

async function increaseTime(duration: number): Promise<void> {
  ethers.provider.send("evm_increaseTime", [duration]);
  ethers.provider.send("evm_mine", []);
}

async function decreaseTime(duration: number): Promise<void> {
  ethers.provider.send("evm_increaseTime", [duration * -1]);
  ethers.provider.send("evm_mine", []);
}

describe("Factory721 Contract Testing", () => {
  let admin: SignerWithAddress;
  let manager: SignerWithAddress;
  let users: SignerWithAddress[];
  let verifier: SignerWithAddress;
  let treasury: SignerWithAddress;

  let factory: Factory721;
  let governance: Governance;
  let paymentToken: ERC20Test;
  let invalidPayment: ERC20Test;

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
    invalidPayment = await erc20TestFactory.deploy("InvalidPayment", "IPT");

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

  it("should deploy Factory contract using proxy pattern", async () => {
    const contractFactory = await ethers.getContractFactory(
      "Factory721",
      admin
    );

    factory = (await upgrades.deployProxy(
      contractFactory,
      [governance.address],
      {
        initializer: "init",
      }
    )) as Factory721;
    await factory.deployed();
  });

  it("Should succeed to update new Governance when Caller is Owner", async () => {
    const updateAddr = ethers.Wallet.createRandom().address;
    await factory.connect(admin).updateGovernance(updateAddr);

    let res = await factory.governance();
    expect(res).deep.equal(updateAddr);

    await factory.connect(admin).updateGovernance(governance.address);

    res = await factory.governance();
    expect(res).deep.equal(governance.address);
  });

  it("Should revert to update new Governance when Callers not have ownershiprole", async () => {
    const updateAddr = ethers.Wallet.createRandom().address;
    await expect(
      factory.connect(users[0]).updateGovernance(updateAddr)
    ).to.revertedWith("Ownable: caller is not the owner");
  });

  it("Should revert to update new Governance when Owner tries to set zero address", async () => {
    const updateAddr = ethers.constants.AddressZero;
    await expect(
      factory.connect(admin).updateGovernance(updateAddr)
    ).to.revertedWith("Set zero address");
  });

  it("Should succeed to create a Campaign when Caller has manager role", async () => {
    const now = (await ethers.provider.getBlock("latest")).timestamp;
    const campaignId = 1;
    const setting = {
      startAt: now + 10 * days,
      endAt: now + 90 * days,
      paymentToken: paymentToken.address,
      name: "NFT721Token",
      symbol: "N721T",
      uri,
    };

    //  callStatic not generate tx, just pre-check whether any reverts would be thrown
    //  In success, INO contract's address will be returned
    const addr = await factory
      .connect(manager)
      .callStatic.createCampaign(campaignId, setting);

    await expect(factory.connect(manager).createCampaign(campaignId, setting))
      .to.emit(factory, "NewCampaign")
      .withArgs(campaignId, addr, setting.startAt, setting.endAt);

    let res: any = await factory.campaigns(campaignId);
    expect(res).deep.equal(addr);

    const ino721 = await ethers.getContractAt("INO721", addr);
    res = await ino721.campaignId();
    expect(res).deep.equal(campaignId);

    res = await ino721.startAt();
    expect(res).deep.equal(setting.startAt);

    res = await ino721.endAt();
    expect(res).deep.equal(setting.endAt);

    res = await ino721.governance();
    expect(res).deep.equal(governance.address);
  });

  it("Should revert to create a Campaign when Caller not having manager role", async () => {
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

  it("Should revert to create a Campaign when campaignId already existed", async () => {
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

  it("Should revert to create a Campaign when payment token is invalid", async () => {
    const now = (await ethers.provider.getBlock("latest")).timestamp;
    const campaignId = 2;
    const setting = {
      startAt: now + 10 * days,
      endAt: now + 90 * days,
      paymentToken: invalidPayment.address,
      name: "",
      symbol: "",
      uri,
    };

    await expect(
      factory.connect(manager).createCampaign(campaignId, setting)
    ).to.revertedWith("Invalid payment token");
  });

  it("Should succeed to set up a new wave with valid settings when Caller has manager role", async () => {
    const now = (await ethers.provider.getBlock("latest")).timestamp;
    const campaignId = 1;
    const waveId = 1;
    const limit = 1;
    const startAt = now + 11 * days;
    const endAt = now + 20 * days;

    await increaseTime(10 * days);

    const addr = await factory.campaigns(campaignId);
    await expect(
      factory
        .connect(manager)
        .setWave(campaignId, waveId, limit, startAt, endAt)
    )
      .to.emit(factory, "NewWave")
      .withArgs(campaignId, addr, waveId, startAt, endAt);

    const ino721 = await ethers.getContractAt("INO721", addr);
    const wave = await ino721.waves(waveId);
    expect(wave.limit).deep.equal(limit);
    expect(wave.startAt).deep.equal(startAt);
    expect(wave.endAt).deep.equal(endAt);

    await decreaseTime(10 * days);
  });

  it("Should revert to set up a new wave when Caller not having manager role", async () => {
    const now = (await ethers.provider.getBlock("latest")).timestamp;
    const campaignId = 2;
    const waveId = 2;
    const limit = 1;
    const startAt = now + 11 * days;
    const endAt = now + 20 * days;

    await increaseTime(10 * days);
    await expect(
      factory.connect(admin).setWave(campaignId, waveId, limit, startAt, endAt)
    ).to.revertedWith("Only Campaign Manager");
    await decreaseTime(10 * days);
  });

  it("Should revert to set up a new wave when campaignId not existed", async () => {
    const now = (await ethers.provider.getBlock("latest")).timestamp;
    const campaignId = 2;
    const waveId = 2;
    const limit = 1;
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

  it("Should revert to set up a new wave when waveId already set", async () => {
    const now = (await ethers.provider.getBlock("latest")).timestamp;
    const campaignId = 1;
    const waveId = 1;
    const limit = 1;
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

  it("Should revert to set up a new wave when Campaign already ended", async () => {
    const now = (await ethers.provider.getBlock("latest")).timestamp;
    const campaignId = 1;
    const waveId = 2;
    const limit = 1;
    const startAt = now + 11 * days;
    const endAt = now + 20 * days;

    await increaseTime(100 * days);
    await expect(
      factory
        .connect(manager)
        .setWave(campaignId, waveId, limit, startAt, endAt)
    ).to.revertedWith("Campaign ended");

    await decreaseTime(100 * days);
  });

  it("Should revert to set up a new wave when limit is set zero", async () => {
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
    await increaseTime(10 * days);
  });

  it("Should revert to set up a new wave when wave's schedule is invalid - Time to start wave has passed", async () => {
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

    await increaseTime(12 * days);
  });

  it("Should revert to set up a new wave when wave's schedule is invalid - Starting time greater than ending time", async () => {
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

  it("Should revert to set up a new wave when wave's schedule is invalid - Wave's ending time greater than campaign's ending time", async () => {
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
