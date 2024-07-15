const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("BottomsInTopsIn", function () {
  let BottomsInTopsIn,
    bottomsInTopsIn,
    BottomToken,
    bottomToken,
    TopToken,
    topToken;
  let MockThrusterRouter,
    thrusterRouter,
    MockV3Aggregator,
    bottomPriceFeed,
    topPriceFeed;
  let owner, addr1, addr2;
  const EPOCH_DURATION = 7 * 24 * 60 * 60; // 7 days in seconds

  beforeEach(async function () {
    [owner, addr1, addr2] = await ethers.getSigners();

    BottomToken = await ethers.getContractFactory("BottomToken");
    bottomToken = await BottomToken.deploy(owner.address);

    TopToken = await ethers.getContractFactory("TopToken");
    topToken = await TopToken.deploy(owner.address);

    MockThrusterRouter = await ethers.getContractFactory("MockThrusterRouter");
    thrusterRouter = await MockThrusterRouter.deploy();

    MockV3Aggregator = await ethers.getContractFactory("MockV3Aggregator");
    bottomPriceFeed = await MockV3Aggregator.deploy(8, 100000000); // 8 decimals, $1.00 initial price
    topPriceFeed = await MockV3Aggregator.deploy(8, 200000000); // 8 decimals, $2.00 initial price

    BottomsInTopsIn = await ethers.getContractFactory("BottomsInTopsIn");
    bottomsInTopsIn = await BottomsInTopsIn.deploy(
      await bottomToken.getAddress(),
      await topToken.getAddress(),
      await thrusterRouter.getAddress(),
      await bottomPriceFeed.getAddress(),
      await topPriceFeed.getAddress()
    );

    await bottomToken.transfer(addr1.address, ethers.parseEther("1000"));
    await topToken.transfer(addr1.address, ethers.parseEther("1000"));
    await bottomToken.transfer(addr2.address, ethers.parseEther("1000"));
    await topToken.transfer(addr2.address, ethers.parseEther("1000"));
  });

  describe("Deployment", function () {
    it("Should set the correct token addresses and initial values", async function () {
      expect(await bottomsInTopsIn.bottomToken()).to.equal(
        await bottomToken.getAddress()
      );
      expect(await bottomsInTopsIn.topToken()).to.equal(
        await topToken.getAddress()
      );
      expect(await bottomsInTopsIn.owner()).to.equal(owner.address);
      expect(await bottomsInTopsIn.getCurrentEpoch()).to.equal(1);
    });
  });

  describe("Epoch Management", function () {
    it("Should allow the owner to settle an epoch after EPOCH_DURATION", async function () {
      await time.increase(EPOCH_DURATION);
      const currentMarketCap = await bottomsInTopsIn.getCurrentMarketCap();
      await expect(bottomsInTopsIn.settleEpoch())
        .to.emit(bottomsInTopsIn, "EpochSettled")
        .withArgs(1, currentMarketCap, 2); // 2 for Winner.Top
    });

    it("Should not allow non-owners to settle an epoch", async function () {
      await time.increase(EPOCH_DURATION);
      await expect(
        bottomsInTopsIn.connect(addr1).settleEpoch()
      ).to.be.revertedWithCustomError(
        bottomsInTopsIn,
        "OwnableUnauthorizedAccount"
      );
    });

    it("Should correctly determine the winner based on market cap changes", async function () {
      await time.increase(EPOCH_DURATION);
      await bottomsInTopsIn.settleEpoch();

      // Increase bottom token price to make it win
      await bottomPriceFeed.updateAnswer(250000000); // $2.50

      await time.increase(EPOCH_DURATION);
      await bottomsInTopsIn.settleEpoch();

      expect(await bottomsInTopsIn.getWinnerForEpoch(2)).to.equal(1); // Winner.Bottom

      // Increase top token price to make it win
      await topPriceFeed.updateAnswer(300000000); // $3.00

      await time.increase(EPOCH_DURATION);
      await bottomsInTopsIn.settleEpoch();

      expect(await bottomsInTopsIn.getWinnerForEpoch(3)).to.equal(2); // Winner.Top
    });
  });

  describe("Reward Distribution and Claiming", function () {
    beforeEach(async function () {
      await time.increase(EPOCH_DURATION);
      await bottomsInTopsIn.settleEpoch();
      await owner.sendTransaction({
        to: await bottomsInTopsIn.getAddress(),
        value: ethers.parseEther("10.0"),
      });
      await bottomsInTopsIn.distributeRewards(1);
    });

    it("Should allow users to claim rewards", async function () {
      const initialBalance = await ethers.provider.getBalance(addr1.address);
      await bottomsInTopsIn.connect(addr1).claimRewards(1);
      const finalBalance = await ethers.provider.getBalance(addr1.address);
      expect(finalBalance).to.be.gt(initialBalance);
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
  });

  describe("Liquidity Management", function () {
    it("Should allow the owner to add liquidity", async function () {
      const amountA = ethers.parseEther("100");
      const amountB = ethers.parseEther("100");
      await bottomToken.transfer(await bottomsInTopsIn.getAddress(), amountA);
      await topToken.transfer(await bottomsInTopsIn.getAddress(), amountB);
      await expect(
        bottomsInTopsIn.addLiquidityToThruster(amountA, amountB)
      ).to.emit(bottomsInTopsIn, "LiquidityAdded");
    });

    it("Should not allow non-owners to add liquidity", async function () {
      const amountA = ethers.parseEther("100");
      const amountB = ethers.parseEther("100");
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
      await bottomsInTopsIn.settleEpoch();
      await owner.sendTransaction({
        to: await bottomsInTopsIn.getAddress(),
        value: ethers.parseEther("10.0"),
      });
      await bottomsInTopsIn.distributeRewards(1);
    });

    it("Should allow the owner to withdraw unclaimed rewards", async function () {
      await time.increase(EPOCH_DURATION);
      const initialBalance = await ethers.provider.getBalance(owner.address);
      await bottomsInTopsIn.withdrawUnclaimedRewards(1);
      const finalBalance = await ethers.provider.getBalance(owner.address);
      expect(finalBalance).to.be.gt(initialBalance);
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
  });

  describe("View Functions", function () {
    it("Should return the correct token supply at epoch", async function () {
      const bottomSupply = await bottomsInTopsIn.getTokenSupplyAtEpoch(1, true);
      const topSupply = await bottomsInTopsIn.getTokenSupplyAtEpoch(1, false);
      expect(bottomSupply).to.equal(await bottomToken.totalSupply());
      expect(topSupply).to.equal(await topToken.totalSupply());
    });

    it("Should return the correct current epoch", async function () {
      expect(await bottomsInTopsIn.getCurrentEpoch()).to.equal(1);
      await time.increase(EPOCH_DURATION);
      await bottomsInTopsIn.settleEpoch();
      expect(await bottomsInTopsIn.getCurrentEpoch()).to.equal(2);
    });

    it("Should return the correct token prices", async function () {
      expect(await bottomsInTopsIn.getBottomTokenPrice()).to.equal(100000000);
      expect(await bottomsInTopsIn.getTopTokenPrice()).to.equal(200000000);
    });

    it("Should calculate the correct market cap", async function () {
      const bottomSupply = await bottomToken.totalSupply();
      const topSupply = await topToken.totalSupply();
      const expectedMarketCap =
        BigInt(bottomSupply) * BigInt(100000000) +
        BigInt(topSupply) * BigInt(200000000);
      expect(await bottomsInTopsIn.getCurrentMarketCap()).to.equal(
        expectedMarketCap
      );
    });
  });
});
