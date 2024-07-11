const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("BottomsInTopsIn", function () {
  let BottomsInTopsIn,
    bottomsInTopsIn,
    BottomToken,
    bottomToken,
    TopToken,
    topToken,
    MockThrusterRouter,
    thrusterRouter,
    owner,
    addr1,
    addr2;
  const EPOCH_DURATION = 7 * 24 * 60 * 60; // 7 days in seconds

  beforeEach(async function () {
    [owner, addr1, addr2] = await ethers.getSigners();

    BottomToken = await ethers.getContractFactory("BottomToken");
    bottomToken = await BottomToken.deploy(owner.address);

    TopToken = await ethers.getContractFactory("TopToken");
    topToken = await TopToken.deploy(owner.address);

    MockThrusterRouter = await ethers.getContractFactory("MockThrusterRouter");
    thrusterRouter = await MockThrusterRouter.deploy();

    BottomsInTopsIn = await ethers.getContractFactory("BottomsInTopsIn");
    bottomsInTopsIn = await BottomsInTopsIn.deploy(
      bottomToken.address,
      topToken.address,
      thrusterRouter.address
    );

    // Mint some tokens to users for testing
    await bottomToken.mint(addr1.address, ethers.utils.parseEther("1000"));
    await topToken.mint(addr1.address, ethers.utils.parseEther("1000"));
    await bottomToken.mint(addr2.address, ethers.utils.parseEther("1000"));
    await topToken.mint(addr2.address, ethers.utils.parseEther("1000"));
  });

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(await bottomsInTopsIn.owner()).to.equal(owner.address);
    });

    it("Should set the correct token addresses", async function () {
      expect(await bottomsInTopsIn.bottomToken()).to.equal(bottomToken.address);
      expect(await bottomsInTopsIn.topToken()).to.equal(topToken.address);
    });

    it("Should set the correct thruster router address", async function () {
      expect(await bottomsInTopsIn.thrusterRouter()).to.equal(
        thrusterRouter.address
      );
    });
  });

  describe("Epoch Management", function () {
    it("Should not allow settling an epoch before EPOCH_DURATION has passed", async function () {
      await expect(
        bottomsInTopsIn.settleEpoch(ethers.utils.parseEther("1000000"))
      ).to.be.revertedWith("Epoch not finished");
    });

    it("Should allow the owner to settle an epoch after EPOCH_DURATION", async function () {
      await time.increase(EPOCH_DURATION);
      const currentMarketCap = ethers.utils.parseEther("1000000");
      await expect(bottomsInTopsIn.settleEpoch(currentMarketCap))
        .to.emit(bottomsInTopsIn, "EpochSettled")
        .withArgs(1, currentMarketCap, 2); // 2 for Winner.Top
    });

    it("Should not allow non-owners to settle an epoch", async function () {
      await time.increase(EPOCH_DURATION);
      await expect(
        bottomsInTopsIn
          .connect(addr1)
          .settleEpoch(ethers.utils.parseEther("1000000"))
      ).to.be.revertedWithCustomError(
        bottomsInTopsIn,
        "OwnableUnauthorizedAccount"
      );
    });

    it("Should correctly determine the winner based on market cap changes", async function () {
      await time.increase(EPOCH_DURATION);
      await bottomsInTopsIn.settleEpoch(ethers.utils.parseEther("1000000"));

      await time.increase(EPOCH_DURATION);
      await bottomsInTopsIn.settleEpoch(ethers.utils.parseEther("2000000"));
      expect(await bottomsInTopsIn.lastEpochWinner()).to.equal(2); // Top wins

      await time.increase(EPOCH_DURATION);
      await bottomsInTopsIn.settleEpoch(ethers.utils.parseEther("1500000"));
      expect(await bottomsInTopsIn.lastEpochWinner()).to.equal(1); // Bottom wins

      await time.increase(EPOCH_DURATION);
      await bottomsInTopsIn.settleEpoch(ethers.utils.parseEther("1500000"));
      expect(await bottomsInTopsIn.lastEpochWinner()).to.equal(0); // No winner
    });
  });

  describe("Reward Distribution", function () {
    beforeEach(async function () {
      await time.increase(EPOCH_DURATION);
      await bottomsInTopsIn.settleEpoch(ethers.utils.parseEther("1000000"));
      await owner.sendTransaction({
        to: bottomsInTopsIn.address,
        value: ethers.utils.parseEther("10.0"),
      });
    });

    it("Should allow the owner to distribute rewards", async function () {
      await expect(bottomsInTopsIn.distributeRewards(1))
        .to.emit(bottomsInTopsIn, "RewardsDistributed")
        .withArgs(1, ethers.utils.parseEther("10.0"), 2);
    });

    it("Should not allow non-owners to distribute rewards", async function () {
      await expect(
        bottomsInTopsIn.connect(addr1).distributeRewards(1)
      ).to.be.revertedWithCustomError(
        bottomsInTopsIn,
        "OwnableUnauthorizedAccount"
      );
    });

    it("Should not allow distributing rewards for invalid epoch", async function () {
      await expect(bottomsInTopsIn.distributeRewards(0)).to.be.revertedWith(
        "Invalid epoch ID"
      );
    });

    it("Should not allow distributing rewards when there's no winner", async function () {
      await time.increase(EPOCH_DURATION);
      await bottomsInTopsIn.settleEpoch(ethers.utils.parseEther("1000000")); // No change in market cap
      await expect(bottomsInTopsIn.distributeRewards(2)).to.be.revertedWith(
        "No winner for this epoch"
      );
    });
  });

  describe("Reward Claiming", function () {
    beforeEach(async function () {
      await time.increase(EPOCH_DURATION);
      await bottomsInTopsIn.settleEpoch(ethers.utils.parseEther("2000000"));
      await owner.sendTransaction({
        to: bottomsInTopsIn.address,
        value: ethers.utils.parseEther("10.0"),
      });
      await bottomsInTopsIn.distributeRewards(1);
    });

    it("Should allow users to claim rewards", async function () {
      const initialBalance = await addr1.getBalance();
      await bottomsInTopsIn.connect(addr1).claimRewards(1);
      const finalBalance = await addr1.getBalance();
      expect(finalBalance.sub(initialBalance)).to.be.gt(0);
    });

    it("Should not allow double claiming of rewards", async function () {
      await bottomsInTopsIn.connect(addr1).claimRewards(1);
      await expect(
        bottomsInTopsIn.connect(addr1).claimRewards(1)
      ).to.be.revertedWith("Rewards already claimed");
    });

    it("Should not allow claiming rewards for invalid epoch", async function () {
      await expect(
        bottomsInTopsIn.connect(addr1).claimRewards(0)
      ).to.be.revertedWith("Invalid epoch ID");
    });

    it("Should not allow claiming rewards when there's no winner", async function () {
      await time.increase(EPOCH_DURATION);
      await bottomsInTopsIn.settleEpoch(ethers.utils.parseEther("2000000")); // No change in market cap
      await bottomsInTopsIn.distributeRewards(2);
      await expect(
        bottomsInTopsIn.connect(addr1).claimRewards(2)
      ).to.be.revertedWith("No winner for this epoch");
    });
  });

  describe("Liquidity Management", function () {
    it("Should allow the owner to add liquidity", async function () {
      const amountA = ethers.utils.parseEther("100");
      const amountB = ethers.utils.parseEther("100");

      await bottomToken.transfer(bottomsInTopsIn.address, amountA);
      await topToken.transfer(bottomsInTopsIn.address, amountB);

      await thrusterRouter.setReturnValues(
        amountA,
        amountB,
        amountA.add(amountB)
      );

      await expect(bottomsInTopsIn.addLiquidityToThruster(amountA, amountB))
        .to.emit(bottomsInTopsIn, "LiquidityAdded")
        .withArgs(amountA, amountB, amountA.add(amountB));
    });

    it("Should not allow non-owners to add liquidity", async function () {
      const amountA = ethers.utils.parseEther("100");
      const amountB = ethers.utils.parseEther("100");

      await expect(
        bottomsInTopsIn.connect(addr1).addLiquidityToThruster(amountA, amountB)
      ).to.be.revertedWithCustomError(
        bottomsInTopsIn,
        "OwnableUnauthorizedAccount"
      );
    });
  });

  describe("Withdraw Unclaimed Rewards", function () {
    beforeEach(async function () {
      await time.increase(EPOCH_DURATION);
      await bottomsInTopsIn.settleEpoch(ethers.utils.parseEther("2000000"));
      await owner.sendTransaction({
        to: bottomsInTopsIn.address,
        value: ethers.utils.parseEther("10.0"),
      });
      await bottomsInTopsIn.distributeRewards(1);
    });

    it("Should allow the owner to withdraw unclaimed rewards", async function () {
      await time.increase(EPOCH_DURATION);
      const initialBalance = await owner.getBalance();
      const tx = await bottomsInTopsIn.withdrawUnclaimedRewards(1);
      const receipt = await tx.wait();
      const gasUsed = receipt.gasUsed.mul(tx.gasPrice);
      const finalBalance = await owner.getBalance();
      expect(finalBalance.add(gasUsed).sub(initialBalance)).to.equal(
        ethers.utils.parseEther("10.0")
      );
    });

    it("Should not allow non-owners to withdraw unclaimed rewards", async function () {
      await expect(
        bottomsInTopsIn.connect(addr1).withdrawUnclaimedRewards(1)
      ).to.be.revertedWithCustomError(
        bottomsInTopsIn,
        "OwnableUnauthorizedAccount"
      );
    });

    it("Should not allow withdrawing from invalid epoch", async function () {
      await expect(
        bottomsInTopsIn.withdrawUnclaimedRewards(0)
      ).to.be.revertedWith("Invalid or current epoch");
    });

    it("Should not allow withdrawing from current epoch", async function () {
      await expect(
        bottomsInTopsIn.withdrawUnclaimedRewards(2)
      ).to.be.revertedWith("Invalid or current epoch");
    });

    it("Should not allow withdrawing when epoch is not finished", async function () {
      await bottomsInTopsIn.settleEpoch(ethers.utils.parseEther("3000000"));
      await expect(
        bottomsInTopsIn.withdrawUnclaimedRewards(2)
      ).to.be.revertedWith("Epoch not finished");
    });
  });
});
