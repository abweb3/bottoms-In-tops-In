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
  });

  describe("Epoch Management", function () {
    it("Should allow the owner to settle an epoch", async function () {
      await time.increase(EPOCH_DURATION);
      const currentMarketCap = ethers.utils.parseEther("1000000");
      await expect(bottomsInTopsIn.settleEpoch(currentMarketCap))
        .to.emit(bottomsInTopsIn, "EpochSettled")
        .withArgs(1, currentMarketCap, 2); // 2 for Winner.Top
    });

    it("Should not allow non-owners to settle an epoch", async function () {
      await time.increase(EPOCH_DURATION);
      const currentMarketCap = ethers.utils.parseEther("1000000");
      await expect(
        bottomsInTopsIn.connect(addr1).settleEpoch(currentMarketCap)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("Reward Distribution", function () {
    it("Should allow the owner to distribute rewards", async function () {
      await time.increase(EPOCH_DURATION);
      const currentMarketCap = ethers.utils.parseEther("1000000");
      await bottomsInTopsIn.settleEpoch(currentMarketCap);

      await owner.sendTransaction({
        to: bottomsInTopsIn.address,
        value: ethers.utils.parseEther("1.0"),
      });

      await expect(bottomsInTopsIn.distributeRewards(1))
        .to.emit(bottomsInTopsIn, "RewardsDistributed")
        .withArgs(1, ethers.utils.parseEther("1.0"), 2);
    });

    it("Should not allow non-owners to distribute rewards", async function () {
      await expect(
        bottomsInTopsIn.connect(addr1).distributeRewards(1)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("Reward Claiming", function () {
    it("Should allow users to claim rewards", async function () {
      await time.increase(EPOCH_DURATION);
      const currentMarketCap = ethers.utils.parseEther("1000000");
      await bottomsInTopsIn.settleEpoch(currentMarketCap);

      await owner.sendTransaction({
        to: bottomsInTopsIn.address,
        value: ethers.utils.parseEther("1.0"),
      });

      await bottomsInTopsIn.distributeRewards(1);

      await bottomToken.transfer(
        addr1.address,
        ethers.utils.parseEther("1000")
      );
      await bottomToken
        .connect(addr1)
        .approve(bottomsInTopsIn.address, ethers.utils.parseEther("1000"));

      await expect(bottomsInTopsIn.connect(addr1).claimRewards(1))
        .to.emit(bottomsInTopsIn, "RewardsClaimed")
        .withArgs(1, addr1.address, ethers.utils.parseEther("1.0"));
    });

    it("Should not allow double claiming of rewards", async function () {
      await time.increase(EPOCH_DURATION);
      const currentMarketCap = ethers.utils.parseEther("1000000");
      await bottomsInTopsIn.settleEpoch(currentMarketCap);

      await owner.sendTransaction({
        to: bottomsInTopsIn.address,
        value: ethers.utils.parseEther("1.0"),
      });

      await bottomsInTopsIn.distributeRewards(1);

      await bottomToken.transfer(
        addr1.address,
        ethers.utils.parseEther("1000")
      );
      await bottomToken
        .connect(addr1)
        .approve(bottomsInTopsIn.address, ethers.utils.parseEther("1000"));

      await bottomsInTopsIn.connect(addr1).claimRewards(1);
      await expect(
        bottomsInTopsIn.connect(addr1).claimRewards(1)
      ).to.be.revertedWith("Rewards already claimed");
    });
  });

  describe("Liquidity Management", function () {
    it("Should allow the owner to add liquidity", async function () {
      const amountA = ethers.utils.parseEther("100");
      const amountB = ethers.utils.parseEther("100");

      await bottomToken.transfer(bottomsInTopsIn.address, amountA);
      await topToken.transfer(bottomsInTopsIn.address, amountB);

      await expect(
        bottomsInTopsIn.addLiquidityToThruster(amountA, amountB)
      ).to.emit(bottomsInTopsIn, "LiquidityAdded");
    });

    it("Should not allow non-owners to add liquidity", async function () {
      const amountA = ethers.utils.parseEther("100");
      const amountB = ethers.utils.parseEther("100");

      await bottomToken.transfer(bottomsInTopsIn.address, amountA);
      await topToken.transfer(bottomsInTopsIn.address, amountB);

      await expect(
        bottomsInTopsIn.connect(addr1).addLiquidityToThruster(amountA, amountB)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("Withdraw Unclaimed Rewards", function () {
    it("Should allow the owner to withdraw unclaimed rewards", async function () {
      await time.increase(EPOCH_DURATION);
      const currentMarketCap = ethers.utils.parseEther("1000000");
      await bottomsInTopsIn.settleEpoch(currentMarketCap);

      await owner.sendTransaction({
        to: bottomsInTopsIn.address,
        value: ethers.utils.parseEther("1.0"),
      });

      await bottomsInTopsIn.distributeRewards(1);

      await bottomToken.transfer(
        addr1.address,
        ethers.utils.parseEther("1000")
      );
      await bottomToken
        .connect(addr1)
        .approve(bottomsInTopsIn.address, ethers.utils.parseEther("1000"));
      await bottomsInTopsIn.connect(addr1).claimRewards(1);

      const unclaimedRewards = await bottomsInTopsIn._epochRewards(1);

      await expect(
        bottomsInTopsIn.withdrawUnclaimedRewards(1)
      ).to.changeEtherBalance(owner, unclaimedRewards);
    });

    it("Should not allow non-owners to withdraw unclaimed rewards", async function () {
      await time.increase(EPOCH_DURATION);
      const currentMarketCap = ethers.utils.parseEther("1000000");
      await bottomsInTopsIn.settleEpoch(currentMarketCap);

      await owner.sendTransaction({
        to: bottomsInTopsIn.address,
        value: ethers.utils.parseEther("1.0"),
      });

      await bottomsInTopsIn.distributeRewards(1);

      await expect(
        bottomsInTopsIn.connect(addr1).withdrawUnclaimedRewards(1)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });
});
