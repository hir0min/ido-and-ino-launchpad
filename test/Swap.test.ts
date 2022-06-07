import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { ERC20Test, Swap } from "../typechain";

async function verifyMessage(
  verifier: SignerWithAddress,
  eventID: number,
  inAmt: number,
  outAmt: number,
  maxAllocation: number,
  inToken: ERC20Test,
  outToken: ERC20Test,
  holder: SignerWithAddress,
  sender: SignerWithAddress
): Promise<string> {
  const message = ethers.utils.solidityKeccak256(
    [
      "uint256",
      "uint256",
      "uint256",
      "uint256",
      "address",
      "address",
      "address",
      "address",
    ],
    [
      eventID,
      inAmt,
      outAmt,
      maxAllocation,
      inToken.address,
      outToken.address,
      holder.address,
      sender.address,
    ]
  );
  return verifier.signMessage(ethers.utils.arrayify(message));
}

describe("Swap contract", () => {
  let idoToken: ERC20Test;
  let usdToken: ERC20Test;
  let swap: Swap;
  let admin: SignerWithAddress;
  let holder: SignerWithAddress;
  let verifier: SignerWithAddress;
  let treasury: SignerWithAddress;
  let users: SignerWithAddress[];

  before(async () => {
    [admin, holder, treasury, verifier, ...users] = await ethers.getSigners();

    const erc20TestFactory = await ethers.getContractFactory(
      "ERC20Test",
      admin
    );

    idoToken = await erc20TestFactory.deploy("IDOToken", "IDT");
    usdToken = await erc20TestFactory.deploy("USDToken", "USDT");
  });

  it("should deploy swap contract using proxy pattern", async () => {
    const poolFactory = await ethers.getContractFactory("Swap", admin);

    swap = (await upgrades.deployProxy(
      poolFactory,
      [
        ethers.Wallet.createRandom().address,
        ethers.Wallet.createRandom().address,
      ],
      {
        initializer: "init",
      }
    )) as Swap;
    await swap.deployed();
  });

  it("should update verfier address if caller is contract owner", async () => {
    await swap.connect(admin).updateVerifier(verifier.address);

    const addr = await swap.verifier();
    expect(addr).deep.equal(verifier.address);
  });

  it("should fail to update verfier address if caller is not contract owner", async () => {
    await expect(
      swap
        .connect(verifier)
        .updateVerifier(ethers.Wallet.createRandom().address)
    ).to.revertedWith("Ownable: caller is not the owner");
  });

  it("should fail to update verifier if address is zero", async () => {
    await expect(
      swap.connect(admin).updateVerifier(ethers.constants.AddressZero)
    ).to.revertedWith("Set zero address");
  });

  it("should update treasury address if caller is contract owner", async () => {
    await swap.connect(admin).updateTreasury(treasury.address);

    const addr = await swap.treasury();
    expect(addr).deep.equal(treasury.address);
  });

  it("should fail to update treasury address if caller is not contract owner", async () => {
    await expect(
      swap
        .connect(treasury)
        .updateTreasury(ethers.Wallet.createRandom().address)
    ).to.revertedWith("Ownable: caller is not the owner");
  });

  it("should fail to update treasury if address is zero", async () => {
    await expect(
      swap.connect(admin).updateTreasury(ethers.constants.AddressZero)
    ).to.revertedWith("Set zero address");
  });

  it("should swap erc20 token for erc20 ido tokens", async () => {
    const buyer = users[0];
    const eventId = 1;
    const inAmt = 600;
    const outAmt = 10000;
    const maxAllocation = 20000;
    const poolSupply = 10 ** 9;
    const balance = 25000;

    await usdToken.mint(buyer.address, balance);
    await idoToken.mint(holder.address, poolSupply);

    await usdToken.connect(buyer).approve(swap.address, maxAllocation);
    await idoToken.connect(holder).approve(swap.address, poolSupply);

    const signature = await verifyMessage(
      verifier,
      eventId,
      inAmt,
      outAmt,
      maxAllocation,
      idoToken,
      usdToken,
      holder,
      buyer
    );

    await expect(
      swap
        .connect(buyer)
        .swap(
          eventId,
          inAmt,
          outAmt,
          maxAllocation,
          idoToken.address,
          usdToken.address,
          holder.address,
          signature
        )
    )
      .to.emit(swap, "Swap")
      .withArgs(
        eventId,
        buyer.address,
        holder.address,
        inAmt,
        outAmt,
        idoToken.address,
        usdToken.address
      );

    // Check buyer's balance
    const buyerIdoBalance = await idoToken.balanceOf(buyer.address);
    expect(buyerIdoBalance).deep.equal(inAmt);

    const buyerUsdtBalance = await usdToken.balanceOf(buyer.address);
    expect(buyerUsdtBalance).deep.equal(balance - outAmt);

    // Check holder's balance
    const holderIdoBalance = await idoToken.balanceOf(holder.address);
    expect(holderIdoBalance).deep.equal(poolSupply - inAmt);

    // Check treasury's balance
    const treasuryUsdtBalance = await usdToken.balanceOf(treasury.address);
    expect(treasuryUsdtBalance).deep.equal(outAmt);
  });

  it("should swap native coin for erc20 ido token", async () => {
    const buyer = users[1];
    const eventId = 1;
    const inAmt = 999;
    const outAmt = 20000;
    const maxAllocation = 20000;
    const emptyContract = usdToken.attach(ethers.constants.AddressZero);
    const poolSupply = await idoToken.balanceOf(holder.address);
    const treasuryBalance = await treasury.getBalance();

    const signature = await verifyMessage(
      verifier,
      eventId,
      inAmt,
      outAmt,
      maxAllocation,
      idoToken,
      emptyContract,
      holder,
      buyer
    );

    await expect(
      swap
        .connect(buyer)
        .swap(
          eventId,
          inAmt,
          outAmt,
          maxAllocation,
          idoToken.address,
          emptyContract.address,
          holder.address,
          signature,
          {
            value: outAmt,
          }
        )
    )
      .to.emit(swap, "Swap")
      .withArgs(
        eventId,
        buyer.address,
        holder.address,
        inAmt,
        outAmt,
        idoToken.address,
        emptyContract.address
      );

    // Check buyer's balance
    const buyerIdoBalance = await idoToken.balanceOf(buyer.address);
    expect(buyerIdoBalance).deep.equal(inAmt);

    // Check holder's balance
    const holderIdoBalance = await idoToken.balanceOf(holder.address);
    expect(holderIdoBalance).deep.equal(poolSupply.sub(inAmt));

    // Check treasury's balance
    const treasuryNativeCoinBalance = await treasury.getBalance();
    expect(treasuryNativeCoinBalance).deep.equal(treasuryBalance.add(outAmt));
  });

  it("should revert if ido token address is zero", async () => {
    const buyer = users[1];
    const eventId = 1;
    const inAmt = 999;
    const outAmt = 20000;
    const maxAllocation = 20000;
    const emptyContract = idoToken.attach(ethers.constants.AddressZero);

    const signature = await verifyMessage(
      verifier,
      eventId,
      inAmt,
      outAmt,
      maxAllocation,
      emptyContract,
      usdToken,
      holder,
      buyer
    );

    await expect(
      swap
        .connect(buyer)
        .swap(
          eventId,
          inAmt,
          outAmt,
          maxAllocation,
          emptyContract.address,
          usdToken.address,
          holder.address,
          signature,
          {
            value: outAmt,
          }
        )
    ).to.revertedWith("Invalid token address");
  });

  it("should revert if max allocation is zero", async () => {
    const buyer = users[1];
    const eventId = 1;
    const inAmt = 999;
    const outAmt = 20000;
    const maxAllocation = 0;

    const signature = await verifyMessage(
      verifier,
      eventId,
      inAmt,
      outAmt,
      maxAllocation,
      idoToken,
      usdToken,
      holder,
      buyer
    );

    await expect(
      swap
        .connect(buyer)
        .swap(
          eventId,
          inAmt,
          outAmt,
          maxAllocation,
          idoToken.address,
          usdToken.address,
          holder.address,
          signature,
          {
            value: outAmt,
          }
        )
    ).to.revertedWith("Invalid allocation");
  });

  it("should revert if purchase exceeds the current allocation", async () => {
    const buyer = users[0];
    const eventId = 1;
    const inAmt = 600;
    const outAmt = 20000;
    const maxAllocation = 20000;

    const signature = await verifyMessage(
      verifier,
      eventId,
      inAmt,
      outAmt,
      maxAllocation,
      idoToken,
      usdToken,
      holder,
      buyer
    );

    await expect(
      swap
        .connect(buyer)
        .swap(
          eventId,
          inAmt,
          outAmt,
          maxAllocation,
          idoToken.address,
          usdToken.address,
          holder.address,
          signature
        )
    ).to.revertedWith("Exceed available allocation");
  });

  it("should allow to swap ido tokens again if current allocation is still avaiable", async () => {
    const buyer = users[0];
    const eventId = 1;
    const inAmt = 700;
    const outAmt = 5000;
    const maxAllocation = 20000;
    const holderIdoBalanceBefore = await idoToken.balanceOf(holder.address);
    const buyerUsdtBalanceBefore = await usdToken.balanceOf(buyer.address);
    const buyerIdoBalanceBefore = await idoToken.balanceOf(buyer.address);
    const treasuryIdoBalanceBefore = await usdToken.balanceOf(treasury.address);

    const signature = await verifyMessage(
      verifier,
      eventId,
      inAmt,
      outAmt,
      maxAllocation,
      idoToken,
      usdToken,
      holder,
      buyer
    );

    await expect(
      swap
        .connect(buyer)
        .swap(
          eventId,
          inAmt,
          outAmt,
          maxAllocation,
          idoToken.address,
          usdToken.address,
          holder.address,
          signature
        )
    )
      .to.emit(swap, "Swap")
      .withArgs(
        eventId,
        buyer.address,
        holder.address,
        inAmt,
        outAmt,
        idoToken.address,
        usdToken.address
      );

    // Check buyer's balance
    const buyerIdoBalance = await idoToken.balanceOf(buyer.address);
    expect(buyerIdoBalance).deep.equal(buyerIdoBalanceBefore.add(inAmt));

    const buyerUsdtBalance = await usdToken.balanceOf(buyer.address);
    expect(buyerUsdtBalance).deep.equal(buyerUsdtBalanceBefore.sub(outAmt));

    // Check holder's balance
    const holderIdoBalance = await idoToken.balanceOf(holder.address);
    expect(holderIdoBalance).deep.equal(holderIdoBalanceBefore.sub(inAmt));

    // Check treasury's balance
    const treasuryUsdtBalance = await usdToken.balanceOf(treasury.address);
    expect(treasuryUsdtBalance).deep.equal(
      treasuryIdoBalanceBefore.add(outAmt)
    );
  });
});
