import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Factory1155, Governance, ERC20Test } from "../typechain";
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
  buyer: string,
  creator: string,
  saleId: number,
  tokenId: BigNumber,
  unitPrice: number,
  amount: number,
  paymentToken: string,
  type: number
): Promise<string> {
  const message = ethers.utils.solidityKeccak256(
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
    [buyer, creator, saleId, tokenId, unitPrice, amount, paymentToken, type]
  );
  return verifier.signMessage(ethers.utils.arrayify(message));
}

describe("INO1155 contract", () => {
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

    // Campaign with ERC20 payment
    const now = (await ethers.provider.getBlock("latest")).timestamp;
    let campaignId = 1;
    let setting = {
      startAt: now + 10 * 60 * 1000,
      endAt: now + 30 * 60 * 1000,
      paymentToken: paymentToken.address,
      name: "",
      symbol: "",
      uri,
    };
    await factory.connect(manager).createCampaign(campaignId, setting);

    // Campaign with native coin payment
    campaignId = 2;
    setting = {
      startAt: now + 10 * 60 * 1000,
      endAt: now + 30 * 60 * 1000,
      paymentToken: ethers.constants.AddressZero,
      name: "",
      symbol: "",
      uri,
    };
    await factory.connect(manager).createCampaign(campaignId, setting);
  });

  it("should set up wave if caller is campaign manager", async () => {
    const now = (await ethers.provider.getBlock("latest")).timestamp;
    const campaignId = 1;
    const waveId = 1;
    const limit = 2500;
    const startAt = now + 15 * 60 * 1000;
    const endAt = now + 18 * 60 * 1000;

    await increaseTime(10 * 60 * 1000);

    await factory
      .connect(manager)
      .setWave(campaignId, waveId, limit, startAt, endAt);
    const addr = await factory.campaigns(campaignId);

    const ino1155 = await ethers.getContractAt("INO1155", addr);
    const wave = await ino1155.waves(waveId);
    expect(wave.limit).deep.equal(limit);
    expect(wave.startAt).deep.equal(startAt);
    expect(wave.endAt).deep.equal(endAt);
  });

  it("should fail to set up wave if caller is not campaign manager", async () => {
    const now = (await ethers.provider.getBlock("latest")).timestamp;
    const campaignId = 1;
    const waveId = 2;
    const limit = 2500;
    const startAt = now + 15 * 60 * 1000;
    const endAt = now + 18 * 60 * 1000;

    await expect(
      factory.connect(admin).setWave(campaignId, waveId, limit, startAt, endAt)
    ).to.revertedWith("Only Campaign Manager");
  });

  it("should fail to set up wave if campaignId does not exist", async () => {
    const now = (await ethers.provider.getBlock("latest")).timestamp;
    const campaignId = 3;
    const waveId = 2;
    const limit = 2500;
    const startAt = now + 15 * 60 * 1000;
    const endAt = now + 18 * 60 * 1000;

    await expect(
      factory
        .connect(manager)
        .setWave(campaignId, waveId, limit, startAt, endAt)
    ).to.revertedWith("Campaign not exist");
  });

  it("should fail to set up wave if waveId already set", async () => {
    const now = (await ethers.provider.getBlock("latest")).timestamp;
    const campaignId = 1;
    const waveId = 1;
    const limit = 2500;
    const startAt = now + 15 * 60 * 1000;
    const endAt = now + 18 * 60 * 1000;

    await expect(
      factory
        .connect(manager)
        .setWave(campaignId, waveId, limit, startAt, endAt)
    ).to.revertedWith("Wave already set");
  });

  it("should fail to set up wave if campaign ended", async () => {
    const now = (await ethers.provider.getBlock("latest")).timestamp;
    const campaignId = 1;
    const waveId = 2;
    const limit = 3500;
    const startAt = now + 15 * 60 * 1000;
    const endAt = now + 18 * 60 * 1000;

    await increaseTime(100 * 60 * 1000); // campaign already ended
    await expect(
      factory
        .connect(manager)
        .setWave(campaignId, waveId, limit, startAt, endAt)
    ).to.revertedWith("Campaign ended");

    await decreaseTime(100 * 60 * 1000); // revert to current evm_time
  });

  it("should fail to set up wave if wave limit is zero", async () => {
    const now = (await ethers.provider.getBlock("latest")).timestamp;
    const campaignId = 1;
    const waveId = 2;
    const limit = 0;
    const startAt = now + 15 * 60 * 1000;
    const endAt = now + 18 * 60 * 1000;

    await expect(
      factory
        .connect(manager)
        .setWave(campaignId, waveId, limit, startAt, endAt)
    ).to.revertedWith("Invalid settings");
  });

  it("should fail to set up wave if wave times is invalid", async () => {
    const now = (await ethers.provider.getBlock("latest")).timestamp;
    const campaignId = 1;
    const waveId = 2;
    const limit = 0;
    const startAt = now + 15 * 60 * 1000;
    const endAt = now + 18 * 60 * 1000;

    await increaseTime(6 * 60 * 1000); // current time = 10 + 6 > start end = 15

    await expect(
      factory
        .connect(manager)
        .setWave(campaignId, waveId, limit, startAt, endAt)
    ).to.revertedWith("Invalid settings");

    await decreaseTime(6 * 60 * 1000); // revert to current evm_time
  });

  it("should not allow to set up wave if caller is not contract Factory", async () => {
    const now = (await ethers.provider.getBlock("latest")).timestamp;
    const campaignId = 1;
    const waveId = 2;
    const limit = 0;
    const startAt = now + 15 * 60 * 1000;
    const endAt = now + 18 * 60 * 1000;

    const addr = await factory.campaigns(campaignId);
    const ino1155 = await ethers.getContractAt("INO1155", addr);
    await expect(
      ino1155.setWave(waveId, limit, startAt, endAt)
    ).to.revertedWith("Only Factory");
  });

  it("should return tokenURI", async () => {
    const campaignId = 1;
    const tokenId = 99999001;
    const addr = await factory.campaigns(campaignId);
    const ino1155 = await ethers.getContractAt("INO1155", addr);
    const tokenUri = await ino1155.tokenURI(tokenId);
    expect(tokenUri).deep.equal(uri + tokenId);
  });

  describe("Redem tokens with ERC20 payment", () => {
    it("should allow user to redeem tokens by valid ticket", async () => {
      await increaseTime(5 * 60 * 1000); // set current evm_time to wave time

      const campaignId = 1;
      const creator = users[2];
      const buyer = users[0];
      const saleId = 1;
      const tokenId = ethers.BigNumber.from(
        "11155000100000000000000000000000000001"
      );
      const unitPrice = 100;
      const amount = 50;
      const type = 1155;
      const ticket = {
        saleId,
        creator: creator.address,
        tokenId,
        unitPrice,
        paymentToken: paymentToken.address,
        amount,
      };

      const buyerBalanceBefore = await paymentToken.balanceOf(buyer.address);
      const treasuryBalanceBefore = await paymentToken.balanceOf(
        treasury.address
      );

      const signature = await verifyMessage(
        verifier,
        buyer.address,
        creator.address,
        saleId,
        tokenId,
        unitPrice,
        amount,
        paymentToken.address,
        type
      );

      const addr = await factory.campaigns(campaignId);
      await paymentToken.connect(buyer).approve(addr, balance);

      const ino1155 = await ethers.getContractAt("INO1155", addr);

      await expect(ino1155.connect(buyer).redeem(ticket, signature))
        .to.emit(ino1155, "Redeem")
        .withArgs(
          addr,
          buyer.address,
          tokenId,
          paymentToken.address,
          unitPrice,
          amount
        );

      // Check buyer's balances
      let buyerBalance = await paymentToken.balanceOf(buyer.address);
      expect(buyerBalance).deep.equal(
        buyerBalanceBefore.sub(amount * unitPrice)
      );

      buyerBalance = await ino1155.balanceOf(buyer.address, tokenId);
      expect(buyerBalance).deep.equal(amount);

      // Check treasury's balance
      const treasuryBalance = await paymentToken.balanceOf(treasury.address);
      expect(treasuryBalance).deep.equal(
        treasuryBalanceBefore.add(amount * unitPrice)
      );

      await decreaseTime(5 * 60 * 1000); // revert to current evm_time
    });

    it("should not allow user to redeem tokens if creator address in ticket is zero address", async () => {
      await increaseTime(5 * 60 * 1000); // set current evm_time to wave time

      const campaignId = 1;
      const buyer = users[0];
      const saleId = 1;
      const tokenId = ethers.BigNumber.from(
        "11155000100000000000000000000000000001"
      );
      const unitPrice = 100;
      const amount = 50;
      const type = 1155;
      const ticket = {
        saleId,
        creator: ethers.constants.AddressZero,
        tokenId,
        unitPrice,
        paymentToken: paymentToken.address,
        amount,
      };

      const signature = await verifyMessage(
        verifier,
        buyer.address,
        ethers.constants.AddressZero,
        saleId,
        tokenId,
        unitPrice,
        amount,
        paymentToken.address,
        type
      );

      const addr = await factory.campaigns(campaignId);

      const ino1155 = await ethers.getContractAt("INO1155", addr);

      await expect(
        ino1155.connect(buyer).redeem(ticket, signature)
      ).revertedWith("ERC1155: mint to the zero address");

      await decreaseTime(5 * 60 * 1000); // reset
    });

    it("should not allow user to redeem tokens if payment token address in ticket is invalid", async () => {
      await increaseTime(5 * 60 * 1000); // set current evm_time to wave time

      const campaignId = 1;
      const creator = users[2];
      const buyer = users[0];
      const saleId = 1;
      const tokenId = ethers.BigNumber.from(
        "11155000100000000000000000000000000001"
      );
      const unitPrice = 100;
      const amount = 50;
      const type = 1155;
      const ticket = {
        saleId,
        creator: creator.address,
        tokenId,
        unitPrice,
        paymentToken: ethers.Wallet.createRandom().address,
        amount,
      };

      const signature = await verifyMessage(
        verifier,
        buyer.address,
        creator.address,
        saleId,
        tokenId,
        unitPrice,
        amount,
        paymentToken.address,
        type
      );

      const addr = await factory.campaigns(campaignId);

      const ino1155 = await ethers.getContractAt("INO1155", addr);

      await expect(
        ino1155.connect(buyer).redeem(ticket, signature)
      ).revertedWith("Invalid payment token");

      await decreaseTime(5 * 60 * 1000); // reset
    });

    it("should not allow user to redeem tokens if campaign didnt start yet or ended", async () => {
      const campaignId = 1;
      const creator = users[2];
      const buyer = users[0];
      const saleId = 1;
      const tokenId = ethers.BigNumber.from(
        "11155000100000000000000000000000000001"
      );
      const unitPrice = 100;
      const amount = 50;
      const type = 1155;
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
        buyer.address,
        creator.address,
        saleId,
        tokenId,
        unitPrice,
        amount,
        paymentToken.address,
        type
      );

      const addr = await factory.campaigns(campaignId);
      const ino1155 = await ethers.getContractAt("INO1155", addr);

      await decreaseTime(100 * 60 * 1000); // set campaign not start yet
      await expect(
        ino1155.connect(buyer).redeem(ticket, signature)
      ).to.revertedWith("Not yet started or expired");

      await increaseTime(200 * 60 * 1000); // set campaign ended
      await expect(
        ino1155.connect(buyer).redeem(ticket, signature)
      ).to.revertedWith("Campaign ended");

      await decreaseTime(100 * 60 * 1000); // revert to current evm_time
    });

    it("should not allow user to redeem tokens if wave didnt start yet or ended", async () => {
      const campaignId = 1;
      const creator = users[2];
      const buyer = users[0];
      const saleId = 1;
      const tokenId = ethers.BigNumber.from(
        "11155000100000000000000000000000000001"
      );
      const unitPrice = 100;
      const amount = 50;
      const type = 1155;
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
        creator.address,
        buyer.address,
        saleId,
        tokenId,
        unitPrice,
        amount,
        paymentToken.address,
        type
      );

      const addr = await factory.campaigns(campaignId);
      const ino1155 = await ethers.getContractAt("INO1155", addr);

      // current time = 10 < wave statrt = 15
      await expect(
        ino1155.connect(buyer).redeem(ticket, signature)
      ).to.revertedWith("Not yet started or expired");

      await increaseTime(10 * 60 * 1000); // set wave ended = 18 < 20
      await expect(
        ino1155.connect(buyer).redeem(ticket, signature)
      ).to.revertedWith("Not yet started or expired");

      await decreaseTime(10 * 60 * 1000); // reset
    });

    it("should not allow user to redeem tokens if campaginId in tokenId is incorrect", async () => {
      const campaignId = 1;
      const creator = users[2];
      const buyer = users[0];
      const saleId = 1;
      const tokenId = ethers.BigNumber.from(
        "1001155000100000000000000000000000000001"
      );
      const unitPrice = 100;
      const amount = 150;
      const type = 1155;
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
        creator.address,
        buyer.address,
        saleId,
        tokenId,
        unitPrice,
        amount,
        paymentToken.address,
        type
      );

      const addr = await factory.campaigns(campaignId);
      const ino1155 = await ethers.getContractAt("INO1155", addr);

      await increaseTime(5 * 60 * 1000); // enable wave 1
      await expect(
        ino1155.connect(buyer).redeem(ticket, signature)
      ).to.revertedWith("Invalid tokenId");
      await decreaseTime(5 * 60 * 1000); // revert to current evm_time
    });

    it("should not allow user to redeem tokens if NFT type in tokenId is incorrect", async () => {
      const campaignId = 1;
      const creator = users[2];
      const buyer = users[0];
      const saleId = 1;
      const tokenId = ethers.BigNumber.from(
        "1001166000100000000000000000000000000001"
      );
      const unitPrice = 100;
      const amount = 150;
      const type = 1155;
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
        creator.address,
        buyer.address,
        saleId,
        tokenId,
        unitPrice,
        amount,
        paymentToken.address,
        type
      );

      const addr = await factory.campaigns(campaignId);
      const ino1155 = await ethers.getContractAt("INO1155", addr);

      await increaseTime(5 * 60 * 1000); // enable wave 1
      await expect(
        ino1155.connect(buyer).redeem(ticket, signature)
      ).to.revertedWith("Invalid tokenId");
      await decreaseTime(5 * 60 * 1000); // reset
    });

    it("should not allow user to redeem tokens if max allocation exceed", async () => {
      const campaignId = 1;
      const creator = users[2];
      const buyer = users[0];
      const saleId = 1;
      const tokenId = ethers.BigNumber.from(
        "11155000100000000000000000000000000001"
      );
      const unitPrice = 100;
      const amount = 150000000;
      const type = 1155;
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
        creator.address,
        buyer.address,
        saleId,
        tokenId,
        unitPrice,
        amount,
        paymentToken.address,
        type
      );

      const addr = await factory.campaigns(campaignId);
      const ino1155 = await ethers.getContractAt("INO1155", addr);

      await increaseTime(5 * 60 * 1000); // enable wave 1
      await expect(
        ino1155.connect(buyer).redeem(ticket, signature)
      ).to.revertedWith("Reach max allocation");
      await decreaseTime(5 * 60 * 1000); // reset
    });

    it("should not allow user to redeem tokens if signature was used", async () => {
      await increaseTime(5 * 60 * 1000); // set current evm_time to wave time

      const campaignId = 1;
      const creator = users[2];
      const buyer = users[0];
      const saleId = 1;
      const tokenId = ethers.BigNumber.from(
        "11155000100000000000000000000000000001"
      );
      const unitPrice = 100;
      const amount = 50;
      const type = 1155;
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
        creator.address,
        buyer.address,
        saleId,
        tokenId,
        unitPrice,
        amount,
        paymentToken.address,
        type
      );

      const addr = await factory.campaigns(campaignId);
      const ino1155 = await ethers.getContractAt("INO1155", addr);

      await expect(
        ino1155.connect(buyer).redeem(ticket, signature)
      ).to.revertedWith("Signature was used");
      await decreaseTime(5 * 60 * 1000); // reset
    });

    it("should not allow user to redeem tokens if buyer in signature is not caller", async () => {
      await increaseTime(5 * 60 * 1000); // set current evm_time to wave time

      const campaignId = 1;
      const creator = users[2];
      const buyer = users[0];
      const saleId = 1;
      const tokenId = ethers.BigNumber.from(
        "11155000100000000000000000000000000001"
      );
      const unitPrice = 100;
      const amount = 100;
      const type = 1155;
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
        creator.address,
        users[3].address,
        saleId,
        tokenId,
        unitPrice,
        amount,
        paymentToken.address,
        type
      );

      const addr = await factory.campaigns(campaignId);
      const ino1155 = await ethers.getContractAt("INO1155", addr);

      await expect(
        ino1155.connect(buyer).redeem(ticket, signature)
      ).to.revertedWith("Invalid admin or params");
      await decreaseTime(5 * 60 * 1000); // reset
    });

    it("should not allow user to redeem tokens if creators in signature and ticket are different", async () => {
      await increaseTime(5 * 60 * 1000); // set current evm_time to wave time

      const campaignId = 1;
      const creator = users[2];
      const buyer = users[0];
      const saleId = 1;
      const tokenId = ethers.BigNumber.from(
        "11155000100000000000000000000000000001"
      );
      const unitPrice = 100;
      const amount = 100;
      const type = 1155;
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
        users[3].address,
        buyer.address,
        saleId,
        tokenId,
        unitPrice,
        amount,
        paymentToken.address,
        type
      );

      const addr = await factory.campaigns(campaignId);
      const ino1155 = await ethers.getContractAt("INO1155", addr);

      await expect(
        ino1155.connect(buyer).redeem(ticket, signature)
      ).to.revertedWith("Invalid admin or params");
      await decreaseTime(5 * 60 * 1000); // reset
    });

    it("should not allow user to redeem tokens if saleIds in signature and ticket are different", async () => {
      await increaseTime(5 * 60 * 1000); // set current evm_time to wave time

      const campaignId = 1;
      const creator = users[2];
      const buyer = users[0];
      const saleId = 1;
      const tokenId = ethers.BigNumber.from(
        "11155000100000000000000000000000000001"
      );
      const unitPrice = 100;
      const amount = 100;
      const type = 1155;
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
        creator.address,
        buyer.address,
        saleId + 1,
        tokenId,
        unitPrice,
        amount,
        paymentToken.address,
        type
      );

      const addr = await factory.campaigns(campaignId);
      const ino1155 = await ethers.getContractAt("INO1155", addr);

      await expect(
        ino1155.connect(buyer).redeem(ticket, signature)
      ).to.revertedWith("Invalid admin or params");
      await decreaseTime(5 * 60 * 1000); // reset
    });

    it("should not allow user to redeem tokens if tokenIds in signature and ticket are different", async () => {
      await increaseTime(5 * 60 * 1000); // set current evm_time to wave time

      const campaignId = 1;
      const creator = users[2];
      const buyer = users[0];
      const saleId = 1;
      const tokenId = ethers.BigNumber.from(
        "11155000100000000000000000000000000002"
      );
      const unitPrice = 100;
      const amount = 100;
      const type = 1155;
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
        creator.address,
        buyer.address,
        saleId,
        ethers.BigNumber.from("11155000100000000000000000000000000003"),
        unitPrice,
        amount,
        paymentToken.address,
        type
      );

      const addr = await factory.campaigns(campaignId);
      const ino1155 = await ethers.getContractAt("INO1155", addr);

      await expect(
        ino1155.connect(buyer).redeem(ticket, signature)
      ).to.revertedWith("Invalid admin or params");
      await decreaseTime(5 * 60 * 1000); // reset
    });

    it("should not allow user to redeem tokens if unit prices in signature and ticket are different", async () => {
      await increaseTime(5 * 60 * 1000); // set current evm_time to wave time

      const campaignId = 1;
      const creator = users[2];
      const buyer = users[0];
      const saleId = 1;
      const tokenId = ethers.BigNumber.from(
        "11155000100000000000000000000000000002"
      );
      const unitPrice = 100;
      const amount = 100;
      const type = 1155;
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
        creator.address,
        buyer.address,
        saleId,
        tokenId,
        unitPrice + 200,
        amount,
        paymentToken.address,
        type
      );

      const addr = await factory.campaigns(campaignId);
      const ino1155 = await ethers.getContractAt("INO1155", addr);

      await expect(
        ino1155.connect(buyer).redeem(ticket, signature)
      ).to.revertedWith("Invalid admin or params");
      await decreaseTime(5 * 60 * 1000); // reset
    });

    it("should not allow user to redeem tokens if purchase amounts in signature and ticket are different", async () => {
      await increaseTime(5 * 60 * 1000); // set current evm_time to wave time

      const campaignId = 1;
      const creator = users[2];
      const buyer = users[0];
      const saleId = 1;
      const tokenId = ethers.BigNumber.from(
        "11155000100000000000000000000000000002"
      );
      const unitPrice = 100;
      const amount = 100;
      const type = 1155;
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
        creator.address,
        buyer.address,
        saleId,
        tokenId,
        unitPrice,
        amount + 100,
        paymentToken.address,
        type
      );

      const addr = await factory.campaigns(campaignId);
      const ino1155 = await ethers.getContractAt("INO1155", addr);

      await expect(
        ino1155.connect(buyer).redeem(ticket, signature)
      ).to.revertedWith("Invalid admin or params");
      await decreaseTime(5 * 60 * 1000); // reset
    });

    it("should not allow user to redeem tokens if payment tokens in signature and ticket are different", async () => {
      await increaseTime(5 * 60 * 1000); // set current evm_time to wave time

      const campaignId = 1;
      const creator = users[2];
      const buyer = users[0];
      const saleId = 1;
      const tokenId = ethers.BigNumber.from(
        "11155000100000000000000000000000000002"
      );
      const unitPrice = 100;
      const amount = 100;
      const type = 1155;
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
        creator.address,
        buyer.address,
        saleId,
        tokenId,
        unitPrice + 200,
        amount,
        ethers.Wallet.createRandom().address,
        type
      );

      const addr = await factory.campaigns(campaignId);
      const ino1155 = await ethers.getContractAt("INO1155", addr);

      await expect(
        ino1155.connect(buyer).redeem(ticket, signature)
      ).to.revertedWith("Invalid admin or params");
      await decreaseTime(5 * 60 * 1000); // reset
    });

    it("should revert when user redeem tokens but does not approves the contract INO for the payment", async () => {
      await increaseTime(5 * 60 * 1000); // set current evm_time to wave time

      const campaignId = 1;
      const creator = users[2];
      const buyer = users[1];
      const saleId = 1;
      const tokenId = ethers.BigNumber.from(
        "11155000100000000000000000000000000001"
      );
      const unitPrice = 100;
      const amount = 50;
      const type = 1155;
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
        buyer.address,
        creator.address,
        saleId,
        tokenId,
        unitPrice,
        amount,
        paymentToken.address,
        type
      );

      const addr = await factory.campaigns(campaignId);

      const ino1155 = await ethers.getContractAt("INO1155", addr);

      await expect(
        ino1155.connect(buyer).redeem(ticket, signature)
      ).revertedWith("ERC20: insufficient allowance");

      await decreaseTime(5 * 60 * 1000); // revert to current evm_time
    });

    it("should revert when user redeem tokens but payment amount exceeds allowance", async () => {
      await increaseTime(5 * 60 * 1000); // set current evm_time to wave time

      const campaignId = 1;
      const creator = users[2];
      const buyer = users[1];
      const saleId = 1;
      const tokenId = ethers.BigNumber.from(
        "11155000100000000000000000000000000001"
      );
      const unitPrice = 100;
      const amount = 50;
      const allowance = 4000;
      const type = 1155;
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
        buyer.address,
        creator.address,
        saleId,
        tokenId,
        unitPrice,
        amount,
        paymentToken.address,
        type
      );

      const addr = await factory.campaigns(campaignId);
      await paymentToken.connect(buyer).approve(addr, allowance);

      const ino1155 = await ethers.getContractAt("INO1155", addr);

      await expect(
        ino1155.connect(buyer).redeem(ticket, signature)
      ).revertedWith("ERC20: insufficient allowance");

      await decreaseTime(5 * 60 * 1000); // reset
    });

    it("should revert when user redeem tokens but payment amount exceeds balance", async () => {
      await increaseTime(5 * 60 * 1000); // set current evm_time to wave time

      const campaignId = 1;
      const creator = users[2];
      const buyer = users[1];
      const saleId = 1;
      const tokenId = ethers.BigNumber.from(
        "11155000100000000000000000000000000001"
      );
      const unitPrice = 100;
      const amount = 50;
      const type = 1155;
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
        buyer.address,
        creator.address,
        saleId,
        tokenId,
        unitPrice,
        amount,
        paymentToken.address,
        type
      );

      const addr = await factory.campaigns(campaignId);
      await paymentToken.connect(buyer).approve(addr, balance);

      await paymentToken.connect(buyer).transfer(users[4].address, balance);

      const ino1155 = await ethers.getContractAt("INO1155", addr);

      await expect(
        ino1155.connect(buyer).redeem(ticket, signature)
      ).revertedWith("ERC20: transfer amount exceeds balance");

      await decreaseTime(5 * 60 * 1000); // reset
    });
  });

  describe("Redem tokens with native coin payment", () => {
    it("should allow user to redeem tokens by valid ticket", async () => {
      const now = (await ethers.provider.getBlock("latest")).timestamp;
      await factory
        .connect(manager)
        .setWave(2, 1, 4000, now + 5 * 60 * 1000, now + 8 * 60 * 1000);

      await increaseTime(5 * 60 * 1000); // set current evm_time to wave time

      const campaignId = 2;
      const creator = users[2];
      const buyer = users[0];
      const saleId = 1;
      const tokenId = ethers.BigNumber.from(
        "21155000100000000000000000000000000001"
      );
      const unitPrice = 100;
      const amount = 50;
      const type = 1155;
      const nativePayment = ethers.constants.AddressZero;
      const ticket = {
        saleId,
        creator: creator.address,
        tokenId,
        unitPrice,
        paymentToken: nativePayment,
        amount,
      };

      const treasuryBalanceBefore = await treasury.getBalance();

      const signature = await verifyMessage(
        verifier,
        buyer.address,
        creator.address,
        saleId,
        tokenId,
        unitPrice,
        amount,
        nativePayment,
        type
      );

      const addr = await factory.campaigns(campaignId);
      const ino1155 = await ethers.getContractAt("INO1155", addr);

      await expect(
        ino1155
          .connect(buyer)
          .redeem(ticket, signature, { value: amount * unitPrice })
      )
        .to.emit(ino1155, "Redeem")
        .withArgs(
          addr,
          buyer.address,
          tokenId,
          nativePayment,
          unitPrice,
          amount
        );

      // Check buyer's balances
      const buyerINOBalance = await ino1155.balanceOf(buyer.address, tokenId);
      expect(buyerINOBalance).deep.equal(amount);

      // Check treasury's balance
      const treasuryBalance = await treasury.getBalance();
      expect(treasuryBalance).deep.equal(
        treasuryBalanceBefore.add(amount * unitPrice)
      );

      await decreaseTime(5 * 60 * 1000); // revert to current evm_time
    });

    it("should not allow user to redeem tokens if creator address in ticket is zero address", async () => {
      await increaseTime(5 * 60 * 1000); // set current evm_time to wave time

      const campaignId = 2;
      const buyer = users[0];
      const saleId = 1;
      const tokenId = ethers.BigNumber.from(
        "21155000100000000000000000000000000001"
      );
      const unitPrice = 100;
      const amount = 50;
      const type = 1155;
      const nativePayment = ethers.constants.AddressZero;
      const ticket = {
        saleId,
        creator: ethers.constants.AddressZero,
        tokenId,
        unitPrice,
        paymentToken: nativePayment,
        amount,
      };

      const signature = await verifyMessage(
        verifier,
        buyer.address,
        ethers.constants.AddressZero,
        saleId,
        tokenId,
        unitPrice,
        amount,
        nativePayment,
        type
      );

      const addr = await factory.campaigns(campaignId);
      const ino1155 = await ethers.getContractAt("INO1155", addr);

      await expect(
        ino1155
          .connect(buyer)
          .redeem(ticket, signature, { value: amount * unitPrice })
      ).revertedWith("ERC1155: mint to the zero address");

      await decreaseTime(5 * 60 * 1000); // reset
    });

    it("should not allow user to redeem tokens if payment token address in ticket is invalid", async () => {
      await increaseTime(5 * 60 * 1000); // set current evm_time to wave time

      const campaignId = 2;
      const buyer = users[0];
      const saleId = 1;
      const tokenId = ethers.BigNumber.from(
        "21155000100000000000000000000000000001"
      );
      const unitPrice = 100;
      const amount = 50;
      const type = 1155;
      const nativePayment = ethers.constants.AddressZero;
      const ticket = {
        saleId,
        creator: ethers.constants.AddressZero,
        tokenId,
        unitPrice,
        paymentToken: ethers.Wallet.createRandom().address,
        amount,
      };

      const signature = await verifyMessage(
        verifier,
        buyer.address,
        ethers.constants.AddressZero,
        saleId,
        tokenId,
        unitPrice,
        amount,
        nativePayment,
        type
      );

      const addr = await factory.campaigns(campaignId);
      const ino1155 = await ethers.getContractAt("INO1155", addr);

      await expect(
        ino1155
          .connect(buyer)
          .redeem(ticket, signature, { value: amount * unitPrice })
      ).revertedWith("Invalid payment token");

      await decreaseTime(5 * 60 * 1000); // reset
    });

    it("should not allow user to redeem tokens if campaign didnt start yet or ended", async () => {
      const campaignId = 2;
      const creator = users[2];
      const buyer = users[0];
      const saleId = 1;
      const tokenId = ethers.BigNumber.from(
        "21155000100000000000000000000000000001"
      );
      const unitPrice = 100;
      const amount = 50;
      const type = 1155;
      const nativePayment = ethers.constants.AddressZero;
      const ticket = {
        saleId,
        creator: creator.address,
        tokenId,
        unitPrice,
        paymentToken: nativePayment,
        amount,
      };

      const signature = await verifyMessage(
        verifier,
        buyer.address,
        creator.address,
        saleId,
        tokenId,
        unitPrice,
        amount,
        nativePayment,
        type
      );

      const addr = await factory.campaigns(campaignId);
      const ino1155 = await ethers.getContractAt("INO1155", addr);

      await decreaseTime(100 * 60 * 1000); // set campaign not start yet
      await expect(
        ino1155.connect(buyer).redeem(ticket, signature)
      ).to.revertedWith("Not yet started or expired");

      await increaseTime(200 * 60 * 1000); // set campaign ended
      await expect(
        ino1155
          .connect(buyer)
          .redeem(ticket, signature, { value: amount * unitPrice })
      ).to.revertedWith("Campaign ended");

      await decreaseTime(100 * 60 * 1000); // revert to current evm_time
    });

    it("should not allow user to redeem tokens if wave didnt start yet or ended", async () => {
      const campaignId = 2;
      const creator = users[2];
      const buyer = users[0];
      const saleId = 1;
      const tokenId = ethers.BigNumber.from(
        "21155000100000000000000000000000000001"
      );
      const unitPrice = 100;
      const amount = 50;
      const type = 1155;
      const nativePayment = ethers.constants.AddressZero;
      const ticket = {
        saleId,
        creator: creator.address,
        tokenId,
        unitPrice,
        paymentToken: nativePayment,
        amount,
      };

      const signature = await verifyMessage(
        verifier,
        buyer.address,
        creator.address,
        saleId,
        tokenId,
        unitPrice,
        amount,
        nativePayment,
        type
      );

      const addr = await factory.campaigns(campaignId);
      const ino1155 = await ethers.getContractAt("INO1155", addr);

      // current time = 10 < wave statrt = 15
      await expect(
        ino1155.connect(buyer).redeem(ticket, signature)
      ).to.revertedWith("Not yet started or expired");

      await increaseTime(10 * 60 * 1000); // set wave ended = 18 < 20
      await expect(
        ino1155
          .connect(buyer)
          .redeem(ticket, signature, { value: amount * unitPrice })
      ).to.revertedWith("Not yet started or expired");

      await decreaseTime(10 * 60 * 1000); // reset
    });

    it("should not allow user to redeem tokens if campaginId in tokenId is incorrect", async () => {
      const campaignId = 2;
      const creator = users[2];
      const buyer = users[0];
      const saleId = 1;
      const tokenId = ethers.BigNumber.from(
        "41155000100000000000000000000000000001"
      );
      const unitPrice = 100;
      const amount = 50;
      const type = 1155;
      const nativePayment = ethers.constants.AddressZero;
      const ticket = {
        saleId,
        creator: creator.address,
        tokenId,
        unitPrice,
        paymentToken: nativePayment,
        amount,
      };

      const signature = await verifyMessage(
        verifier,
        buyer.address,
        creator.address,
        saleId,
        tokenId,
        unitPrice,
        amount,
        nativePayment,
        type
      );

      const addr = await factory.campaigns(campaignId);
      const ino1155 = await ethers.getContractAt("INO1155", addr);

      await increaseTime(5 * 60 * 1000); // enable wave 1
      await expect(
        ino1155
          .connect(buyer)
          .redeem(ticket, signature, { value: amount * unitPrice })
      ).to.revertedWith("Invalid tokenId");
      await decreaseTime(5 * 60 * 1000); // revert to current evm_time
    });

    it("should not allow user to redeem tokens if NFT type in tokenId is incorrect", async () => {
      const campaignId = 2;
      const creator = users[2];
      const buyer = users[0];
      const saleId = 1;
      const tokenId = ethers.BigNumber.from(
        "21156000100000000000000000000000000001"
      );
      const unitPrice = 100;
      const amount = 50;
      const type = 1155;
      const nativePayment = ethers.constants.AddressZero;
      const ticket = {
        saleId,
        creator: creator.address,
        tokenId,
        unitPrice,
        paymentToken: nativePayment,
        amount,
      };

      const signature = await verifyMessage(
        verifier,
        buyer.address,
        creator.address,
        saleId,
        tokenId,
        unitPrice,
        amount,
        nativePayment,
        type
      );

      const addr = await factory.campaigns(campaignId);
      const ino1155 = await ethers.getContractAt("INO1155", addr);

      await increaseTime(5 * 60 * 1000); // enable wave 1
      await expect(
        ino1155
          .connect(buyer)
          .redeem(ticket, signature, { value: amount * unitPrice })
      ).to.revertedWith("Invalid tokenId");
      await decreaseTime(5 * 60 * 1000); // reset
    });

    it("should not allow user to redeem tokens if max allocation exceed", async () => {
      const campaignId = 2;
      const creator = users[2];
      const buyer = users[0];
      const saleId = 1;
      const tokenId = ethers.BigNumber.from(
        "21155000100000000000000000000000000001"
      );
      const unitPrice = 100;
      const amount = 100000050;
      const type = 1155;
      const nativePayment = ethers.constants.AddressZero;
      const ticket = {
        saleId,
        creator: creator.address,
        tokenId,
        unitPrice,
        paymentToken: nativePayment,
        amount,
      };

      const signature = await verifyMessage(
        verifier,
        buyer.address,
        creator.address,
        saleId,
        tokenId,
        unitPrice,
        amount,
        nativePayment,
        type
      );

      const addr = await factory.campaigns(campaignId);
      const ino1155 = await ethers.getContractAt("INO1155", addr);

      await increaseTime(5 * 60 * 1000); // enable wave 1
      await expect(
        ino1155
          .connect(buyer)
          .redeem(ticket, signature, { value: amount * unitPrice })
      ).to.revertedWith("Reach max allocation");
      await decreaseTime(5 * 60 * 1000); // reset
    });

    it("should not allow user to redeem tokens if signature was used", async () => {
      await increaseTime(5 * 60 * 1000); // set current evm_time to wave time

      const campaignId = 2;
      const creator = users[2];
      const buyer = users[0];
      const saleId = 1;
      const tokenId = ethers.BigNumber.from(
        "21155000100000000000000000000000000001"
      );
      const unitPrice = 100;
      const amount = 50;
      const type = 1155;
      const nativePayment = ethers.constants.AddressZero;
      const ticket = {
        saleId,
        creator: creator.address,
        tokenId,
        unitPrice,
        paymentToken: nativePayment,
        amount,
      };

      const signature = await verifyMessage(
        verifier,
        buyer.address,
        creator.address,
        saleId,
        tokenId,
        unitPrice,
        amount,
        nativePayment,
        type
      );

      const addr = await factory.campaigns(campaignId);
      const ino1155 = await ethers.getContractAt("INO1155", addr);

      await expect(
        ino1155
          .connect(buyer)
          .redeem(ticket, signature, { value: amount * unitPrice })
      ).to.revertedWith("Signature was used");
      await decreaseTime(5 * 60 * 1000); // reset
    });

    it("should not allow user to redeem tokens if buyer in signature is not caller", async () => {
      await increaseTime(5 * 60 * 1000); // set current evm_time to wave time

      const campaignId = 2;
      const creator = users[2];
      const buyer = users[0];
      const saleId = 2;
      const tokenId = ethers.BigNumber.from(
        "21155000100000000000000000000000000001"
      );
      const unitPrice = 100;
      const amount = 50;
      const type = 1155;
      const nativePayment = ethers.constants.AddressZero;
      const ticket = {
        saleId,
        creator: creator.address,
        tokenId,
        unitPrice,
        paymentToken: nativePayment,
        amount,
      };

      const signature = await verifyMessage(
        verifier,
        users[3].address,
        creator.address,
        saleId,
        tokenId,
        unitPrice,
        amount,
        nativePayment,
        type
      );

      const addr = await factory.campaigns(campaignId);
      const ino1155 = await ethers.getContractAt("INO1155", addr);

      await expect(
        ino1155
          .connect(buyer)
          .redeem(ticket, signature, { value: amount * unitPrice })
      ).to.revertedWith("Invalid admin or params");
      await decreaseTime(5 * 60 * 1000); // reset
    });

    it("should not allow user to redeem tokens if creators in signature and ticket are different", async () => {
      await increaseTime(5 * 60 * 1000); // set current evm_time to wave time

      const campaignId = 2;
      const creator = users[2];
      const buyer = users[0];
      const saleId = 2;
      const tokenId = ethers.BigNumber.from(
        "21155000100000000000000000000000000001"
      );
      const unitPrice = 100;
      const amount = 50;
      const type = 1155;
      const nativePayment = ethers.constants.AddressZero;
      const ticket = {
        saleId,
        creator: creator.address,
        tokenId,
        unitPrice,
        paymentToken: nativePayment,
        amount,
      };

      const signature = await verifyMessage(
        verifier,
        buyer.address,
        users[3].address,
        saleId,
        tokenId,
        unitPrice,
        amount,
        nativePayment,
        type
      );

      const addr = await factory.campaigns(campaignId);
      const ino1155 = await ethers.getContractAt("INO1155", addr);

      await expect(
        ino1155
          .connect(buyer)
          .redeem(ticket, signature, { value: amount * unitPrice })
      ).to.revertedWith("Invalid admin or params");
      await decreaseTime(5 * 60 * 1000); // reset
    });

    it("should not allow user to redeem tokens if saleIds in signature and ticket are different", async () => {
      await increaseTime(5 * 60 * 1000); // set current evm_time to wave time

      const campaignId = 2;
      const creator = users[2];
      const buyer = users[0];
      const saleId = 2;
      const tokenId = ethers.BigNumber.from(
        "21155000100000000000000000000000000001"
      );
      const unitPrice = 100;
      const amount = 50;
      const type = 1155;
      const nativePayment = ethers.constants.AddressZero;
      const ticket = {
        saleId,
        creator: creator.address,
        tokenId,
        unitPrice,
        paymentToken: nativePayment,
        amount,
      };

      const signature = await verifyMessage(
        verifier,
        buyer.address,
        creator.address,
        saleId + 1,
        tokenId,
        unitPrice,
        amount,
        nativePayment,
        type
      );

      const addr = await factory.campaigns(campaignId);
      const ino1155 = await ethers.getContractAt("INO1155", addr);

      await expect(
        ino1155
          .connect(buyer)
          .redeem(ticket, signature, { value: amount * unitPrice })
      ).to.revertedWith("Invalid admin or params");
      await decreaseTime(5 * 60 * 1000); // reset
    });

    it("should not allow user to redeem tokens if tokenIds in signature and ticket are different", async () => {
      await increaseTime(5 * 60 * 1000); // set current evm_time to wave time

      const campaignId = 2;
      const creator = users[2];
      const buyer = users[0];
      const saleId = 2;
      const tokenId = ethers.BigNumber.from(
        "21155000100000000000000000000000000001"
      );
      const unitPrice = 100;
      const amount = 50;
      const type = 1155;
      const nativePayment = ethers.constants.AddressZero;
      const ticket = {
        saleId,
        creator: creator.address,
        tokenId,
        unitPrice,
        paymentToken: nativePayment,
        amount,
      };

      const signature = await verifyMessage(
        verifier,
        buyer.address,
        creator.address,
        saleId,
        tokenId.sub(1),
        unitPrice,
        amount,
        nativePayment,
        type
      );

      const addr = await factory.campaigns(campaignId);
      const ino1155 = await ethers.getContractAt("INO1155", addr);

      await expect(
        ino1155
          .connect(buyer)
          .redeem(ticket, signature, { value: amount * unitPrice })
      ).to.revertedWith("Invalid admin or params");
      await decreaseTime(5 * 60 * 1000); // reset
    });

    it("should not allow user to redeem tokens if unit prices in signature and ticket are different", async () => {
      await increaseTime(5 * 60 * 1000); // set current evm_time to wave time

      const campaignId = 2;
      const creator = users[2];
      const buyer = users[0];
      const saleId = 2;
      const tokenId = ethers.BigNumber.from(
        "21155000100000000000000000000000000001"
      );
      const unitPrice = 100;
      const amount = 50;
      const type = 1155;
      const nativePayment = ethers.constants.AddressZero;
      const ticket = {
        saleId,
        creator: creator.address,
        tokenId,
        unitPrice,
        paymentToken: nativePayment,
        amount,
      };

      const signature = await verifyMessage(
        verifier,
        buyer.address,
        creator.address,
        saleId,
        tokenId,
        unitPrice + 1,
        amount,
        nativePayment,
        type
      );

      const addr = await factory.campaigns(campaignId);
      const ino1155 = await ethers.getContractAt("INO1155", addr);

      await expect(
        ino1155
          .connect(buyer)
          .redeem(ticket, signature, { value: amount * unitPrice })
      ).to.revertedWith("Invalid admin or params");
      await decreaseTime(5 * 60 * 1000); // reset
    });

    it("should not allow user to redeem tokens if purchase amounts in signature and ticket are different", async () => {
      await increaseTime(5 * 60 * 1000); // set current evm_time to wave time

      const campaignId = 2;
      const creator = users[2];
      const buyer = users[0];
      const saleId = 2;
      const tokenId = ethers.BigNumber.from(
        "21155000100000000000000000000000000001"
      );
      const unitPrice = 100;
      const amount = 50;
      const type = 1155;
      const nativePayment = ethers.constants.AddressZero;
      const ticket = {
        saleId,
        creator: creator.address,
        tokenId,
        unitPrice,
        paymentToken: nativePayment,
        amount,
      };

      const signature = await verifyMessage(
        verifier,
        buyer.address,
        creator.address,
        saleId,
        tokenId,
        unitPrice,
        amount + 1,
        nativePayment,
        type
      );

      const addr = await factory.campaigns(campaignId);
      const ino1155 = await ethers.getContractAt("INO1155", addr);

      await expect(
        ino1155
          .connect(buyer)
          .redeem(ticket, signature, { value: amount * unitPrice })
      ).to.revertedWith("Invalid admin or params");
      await decreaseTime(5 * 60 * 1000); // reset
    });

    it("should not allow user to redeem tokens if payment tokens in signature and ticket are different", async () => {
      await increaseTime(5 * 60 * 1000); // set current evm_time to wave time

      const campaignId = 2;
      const creator = users[2];
      const buyer = users[0];
      const saleId = 2;
      const tokenId = ethers.BigNumber.from(
        "21155000100000000000000000000000000001"
      );
      const unitPrice = 100;
      const amount = 50;
      const type = 1155;
      const nativePayment = ethers.constants.AddressZero;
      const ticket = {
        saleId,
        creator: creator.address,
        tokenId,
        unitPrice,
        paymentToken: nativePayment,
        amount,
      };

      const signature = await verifyMessage(
        verifier,
        buyer.address,
        creator.address,
        saleId,
        tokenId,
        unitPrice,
        amount,
        ethers.Wallet.createRandom().address,
        type
      );

      const addr = await factory.campaigns(campaignId);
      const ino1155 = await ethers.getContractAt("INO1155", addr);

      await expect(
        ino1155
          .connect(buyer)
          .redeem(ticket, signature, { value: amount * unitPrice })
      ).to.revertedWith("Invalid admin or params");
      await decreaseTime(5 * 60 * 1000); // reset
    });

    it("should revert when user redeem tokens but payment amount is insufficient", async () => {
      await increaseTime(5 * 60 * 1000); // set current evm_time to wave time

      const campaignId = 2;
      const creator = users[2];
      const buyer = users[5];
      const saleId = 2;
      const tokenId = ethers.BigNumber.from(
        "21155000100000000000000000000000000001"
      );
      const unitPrice = 100;
      const amount = 50;
      const type = 1155;
      const nativePayment = ethers.constants.AddressZero;
      const ticket = {
        saleId,
        creator: creator.address,
        tokenId,
        unitPrice,
        paymentToken: nativePayment,
        amount,
      };

      const signature = await verifyMessage(
        verifier,
        buyer.address,
        creator.address,
        saleId,
        tokenId,
        unitPrice,
        amount,
        nativePayment,
        type
      );

      const addr = await factory.campaigns(campaignId);

      const ino1155 = await ethers.getContractAt("INO1155", addr);

      await expect(
        ino1155
          .connect(buyer)
          .redeem(ticket, signature, { value: amount * unitPrice - 100 })
      ).revertedWith("Insufficient payment");

      await decreaseTime(5 * 60 * 1000); // reset
    });
  });
});
