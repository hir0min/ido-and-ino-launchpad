import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Factory721, Governance, ERC20Test, INO721 } from "../typechain";
import { BigNumber } from "ethers";

async function increaseTime(duration: number): Promise<void> {
  ethers.provider.send("evm_increaseTime", [duration]);
  ethers.provider.send("evm_mine", []);
}

async function decreaseTime(duration: number): Promise<void> {
  ethers.provider.send("evm_increaseTime", [duration * -1]);
  ethers.provider.send("evm_mine", []);
}

async function verifyMessage(
  verifier: SignerWithAddress,
  buyer: SignerWithAddress,
  creator: string,
  saleId: number,
  tokenId: BigNumber,
  unitPrice: number,
  amount?: number,
  paymentToken?: string,
  type?: number
): Promise<string> {
  const message = amount
    ? ethers.utils.solidityKeccak256(
        [
          "address",
          "address",
          "uint256",
          "uint256",
          "uint256",
          "uint256",
          "address",
          "uint256",
        ],
        [
          buyer.address,
          creator,
          saleId,
          tokenId,
          unitPrice,
          amount,
          paymentToken,
          type,
        ]
      )
    : ethers.utils.solidityKeccak256(
        [
          "address",
          "address",
          "uint256",
          "uint256",
          "uint256",
          "address",
          "uint256",
        ],
        [buyer.address, creator, saleId, tokenId, unitPrice, paymentToken, type]
      );
  return verifier.signMessage(ethers.utils.arrayify(message));
}

function hashPacked(arr: BigNumber[]) {
  const types = new Array(arr.length).fill("uint256");
  const encodePacked = ethers.utils.solidityPack(types, arr);
  return ethers.utils.solidityKeccak256(["bytes"], [encodePacked]);
}

describe("INO721 contract", () => {
  let admin: SignerWithAddress;
  let manager: SignerWithAddress;
  let users: SignerWithAddress[];
  let verifier: SignerWithAddress;
  let treasury: SignerWithAddress;

  let factory: Factory721;
  let governance: Governance;
  let inoERC20: INO721;
  let inoNative: INO721;
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

    const now = (await ethers.provider.getBlock("latest")).timestamp;
    const campaignId1 = 1;
    const setting1 = {
      startAt: now + 10 * days,
      endAt: now + 90 * days,
      paymentToken: paymentToken.address,
      name: "INO721-Campaign1",
      symbol: "INOC1",
      uri,
    };
    await factory.connect(manager).createCampaign(campaignId1, setting1);
    let addr = await factory.campaigns(campaignId1);
    inoERC20 = (await ethers.getContractAt("INO721", addr)) as INO721;

    await increaseTime(10 * days); // increase time to set wave
    const waveId11 = 1;
    const limit11 = 2;
    const startWave11 = now + 11 * days;
    const endWave11 = now + 20 * days;
    await factory
      .connect(manager)
      .setWave(campaignId1, waveId11, limit11, startWave11, endWave11);

    const waveId12 = 2;
    const limit12 = 10;
    const startWave12 = now + 31 * days;
    const endWave12 = now + 40 * days;
    await factory
      .connect(manager)
      .setWave(campaignId1, waveId12, limit12, startWave12, endWave12);

    const waveId13 = 3;
    const limit13 = 5;
    const startWave13 = now + 41 * days;
    const endWave13 = now + 50 * days;
    await factory
      .connect(manager)
      .setWave(campaignId1, waveId13, limit13, startWave13, endWave13);
    await decreaseTime(10 * days); // set back to normal

    const campaignId2 = 2;
    const setting2 = {
      startAt: now + 10 * days,
      endAt: now + 90 * days,
      paymentToken: ethers.constants.AddressZero,
      name: "INO721-Campaign1",
      symbol: "INOC2",
      uri,
    };
    await factory.connect(manager).createCampaign(campaignId2, setting2);
    addr = await factory.campaigns(campaignId2);
    inoNative = (await ethers.getContractAt("INO721", addr)) as INO721;

    await increaseTime(10 * days); // increase time to set wave
    const waveId21 = 1;
    const limit21 = 2;
    const startWave21 = now + 11 * days;
    const endWave21 = now + 20 * days;
    await factory
      .connect(manager)
      .setWave(campaignId2, waveId21, limit21, startWave21, endWave21);

    const waveId22 = 2;
    const limit22 = 10;
    const startWave22 = now + 31 * days;
    const endWave22 = now + 40 * days;
    await factory
      .connect(manager)
      .setWave(campaignId2, waveId22, limit22, startWave22, endWave22);

    const waveId23 = 3;
    const limit23 = 6;
    const startWave23 = now + 41 * days;
    const endWave23 = now + 50 * days;
    await factory
      .connect(manager)
      .setWave(campaignId2, waveId23, limit23, startWave23, endWave23);
    await decreaseTime(10 * days); // set back to normal
  });

  it("should revert to set a new wave when Caller is not Factory contract", async () => {
    const now = (await ethers.provider.getBlock("latest")).timestamp;
    const campaignId = 1;
    const waveId = 2;
    const limit = 0;
    const startAt = now + 15 * 60 * 1000;
    const endAt = now + 18 * 60 * 1000;

    const addr = await factory.campaigns(campaignId);
    const ino721 = await ethers.getContractAt("INO721", addr);
    await expect(ino721.setWave(waveId, limit, startAt, endAt)).to.revertedWith(
      "Only Factory"
    );
  });

  describe("Redeem Single", () => {
    it("should succeed when User redeems a ticket with valid info - ERC20", async () => {
      const buyer = users[0];
      const creator = users[1];
      const saleId = 1;
      const tokenId = ethers.BigNumber.from(
        "1721000100000000000000000000000000001"
      );
      const unitPrice = 100;
      const amount = 1;
      const type = 721;
      const ticket = {
        saleId,
        creator: creator.address,
        tokenId,
        unitPrice,
        paymentToken: paymentToken.address,
        amount,
      };

      const balBuyer = await paymentToken.balanceOf(buyer.address);
      const balTreasury = await paymentToken.balanceOf(treasury.address);
      const itemBuyer = await inoERC20.balanceOf(buyer.address);

      const signature = await verifyMessage(
        verifier,
        buyer,
        creator.address,
        saleId,
        tokenId,
        unitPrice,
        amount,
        paymentToken.address,
        type
      );

      await paymentToken.connect(buyer).approve(inoERC20.address, balance);

      await increaseTime(11 * days); // increase time to redeem
      await expect(inoERC20.connect(buyer).redeemSingle(ticket, signature))
        .to.emit(inoERC20, "Redeem")
        .withArgs(
          inoERC20.address,
          buyer.address,
          tokenId,
          paymentToken.address,
          unitPrice,
          amount
        );

      expect(await paymentToken.balanceOf(buyer.address)).deep.equal(
        balBuyer.sub(amount * unitPrice)
      );
      expect(await inoERC20.balanceOf(buyer.address)).deep.equal(
        itemBuyer.add(amount)
      );
      expect(await paymentToken.balanceOf(treasury.address)).deep.equal(
        balTreasury.add(amount * unitPrice)
      );

      await decreaseTime(11 * days); // set back to normal
    });

    it("should succeed when User redeems a ticket with valid info - Native Coin", async () => {
      const buyer = users[0];
      const creator = users[1];
      const saleId = 1;
      const tokenId = ethers.BigNumber.from(
        "2721000100000000000000000000000000001"
      );
      const unitPrice = 100;
      const amount = 1;
      const type = 721;
      const ticket = {
        saleId,
        creator: creator.address,
        tokenId,
        unitPrice,
        paymentToken: ethers.constants.AddressZero,
        amount,
      };

      const balTreasury = await treasury.getBalance();
      const itemBuyer = await inoNative.balanceOf(buyer.address);

      const signature = await verifyMessage(
        verifier,
        buyer,
        creator.address,
        saleId,
        tokenId,
        unitPrice,
        amount,
        ethers.constants.AddressZero,
        type
      );

      await increaseTime(11 * days); // increase time to redeem
      await expect(
        inoNative
          .connect(buyer)
          .redeemSingle(ticket, signature, { value: unitPrice })
      )
        .to.emit(inoNative, "Redeem")
        .withArgs(
          inoNative.address,
          buyer.address,
          tokenId,
          ethers.constants.AddressZero,
          unitPrice,
          amount
        );

      expect(await inoERC20.balanceOf(buyer.address)).deep.equal(
        itemBuyer.add(amount)
      );
      expect(await treasury.getBalance()).deep.equal(
        balTreasury.add(amount * unitPrice)
      );
      await decreaseTime(11 * days); // set back to normal
    });

    it("should return tokenURI - ERC20", async () => {
      const tokenId = "1721000100000000000000000000000000001";
      const tokenUri = await inoERC20.tokenURI(tokenId);
      expect(tokenUri).deep.equal(uri + tokenId);
    });

    it("should return tokenURI - Native Coin", async () => {
      const tokenId = "2721000100000000000000000000000000001";
      const tokenUri = await inoNative.tokenURI(tokenId);
      expect(tokenUri).deep.equal(uri + tokenId);
    });

    it("should revert when User redeems a ticket, but Campaign not started yet - ERC20", async () => {
      const buyer = users[0];
      const creator = users[1];
      const saleId = 1;
      const tokenId = ethers.BigNumber.from(
        "1721000100000000000000000000000000002"
      );
      const unitPrice = 100;
      const amount = 1;
      const type = 721;
      const ticket = {
        saleId,
        creator: creator.address,
        tokenId,
        unitPrice,
        paymentToken: paymentToken.address,
        amount,
      };

      const signature = await verifyMessage(
        verifier,
        buyer,
        creator.address,
        saleId,
        tokenId,
        unitPrice,
        amount,
        paymentToken.address,
        type
      );

      const balBuyer = await paymentToken.balanceOf(buyer.address);
      const balTreasury = await paymentToken.balanceOf(treasury.address);
      const itemBuyer = await inoERC20.balanceOf(buyer.address);

      await expect(
        inoERC20.connect(buyer).redeemSingle(ticket, signature)
      ).to.revertedWith("Not yet started or expired");

      expect(await paymentToken.balanceOf(buyer.address)).deep.equal(balBuyer);
      expect(await paymentToken.balanceOf(treasury.address)).deep.equal(
        balTreasury
      );
      expect(await inoERC20.balanceOf(buyer.address)).deep.equal(itemBuyer);
      await expect(inoERC20.ownerOf(tokenId)).to.revertedWith(
        "ERC721: owner query for nonexistent token"
      );
    });

    it("should revert when User redeems a ticket, but Campaign not started yet - Native Coin", async () => {
      const buyer = users[0];
      const creator = users[1];
      const saleId = 1;
      const tokenId = ethers.BigNumber.from(
        "2721000100000000000000000000000000002"
      );
      const unitPrice = 100;
      const amount = 1;
      const type = 721;
      const ticket = {
        saleId,
        creator: creator.address,
        tokenId,
        unitPrice,
        paymentToken: ethers.constants.AddressZero,
        amount,
      };

      const signature = await verifyMessage(
        verifier,
        buyer,
        creator.address,
        saleId,
        tokenId,
        unitPrice,
        amount,
        ethers.constants.AddressZero,
        type
      );

      const balTreasury = await treasury.getBalance();
      const itemBuyer = await inoERC20.balanceOf(buyer.address);

      await expect(
        inoNative
          .connect(buyer)
          .redeemSingle(ticket, signature, { value: unitPrice })
      ).to.revertedWith("Not yet started or expired");

      expect(await treasury.getBalance()).deep.equal(balTreasury);
      expect(await inoNative.balanceOf(buyer.address)).deep.equal(itemBuyer);
      await expect(inoNative.ownerOf(tokenId)).to.revertedWith(
        "ERC721: owner query for nonexistent token"
      );
    });

    it("should revert when User redeems a ticket, but Campaign already ended - ERC20", async () => {
      const buyer = users[0];
      const creator = users[1];
      const saleId = 1;
      const tokenId = ethers.BigNumber.from(
        "1721000100000000000000000000000000002"
      );
      const unitPrice = 100;
      const amount = 1;
      const type = 721;
      const ticket = {
        saleId,
        creator: creator.address,
        tokenId,
        unitPrice,
        paymentToken: paymentToken.address,
        amount,
      };

      const signature = await verifyMessage(
        verifier,
        buyer,
        creator.address,
        saleId,
        tokenId,
        unitPrice,
        amount,
        paymentToken.address,
        type
      );

      const balBuyer = await paymentToken.balanceOf(buyer.address);
      const balTreasury = await paymentToken.balanceOf(treasury.address);
      const itemBuyer = await inoERC20.balanceOf(buyer.address);

      await increaseTime(100 * days);
      await expect(
        inoERC20.connect(buyer).redeemSingle(ticket, signature)
      ).to.revertedWith("Campaign ended");

      expect(await paymentToken.balanceOf(buyer.address)).deep.equal(balBuyer);
      expect(await paymentToken.balanceOf(treasury.address)).deep.equal(
        balTreasury
      );
      expect(await inoERC20.balanceOf(buyer.address)).deep.equal(itemBuyer);
      await expect(inoERC20.ownerOf(tokenId)).to.revertedWith(
        "ERC721: owner query for nonexistent token"
      );
      await decreaseTime(100 * days);
    });

    it("should revert when User redeems a ticket, but Campaign already ended - Native Coin", async () => {
      const buyer = users[0];
      const creator = users[1];
      const saleId = 1;
      const tokenId = ethers.BigNumber.from(
        "2721000100000000000000000000000000002"
      );
      const unitPrice = 100;
      const amount = 1;
      const type = 721;
      const ticket = {
        saleId,
        creator: creator.address,
        tokenId,
        unitPrice,
        paymentToken: ethers.constants.AddressZero,
        amount,
      };

      const signature = await verifyMessage(
        verifier,
        buyer,
        creator.address,
        saleId,
        tokenId,
        unitPrice,
        amount,
        ethers.constants.AddressZero,
        type
      );

      const balTreasury = await treasury.getBalance();
      const itemBuyer = await inoERC20.balanceOf(buyer.address);

      await increaseTime(100 * days);
      await expect(
        inoNative
          .connect(buyer)
          .redeemSingle(ticket, signature, { value: unitPrice })
      ).to.revertedWith("Campaign ended");

      expect(await treasury.getBalance()).deep.equal(balTreasury);
      expect(await inoNative.balanceOf(buyer.address)).deep.equal(itemBuyer);
      await expect(inoNative.ownerOf(tokenId)).to.revertedWith(
        "ERC721: owner query for nonexistent token"
      );
      await decreaseTime(100 * days);
    });

    it("should revert when User redeems tokens, but payment token is invalid - ERC20", async () => {
      const buyer = users[0];
      const creator = users[1];
      const saleId = 2;
      const tokenId = ethers.BigNumber.from(
        "1721000100000000000000000000000000002"
      );
      const unitPrice = 100;
      const amount = 1;
      const type = 721;
      const ticket = {
        saleId,
        creator: creator.address,
        tokenId,
        unitPrice,
        paymentToken: ethers.constants.AddressZero,
        amount,
      };

      const signature = await verifyMessage(
        verifier,
        buyer,
        creator.address,
        saleId,
        tokenId,
        unitPrice,
        amount,
        ethers.constants.AddressZero,
        type
      );

      const balBuyer = await paymentToken.balanceOf(buyer.address);
      const balTreasury = await paymentToken.balanceOf(treasury.address);
      const nativeTreasury = await treasury.getBalance();
      const itemBuyer = await inoERC20.balanceOf(buyer.address);

      await increaseTime(11 * days);
      await expect(
        inoERC20.connect(buyer).redeemSingle(ticket, signature)
      ).to.revertedWith("Invalid payment token");

      expect(await paymentToken.balanceOf(buyer.address)).deep.equal(balBuyer);
      expect(await paymentToken.balanceOf(treasury.address)).deep.equal(
        balTreasury
      );
      expect(await treasury.getBalance()).deep.equal(nativeTreasury);
      expect(await inoERC20.balanceOf(buyer.address)).deep.equal(itemBuyer);
      await expect(inoERC20.ownerOf(tokenId)).to.revertedWith(
        "ERC721: owner query for nonexistent token"
      );
      await decreaseTime(11 * days);
    });

    it("should revert when User redeems tokens, but payment token is invalid - Native Coin", async () => {
      const buyer = users[0];
      const creator = users[1];
      const saleId = 2;
      const tokenId = ethers.BigNumber.from(
        "2721000100000000000000000000000000002"
      );
      const unitPrice = 100;
      const amount = 1;
      const type = 721;
      const ticket = {
        saleId,
        creator: creator.address,
        tokenId,
        unitPrice,
        paymentToken: paymentToken.address,
        amount,
      };

      const signature = await verifyMessage(
        verifier,
        buyer,
        creator.address,
        saleId,
        tokenId,
        unitPrice,
        amount,
        paymentToken.address,
        type
      );

      const balBuyer = await paymentToken.balanceOf(buyer.address);
      const balTreasury = await paymentToken.balanceOf(treasury.address);
      const nativeTreasury = await treasury.getBalance();
      const itemBuyer = await inoNative.balanceOf(buyer.address);

      await increaseTime(11 * days);
      await expect(
        inoNative
          .connect(buyer)
          .redeemSingle(ticket, signature, { value: unitPrice })
      ).to.revertedWith("Invalid payment token");

      expect(await paymentToken.balanceOf(buyer.address)).deep.equal(balBuyer);
      expect(await paymentToken.balanceOf(treasury.address)).deep.equal(
        balTreasury
      );
      expect(await treasury.getBalance()).deep.equal(nativeTreasury);
      expect(await inoNative.balanceOf(buyer.address)).deep.equal(itemBuyer);
      await expect(inoNative.ownerOf(tokenId)).to.revertedWith(
        "ERC721: owner query for nonexistent token"
      );
      await decreaseTime(11 * days);
    });

    it("should revert when User redeems ticket, but TokenId was minted - ERC20", async () => {
      const buyer = users[0];
      const creator = users[1];
      const saleId = 2;
      const tokenId = ethers.BigNumber.from(
        "1721000100000000000000000000000000001"
      );
      const unitPrice = 100;
      const amount = 1;
      const type = 721;
      const ticket = {
        saleId,
        creator: creator.address,
        tokenId,
        unitPrice,
        paymentToken: paymentToken.address,
        amount,
      };

      const signature = await verifyMessage(
        verifier,
        buyer,
        creator.address,
        saleId,
        tokenId,
        unitPrice,
        amount,
        paymentToken.address,
        type
      );

      const balBuyer = await paymentToken.balanceOf(buyer.address);
      const balTreasury = await paymentToken.balanceOf(treasury.address);
      const itemBuyer = await inoERC20.balanceOf(buyer.address);

      await increaseTime(11 * days);
      await expect(
        inoERC20.connect(buyer).redeemSingle(ticket, signature)
      ).to.revertedWith("ERC721: token already minted");

      expect(await paymentToken.balanceOf(buyer.address)).deep.equal(balBuyer);
      expect(await paymentToken.balanceOf(treasury.address)).deep.equal(
        balTreasury
      );
      expect(await inoERC20.balanceOf(buyer.address)).deep.equal(itemBuyer);
      await decreaseTime(11 * days);
    });

    it("should revert when User redeems ticket, but TokenId was minted - Native Coin", async () => {
      const buyer = users[0];
      const creator = users[1];
      const saleId = 2;
      const tokenId = ethers.BigNumber.from(
        "2721000100000000000000000000000000001"
      );
      const unitPrice = 100;
      const amount = 1;
      const type = 721;
      const ticket = {
        saleId,
        creator: creator.address,
        tokenId,
        unitPrice,
        paymentToken: ethers.constants.AddressZero,
        amount,
      };

      const signature = await verifyMessage(
        verifier,
        buyer,
        creator.address,
        saleId,
        tokenId,
        unitPrice,
        amount,
        ethers.constants.AddressZero,
        type
      );

      const balTreasury = await treasury.getBalance();
      const itemBuyer = await inoNative.balanceOf(buyer.address);

      await increaseTime(11 * days);
      await expect(
        inoNative
          .connect(buyer)
          .redeemSingle(ticket, signature, { value: unitPrice })
      ).to.revertedWith("ERC721: token already minted");

      expect(await treasury.getBalance()).deep.equal(balTreasury);
      expect(await inoNative.balanceOf(buyer.address)).deep.equal(itemBuyer);
      await decreaseTime(11 * days);
    });

    it("should revert when User redeems a ticket, but CampaignID, in tokenID, is incorrect - ERC20", async () => {
      const buyer = users[0];
      const creator = users[1];
      const saleId = 2;
      const tokenId = ethers.BigNumber.from(
        "3721000100000000000000000000000000001"
      );
      const unitPrice = 100;
      const amount = 1;
      const type = 721;
      const ticket = {
        saleId,
        creator: creator.address,
        tokenId,
        unitPrice,
        paymentToken: paymentToken.address,
        amount,
      };

      const signature = await verifyMessage(
        verifier,
        buyer,
        creator.address,
        saleId,
        tokenId,
        unitPrice,
        amount,
        paymentToken.address,
        type
      );

      const balBuyer = await paymentToken.balanceOf(buyer.address);
      const balTreasury = await paymentToken.balanceOf(treasury.address);
      const itemBuyer = await inoERC20.balanceOf(buyer.address);

      await increaseTime(11 * days);
      await expect(
        inoERC20.connect(buyer).redeemSingle(ticket, signature)
      ).to.revertedWith("Invalid tokenId");

      expect(await paymentToken.balanceOf(buyer.address)).deep.equal(balBuyer);
      expect(await paymentToken.balanceOf(treasury.address)).deep.equal(
        balTreasury
      );
      expect(await inoERC20.balanceOf(buyer.address)).deep.equal(itemBuyer);
      await expect(inoERC20.ownerOf(tokenId)).to.revertedWith(
        "ERC721: owner query for nonexistent token"
      );
      await decreaseTime(11 * days);
    });

    it("should revert when User redeems a ticket, but CampaignID, in tokenID, is incorrect - Native Coin", async () => {
      const buyer = users[0];
      const creator = users[1];
      const saleId = 2;
      const tokenId = ethers.BigNumber.from(
        "3721000100000000000000000000000000001"
      );
      const unitPrice = 100;
      const amount = 1;
      const type = 721;
      const ticket = {
        saleId,
        creator: creator.address,
        tokenId,
        unitPrice,
        paymentToken: ethers.constants.AddressZero,
        amount,
      };

      const signature = await verifyMessage(
        verifier,
        buyer,
        creator.address,
        saleId,
        tokenId,
        unitPrice,
        amount,
        ethers.constants.AddressZero,
        type
      );

      const balTreasury = await treasury.getBalance();
      const itemBuyer = await inoNative.balanceOf(buyer.address);

      await increaseTime(11 * days);
      await expect(
        inoNative
          .connect(buyer)
          .redeemSingle(ticket, signature, { value: unitPrice })
      ).to.revertedWith("Invalid tokenId");

      expect(await treasury.getBalance()).deep.equal(balTreasury);
      expect(await inoNative.balanceOf(buyer.address)).deep.equal(itemBuyer);
      await expect(inoNative.ownerOf(tokenId)).to.revertedWith(
        "ERC721: owner query for nonexistent token"
      );
      await decreaseTime(11 * days);
    });

    it("should revert when User redeems a ticket, but type, in tokenID, is invalid - ERC20", async () => {
      const buyer = users[0];
      const creator = users[1];
      const saleId = 2;
      const tokenId = ethers.BigNumber.from(
        "1722000100000000000000000000000000002"
      );
      const unitPrice = 100;
      const amount = 1;
      const type = 721;
      const ticket = {
        saleId,
        creator: creator.address,
        tokenId,
        unitPrice,
        paymentToken: paymentToken.address,
        amount,
      };

      const signature = await verifyMessage(
        verifier,
        buyer,
        creator.address,
        saleId,
        tokenId,
        unitPrice,
        amount,
        paymentToken.address,
        type
      );

      const balBuyer = await paymentToken.balanceOf(buyer.address);
      const balTreasury = await paymentToken.balanceOf(treasury.address);
      const itemBuyer = await inoERC20.balanceOf(buyer.address);

      await increaseTime(11 * days);
      await expect(
        inoERC20.connect(buyer).redeemSingle(ticket, signature)
      ).to.revertedWith("Invalid tokenId");

      expect(await paymentToken.balanceOf(buyer.address)).deep.equal(balBuyer);
      expect(await paymentToken.balanceOf(treasury.address)).deep.equal(
        balTreasury
      );
      expect(await inoERC20.balanceOf(buyer.address)).deep.equal(itemBuyer);
      await expect(inoERC20.ownerOf(tokenId)).to.revertedWith(
        "ERC721: owner query for nonexistent token"
      );
      await decreaseTime(11 * days);
    });

    it("should revert when User redeems a ticket, but type, in tokenID, is invalid - Native Coin", async () => {
      const buyer = users[0];
      const creator = users[1];
      const saleId = 2;
      const tokenId = ethers.BigNumber.from(
        "2722000100000000000000000000000000002"
      );
      const unitPrice = 100;
      const amount = 1;
      const type = 721;
      const ticket = {
        saleId,
        creator: creator.address,
        tokenId,
        unitPrice,
        paymentToken: ethers.constants.AddressZero,
        amount,
      };

      const signature = await verifyMessage(
        verifier,
        buyer,
        creator.address,
        saleId,
        tokenId,
        unitPrice,
        amount,
        ethers.constants.AddressZero,
        type
      );

      const balTreasury = await treasury.getBalance();
      const itemBuyer = await inoNative.balanceOf(buyer.address);

      await increaseTime(11 * days);
      await expect(
        inoNative
          .connect(buyer)
          .redeemSingle(ticket, signature, { value: unitPrice })
      ).to.revertedWith("Invalid tokenId");

      expect(await treasury.getBalance()).deep.equal(balTreasury);
      expect(await inoNative.balanceOf(buyer.address)).deep.equal(itemBuyer);
      await expect(inoNative.ownerOf(tokenId)).to.revertedWith(
        "ERC721: owner query for nonexistent token"
      );
      await decreaseTime(11 * days);
    });

    it("should revert when User redeems a ticket, but wave not yet started - ERC20", async () => {
      const buyer = users[0];
      const creator = users[1];
      const saleId = 2;
      const tokenId = ethers.BigNumber.from(
        "1721000100000000000000000000000000002"
      );
      const unitPrice = 100;
      const amount = 1;
      const type = 721;
      const ticket = {
        saleId,
        creator: creator.address,
        tokenId,
        unitPrice,
        paymentToken: paymentToken.address,
        amount,
      };

      const signature = await verifyMessage(
        verifier,
        buyer,
        creator.address,
        saleId,
        tokenId,
        unitPrice,
        amount,
        paymentToken.address,
        type
      );

      const balBuyer = await paymentToken.balanceOf(buyer.address);
      const balTreasury = await paymentToken.balanceOf(treasury.address);
      const itemBuyer = await inoERC20.balanceOf(buyer.address);

      await increaseTime(10 * days);
      await expect(
        inoERC20.connect(buyer).redeemSingle(ticket, signature)
      ).to.revertedWith("Not yet started or expired");

      expect(await paymentToken.balanceOf(buyer.address)).deep.equal(balBuyer);
      expect(await paymentToken.balanceOf(treasury.address)).deep.equal(
        balTreasury
      );
      expect(await inoERC20.balanceOf(buyer.address)).deep.equal(itemBuyer);
      await expect(inoERC20.ownerOf(tokenId)).to.revertedWith(
        "ERC721: owner query for nonexistent token"
      );
      await decreaseTime(10 * days);
    });

    it("should revert when User redeems a ticket, but wave not yet started - Native Coin", async () => {
      const buyer = users[0];
      const creator = users[1];
      const saleId = 2;
      const tokenId = ethers.BigNumber.from(
        "2721000100000000000000000000000000002"
      );
      const unitPrice = 100;
      const amount = 1;
      const type = 721;
      const ticket = {
        saleId,
        creator: creator.address,
        tokenId,
        unitPrice,
        paymentToken: ethers.constants.AddressZero,
        amount,
      };

      const signature = await verifyMessage(
        verifier,
        buyer,
        creator.address,
        saleId,
        tokenId,
        unitPrice,
        amount,
        ethers.constants.AddressZero,
        type
      );

      const balTreasury = await treasury.getBalance();
      const itemBuyer = await inoNative.balanceOf(buyer.address);

      await increaseTime(10 * days);
      await expect(
        inoNative
          .connect(buyer)
          .redeemSingle(ticket, signature, { value: unitPrice })
      ).to.revertedWith("Not yet started or expired");

      expect(await treasury.getBalance()).deep.equal(balTreasury);
      expect(await inoNative.balanceOf(buyer.address)).deep.equal(itemBuyer);
      await expect(inoNative.ownerOf(tokenId)).to.revertedWith(
        "ERC721: owner query for nonexistent token"
      );
      await decreaseTime(10 * days);
    });

    it("should revert when User redeems a ticket, but wave already ended - ERC20", async () => {
      const buyer = users[0];
      const creator = users[1];
      const saleId = 2;
      const tokenId = ethers.BigNumber.from(
        "1721000100000000000000000000000000002"
      );
      const unitPrice = 100;
      const amount = 1;
      const type = 721;
      const ticket = {
        saleId,
        creator: creator.address,
        tokenId,
        unitPrice,
        paymentToken: paymentToken.address,
        amount,
      };

      const signature = await verifyMessage(
        verifier,
        buyer,
        creator.address,
        saleId,
        tokenId,
        unitPrice,
        amount,
        paymentToken.address,
        type
      );

      const balBuyer = await paymentToken.balanceOf(buyer.address);
      const balTreasury = await paymentToken.balanceOf(treasury.address);
      const itemBuyer = await inoERC20.balanceOf(buyer.address);

      await increaseTime(21 * days);
      await expect(
        inoERC20.connect(buyer).redeemSingle(ticket, signature)
      ).to.revertedWith("Not yet started or expired");

      expect(await paymentToken.balanceOf(buyer.address)).deep.equal(balBuyer);
      expect(await paymentToken.balanceOf(treasury.address)).deep.equal(
        balTreasury
      );
      expect(await inoERC20.balanceOf(buyer.address)).deep.equal(itemBuyer);
      await expect(inoERC20.ownerOf(tokenId)).to.revertedWith(
        "ERC721: owner query for nonexistent token"
      );
      await decreaseTime(21 * days);
    });

    it("should revert when User redeems a ticket, but wave already ended - Native Coin", async () => {
      const buyer = users[0];
      const creator = users[1];
      const saleId = 2;
      const tokenId = ethers.BigNumber.from(
        "2721000100000000000000000000000000002"
      );
      const unitPrice = 100;
      const amount = 1;
      const type = 721;
      const ticket = {
        saleId,
        creator: creator.address,
        tokenId,
        unitPrice,
        paymentToken: ethers.constants.AddressZero,
        amount,
      };

      const signature = await verifyMessage(
        verifier,
        buyer,
        creator.address,
        saleId,
        tokenId,
        unitPrice,
        amount,
        ethers.constants.AddressZero,
        type
      );

      const balTreasury = await treasury.getBalance();
      const itemBuyer = await inoNative.balanceOf(buyer.address);

      await increaseTime(21 * days);
      await expect(
        inoNative
          .connect(buyer)
          .redeemSingle(ticket, signature, { value: unitPrice })
      ).to.revertedWith("Not yet started or expired");

      expect(await treasury.getBalance()).deep.equal(balTreasury);
      expect(await inoNative.balanceOf(buyer.address)).deep.equal(itemBuyer);
      await expect(inoNative.ownerOf(tokenId)).to.revertedWith(
        "ERC721: owner query for nonexistent token"
      );
      await decreaseTime(21 * days);
    });

    it("should revert when User redeems a ticket, but reach max allocation - ERC20", async () => {
      const buyer = users[0];
      const creator = users[1];
      const saleId = 2;
      let tokenId = ethers.BigNumber.from(
        "1721000100000000000000000000000000002"
      );
      const unitPrice = 100;
      const amount = 1;
      const type = 721;
      let ticket = {
        saleId,
        creator: creator.address,
        tokenId,
        unitPrice,
        paymentToken: paymentToken.address,
        amount,
      };

      let signature = await verifyMessage(
        verifier,
        buyer,
        creator.address,
        saleId,
        tokenId,
        unitPrice,
        amount,
        paymentToken.address,
        type
      );
      await increaseTime(11 * days);
      await inoERC20.connect(buyer).redeemSingle(ticket, signature);

      const balBuyer = await paymentToken.balanceOf(buyer.address);
      const balTreasury = await paymentToken.balanceOf(treasury.address);
      const itemBuyer = await inoERC20.balanceOf(buyer.address);

      tokenId = ethers.BigNumber.from("1721000100000000000000000000000000003");
      ticket = {
        saleId,
        creator: creator.address,
        tokenId,
        unitPrice,
        paymentToken: paymentToken.address,
        amount,
      };

      signature = await verifyMessage(
        verifier,
        buyer,
        creator.address,
        saleId,
        tokenId,
        unitPrice,
        amount,
        paymentToken.address,
        type
      );

      await expect(
        inoERC20.connect(buyer).redeemSingle(ticket, signature)
      ).to.revertedWith("Reach max allocation");

      expect(await paymentToken.balanceOf(buyer.address)).deep.equal(balBuyer);
      expect(await paymentToken.balanceOf(treasury.address)).deep.equal(
        balTreasury
      );
      expect(await inoERC20.balanceOf(buyer.address)).deep.equal(itemBuyer);
      await expect(inoERC20.ownerOf(tokenId)).to.revertedWith(
        "ERC721: owner query for nonexistent token"
      );
      await decreaseTime(11 * days);
    });

    it("should revert when User redeems a ticket, but reach max allocation - Native Coin", async () => {
      const buyer = users[0];
      const creator = users[1];
      const saleId = 2;
      let tokenId = ethers.BigNumber.from(
        "2721000100000000000000000000000000002"
      );
      const unitPrice = 100;
      const amount = 1;
      const type = 721;
      let ticket = {
        saleId,
        creator: creator.address,
        tokenId,
        unitPrice,
        paymentToken: ethers.constants.AddressZero,
        amount,
      };

      let signature = await verifyMessage(
        verifier,
        buyer,
        creator.address,
        saleId,
        tokenId,
        unitPrice,
        amount,
        ethers.constants.AddressZero,
        type
      );

      await increaseTime(11 * days);
      await inoNative
        .connect(buyer)
        .redeemSingle(ticket, signature, { value: unitPrice });

      const balTreasury = await treasury.getBalance();
      const itemBuyer = await inoNative.balanceOf(buyer.address);

      tokenId = ethers.BigNumber.from("2721000100000000000000000000000000003");
      ticket = {
        saleId,
        creator: creator.address,
        tokenId,
        unitPrice,
        paymentToken: ethers.constants.AddressZero,
        amount,
      };

      signature = await verifyMessage(
        verifier,
        buyer,
        creator.address,
        saleId,
        tokenId,
        unitPrice,
        amount,
        ethers.constants.AddressZero,
        type
      );

      await expect(
        inoNative
          .connect(buyer)
          .redeemSingle(ticket, signature, { value: unitPrice })
      ).to.revertedWith("Reach max allocation");

      expect(await treasury.getBalance()).deep.equal(balTreasury);
      expect(await inoNative.balanceOf(buyer.address)).deep.equal(itemBuyer);
      await expect(inoNative.ownerOf(tokenId)).to.revertedWith(
        "ERC721: owner query for nonexistent token"
      );
      await decreaseTime(11 * days);
    });

    it("should revert when User redeems a ticket without a signature - ERC20", async () => {
      const buyer = users[0];
      const creator = users[1];
      const saleId = 2;
      const tokenId = ethers.BigNumber.from(
        "1721000200000000000000000000000000001"
      );
      const unitPrice = 100;
      const amount = 1;
      const ticket = {
        saleId,
        creator: creator.address,
        tokenId,
        unitPrice,
        paymentToken: paymentToken.address,
        amount,
      };

      const signature = ethers.utils.arrayify(0);

      const balBuyer = await paymentToken.balanceOf(buyer.address);
      const balTreasury = await paymentToken.balanceOf(treasury.address);
      const itemBuyer = await inoERC20.balanceOf(buyer.address);

      await increaseTime(31 * days);
      await expect(
        inoERC20.connect(buyer).redeemSingle(ticket, signature)
      ).to.revertedWith("ECDSA: invalid signature length");

      expect(await paymentToken.balanceOf(buyer.address)).deep.equal(balBuyer);
      expect(await paymentToken.balanceOf(treasury.address)).deep.equal(
        balTreasury
      );
      expect(await inoERC20.balanceOf(buyer.address)).deep.equal(itemBuyer);
      await expect(inoERC20.ownerOf(tokenId)).to.revertedWith(
        "ERC721: owner query for nonexistent token"
      );
      await decreaseTime(31 * days);
    });

    it("should revert when User redeems a ticket without a signature - Native Coin", async () => {
      const buyer = users[0];
      const creator = users[1];
      const saleId = 2;
      const tokenId = ethers.BigNumber.from(
        "2721000200000000000000000000000000001"
      );
      const unitPrice = 100;
      const amount = 1;
      const ticket = {
        saleId,
        creator: creator.address,
        tokenId,
        unitPrice,
        paymentToken: ethers.constants.AddressZero,
        amount,
      };

      const signature = ethers.utils.arrayify(0);

      const balTreasury = await treasury.getBalance();
      const itemBuyer = await inoNative.balanceOf(buyer.address);

      await increaseTime(31 * days);
      await expect(
        inoNative
          .connect(buyer)
          .redeemSingle(ticket, signature, { value: unitPrice })
      ).to.revertedWith("ECDSA: invalid signature length");

      expect(await treasury.getBalance()).deep.equal(balTreasury);
      expect(await inoNative.balanceOf(buyer.address)).deep.equal(itemBuyer);
      await expect(inoNative.ownerOf(tokenId)).to.revertedWith(
        "ERC721: owner query for nonexistent token"
      );
      await decreaseTime(31 * days);
    });

    it("should revert when User redeems a ticket, but Buyer, msg.sender and in signature, not matched - ERC20", async () => {
      const buyer = users[0];
      const creator = users[1];
      const saleId = 2;
      const tokenId = ethers.BigNumber.from(
        "1721000200000000000000000000000000001"
      );
      const unitPrice = 100;
      const amount = 1;
      const type = 721;
      const ticket = {
        saleId,
        creator: creator.address,
        tokenId,
        unitPrice,
        paymentToken: paymentToken.address,
        amount,
      };

      const signature = await verifyMessage(
        verifier,
        creator,
        creator.address,
        saleId,
        tokenId,
        unitPrice,
        amount,
        paymentToken.address,
        type
      );

      const balBuyer = await paymentToken.balanceOf(buyer.address);
      const balTreasury = await paymentToken.balanceOf(treasury.address);
      const itemBuyer = await inoERC20.balanceOf(buyer.address);

      await increaseTime(31 * days);
      await expect(
        inoERC20.connect(buyer).redeemSingle(ticket, signature)
      ).to.revertedWith("Invalid admin or params");

      expect(await paymentToken.balanceOf(buyer.address)).deep.equal(balBuyer);
      expect(await paymentToken.balanceOf(treasury.address)).deep.equal(
        balTreasury
      );
      expect(await inoERC20.balanceOf(buyer.address)).deep.equal(itemBuyer);
      await expect(inoERC20.ownerOf(tokenId)).to.revertedWith(
        "ERC721: owner query for nonexistent token"
      );
      await decreaseTime(31 * days);
    });

    it("should revert when User redeems a ticket, but Buyer, msg.sender and in signature, not matched - Native Coin", async () => {
      const buyer = users[0];
      const creator = users[1];
      const saleId = 2;
      const tokenId = ethers.BigNumber.from(
        "2721000200000000000000000000000000001"
      );
      const unitPrice = 100;
      const amount = 1;
      const type = 721;
      const ticket = {
        saleId,
        creator: creator.address,
        tokenId,
        unitPrice,
        paymentToken: ethers.constants.AddressZero,
        amount,
      };

      const signature = await verifyMessage(
        verifier,
        creator,
        creator.address,
        saleId,
        tokenId,
        unitPrice,
        amount,
        ethers.constants.AddressZero,
        type
      );

      const balTreasury = await treasury.getBalance();
      const itemBuyer = await inoNative.balanceOf(buyer.address);

      await increaseTime(31 * days);
      await expect(
        inoNative
          .connect(buyer)
          .redeemSingle(ticket, signature, { value: unitPrice })
      ).to.revertedWith("Invalid admin or params");

      expect(await treasury.getBalance()).deep.equal(balTreasury);
      expect(await inoNative.balanceOf(buyer.address)).deep.equal(itemBuyer);
      await expect(inoNative.ownerOf(tokenId)).to.revertedWith(
        "ERC721: owner query for nonexistent token"
      );
      await decreaseTime(31 * days);
    });

    it("should revert when User redeems a ticket, but SaleID, param and signature, not matched - ERC20", async () => {
      const buyer = users[0];
      const creator = users[1];
      const saleId = 2;
      const invalidSaleId = 3;
      const tokenId = ethers.BigNumber.from(
        "1721000200000000000000000000000000001"
      );
      const unitPrice = 100;
      const amount = 1;
      const type = 721;
      const ticket = {
        saleId: invalidSaleId,
        creator: creator.address,
        tokenId,
        unitPrice,
        paymentToken: paymentToken.address,
        amount,
      };

      const signature = await verifyMessage(
        verifier,
        buyer,
        creator.address,
        saleId,
        tokenId,
        unitPrice,
        amount,
        paymentToken.address,
        type
      );

      const balBuyer = await paymentToken.balanceOf(buyer.address);
      const balTreasury = await paymentToken.balanceOf(treasury.address);
      const itemBuyer = await inoERC20.balanceOf(buyer.address);

      await increaseTime(31 * days);
      await expect(
        inoERC20.connect(buyer).redeemSingle(ticket, signature)
      ).to.revertedWith("Invalid admin or params");

      expect(await paymentToken.balanceOf(buyer.address)).deep.equal(balBuyer);
      expect(await paymentToken.balanceOf(treasury.address)).deep.equal(
        balTreasury
      );
      expect(await inoERC20.balanceOf(buyer.address)).deep.equal(itemBuyer);
      await expect(inoERC20.ownerOf(tokenId)).to.revertedWith(
        "ERC721: owner query for nonexistent token"
      );
      await decreaseTime(31 * days);
    });

    it("should revert when User redeems a ticket, but SaleID, param and signature, not matched - Native Coin", async () => {
      const buyer = users[0];
      const creator = users[1];
      const saleId = 2;
      const invalidSaleId = 3;
      const tokenId = ethers.BigNumber.from(
        "2721000200000000000000000000000000001"
      );
      const unitPrice = 100;
      const amount = 1;
      const type = 721;
      const ticket = {
        saleId: invalidSaleId,
        creator: creator.address,
        tokenId,
        unitPrice,
        paymentToken: ethers.constants.AddressZero,
        amount,
      };

      const signature = await verifyMessage(
        verifier,
        buyer,
        creator.address,
        saleId,
        tokenId,
        unitPrice,
        amount,
        ethers.constants.AddressZero,
        type
      );

      const balTreasury = await treasury.getBalance();
      const itemBuyer = await inoNative.balanceOf(buyer.address);

      await increaseTime(31 * days);
      await expect(
        inoNative
          .connect(buyer)
          .redeemSingle(ticket, signature, { value: unitPrice })
      ).to.revertedWith("Invalid admin or params");

      expect(await treasury.getBalance()).deep.equal(balTreasury);
      expect(await inoNative.balanceOf(buyer.address)).deep.equal(itemBuyer);
      await expect(inoNative.ownerOf(tokenId)).to.revertedWith(
        "ERC721: owner query for nonexistent token"
      );
      await decreaseTime(31 * days);
    });

    it("should revert when User redeems a ticket, but tokenID, param and signature, not matched - ERC20", async () => {
      const buyer = users[0];
      const creator = users[1];
      const saleId = 2;
      const tokenId = ethers.BigNumber.from(
        "1721000200000000000000000000000000001"
      );
      const invalidTokenId = ethers.BigNumber.from(
        "1721000200000000000000000000000000002"
      );
      const unitPrice = 100;
      const amount = 1;
      const type = 721;
      const ticket = {
        saleId,
        creator: creator.address,
        tokenId: invalidTokenId,
        unitPrice,
        paymentToken: paymentToken.address,
        amount,
      };

      const signature = await verifyMessage(
        verifier,
        buyer,
        creator.address,
        saleId,
        tokenId,
        unitPrice,
        amount,
        paymentToken.address,
        type
      );

      const balBuyer = await paymentToken.balanceOf(buyer.address);
      const balTreasury = await paymentToken.balanceOf(treasury.address);
      const itemBuyer = await inoERC20.balanceOf(buyer.address);

      await increaseTime(31 * days);
      await expect(
        inoERC20.connect(buyer).redeemSingle(ticket, signature)
      ).to.revertedWith("Invalid admin or params");

      expect(await paymentToken.balanceOf(buyer.address)).deep.equal(balBuyer);
      expect(await paymentToken.balanceOf(treasury.address)).deep.equal(
        balTreasury
      );
      expect(await inoERC20.balanceOf(buyer.address)).deep.equal(itemBuyer);
      await expect(inoERC20.ownerOf(tokenId)).to.revertedWith(
        "ERC721: owner query for nonexistent token"
      );
      await decreaseTime(31 * days);
    });

    it("should revert when User redeems a ticket, but tokenID, param and signature, not matched - Native Coin", async () => {
      const buyer = users[0];
      const creator = users[1];
      const saleId = 2;
      const tokenId = ethers.BigNumber.from(
        "2721000200000000000000000000000000001"
      );
      const invalidTokenId = ethers.BigNumber.from(
        "2721000200000000000000000000000000002"
      );
      const unitPrice = 100;
      const amount = 1;
      const type = 721;
      const ticket = {
        saleId,
        creator: creator.address,
        tokenId: invalidTokenId,
        unitPrice,
        paymentToken: ethers.constants.AddressZero,
        amount,
      };

      const signature = await verifyMessage(
        verifier,
        buyer,
        creator.address,
        saleId,
        tokenId,
        unitPrice,
        amount,
        ethers.constants.AddressZero,
        type
      );

      const balTreasury = await treasury.getBalance();
      const itemBuyer = await inoNative.balanceOf(buyer.address);

      await increaseTime(31 * days);
      await expect(
        inoNative
          .connect(buyer)
          .redeemSingle(ticket, signature, { value: unitPrice })
      ).to.revertedWith("Invalid admin or params");

      expect(await treasury.getBalance()).deep.equal(balTreasury);
      expect(await inoNative.balanceOf(buyer.address)).deep.equal(itemBuyer);
      await expect(inoNative.ownerOf(tokenId)).to.revertedWith(
        "ERC721: owner query for nonexistent token"
      );
      await decreaseTime(31 * days);
    });

    it("should revert when User redeems a ticket, but unitPrice, param and signature, not matched - ERC20", async () => {
      const buyer = users[0];
      const creator = users[1];
      const saleId = 2;
      const tokenId = ethers.BigNumber.from(
        "1721000200000000000000000000000000001"
      );
      const unitPrice = 100;
      const invalidPrice = 10;
      const amount = 1;
      const type = 721;
      const ticket = {
        saleId,
        creator: creator.address,
        tokenId,
        unitPrice: invalidPrice,
        paymentToken: paymentToken.address,
        amount,
      };

      const signature = await verifyMessage(
        verifier,
        buyer,
        creator.address,
        saleId,
        tokenId,
        unitPrice,
        amount,
        paymentToken.address,
        type
      );

      const balBuyer = await paymentToken.balanceOf(buyer.address);
      const balTreasury = await paymentToken.balanceOf(treasury.address);
      const itemBuyer = await inoERC20.balanceOf(buyer.address);

      await increaseTime(31 * days);
      await expect(
        inoERC20.connect(buyer).redeemSingle(ticket, signature)
      ).to.revertedWith("Invalid admin or params");

      expect(await paymentToken.balanceOf(buyer.address)).deep.equal(balBuyer);
      expect(await paymentToken.balanceOf(treasury.address)).deep.equal(
        balTreasury
      );
      expect(await inoERC20.balanceOf(buyer.address)).deep.equal(itemBuyer);
      await expect(inoERC20.ownerOf(tokenId)).to.revertedWith(
        "ERC721: owner query for nonexistent token"
      );
      await decreaseTime(31 * days);
    });

    it("should revert when User redeems a ticket, but unitPrice, param and signature, not matched - Native Coin", async () => {
      const buyer = users[0];
      const creator = users[1];
      const saleId = 2;
      const tokenId = ethers.BigNumber.from(
        "2721000200000000000000000000000000001"
      );
      const unitPrice = 100;
      const invalidPrice = 10;
      const amount = 1;
      const type = 721;
      const ticket = {
        saleId,
        creator: creator.address,
        tokenId,
        unitPrice: invalidPrice,
        paymentToken: ethers.constants.AddressZero,
        amount,
      };

      const signature = await verifyMessage(
        verifier,
        buyer,
        creator.address,
        saleId,
        tokenId,
        unitPrice,
        amount,
        ethers.constants.AddressZero,
        type
      );

      const balTreasury = await treasury.getBalance();
      const itemBuyer = await inoNative.balanceOf(buyer.address);

      await increaseTime(31 * days);
      await expect(
        inoNative
          .connect(buyer)
          .redeemSingle(ticket, signature, { value: invalidPrice })
      ).to.revertedWith("Invalid admin or params");

      expect(await treasury.getBalance()).deep.equal(balTreasury);
      expect(await inoNative.balanceOf(buyer.address)).deep.equal(itemBuyer);
      await expect(inoNative.ownerOf(tokenId)).to.revertedWith(
        "ERC721: owner query for nonexistent token"
      );
      await decreaseTime(31 * days);
    });

    it("should revert when User redeems a ticket, but amount, param and signature, not matched - ERC20", async () => {
      const buyer = users[0];
      const creator = users[1];
      const saleId = 2;
      const tokenId = ethers.BigNumber.from(
        "1721000200000000000000000000000000001"
      );
      const unitPrice = 100;
      const amount = 1;
      const invalidAmt = 2;
      const type = 721;
      const ticket = {
        saleId,
        creator: creator.address,
        tokenId,
        unitPrice,
        paymentToken: paymentToken.address,
        amount,
      };

      const signature = await verifyMessage(
        verifier,
        buyer,
        creator.address,
        saleId,
        tokenId,
        unitPrice,
        invalidAmt,
        paymentToken.address,
        type
      );

      const balBuyer = await paymentToken.balanceOf(buyer.address);
      const balTreasury = await paymentToken.balanceOf(treasury.address);
      const itemBuyer = await inoERC20.balanceOf(buyer.address);

      await increaseTime(31 * days);
      await expect(
        inoERC20.connect(buyer).redeemSingle(ticket, signature)
      ).to.revertedWith("Invalid admin or params");

      expect(await paymentToken.balanceOf(buyer.address)).deep.equal(balBuyer);
      expect(await paymentToken.balanceOf(treasury.address)).deep.equal(
        balTreasury
      );
      expect(await inoERC20.balanceOf(buyer.address)).deep.equal(itemBuyer);
      await expect(inoERC20.ownerOf(tokenId)).to.revertedWith(
        "ERC721: owner query for nonexistent token"
      );
      await decreaseTime(31 * days);
    });

    it("should revert when User redeems a ticket, but amount, param and signature, not matched - Native Coin", async () => {
      const buyer = users[0];
      const creator = users[1];
      const saleId = 2;
      const tokenId = ethers.BigNumber.from(
        "2721000200000000000000000000000000001"
      );
      const unitPrice = 100;
      const amount = 1;
      const invalidAmt = 2;
      const type = 721;
      const ticket = {
        saleId,
        creator: creator.address,
        tokenId,
        unitPrice,
        paymentToken: ethers.constants.AddressZero,
        amount,
      };

      const signature = await verifyMessage(
        verifier,
        buyer,
        creator.address,
        saleId,
        tokenId,
        unitPrice,
        invalidAmt,
        ethers.constants.AddressZero,
        type
      );

      const balTreasury = await treasury.getBalance();
      const itemBuyer = await inoNative.balanceOf(buyer.address);

      await increaseTime(31 * days);
      await expect(
        inoNative
          .connect(buyer)
          .redeemSingle(ticket, signature, { value: unitPrice })
      ).to.revertedWith("Invalid admin or params");

      expect(await treasury.getBalance()).deep.equal(balTreasury);
      expect(await inoNative.balanceOf(buyer.address)).deep.equal(itemBuyer);
      await expect(inoNative.ownerOf(tokenId)).to.revertedWith(
        "ERC721: owner query for nonexistent token"
      );
      await decreaseTime(31 * days);
    });

    it("should revert when User redeems a ticket, but paymentToken, param and signature, not matched - ERC20", async () => {
      const buyer = users[0];
      const creator = users[1];
      const saleId = 2;
      const tokenId = ethers.BigNumber.from(
        "1721000200000000000000000000000000001"
      );
      const unitPrice = 100;
      const amount = 1;
      const type = 721;
      const ticket = {
        saleId,
        creator: creator.address,
        tokenId,
        unitPrice,
        paymentToken: paymentToken.address,
        amount,
      };

      const signature = await verifyMessage(
        verifier,
        buyer,
        creator.address,
        saleId,
        tokenId,
        unitPrice,
        amount,
        ethers.constants.AddressZero,
        type
      );

      const balBuyer = await paymentToken.balanceOf(buyer.address);
      const balTreasury = await paymentToken.balanceOf(treasury.address);
      const itemBuyer = await inoERC20.balanceOf(buyer.address);

      await increaseTime(31 * days);
      await expect(
        inoERC20.connect(buyer).redeemSingle(ticket, signature)
      ).to.revertedWith("Invalid admin or params");

      expect(await paymentToken.balanceOf(buyer.address)).deep.equal(balBuyer);
      expect(await paymentToken.balanceOf(treasury.address)).deep.equal(
        balTreasury
      );
      expect(await inoERC20.balanceOf(buyer.address)).deep.equal(itemBuyer);
      await expect(inoERC20.ownerOf(tokenId)).to.revertedWith(
        "ERC721: owner query for nonexistent token"
      );
      await decreaseTime(31 * days);
    });

    it("should revert when User redeems a ticket, but paymentToken, param and signature, not matched - Native Coin", async () => {
      const buyer = users[0];
      const creator = users[1];
      const saleId = 2;
      const tokenId = ethers.BigNumber.from(
        "2721000200000000000000000000000000001"
      );
      const unitPrice = 100;
      const amount = 1;
      const type = 721;
      const ticket = {
        saleId,
        creator: creator.address,
        tokenId,
        unitPrice,
        paymentToken: ethers.constants.AddressZero,
        amount,
      };

      const signature = await verifyMessage(
        verifier,
        buyer,
        creator.address,
        saleId,
        tokenId,
        unitPrice,
        amount,
        paymentToken.address,
        type
      );

      const balTreasury = await treasury.getBalance();
      const itemBuyer = await inoNative.balanceOf(buyer.address);

      await increaseTime(31 * days);
      await expect(
        inoNative
          .connect(buyer)
          .redeemSingle(ticket, signature, { value: unitPrice })
      ).to.revertedWith("Invalid admin or params");

      expect(await treasury.getBalance()).deep.equal(balTreasury);
      expect(await inoNative.balanceOf(buyer.address)).deep.equal(itemBuyer);
      await expect(inoNative.ownerOf(tokenId)).to.revertedWith(
        "ERC721: owner query for nonexistent token"
      );
      await decreaseTime(31 * days);
    });

    it("should revert when User redeems a ticket, but type, param and signature, not matched - ERC20", async () => {
      const buyer = users[0];
      const creator = users[1];
      const saleId = 2;
      const tokenId = ethers.BigNumber.from(
        "1721000200000000000000000000000000001"
      );
      const unitPrice = 100;
      const amount = 1;
      const invalidType = 1155;
      const ticket = {
        saleId,
        creator: creator.address,
        tokenId,
        unitPrice,
        paymentToken: paymentToken.address,
        amount,
      };

      const signature = await verifyMessage(
        verifier,
        buyer,
        creator.address,
        saleId,
        tokenId,
        unitPrice,
        amount,
        paymentToken.address,
        invalidType
      );

      const balBuyer = await paymentToken.balanceOf(buyer.address);
      const balTreasury = await paymentToken.balanceOf(treasury.address);
      const itemBuyer = await inoERC20.balanceOf(buyer.address);

      await increaseTime(31 * days);
      await expect(
        inoERC20.connect(buyer).redeemSingle(ticket, signature)
      ).to.revertedWith("Invalid admin or params");

      expect(await paymentToken.balanceOf(buyer.address)).deep.equal(balBuyer);
      expect(await paymentToken.balanceOf(treasury.address)).deep.equal(
        balTreasury
      );
      expect(await inoERC20.balanceOf(buyer.address)).deep.equal(itemBuyer);
      await expect(inoERC20.ownerOf(tokenId)).to.revertedWith(
        "ERC721: owner query for nonexistent token"
      );
      await decreaseTime(31 * days);
    });

    it("should revert when User redeems a ticket, but type, param and signature, not matched - Native Coin", async () => {
      const buyer = users[0];
      const creator = users[1];
      const saleId = 2;
      const tokenId = ethers.BigNumber.from(
        "2721000200000000000000000000000000001"
      );
      const unitPrice = 100;
      const amount = 1;
      const invalidType = 1155;
      const ticket = {
        saleId,
        creator: creator.address,
        tokenId,
        unitPrice,
        paymentToken: ethers.constants.AddressZero,
        amount,
      };

      const signature = await verifyMessage(
        verifier,
        buyer,
        creator.address,
        saleId,
        tokenId,
        unitPrice,
        amount,
        ethers.constants.AddressZero,
        invalidType
      );

      const balTreasury = await treasury.getBalance();
      const itemBuyer = await inoNative.balanceOf(buyer.address);

      await increaseTime(31 * days);
      await expect(
        inoNative
          .connect(buyer)
          .redeemSingle(ticket, signature, { value: unitPrice })
      ).to.revertedWith("Invalid admin or params");

      expect(await treasury.getBalance()).deep.equal(balTreasury);
      expect(await inoNative.balanceOf(buyer.address)).deep.equal(itemBuyer);
      await expect(inoNative.ownerOf(tokenId)).to.revertedWith(
        "ERC721: owner query for nonexistent token"
      );
      await decreaseTime(31 * days);
    });

    it("should revert when User redeems a ticket, but payment is insufficient - Native Coin", async () => {
      const buyer = users[0];
      const creator = users[1];
      const saleId = 2;
      const tokenId = ethers.BigNumber.from(
        "2721000200000000000000000000000000001"
      );
      const unitPrice = 100;
      const invalidPayment = 10;
      const amount = 1;
      const type = 721;
      const ticket = {
        saleId,
        creator: creator.address,
        tokenId,
        unitPrice,
        paymentToken: ethers.constants.AddressZero,
        amount,
      };

      const signature = await verifyMessage(
        verifier,
        buyer,
        creator.address,
        saleId,
        tokenId,
        unitPrice,
        amount,
        ethers.constants.AddressZero,
        type
      );

      const balTreasury = await treasury.getBalance();
      const itemBuyer = await inoNative.balanceOf(buyer.address);

      await increaseTime(31 * days);
      await expect(
        inoNative
          .connect(buyer)
          .redeemSingle(ticket, signature, { value: invalidPayment })
      ).to.revertedWith("Insufficient payment");

      expect(await treasury.getBalance()).deep.equal(balTreasury);
      expect(await inoNative.balanceOf(buyer.address)).deep.equal(itemBuyer);
      await expect(inoNative.ownerOf(tokenId)).to.revertedWith(
        "ERC721: owner query for nonexistent token"
      );
      await decreaseTime(31 * days);
    });

    it("should revert when User redeems a ticket, but balance is insufficient - ERC20", async () => {
      const buyer = users[0];
      const creator = users[1];
      const saleId = 2;
      const tokenId = ethers.BigNumber.from(
        "1721000200000000000000000000000000001"
      );
      const unitPrice = balance + 1;
      const amount = 1;
      const type = 721;
      const ticket = {
        saleId,
        creator: creator.address,
        tokenId,
        unitPrice,
        paymentToken: paymentToken.address,
        amount,
      };

      const signature = await verifyMessage(
        verifier,
        buyer,
        creator.address,
        saleId,
        tokenId,
        unitPrice,
        amount,
        paymentToken.address,
        type
      );

      const balBuyer = await paymentToken.balanceOf(buyer.address);
      const balTreasury = await paymentToken.balanceOf(treasury.address);
      const itemBuyer = await inoERC20.balanceOf(buyer.address);

      await increaseTime(31 * days);
      await expect(
        inoERC20.connect(buyer).redeemSingle(ticket, signature)
      ).to.revertedWith("ERC20: insufficient allowance");

      expect(await paymentToken.balanceOf(buyer.address)).deep.equal(balBuyer);
      expect(await paymentToken.balanceOf(treasury.address)).deep.equal(
        balTreasury
      );
      expect(await inoERC20.balanceOf(buyer.address)).deep.equal(itemBuyer);
      await expect(inoERC20.ownerOf(tokenId)).to.revertedWith(
        "ERC721: owner query for nonexistent token"
      );
      await decreaseTime(31 * days);
    });

    it("should revert when User redeems a ticket, but not yet set allowance - ERC20", async () => {
      const buyer = users[0];
      const creator = users[1];
      const saleId = 2;
      const tokenId = ethers.BigNumber.from(
        "1721000200000000000000000000000000001"
      );
      const unitPrice = 100;
      const amount = 1;
      const type = 721;
      const ticket = {
        saleId,
        creator: creator.address,
        tokenId,
        unitPrice,
        paymentToken: paymentToken.address,
        amount,
      };

      const signature = await verifyMessage(
        verifier,
        buyer,
        creator.address,
        saleId,
        tokenId,
        unitPrice,
        amount,
        paymentToken.address,
        type
      );

      const balBuyer = await paymentToken.balanceOf(buyer.address);
      const balTreasury = await paymentToken.balanceOf(treasury.address);
      const itemBuyer = await inoERC20.balanceOf(buyer.address);

      await paymentToken.connect(buyer).approve(inoERC20.address, 0);

      await increaseTime(31 * days);
      await expect(
        inoERC20.connect(buyer).redeemSingle(ticket, signature)
      ).to.revertedWith("ERC20: insufficient allowance");

      expect(await paymentToken.balanceOf(buyer.address)).deep.equal(balBuyer);
      expect(await paymentToken.balanceOf(treasury.address)).deep.equal(
        balTreasury
      );
      expect(await inoERC20.balanceOf(buyer.address)).deep.equal(itemBuyer);
      await expect(inoERC20.ownerOf(tokenId)).to.revertedWith(
        "ERC721: owner query for nonexistent token"
      );
      await decreaseTime(31 * days);
    });
  });

  describe("Redeem Bulk", () => {
    it("should succeed when User redeems tokens in bulk with valid info - ERC20", async () => {
      const buyer = users[0];
      const creator = users[1];
      const saleId = 200;
      const tokenIds = [
        ethers.BigNumber.from("1721000300000000000000000000000000001"),
        ethers.BigNumber.from("1721000300000000000000000000000000002"),
        ethers.BigNumber.from("1721000300000000000000000000000000003"),
      ];
      const unitPrice = 100;
      const amount = tokenIds.length;
      const type = 721;
      const bulk = {
        saleId,
        creator: creator.address,
        tokenIds,
        unitPrice,
        paymentToken: paymentToken.address,
      };

      const balBuyer = await paymentToken.balanceOf(buyer.address);
      const balTreasury = await paymentToken.balanceOf(treasury.address);
      const itemBuyer = await inoERC20.balanceOf(buyer.address);

      const signature = await verifyMessage(
        verifier,
        buyer,
        creator.address,
        saleId,
        BigNumber.from(hashPacked(tokenIds)),
        unitPrice,
        undefined,
        paymentToken.address,
        type
      );

      await paymentToken.connect(buyer).approve(inoERC20.address, balance);

      await increaseTime(41 * days); // increase time to redeem
      await expect(inoERC20.connect(buyer).redeemBulk(bulk, signature))
        .to.emit(inoERC20, "RedeemBulk")
        .withArgs(
          inoERC20.address,
          buyer.address,
          tokenIds,
          paymentToken.address,
          unitPrice
        );

      expect(await paymentToken.balanceOf(buyer.address)).deep.equal(
        balBuyer.sub(amount * unitPrice)
      );
      expect(await inoERC20.balanceOf(buyer.address)).deep.equal(
        itemBuyer.add(amount)
      );
      expect(await paymentToken.balanceOf(treasury.address)).deep.equal(
        balTreasury.add(amount * unitPrice)
      );

      expect(await inoERC20.ownerOf(tokenIds[0])).deep.equal(buyer.address);
      expect(await inoERC20.ownerOf(tokenIds[1])).deep.equal(buyer.address);
      expect(await inoERC20.ownerOf(tokenIds[2])).deep.equal(buyer.address);

      await decreaseTime(41 * days); // set back to normal
    });

    it("should succeed when User redeems tokens in bulk with valid info - Native Coin", async () => {
      const buyer = users[0];
      const creator = users[1];
      const saleId = 300;
      const tokenIds = [
        ethers.BigNumber.from("2721000300000000000000000000000000001"),
        ethers.BigNumber.from("2721000300000000000000000000000000002"),
        ethers.BigNumber.from("2721000300000000000000000000000000003"),
      ];
      const unitPrice = 100;
      const amount = tokenIds.length;
      const type = 721;
      const bulk = {
        saleId,
        creator: creator.address,
        tokenIds,
        unitPrice,
        paymentToken: ethers.constants.AddressZero,
      };

      const balTreasury = await treasury.getBalance();
      const itemBuyer = await inoNative.balanceOf(buyer.address);

      const signature = await verifyMessage(
        verifier,
        buyer,
        creator.address,
        saleId,
        BigNumber.from(hashPacked(tokenIds)),
        unitPrice,
        undefined,
        ethers.constants.AddressZero,
        type
      );

      await increaseTime(41 * days); // increase time to redeem
      await expect(
        inoNative
          .connect(buyer)
          .redeemBulk(bulk, signature, { value: unitPrice * amount })
      )
        .to.emit(inoNative, "RedeemBulk")
        .withArgs(
          inoNative.address,
          buyer.address,
          tokenIds,
          ethers.constants.AddressZero,
          unitPrice
        );

      expect(await inoNative.balanceOf(buyer.address)).deep.equal(
        itemBuyer.add(amount)
      );
      expect(await treasury.getBalance()).deep.equal(
        balTreasury.add(amount * unitPrice)
      );

      expect(await inoNative.ownerOf(tokenIds[0])).deep.equal(buyer.address);
      expect(await inoNative.ownerOf(tokenIds[1])).deep.equal(buyer.address);
      expect(await inoNative.ownerOf(tokenIds[2])).deep.equal(buyer.address);

      await decreaseTime(41 * days); // set back to normal
    });

    it("should revert when User redeems tokens in bulk, but Campaign not started yet - ERC20", async () => {
      const buyer = users[0];
      const creator = users[1];
      const saleId = 301;
      const tokenIds = [
        ethers.BigNumber.from("1721000300000000000000000000000000004"),
        ethers.BigNumber.from("1721000300000000000000000000000000005"),
      ];
      const unitPrice = 100;
      const type = 721;
      const bulk = {
        saleId,
        creator: creator.address,
        tokenIds,
        unitPrice,
        paymentToken: paymentToken.address,
      };

      const signature = await verifyMessage(
        verifier,
        buyer,
        creator.address,
        saleId,
        BigNumber.from(hashPacked(tokenIds)),
        unitPrice,
        undefined,
        paymentToken.address,
        type
      );

      const balBuyer = await paymentToken.balanceOf(buyer.address);
      const balTreasury = await paymentToken.balanceOf(treasury.address);
      const itemBuyer = await inoERC20.balanceOf(buyer.address);

      await expect(
        inoERC20.connect(buyer).redeemBulk(bulk, signature)
      ).to.revertedWith("Not yet started or expired");

      expect(await paymentToken.balanceOf(buyer.address)).deep.equal(balBuyer);
      expect(await inoERC20.balanceOf(buyer.address)).deep.equal(itemBuyer);
      expect(await paymentToken.balanceOf(treasury.address)).deep.equal(
        balTreasury
      );

      await expect(inoERC20.ownerOf(tokenIds[0])).to.revertedWith(
        "ERC721: owner query for nonexistent token"
      );
      await expect(inoERC20.ownerOf(tokenIds[1])).to.revertedWith(
        "ERC721: owner query for nonexistent token"
      );
    });

    it("should revert when User redeems tokens in bulk, but Campaign not started yet - Native Coin", async () => {
      const buyer = users[0];
      const creator = users[1];
      const saleId = 301;
      const tokenIds = [
        ethers.BigNumber.from("2721000300000000000000000000000000004"),
        ethers.BigNumber.from("2721000300000000000000000000000000005"),
      ];
      const unitPrice = 100;
      const amount = tokenIds.length;
      const type = 721;
      const bulk = {
        saleId,
        creator: creator.address,
        tokenIds,
        unitPrice,
        paymentToken: ethers.constants.AddressZero,
      };

      const signature = await verifyMessage(
        verifier,
        buyer,
        creator.address,
        saleId,
        BigNumber.from(hashPacked(tokenIds)),
        unitPrice,
        undefined,
        ethers.constants.AddressZero,
        type
      );

      const balTreasury = await treasury.getBalance();
      const itemBuyer = await inoNative.balanceOf(buyer.address);

      await expect(
        inoNative
          .connect(buyer)
          .redeemBulk(bulk, signature, { value: unitPrice * amount })
      ).to.revertedWith("Not yet started or expired");

      expect(await inoNative.balanceOf(buyer.address)).deep.equal(itemBuyer);
      expect(await treasury.getBalance()).deep.equal(balTreasury);

      await expect(inoNative.ownerOf(tokenIds[0])).to.revertedWith(
        "ERC721: owner query for nonexistent token"
      );
      await expect(inoNative.ownerOf(tokenIds[1])).to.revertedWith(
        "ERC721: owner query for nonexistent token"
      );
    });

    it("should revert when User redeems tokens in bulk, but Campaign already ended - ERC20", async () => {
      const buyer = users[0];
      const creator = users[1];
      const saleId = 301;
      const tokenIds = [
        ethers.BigNumber.from("1721000300000000000000000000000000004"),
        ethers.BigNumber.from("1721000300000000000000000000000000005"),
      ];
      const unitPrice = 100;
      const type = 721;
      const bulk = {
        saleId,
        creator: creator.address,
        tokenIds,
        unitPrice,
        paymentToken: paymentToken.address,
      };

      const signature = await verifyMessage(
        verifier,
        buyer,
        creator.address,
        saleId,
        BigNumber.from(hashPacked(tokenIds)),
        unitPrice,
        undefined,
        paymentToken.address,
        type
      );

      await increaseTime(100 * days);

      const balBuyer = await paymentToken.balanceOf(buyer.address);
      const balTreasury = await paymentToken.balanceOf(treasury.address);
      const itemBuyer = await inoERC20.balanceOf(buyer.address);

      await expect(
        inoERC20.connect(buyer).redeemBulk(bulk, signature)
      ).to.revertedWith("Campaign ended");

      expect(await paymentToken.balanceOf(buyer.address)).deep.equal(balBuyer);
      expect(await inoERC20.balanceOf(buyer.address)).deep.equal(itemBuyer);
      expect(await paymentToken.balanceOf(treasury.address)).deep.equal(
        balTreasury
      );

      await expect(inoERC20.ownerOf(tokenIds[0])).to.revertedWith(
        "ERC721: owner query for nonexistent token"
      );
      await expect(inoERC20.ownerOf(tokenIds[1])).to.revertedWith(
        "ERC721: owner query for nonexistent token"
      );

      await decreaseTime(100 * days);
    });

    it("should revert when User redeems tokens in bulk, but Campaign ended already - Native Coin", async () => {
      const buyer = users[0];
      const creator = users[1];
      const saleId = 301;
      const tokenIds = [
        ethers.BigNumber.from("2721000300000000000000000000000000004"),
        ethers.BigNumber.from("2721000300000000000000000000000000005"),
      ];
      const unitPrice = 100;
      const amount = tokenIds.length;
      const type = 721;
      const bulk = {
        saleId,
        creator: creator.address,
        tokenIds,
        unitPrice,
        paymentToken: ethers.constants.AddressZero,
      };

      const signature = await verifyMessage(
        verifier,
        buyer,
        creator.address,
        saleId,
        BigNumber.from(hashPacked(tokenIds)),
        unitPrice,
        undefined,
        ethers.constants.AddressZero,
        type
      );

      await increaseTime(100 * days);

      const balTreasury = await treasury.getBalance();
      const itemBuyer = await inoNative.balanceOf(buyer.address);

      await expect(
        inoNative
          .connect(buyer)
          .redeemBulk(bulk, signature, { value: unitPrice * amount })
      ).to.revertedWith("Campaign ended");

      expect(await inoNative.balanceOf(buyer.address)).deep.equal(itemBuyer);
      expect(await treasury.getBalance()).deep.equal(balTreasury);

      await expect(inoNative.ownerOf(tokenIds[0])).to.revertedWith(
        "ERC721: owner query for nonexistent token"
      );
      await expect(inoNative.ownerOf(tokenIds[1])).to.revertedWith(
        "ERC721: owner query for nonexistent token"
      );

      await decreaseTime(100 * days);
    });

    it("should revert when User redeems tokens in bulk, but reach max allocation - ERC20", async () => {
      const buyer = users[0];
      const creator = users[1];
      const saleId = 301;
      const tokenIds = [
        ethers.BigNumber.from("1721000300000000000000000000000000004"),
        ethers.BigNumber.from("1721000300000000000000000000000000005"),
        ethers.BigNumber.from("1721000300000000000000000000000000006"),
      ];
      const unitPrice = 100;
      const type = 721;
      const bulk = {
        saleId,
        creator: creator.address,
        tokenIds,
        unitPrice,
        paymentToken: paymentToken.address,
      };

      const signature = await verifyMessage(
        verifier,
        buyer,
        creator.address,
        saleId,
        BigNumber.from(hashPacked(tokenIds)),
        unitPrice,
        undefined,
        paymentToken.address,
        type
      );

      await increaseTime(41 * days);

      const balBuyer = await paymentToken.balanceOf(buyer.address);
      const balTreasury = await paymentToken.balanceOf(treasury.address);
      const itemBuyer = await inoERC20.balanceOf(buyer.address);

      await expect(
        inoERC20.connect(buyer).redeemBulk(bulk, signature)
      ).to.revertedWith("Reach max allocation");

      expect(await paymentToken.balanceOf(buyer.address)).deep.equal(balBuyer);
      expect(await inoERC20.balanceOf(buyer.address)).deep.equal(itemBuyer);
      expect(await paymentToken.balanceOf(treasury.address)).deep.equal(
        balTreasury
      );

      await expect(inoERC20.ownerOf(tokenIds[0])).to.revertedWith(
        "ERC721: owner query for nonexistent token"
      );
      await expect(inoERC20.ownerOf(tokenIds[1])).to.revertedWith(
        "ERC721: owner query for nonexistent token"
      );
      await expect(inoERC20.ownerOf(tokenIds[2])).to.revertedWith(
        "ERC721: owner query for nonexistent token"
      );

      await decreaseTime(41 * days);
    });

    it("should revert when User redeems tokens in bulk, but reach max allocation - Native Coin", async () => {
      const buyer = users[0];
      const creator = users[1];
      const saleId = 301;
      const tokenIds = [
        ethers.BigNumber.from("2721000300000000000000000000000000004"),
        ethers.BigNumber.from("2721000300000000000000000000000000005"),
        ethers.BigNumber.from("2721000300000000000000000000000000006"),
        ethers.BigNumber.from("2721000300000000000000000000000000007"),
      ];
      const unitPrice = 100;
      const amount = tokenIds.length;
      const type = 721;
      const bulk = {
        saleId,
        creator: creator.address,
        tokenIds,
        unitPrice,
        paymentToken: ethers.constants.AddressZero,
      };

      const signature = await verifyMessage(
        verifier,
        buyer,
        creator.address,
        saleId,
        BigNumber.from(hashPacked(tokenIds)),
        unitPrice,
        undefined,
        ethers.constants.AddressZero,
        type
      );

      await increaseTime(41 * days);

      const balTreasury = await treasury.getBalance();
      const itemBuyer = await inoNative.balanceOf(buyer.address);

      await expect(
        inoNative
          .connect(buyer)
          .redeemBulk(bulk, signature, { value: unitPrice * amount })
      ).to.revertedWith("Reach max allocation");

      expect(await inoNative.balanceOf(buyer.address)).deep.equal(itemBuyer);
      expect(await treasury.getBalance()).deep.equal(balTreasury);

      await expect(inoNative.ownerOf(tokenIds[0])).to.revertedWith(
        "ERC721: owner query for nonexistent token"
      );
      await expect(inoNative.ownerOf(tokenIds[1])).to.revertedWith(
        "ERC721: owner query for nonexistent token"
      );
      await expect(inoNative.ownerOf(tokenIds[2])).to.revertedWith(
        "ERC721: owner query for nonexistent token"
      );
      await expect(inoNative.ownerOf(tokenIds[3])).to.revertedWith(
        "ERC721: owner query for nonexistent token"
      );

      await decreaseTime(41 * days);
    });

    it("should revert when User redeems tokens in bulk, but wave not yet started - ERC20", async () => {
      const buyer = users[0];
      const creator = users[1];
      const saleId = 301;
      const tokenIds = [
        ethers.BigNumber.from("1721000300000000000000000000000000004"),
        ethers.BigNumber.from("1721000300000000000000000000000000005"),
      ];
      const unitPrice = 100;
      const type = 721;
      const bulk = {
        saleId,
        creator: creator.address,
        tokenIds,
        unitPrice,
        paymentToken: paymentToken.address,
      };

      const signature = await verifyMessage(
        verifier,
        buyer,
        creator.address,
        saleId,
        BigNumber.from(hashPacked(tokenIds)),
        unitPrice,
        undefined,
        paymentToken.address,
        type
      );

      await increaseTime(30 * days);

      const balBuyer = await paymentToken.balanceOf(buyer.address);
      const balTreasury = await paymentToken.balanceOf(treasury.address);
      const itemBuyer = await inoERC20.balanceOf(buyer.address);

      await expect(
        inoERC20.connect(buyer).redeemBulk(bulk, signature)
      ).to.revertedWith("Not yet started or expired");

      expect(await paymentToken.balanceOf(buyer.address)).deep.equal(balBuyer);
      expect(await inoERC20.balanceOf(buyer.address)).deep.equal(itemBuyer);
      expect(await paymentToken.balanceOf(treasury.address)).deep.equal(
        balTreasury
      );

      await expect(inoERC20.ownerOf(tokenIds[0])).to.revertedWith(
        "ERC721: owner query for nonexistent token"
      );
      await expect(inoERC20.ownerOf(tokenIds[1])).to.revertedWith(
        "ERC721: owner query for nonexistent token"
      );

      await decreaseTime(30 * days);
    });

    it("should revert when User redeems tokens in bulk, but wave not yet started - Native Coin", async () => {
      const buyer = users[0];
      const creator = users[1];
      const saleId = 301;
      const tokenIds = [
        ethers.BigNumber.from("2721000300000000000000000000000000004"),
        ethers.BigNumber.from("2721000300000000000000000000000000005"),
      ];
      const unitPrice = 100;
      const amount = tokenIds.length;
      const type = 721;
      const bulk = {
        saleId,
        creator: creator.address,
        tokenIds,
        unitPrice,
        paymentToken: ethers.constants.AddressZero,
      };

      const signature = await verifyMessage(
        verifier,
        buyer,
        creator.address,
        saleId,
        BigNumber.from(hashPacked(tokenIds)),
        unitPrice,
        undefined,
        ethers.constants.AddressZero,
        type
      );

      await increaseTime(30 * days);

      const balTreasury = await treasury.getBalance();
      const itemBuyer = await inoNative.balanceOf(buyer.address);

      await expect(
        inoNative
          .connect(buyer)
          .redeemBulk(bulk, signature, { value: unitPrice * amount })
      ).to.revertedWith("Not yet started or expired");

      expect(await inoNative.balanceOf(buyer.address)).deep.equal(itemBuyer);
      expect(await treasury.getBalance()).deep.equal(balTreasury);

      await expect(inoNative.ownerOf(tokenIds[0])).to.revertedWith(
        "ERC721: owner query for nonexistent token"
      );
      await expect(inoNative.ownerOf(tokenIds[1])).to.revertedWith(
        "ERC721: owner query for nonexistent token"
      );

      await decreaseTime(30 * days);
    });

    it("should revert when User redeems tokens in bulk, but wave ended already - ERC20", async () => {
      const buyer = users[0];
      const creator = users[1];
      const saleId = 301;
      const tokenIds = [
        ethers.BigNumber.from("1721000300000000000000000000000000004"),
        ethers.BigNumber.from("1721000300000000000000000000000000005"),
      ];
      const unitPrice = 100;
      const type = 721;
      const bulk = {
        saleId,
        creator: creator.address,
        tokenIds,
        unitPrice,
        paymentToken: paymentToken.address,
      };

      const signature = await verifyMessage(
        verifier,
        buyer,
        creator.address,
        saleId,
        BigNumber.from(hashPacked(tokenIds)),
        unitPrice,
        undefined,
        paymentToken.address,
        type
      );

      await increaseTime(60 * days);

      const balBuyer = await paymentToken.balanceOf(buyer.address);
      const balTreasury = await paymentToken.balanceOf(treasury.address);
      const itemBuyer = await inoERC20.balanceOf(buyer.address);

      await expect(
        inoERC20.connect(buyer).redeemBulk(bulk, signature)
      ).to.revertedWith("Not yet started or expired");

      expect(await paymentToken.balanceOf(buyer.address)).deep.equal(balBuyer);
      expect(await inoERC20.balanceOf(buyer.address)).deep.equal(itemBuyer);
      expect(await paymentToken.balanceOf(treasury.address)).deep.equal(
        balTreasury
      );

      await expect(inoERC20.ownerOf(tokenIds[0])).to.revertedWith(
        "ERC721: owner query for nonexistent token"
      );
      await expect(inoERC20.ownerOf(tokenIds[1])).to.revertedWith(
        "ERC721: owner query for nonexistent token"
      );

      await decreaseTime(60 * days);
    });

    it("should revert when User redeems tokens in bulk, but wave ended already - Native Coin", async () => {
      const buyer = users[0];
      const creator = users[1];
      const saleId = 301;
      const tokenIds = [
        ethers.BigNumber.from("2721000300000000000000000000000000004"),
        ethers.BigNumber.from("2721000300000000000000000000000000005"),
      ];
      const unitPrice = 100;
      const amount = tokenIds.length;
      const type = 721;
      const bulk = {
        saleId,
        creator: creator.address,
        tokenIds,
        unitPrice,
        paymentToken: ethers.constants.AddressZero,
      };

      const signature = await verifyMessage(
        verifier,
        buyer,
        creator.address,
        saleId,
        BigNumber.from(hashPacked(tokenIds)),
        unitPrice,
        undefined,
        ethers.constants.AddressZero,
        type
      );

      await increaseTime(60 * days);

      const balTreasury = await treasury.getBalance();
      const itemBuyer = await inoNative.balanceOf(buyer.address);

      await expect(
        inoNative
          .connect(buyer)
          .redeemBulk(bulk, signature, { value: unitPrice * amount })
      ).to.revertedWith("Not yet started or expired");

      expect(await inoNative.balanceOf(buyer.address)).deep.equal(itemBuyer);
      expect(await treasury.getBalance()).deep.equal(balTreasury);

      await expect(inoNative.ownerOf(tokenIds[0])).to.revertedWith(
        "ERC721: owner query for nonexistent token"
      );
      await expect(inoNative.ownerOf(tokenIds[1])).to.revertedWith(
        "ERC721: owner query for nonexistent token"
      );

      await decreaseTime(60 * days);
    });

    it("should revert when User redeems tokens in bulk, but payment token is invalid - ERC20", async () => {
      const buyer = users[0];
      const creator = users[1];
      const saleId = 301;
      const tokenIds = [
        ethers.BigNumber.from("1721000300000000000000000000000000004"),
        ethers.BigNumber.from("1721000300000000000000000000000000005"),
      ];
      const unitPrice = 100;
      const type = 721;
      const bulk = {
        saleId,
        creator: creator.address,
        tokenIds,
        unitPrice,
        paymentToken: ethers.constants.AddressZero,
      };

      const signature = await verifyMessage(
        verifier,
        buyer,
        creator.address,
        saleId,
        BigNumber.from(hashPacked(tokenIds)),
        unitPrice,
        undefined,
        ethers.constants.AddressZero,
        type
      );

      await increaseTime(41 * days);

      const balBuyer = await paymentToken.balanceOf(buyer.address);
      const balTreasury = await paymentToken.balanceOf(treasury.address);
      const itemBuyer = await inoERC20.balanceOf(buyer.address);

      await expect(
        inoERC20.connect(buyer).redeemBulk(bulk, signature)
      ).to.revertedWith("Invalid payment token");

      expect(await paymentToken.balanceOf(buyer.address)).deep.equal(balBuyer);
      expect(await inoERC20.balanceOf(buyer.address)).deep.equal(itemBuyer);
      expect(await paymentToken.balanceOf(treasury.address)).deep.equal(
        balTreasury
      );

      await expect(inoERC20.ownerOf(tokenIds[0])).to.revertedWith(
        "ERC721: owner query for nonexistent token"
      );
      await expect(inoERC20.ownerOf(tokenIds[1])).to.revertedWith(
        "ERC721: owner query for nonexistent token"
      );

      await decreaseTime(41 * days);
    });

    it("should revert when User redeems tokens in bulk, but payment token is invalid - Native Coin", async () => {
      const buyer = users[0];
      const creator = users[1];
      const saleId = 301;
      const tokenIds = [
        ethers.BigNumber.from("2721000300000000000000000000000000004"),
        ethers.BigNumber.from("2721000300000000000000000000000000005"),
      ];
      const unitPrice = 100;
      const amount = tokenIds.length;
      const type = 721;
      const bulk = {
        saleId,
        creator: creator.address,
        tokenIds,
        unitPrice,
        paymentToken: paymentToken.address,
      };

      const signature = await verifyMessage(
        verifier,
        buyer,
        creator.address,
        saleId,
        BigNumber.from(hashPacked(tokenIds)),
        unitPrice,
        undefined,
        paymentToken.address,
        type
      );

      await increaseTime(41 * days);

      const balTreasury = await treasury.getBalance();
      const itemBuyer = await inoNative.balanceOf(buyer.address);

      await expect(
        inoNative
          .connect(buyer)
          .redeemBulk(bulk, signature, { value: unitPrice * amount })
      ).to.revertedWith("Invalid payment token");

      expect(await inoNative.balanceOf(buyer.address)).deep.equal(itemBuyer);
      expect(await treasury.getBalance()).deep.equal(balTreasury);

      await expect(inoNative.ownerOf(tokenIds[0])).to.revertedWith(
        "ERC721: owner query for nonexistent token"
      );
      await expect(inoNative.ownerOf(tokenIds[1])).to.revertedWith(
        "ERC721: owner query for nonexistent token"
      );

      await decreaseTime(41 * days);
    });

    it("should revert when User redeems tokens in bulk, but one of TokenIds was minted - ERC20", async () => {
      const buyer = users[0];
      const creator = users[1];
      const saleId = 301;
      const tokenIds = [
        ethers.BigNumber.from("1721000300000000000000000000000000002"),
        ethers.BigNumber.from("1721000300000000000000000000000000005"),
      ];
      const unitPrice = 100;
      const type = 721;
      const bulk = {
        saleId,
        creator: creator.address,
        tokenIds,
        unitPrice,
        paymentToken: paymentToken.address,
      };

      const signature = await verifyMessage(
        verifier,
        buyer,
        creator.address,
        saleId,
        BigNumber.from(hashPacked(tokenIds)),
        unitPrice,
        undefined,
        paymentToken.address,
        type
      );

      await increaseTime(41 * days);

      const balBuyer = await paymentToken.balanceOf(buyer.address);
      const balTreasury = await paymentToken.balanceOf(treasury.address);
      const itemBuyer = await inoERC20.balanceOf(buyer.address);

      await expect(
        inoERC20.connect(buyer).redeemBulk(bulk, signature)
      ).to.revertedWith("ERC721: token already minted");

      expect(await paymentToken.balanceOf(buyer.address)).deep.equal(balBuyer);
      expect(await inoERC20.balanceOf(buyer.address)).deep.equal(itemBuyer);
      expect(await paymentToken.balanceOf(treasury.address)).deep.equal(
        balTreasury
      );

      expect(await inoERC20.ownerOf(tokenIds[0])).deep.equal(buyer.address);
      await expect(inoERC20.ownerOf(tokenIds[1])).to.revertedWith(
        "ERC721: owner query for nonexistent token"
      );

      await decreaseTime(41 * days);
    });

    it("should revert when User redeems tokens in bulk, but one of TokenIds was minted - Native Coin", async () => {
      const buyer = users[0];
      const creator = users[1];
      const saleId = 301;
      const tokenIds = [
        ethers.BigNumber.from("2721000300000000000000000000000000001"),
        ethers.BigNumber.from("2721000300000000000000000000000000005"),
      ];
      const unitPrice = 100;
      const amount = tokenIds.length;
      const type = 721;
      const bulk = {
        saleId,
        creator: creator.address,
        tokenIds,
        unitPrice,
        paymentToken: ethers.constants.AddressZero,
      };

      const signature = await verifyMessage(
        verifier,
        buyer,
        creator.address,
        saleId,
        BigNumber.from(hashPacked(tokenIds)),
        unitPrice,
        undefined,
        ethers.constants.AddressZero,
        type
      );

      await increaseTime(41 * days);

      const balTreasury = await treasury.getBalance();
      const itemBuyer = await inoNative.balanceOf(buyer.address);

      await expect(
        inoNative
          .connect(buyer)
          .redeemBulk(bulk, signature, { value: unitPrice * amount })
      ).to.revertedWith("ERC721: token already minted");

      expect(await inoNative.balanceOf(buyer.address)).deep.equal(itemBuyer);
      expect(await treasury.getBalance()).deep.equal(balTreasury);

      expect(await inoNative.ownerOf(tokenIds[0])).deep.equal(buyer.address);
      await expect(inoNative.ownerOf(tokenIds[1])).to.revertedWith(
        "ERC721: owner query for nonexistent token"
      );

      await decreaseTime(41 * days);
    });

    it("should revert when User redeems tokens in bulk without a signature - ERC20", async () => {
      const buyer = users[0];
      const creator = users[1];
      const saleId = 301;
      const tokenIds = [
        ethers.BigNumber.from("1721000300000000000000000000000000004"),
        ethers.BigNumber.from("1721000300000000000000000000000000005"),
      ];
      const unitPrice = 100;
      const bulk = {
        saleId,
        creator: creator.address,
        tokenIds,
        unitPrice,
        paymentToken: paymentToken.address,
      };

      const signature = ethers.utils.arrayify(0);

      await increaseTime(41 * days);

      const balBuyer = await paymentToken.balanceOf(buyer.address);
      const balTreasury = await paymentToken.balanceOf(treasury.address);
      const itemBuyer = await inoERC20.balanceOf(buyer.address);

      await expect(
        inoERC20.connect(buyer).redeemBulk(bulk, signature)
      ).to.revertedWith("ECDSA: invalid signature length");

      expect(await paymentToken.balanceOf(buyer.address)).deep.equal(balBuyer);
      expect(await inoERC20.balanceOf(buyer.address)).deep.equal(itemBuyer);
      expect(await paymentToken.balanceOf(treasury.address)).deep.equal(
        balTreasury
      );

      await expect(inoERC20.ownerOf(tokenIds[0])).to.revertedWith(
        "ERC721: owner query for nonexistent token"
      );
      await expect(inoERC20.ownerOf(tokenIds[1])).to.revertedWith(
        "ERC721: owner query for nonexistent token"
      );

      await decreaseTime(41 * days);
    });

    it("should revert when User redeems tokens in bulk without a signature - Native Coin", async () => {
      const buyer = users[0];
      const creator = users[1];
      const saleId = 301;
      const tokenIds = [
        ethers.BigNumber.from("2721000300000000000000000000000000004"),
        ethers.BigNumber.from("2721000300000000000000000000000000005"),
      ];
      const unitPrice = 100;
      const amount = tokenIds.length;
      const bulk = {
        saleId,
        creator: creator.address,
        tokenIds,
        unitPrice,
        paymentToken: ethers.constants.AddressZero,
      };

      const signature = ethers.utils.arrayify(0);

      await increaseTime(41 * days);

      const balTreasury = await treasury.getBalance();
      const itemBuyer = await inoNative.balanceOf(buyer.address);

      await expect(
        inoNative
          .connect(buyer)
          .redeemBulk(bulk, signature, { value: unitPrice * amount })
      ).to.revertedWith("ECDSA: invalid signature length");

      expect(await inoNative.balanceOf(buyer.address)).deep.equal(itemBuyer);
      expect(await treasury.getBalance()).deep.equal(balTreasury);

      await expect(inoNative.ownerOf(tokenIds[0])).to.revertedWith(
        "ERC721: owner query for nonexistent token"
      );
      await expect(inoNative.ownerOf(tokenIds[1])).to.revertedWith(
        "ERC721: owner query for nonexistent token"
      );

      await decreaseTime(41 * days);
    });

    it("should revert when User redeems tokens in bulk, but saleId, param and signature, not matched - ERC20", async () => {
      const buyer = users[0];
      const creator = users[1];
      const saleId = 301;
      const tokenIds = [
        ethers.BigNumber.from("1721000300000000000000000000000000004"),
        ethers.BigNumber.from("1721000300000000000000000000000000005"),
      ];
      const unitPrice = 100;
      const type = 721;
      const bulk = {
        saleId,
        creator: creator.address,
        tokenIds,
        unitPrice,
        paymentToken: paymentToken.address,
      };

      const signature = await verifyMessage(
        verifier,
        buyer,
        creator.address,
        saleId + 1,
        BigNumber.from(hashPacked(tokenIds)),
        unitPrice,
        undefined,
        paymentToken.address,
        type
      );

      await increaseTime(41 * days);

      const balBuyer = await paymentToken.balanceOf(buyer.address);
      const balTreasury = await paymentToken.balanceOf(treasury.address);
      const itemBuyer = await inoERC20.balanceOf(buyer.address);

      await expect(
        inoERC20.connect(buyer).redeemBulk(bulk, signature)
      ).to.revertedWith("Invalid admin or params");

      expect(await paymentToken.balanceOf(buyer.address)).deep.equal(balBuyer);
      expect(await inoERC20.balanceOf(buyer.address)).deep.equal(itemBuyer);
      expect(await paymentToken.balanceOf(treasury.address)).deep.equal(
        balTreasury
      );

      await expect(inoERC20.ownerOf(tokenIds[0])).to.revertedWith(
        "ERC721: owner query for nonexistent token"
      );
      await expect(inoERC20.ownerOf(tokenIds[1])).to.revertedWith(
        "ERC721: owner query for nonexistent token"
      );

      await decreaseTime(41 * days);
    });

    it("should revert when User redeems tokens in bulk, but saleId, param and signature, not matched - Native Coin", async () => {
      const buyer = users[0];
      const creator = users[1];
      const saleId = 301;
      const tokenIds = [
        ethers.BigNumber.from("2721000300000000000000000000000000004"),
        ethers.BigNumber.from("2721000300000000000000000000000000005"),
      ];
      const unitPrice = 100;
      const amount = tokenIds.length;
      const type = 721;
      const bulk = {
        saleId,
        creator: creator.address,
        tokenIds,
        unitPrice,
        paymentToken: ethers.constants.AddressZero,
      };

      const signature = await verifyMessage(
        verifier,
        buyer,
        creator.address,
        saleId + 1,
        BigNumber.from(hashPacked(tokenIds)),
        unitPrice,
        undefined,
        ethers.constants.AddressZero,
        type
      );

      await increaseTime(41 * days);

      const balTreasury = await treasury.getBalance();
      const itemBuyer = await inoNative.balanceOf(buyer.address);

      await expect(
        inoNative
          .connect(buyer)
          .redeemBulk(bulk, signature, { value: unitPrice * amount })
      ).to.revertedWith("Invalid admin or params");

      expect(await inoNative.balanceOf(buyer.address)).deep.equal(itemBuyer);
      expect(await treasury.getBalance()).deep.equal(balTreasury);

      await expect(inoNative.ownerOf(tokenIds[0])).to.revertedWith(
        "ERC721: owner query for nonexistent token"
      );
      await expect(inoNative.ownerOf(tokenIds[1])).to.revertedWith(
        "ERC721: owner query for nonexistent token"
      );

      await decreaseTime(41 * days);
    });

    it("should revert when User redeems tokens in bulk, but creator, param and signature, not matched - ERC20", async () => {
      const buyer = users[0];
      const creator = users[1];
      const saleId = 301;
      const tokenIds = [
        ethers.BigNumber.from("1721000300000000000000000000000000004"),
        ethers.BigNumber.from("1721000300000000000000000000000000005"),
      ];
      const unitPrice = 100;
      const type = 721;
      const bulk = {
        saleId,
        creator: creator.address,
        tokenIds,
        unitPrice,
        paymentToken: paymentToken.address,
      };

      const signature = await verifyMessage(
        verifier,
        buyer,
        users[3].address,
        saleId,
        BigNumber.from(hashPacked(tokenIds)),
        unitPrice,
        undefined,
        paymentToken.address,
        type
      );

      await increaseTime(41 * days);

      const balBuyer = await paymentToken.balanceOf(buyer.address);
      const balTreasury = await paymentToken.balanceOf(treasury.address);
      const itemBuyer = await inoERC20.balanceOf(buyer.address);

      await expect(
        inoERC20.connect(buyer).redeemBulk(bulk, signature)
      ).to.revertedWith("Invalid admin or params");

      expect(await paymentToken.balanceOf(buyer.address)).deep.equal(balBuyer);
      expect(await inoERC20.balanceOf(buyer.address)).deep.equal(itemBuyer);
      expect(await paymentToken.balanceOf(treasury.address)).deep.equal(
        balTreasury
      );

      await expect(inoERC20.ownerOf(tokenIds[0])).to.revertedWith(
        "ERC721: owner query for nonexistent token"
      );
      await expect(inoERC20.ownerOf(tokenIds[1])).to.revertedWith(
        "ERC721: owner query for nonexistent token"
      );

      await decreaseTime(41 * days);
    });

    it("should revert when User redeems tokens in bulk, but creator, param and signature, not matched - Native Coin", async () => {
      const buyer = users[0];
      const creator = users[1];
      const saleId = 301;
      const tokenIds = [
        ethers.BigNumber.from("2721000300000000000000000000000000004"),
        ethers.BigNumber.from("2721000300000000000000000000000000005"),
      ];
      const unitPrice = 100;
      const amount = tokenIds.length;
      const type = 721;
      const bulk = {
        saleId,
        creator: creator.address,
        tokenIds,
        unitPrice,
        paymentToken: ethers.constants.AddressZero,
      };

      const signature = await verifyMessage(
        verifier,
        buyer,
        users[4].address,
        saleId,
        BigNumber.from(hashPacked(tokenIds)),
        unitPrice,
        undefined,
        ethers.constants.AddressZero,
        type
      );

      await increaseTime(41 * days);

      const balTreasury = await treasury.getBalance();
      const itemBuyer = await inoNative.balanceOf(buyer.address);

      await expect(
        inoNative
          .connect(buyer)
          .redeemBulk(bulk, signature, { value: unitPrice * amount })
      ).to.revertedWith("Invalid admin or params");

      expect(await inoNative.balanceOf(buyer.address)).deep.equal(itemBuyer);
      expect(await treasury.getBalance()).deep.equal(balTreasury);

      await expect(inoNative.ownerOf(tokenIds[0])).to.revertedWith(
        "ERC721: owner query for nonexistent token"
      );
      await expect(inoNative.ownerOf(tokenIds[1])).to.revertedWith(
        "ERC721: owner query for nonexistent token"
      );

      await decreaseTime(41 * days);
    });

    it("should revert when User redeems tokens in bulk, but tokenIds, param and signature, not matched - ERC20", async () => {
      const buyer = users[0];
      const creator = users[1];
      const saleId = 301;
      const tokenIds = [
        ethers.BigNumber.from("1721000300000000000000000000000000004"),
        ethers.BigNumber.from("1721000300000000000000000000000000005"),
      ];
      const unitPrice = 100;
      const type = 721;
      const bulk = {
        saleId,
        creator: creator.address,
        tokenIds: [tokenIds[0]],
        unitPrice,
        paymentToken: paymentToken.address,
      };

      const signature = await verifyMessage(
        verifier,
        buyer,
        creator.address,
        saleId,
        BigNumber.from(hashPacked(tokenIds)),
        unitPrice,
        undefined,
        paymentToken.address,
        type
      );

      await increaseTime(41 * days);

      const balBuyer = await paymentToken.balanceOf(buyer.address);
      const balTreasury = await paymentToken.balanceOf(treasury.address);
      const itemBuyer = await inoERC20.balanceOf(buyer.address);

      await expect(
        inoERC20.connect(buyer).redeemBulk(bulk, signature)
      ).to.revertedWith("Invalid admin or params");

      expect(await paymentToken.balanceOf(buyer.address)).deep.equal(balBuyer);
      expect(await inoERC20.balanceOf(buyer.address)).deep.equal(itemBuyer);
      expect(await paymentToken.balanceOf(treasury.address)).deep.equal(
        balTreasury
      );

      await expect(inoERC20.ownerOf(tokenIds[0])).to.revertedWith(
        "ERC721: owner query for nonexistent token"
      );
      await expect(inoERC20.ownerOf(tokenIds[1])).to.revertedWith(
        "ERC721: owner query for nonexistent token"
      );

      await decreaseTime(41 * days);
    });

    it("should revert when User redeems tokens in bulk, but tokenIds, param and signature, not matched - Native Coin", async () => {
      const buyer = users[0];
      const creator = users[1];
      const saleId = 301;
      const tokenIds = [
        ethers.BigNumber.from("2721000300000000000000000000000000004"),
        ethers.BigNumber.from("2721000300000000000000000000000000005"),
      ];
      const unitPrice = 100;
      const amount = tokenIds.length;
      const type = 721;
      const bulk = {
        saleId,
        creator: creator.address,
        tokenIds: [tokenIds[1]],
        unitPrice,
        paymentToken: ethers.constants.AddressZero,
      };

      const signature = await verifyMessage(
        verifier,
        buyer,
        creator.address,
        saleId,
        BigNumber.from(hashPacked(tokenIds)),
        unitPrice,
        undefined,
        ethers.constants.AddressZero,
        type
      );

      await increaseTime(41 * days);

      const balTreasury = await treasury.getBalance();
      const itemBuyer = await inoNative.balanceOf(buyer.address);

      await expect(
        inoNative
          .connect(buyer)
          .redeemBulk(bulk, signature, { value: unitPrice * amount })
      ).to.revertedWith("Invalid admin or params");

      expect(await inoNative.balanceOf(buyer.address)).deep.equal(itemBuyer);
      expect(await treasury.getBalance()).deep.equal(balTreasury);

      await expect(inoNative.ownerOf(tokenIds[0])).to.revertedWith(
        "ERC721: owner query for nonexistent token"
      );
      await expect(inoNative.ownerOf(tokenIds[1])).to.revertedWith(
        "ERC721: owner query for nonexistent token"
      );

      await decreaseTime(41 * days);
    });

    it("should revert when User redeems tokens in bulk, but unitPirce, param and signature, not matched - ERC20", async () => {
      const buyer = users[0];
      const creator = users[1];
      const saleId = 301;
      const tokenIds = [
        ethers.BigNumber.from("1721000300000000000000000000000000004"),
        ethers.BigNumber.from("1721000300000000000000000000000000005"),
      ];
      const unitPrice = 100;
      const type = 721;
      const bulk = {
        saleId,
        creator: creator.address,
        tokenIds,
        unitPrice,
        paymentToken: paymentToken.address,
      };

      const signature = await verifyMessage(
        verifier,
        buyer,
        creator.address,
        saleId,
        BigNumber.from(hashPacked(tokenIds)),
        unitPrice + 1,
        undefined,
        paymentToken.address,
        type
      );

      await increaseTime(41 * days);

      const balBuyer = await paymentToken.balanceOf(buyer.address);
      const balTreasury = await paymentToken.balanceOf(treasury.address);
      const itemBuyer = await inoERC20.balanceOf(buyer.address);

      await expect(
        inoERC20.connect(buyer).redeemBulk(bulk, signature)
      ).to.revertedWith("Invalid admin or params");

      expect(await paymentToken.balanceOf(buyer.address)).deep.equal(balBuyer);
      expect(await inoERC20.balanceOf(buyer.address)).deep.equal(itemBuyer);
      expect(await paymentToken.balanceOf(treasury.address)).deep.equal(
        balTreasury
      );

      await expect(inoERC20.ownerOf(tokenIds[0])).to.revertedWith(
        "ERC721: owner query for nonexistent token"
      );
      await expect(inoERC20.ownerOf(tokenIds[1])).to.revertedWith(
        "ERC721: owner query for nonexistent token"
      );

      await decreaseTime(41 * days);
    });

    it("should revert when User redeems tokens in bulk, but unitPirce, param and signature, not matched - Native Coin", async () => {
      const buyer = users[0];
      const creator = users[1];
      const saleId = 301;
      const tokenIds = [
        ethers.BigNumber.from("2721000300000000000000000000000000004"),
        ethers.BigNumber.from("2721000300000000000000000000000000005"),
      ];
      const unitPrice = 100;
      const amount = tokenIds.length;
      const type = 721;
      const bulk = {
        saleId,
        creator: creator.address,
        tokenIds,
        unitPrice,
        paymentToken: ethers.constants.AddressZero,
      };

      const signature = await verifyMessage(
        verifier,
        buyer,
        creator.address,
        saleId,
        BigNumber.from(hashPacked(tokenIds)),
        unitPrice + 1,
        undefined,
        ethers.constants.AddressZero,
        type
      );

      await increaseTime(41 * days);

      const balTreasury = await treasury.getBalance();
      const itemBuyer = await inoNative.balanceOf(buyer.address);

      await expect(
        inoNative
          .connect(buyer)
          .redeemBulk(bulk, signature, { value: unitPrice * amount })
      ).to.revertedWith("Invalid admin or params");

      expect(await inoNative.balanceOf(buyer.address)).deep.equal(itemBuyer);
      expect(await treasury.getBalance()).deep.equal(balTreasury);

      await expect(inoNative.ownerOf(tokenIds[0])).to.revertedWith(
        "ERC721: owner query for nonexistent token"
      );
      await expect(inoNative.ownerOf(tokenIds[1])).to.revertedWith(
        "ERC721: owner query for nonexistent token"
      );

      await decreaseTime(41 * days);
    });

    it("should revert when User redeems tokens in bulk, but paymentToken, param and signature, not matched - ERC20", async () => {
      const buyer = users[0];
      const creator = users[1];
      const saleId = 301;
      const tokenIds = [
        ethers.BigNumber.from("1721000300000000000000000000000000004"),
        ethers.BigNumber.from("1721000300000000000000000000000000005"),
      ];
      const unitPrice = 100;
      const type = 721;
      const bulk = {
        saleId,
        creator: creator.address,
        tokenIds,
        unitPrice,
        paymentToken: paymentToken.address,
      };

      const signature = await verifyMessage(
        verifier,
        buyer,
        creator.address,
        saleId,
        BigNumber.from(hashPacked(tokenIds)),
        unitPrice,
        undefined,
        ethers.Wallet.createRandom().address,
        type
      );

      await increaseTime(41 * days);

      const balBuyer = await paymentToken.balanceOf(buyer.address);
      const balTreasury = await paymentToken.balanceOf(treasury.address);
      const itemBuyer = await inoERC20.balanceOf(buyer.address);

      await expect(
        inoERC20.connect(buyer).redeemBulk(bulk, signature)
      ).to.revertedWith("Invalid admin or params");

      expect(await paymentToken.balanceOf(buyer.address)).deep.equal(balBuyer);
      expect(await inoERC20.balanceOf(buyer.address)).deep.equal(itemBuyer);
      expect(await paymentToken.balanceOf(treasury.address)).deep.equal(
        balTreasury
      );

      await expect(inoERC20.ownerOf(tokenIds[0])).to.revertedWith(
        "ERC721: owner query for nonexistent token"
      );
      await expect(inoERC20.ownerOf(tokenIds[1])).to.revertedWith(
        "ERC721: owner query for nonexistent token"
      );

      await decreaseTime(41 * days);
    });

    it("should revert when User redeems tokens in bulk, but paymentToken, param and signature, not matched - Native Coin", async () => {
      const buyer = users[0];
      const creator = users[1];
      const saleId = 301;
      const tokenIds = [
        ethers.BigNumber.from("2721000300000000000000000000000000004"),
        ethers.BigNumber.from("2721000300000000000000000000000000005"),
      ];
      const unitPrice = 100;
      const amount = tokenIds.length;
      const type = 721;
      const bulk = {
        saleId,
        creator: creator.address,
        tokenIds,
        unitPrice,
        paymentToken: ethers.constants.AddressZero,
      };

      const signature = await verifyMessage(
        verifier,
        buyer,
        creator.address,
        saleId,
        BigNumber.from(hashPacked(tokenIds)),
        unitPrice,
        undefined,
        ethers.Wallet.createRandom().address,
        type
      );

      await increaseTime(41 * days);

      const balTreasury = await treasury.getBalance();
      const itemBuyer = await inoNative.balanceOf(buyer.address);

      await expect(
        inoNative
          .connect(buyer)
          .redeemBulk(bulk, signature, { value: unitPrice * amount })
      ).to.revertedWith("Invalid admin or params");

      expect(await inoNative.balanceOf(buyer.address)).deep.equal(itemBuyer);
      expect(await treasury.getBalance()).deep.equal(balTreasury);

      await expect(inoNative.ownerOf(tokenIds[0])).to.revertedWith(
        "ERC721: owner query for nonexistent token"
      );
      await expect(inoNative.ownerOf(tokenIds[1])).to.revertedWith(
        "ERC721: owner query for nonexistent token"
      );

      await decreaseTime(41 * days);
    });

    it("should revert when User redeems tokens in bulk, but balance is insufficient - ERC20", async () => {
      const buyer = users[0];
      const creator = users[1];
      const saleId = 301;
      const tokenIds = [
        ethers.BigNumber.from("1721000300000000000000000000000000004"),
        ethers.BigNumber.from("1721000300000000000000000000000000005"),
      ];
      const unitPrice = 10000000000000;
      const type = 721;
      const bulk = {
        saleId,
        creator: creator.address,
        tokenIds,
        unitPrice,
        paymentToken: paymentToken.address,
      };

      const signature = await verifyMessage(
        verifier,
        buyer,
        creator.address,
        saleId,
        BigNumber.from(hashPacked(tokenIds)),
        unitPrice,
        undefined,
        paymentToken.address,
        type
      );

      await increaseTime(41 * days);

      const balBuyer = await paymentToken.balanceOf(buyer.address);
      const balTreasury = await paymentToken.balanceOf(treasury.address);
      const itemBuyer = await inoERC20.balanceOf(buyer.address);

      await expect(
        inoERC20.connect(buyer).redeemBulk(bulk, signature)
      ).to.revertedWith("ERC20: insufficient allowance");

      expect(await paymentToken.balanceOf(buyer.address)).deep.equal(balBuyer);
      expect(await inoERC20.balanceOf(buyer.address)).deep.equal(itemBuyer);
      expect(await paymentToken.balanceOf(treasury.address)).deep.equal(
        balTreasury
      );

      await expect(inoERC20.ownerOf(tokenIds[0])).to.revertedWith(
        "ERC721: owner query for nonexistent token"
      );
      await expect(inoERC20.ownerOf(tokenIds[1])).to.revertedWith(
        "ERC721: owner query for nonexistent token"
      );

      await decreaseTime(41 * days);
    });

    it("should revert when User redeems tokens in bulk, but not yet set allowance - ERC20", async () => {
      const buyer = users[4];
      const creator = users[1];
      const saleId = 301;
      const tokenIds = [
        ethers.BigNumber.from("1721000300000000000000000000000000004"),
        ethers.BigNumber.from("1721000300000000000000000000000000005"),
      ];
      const unitPrice = 200;
      const type = 721;
      const bulk = {
        saleId,
        creator: creator.address,
        tokenIds,
        unitPrice,
        paymentToken: paymentToken.address,
      };

      const signature = await verifyMessage(
        verifier,
        buyer,
        creator.address,
        saleId,
        BigNumber.from(hashPacked(tokenIds)),
        unitPrice,
        undefined,
        paymentToken.address,
        type
      );

      await increaseTime(41 * days);

      const balBuyer = await paymentToken.balanceOf(buyer.address);
      const balTreasury = await paymentToken.balanceOf(treasury.address);
      const itemBuyer = await inoERC20.balanceOf(buyer.address);

      await expect(
        inoERC20.connect(buyer).redeemBulk(bulk, signature)
      ).to.revertedWith("ERC20: insufficient allowance");

      expect(await paymentToken.balanceOf(buyer.address)).deep.equal(balBuyer);
      expect(await inoERC20.balanceOf(buyer.address)).deep.equal(itemBuyer);
      expect(await paymentToken.balanceOf(treasury.address)).deep.equal(
        balTreasury
      );

      await expect(inoERC20.ownerOf(tokenIds[0])).to.revertedWith(
        "ERC721: owner query for nonexistent token"
      );
      await expect(inoERC20.ownerOf(tokenIds[1])).to.revertedWith(
        "ERC721: owner query for nonexistent token"
      );

      await decreaseTime(41 * days);
    });

    it("should revert when User redeems tokens in bulk, but payment exceeds allowance - ERC20", async () => {
      const buyer = users[4];
      const creator = users[1];
      const saleId = 301;
      const tokenIds = [
        ethers.BigNumber.from("1721000300000000000000000000000000004"),
        ethers.BigNumber.from("1721000300000000000000000000000000005"),
      ];
      const unitPrice = 200;
      const type = 721;
      const bulk = {
        saleId,
        creator: creator.address,
        tokenIds,
        unitPrice,
        paymentToken: paymentToken.address,
      };

      const signature = await verifyMessage(
        verifier,
        buyer,
        creator.address,
        saleId,
        BigNumber.from(hashPacked(tokenIds)),
        unitPrice,
        undefined,
        paymentToken.address,
        type
      );

      await paymentToken.connect(buyer).approve(inoERC20.address, 100);

      await increaseTime(41 * days);

      const balBuyer = await paymentToken.balanceOf(buyer.address);
      const balTreasury = await paymentToken.balanceOf(treasury.address);
      const itemBuyer = await inoERC20.balanceOf(buyer.address);

      await expect(
        inoERC20.connect(buyer).redeemBulk(bulk, signature)
      ).to.revertedWith("ERC20: insufficient allowance");

      expect(await paymentToken.balanceOf(buyer.address)).deep.equal(balBuyer);
      expect(await inoERC20.balanceOf(buyer.address)).deep.equal(itemBuyer);
      expect(await paymentToken.balanceOf(treasury.address)).deep.equal(
        balTreasury
      );

      await expect(inoERC20.ownerOf(tokenIds[0])).to.revertedWith(
        "ERC721: owner query for nonexistent token"
      );
      await expect(inoERC20.ownerOf(tokenIds[1])).to.revertedWith(
        "ERC721: owner query for nonexistent token"
      );

      await decreaseTime(41 * days);
    });

    it("should revert when User redeems tokens in bulk, but payment is insufficient - Native Coin", async () => {
      const buyer = users[0];
      const creator = users[1];
      const saleId = 301;
      const tokenIds = [
        ethers.BigNumber.from("2721000300000000000000000000000000004"),
        ethers.BigNumber.from("2721000300000000000000000000000000005"),
      ];
      const unitPrice = 100;
      const amount = tokenIds.length;
      const type = 721;
      const bulk = {
        saleId,
        creator: creator.address,
        tokenIds,
        unitPrice,
        paymentToken: ethers.constants.AddressZero,
      };

      const signature = await verifyMessage(
        verifier,
        buyer,
        creator.address,
        saleId,
        BigNumber.from(hashPacked(tokenIds)),
        unitPrice,
        undefined,
        ethers.constants.AddressZero,
        type
      );

      await increaseTime(41 * days);

      const balTreasury = await treasury.getBalance();
      const itemBuyer = await inoNative.balanceOf(buyer.address);

      await expect(
        inoNative
          .connect(buyer)
          .redeemBulk(bulk, signature, { value: unitPrice * amount - 100 })
      ).to.revertedWith("Insufficient payment");

      expect(await inoNative.balanceOf(buyer.address)).deep.equal(itemBuyer);
      expect(await treasury.getBalance()).deep.equal(balTreasury);

      await expect(inoNative.ownerOf(tokenIds[0])).to.revertedWith(
        "ERC721: owner query for nonexistent token"
      );
      await expect(inoNative.ownerOf(tokenIds[1])).to.revertedWith(
        "ERC721: owner query for nonexistent token"
      );

      await decreaseTime(41 * days);
    });
  });
});
