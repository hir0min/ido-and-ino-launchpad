import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Governance } from "../typechain";

describe("Governance contract", () => {
  let governance: Governance;
  let admin: SignerWithAddress;
  let users: SignerWithAddress[];
  let verifier: SignerWithAddress;
  let treasury: SignerWithAddress;
  let manager: SignerWithAddress;
  let token1Address: string, token2Address: string, token3Address: string;
  let deployTreasuryAddr: string,
    deployVerifierAddr: string,
    deployManagerAddr: string,
    deployTokenAddr: string;

  before(async () => {
    [admin, treasury, verifier, manager, ...users] = await ethers.getSigners();
    deployTreasuryAddr = ethers.Wallet.createRandom().address;
    deployVerifierAddr = ethers.Wallet.createRandom().address;
    deployManagerAddr = ethers.Wallet.createRandom().address;
    deployTokenAddr = ethers.Wallet.createRandom().address;
    token1Address = ethers.Wallet.createRandom().address;
    token2Address = ethers.Wallet.createRandom().address;
    token3Address = ethers.Wallet.createRandom().address;

    const governancecTestFactory = await ethers.getContractFactory(
      "Governance",
      admin
    );

    governance = await governancecTestFactory.deploy(
      deployTreasuryAddr,
      deployVerifierAddr,
      deployManagerAddr,
      [deployTokenAddr]
    );
  });

  it("should update treasury address if caller is contract owner", async () => {
    await expect(governance.connect(admin).updateTreasury(treasury.address))
      .to.emit(governance, "Treasury")
      .withArgs(deployTreasuryAddr, treasury.address);

    const addr = await governance.treasury();
    expect(addr).deep.equal(treasury.address);
  });

  it("should fail to update treasury address if caller is not contract owner", async () => {
    await expect(
      governance.connect(users[0]).updateTreasury(treasury.address)
    ).to.revertedWith("Ownable: caller is not the owner");

    const addr = await governance.treasury();
    expect(addr).deep.equal(treasury.address);
  });

  it("should fail to update treasury address if treasury address is invalid", async () => {
    await expect(
      governance.connect(admin).updateTreasury(ethers.constants.AddressZero)
    ).to.revertedWith("Set zero address");

    const addr = await governance.treasury();
    expect(addr).deep.equal(treasury.address);
  });

  it("should update verifier address if caller is contract owner", async () => {
    await governance.connect(admin).updateVerifier(verifier.address);

    const addr = await governance.verifier();
    expect(addr).deep.equal(verifier.address);
  });

  it("should fail to update verifier address if caller is not contract owner", async () => {
    await expect(
      governance.connect(users[0]).updateVerifier(verifier.address)
    ).to.revertedWith("Ownable: caller is not the owner");

    const addr = await governance.verifier();
    expect(addr).deep.equal(verifier.address);
  });

  it("should fail to update verifier address if verifier address is invalid", async () => {
    await expect(
      governance.connect(admin).updateVerifier(ethers.constants.AddressZero)
    ).to.revertedWith("Set zero address");

    const addr = await governance.verifier();
    expect(addr).deep.equal(verifier.address);
  });

  it("should update manager address if caller is contract owner", async () => {
    await governance.connect(admin).updateManager(manager.address);

    const addr = await governance.manager();
    expect(addr).deep.equal(manager.address);
  });

  it("should fail to update manager address if caller is not contract owner", async () => {
    await expect(
      governance.connect(users[0]).updateManager(manager.address)
    ).to.revertedWith("Ownable: caller is not the owner");

    const addr = await governance.manager();
    expect(addr).deep.equal(manager.address);
  });

  it("should fail to update manager address if manager address is invalid", async () => {
    await expect(
      governance.connect(admin).updateManager(ethers.constants.AddressZero)
    ).to.revertedWith("Set zero address");

    const addr = await governance.manager();
    expect(addr).deep.equal(manager.address);
  });

  it("should register token if caller is contract owner", async () => {
    await expect(governance.connect(admin).registerToken(token1Address))
      .to.emit(governance, "PaymentAcceptance")
      .withArgs(token1Address, true);

    const isAccepted = await governance.acceptedPayments(token1Address);
    expect(isAccepted).to.be.true;
  });

  it("should fail to register token if caller is not contract owner", async () => {
    await expect(
      governance.connect(users[1]).registerToken(token2Address)
    ).to.revertedWith("Ownable: caller is not the owner");

    const isAccepted = await governance.acceptedPayments(token2Address);
    expect(isAccepted).to.be.false;
  });

  it("should fail to register token if token is already registered", async () => {
    await expect(
      governance.connect(admin).registerToken(token1Address)
    ).to.revertedWith("Token registered");
  });

  it("should fail to register token if token address is invalid", async () => {
    await expect(
      governance.connect(admin).registerToken(ethers.constants.AddressZero)
    ).to.revertedWith("Set zero address");
  });

  it("should unregister token if caller is contract owner", async () => {
    await expect(governance.connect(admin).unregisterToken(token1Address))
      .to.emit(governance, "PaymentAcceptance")
      .withArgs(token1Address, false);

    const isAccepted = await governance.acceptedPayments(token1Address);
    expect(isAccepted).to.be.false;
  });

  it("should fail to unregister token if caller is not contract owner", async () => {
    await governance.connect(admin).registerToken(token2Address);
    await expect(
      governance.connect(users[1]).unregisterToken(token2Address)
    ).to.revertedWith("Ownable: caller is not the owner");

    const isAccepted = await governance.acceptedPayments(token2Address);
    expect(isAccepted).to.be.true;
  });

  it("should fail to unregister token if token is not registered", async () => {
    await expect(
      governance.connect(admin).unregisterToken(token3Address)
    ).to.revertedWith("Token not registered");
  });
});
