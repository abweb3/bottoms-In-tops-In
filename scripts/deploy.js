const { ethers, run } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying contracts with the account:", deployer.address);

  // Deploy BottomToken
  const BottomToken = await ethers.getContractFactory("BottomToken");
  const bottomToken = await BottomToken.deploy(deployer.address);
  await bottomToken.deployed();
  console.log("BottomToken deployed to:", bottomToken.address);

  // Deploy TopToken
  const TopToken = await ethers.getContractFactory("TopToken");
  const topToken = await TopToken.deploy(deployer.address);
  await topToken.deployed();
  console.log("TopToken deployed to:", topToken.address);

  // Deploy BottomsInTopsIn
  const BottomsInTopsIn = await ethers.getContractFactory("BottomsInTopsIn");
  const bottomsInTopsIn = await BottomsInTopsIn.deploy(
    bottomToken.address,
    topToken.address,
    deployer.address // Ensure these are the correct arguments
  );
  await bottomsInTopsIn.deployed();
  console.log("BottomsInTopsIn deployed to:", bottomsInTopsIn.address);

  // Verify contracts on BlastScan
  console.log("Verifying contracts...");
  try {
    await run("verify:verify", {
      address: bottomToken.address,
      constructorArguments: [deployer.address],
    });
    await run("verify:verify", {
      address: topToken.address,
      constructorArguments: [deployer.address],
    });
    await run("verify:verify", {
      address: bottomsInTopsIn.address,
      constructorArguments: [
        bottomToken.address,
        topToken.address,
        deployer.address,
      ],
    });
    console.log("Contracts verified!");
  } catch (error) {
    console.error("Verification failed:", error);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Deployment failed:", error);
    process.exit(1);
  });
