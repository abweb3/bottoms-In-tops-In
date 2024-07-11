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
      await bottomToken.getAddress(),
      await topToken.getAddress(),
      await thrusterRouter.getAddress()
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
      expect(await bottomsInTopsIn.getCurrentEpoch()).to.equal(0);
    });
  });

  describe("Epoch Management", function () {
    it("Should allow the owner to settle an epoch after EPOCH_DURATION", async function () {
      await time.increase(EPOCH_DURATION);
      const currentMarketCap = ethers.parseEther("1000000");
      await expect(bottomsInTopsIn.settleEpoch(currentMarketCap))
        .to.emit(bottomsInTopsIn, "EpochSettled")
        .withArgs(1, currentMarketCap, 2); // 2 for Winner.Top
    });

    it("Should not allow non-owners to settle an epoch", async function () {
      await time.increase(EPOCH_DURATION);
      await expect(
        bottomsInTopsIn.connect(addr1).settleEpoch(ethers.parseEther("1000000"))
      ).to.be.revertedWithCustomError(
        bottomsInTopsIn,
        "OwnableUnauthorizedAccount"
      );
    });

    it("Should correctly determine the winner based on market cap changes", async function () {
      await time.increase(EPOCH_DURATION);
      await bottomsInTopsIn.settleEpoch(ethers.parseEther("1000000"));

      await time.increase(EPOCH_DURATION);
      await bottomsInTopsIn.settleEpoch(ethers.parseEther("2000000"));
      expect(await bottomsInTopsIn.getWinnerForEpoch(2)).to.equal(2); // Top wins

      await time.increase(EPOCH_DURATION);
      await bottomsInTopsIn.settleEpoch(ethers.parseEther("1500000"));
      expect(await bottomsInTopsIn.getWinnerForEpoch(3)).to.equal(1); // Bottom wins
    });
  });

  describe("Reward Distribution and Claiming", function () {
    beforeEach(async function () {
      await time.increase(EPOCH_DURATION);
      await bottomsInTopsIn.settleEpoch(ethers.parseEther("2000000"));
      await time.increase(EPOCH_DURATION);
      await bottomsInTopsIn.settleEpoch(ethers.parseEther("3000000"));
      await owner.sendTransaction({
        to: await bottomsInTopsIn.getAddress(),
        value: ethers.parseEther("10.0"),
      });
      await bottomsInTopsIn.distributeRewards(2);
    });

    it("Should allow users to claim rewards", async function () {
      const initialBalance = await ethers.provider.getBalance(addr1.address);
      await bottomsInTopsIn.connect(addr1).claimRewards(2);
      const finalBalance = await ethers.provider.getBalance(addr1.address);
      expect(finalBalance).to.be.gt(initialBalance);
    });

    it("Should not allow double claiming of rewards", async function () {
      await bottomsInTopsIn.connect(addr1).claimRewards(2);
      await expect(
        bottomsInTopsIn.connect(addr1).claimRewards(2)
      ).to.be.revertedWith("Rewards already claimed");
    });

    it("Should not allow claiming rewards for invalid epoch", async function () {
      await expect(
        bottomsInTopsIn.connect(addr1).claimRewards(0)
      ).to.be.revertedWith("Invalid epoch ID");
    });

    it("Should not allow claiming rewards when there's no winner", async function () {
      await time.increase(EPOCH_DURATION);
      await bottomsInTopsIn.settleEpoch(ethers.parseEther("3000000")); // No change in market cap
      await bottomsInTopsIn.distributeRewards(3);
      await expect(
        bottomsInTopsIn.connect(addr1).claimRewards(3)
      ).to.be.revertedWith("No winner for this epoch");
    });

    it("Should not allow claiming rewards for future epochs", async function () {
      await expect(
        bottomsInTopsIn.connect(addr1).claimRewards(4)
      ).to.be.revertedWith("Invalid epoch ID");
    });

    it("Should distribute and claim correct reward amounts", async function () {
      const initialBalance = await ethers.provider.getBalance(addr1.address);
      await bottomsInTopsIn.connect(addr1).claimRewards(2);
      const finalBalance = await ethers.provider.getBalance(addr1.address);

      // Assuming addr1 has 1000 tokens out of 69420000 total supply
      const expectedReward = ethers.parseEther("10.0").mul(1000).div(69420000);
      expect(finalBalance.sub(initialBalance)).to.be.closeTo(
        expectedReward,
        ethers.parseEther("0.0001")
      );
    });
  });

  describe("Liquidity Management", function () {
    it("Should allow the owner to add liquidity", async function () {
      const amountA = ethers.parseEther("100");
      const amountB = ethers.parseEther("100");

      await bottomToken.transfer(await bottomsInTopsIn.getAddress(), amountA);
      await topToken.transfer(await bottomsInTopsIn.getAddress(), amountB);

      await thrusterRouter.setReturnValues(amountA, amountB, amountA + amountB);

      await expect(bottomsInTopsIn.addLiquidityToThruster(amountA, amountB))
        .to.emit(bottomsInTopsIn, "LiquidityAdded")
        .withArgs(amountA, amountB, amountA + amountB);
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
      await bottomsInTopsIn.settleEpoch(ethers.parseEther("2000000"));
      await time.increase(EPOCH_DURATION);
      await bottomsInTopsIn.settleEpoch(ethers.parseEther("3000000"));
      await owner.sendTransaction({
        to: await bottomsInTopsIn.getAddress(),
        value: ethers.parseEther("10.0"),
      });
      await bottomsInTopsIn.distributeRewards(2);
    });

    it("Should allow the owner to withdraw unclaimed rewards", async function () {
      await time.increase(EPOCH_DURATION);
      const initialBalance = await ethers.provider.getBalance(owner.address);
      const tx = await bottomsInTopsIn.withdrawUnclaimedRewards(2);
      const receipt = await tx.wait();
      const gasUsed = receipt.gasUsed * tx.gasPrice;
      const finalBalance = await ethers.provider.getBalance(owner.address);
      expect(finalBalance + gasUsed - initialBalance).to.equal(
        ethers.parseEther("10.0")
      );
    });

    it("Should not allow non-owners to withdraw unclaimed rewards", async function () {
      await expect(
        bottomsInTopsIn.connect(addr1).withdrawUnclaimedRewards(2)
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
        bottomsInTopsIn.withdrawUnclaimedRewards(3)
      ).to.be.revertedWith("Invalid or current epoch");
    });

    it("Should not allow withdrawing when epoch is not finished", async function () {
      await bottomsInTopsIn.settleEpoch(ethers.parseEther("4000000"));
      await expect(
        bottomsInTopsIn.withdrawUnclaimedRewards(3)
      ).to.be.revertedWith("Epoch not finished");
    });
  });

  describe("View Functions", function () {
    it("Should return the correct token supply at epoch", async function () {
      await time.increase(EPOCH_DURATION);
      await bottomsInTopsIn.settleEpoch(ethers.parseEther("1000000"));

      const bottomSupply = await bottomsInTopsIn.getTokenSupplyAtEpoch(1, true);
      const topSupply = await bottomsInTopsIn.getTokenSupplyAtEpoch(1, false);

      expect(bottomSupply).to.equal(await bottomToken.totalSupply());
      expect(topSupply).to.equal(await topToken.totalSupply());
    });

    it("Should return the correct current epoch", async function () {
      expect(await bottomsInTopsIn.getCurrentEpoch()).to.equal(0);

      await time.increase(EPOCH_DURATION);
      await bottomsInTopsIn.settleEpoch(ethers.parseEther("1000000"));
      expect(await bottomsInTopsIn.getCurrentEpoch()).to.equal(1);

      await time.increase(EPOCH_DURATION);
      await bottomsInTopsIn.settleEpoch(ethers.parseEther("2000000"));
      expect(await bottomsInTopsIn.getCurrentEpoch()).to.equal(2);
    });
  });
});
