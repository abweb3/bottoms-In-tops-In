const { ethers } = require("hardhat");

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
    "THRUSTER_ROUTER_ADDRESS", // Replace with actual address
    "BOTTOM_TOKEN_PRICE_FEED_ADDRESS", // Replace with actual address
    "TOP_TOKEN_PRICE_FEED_ADDRESS" // Replace with actual address
  );
  await bottomsInTopsIn.deployed();
  console.log("BottomsInTopsIn deployed to:", bottomsInTopsIn.address);

  console.log("Deployment completed successfully");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Deployment failed:", error);
    process.exit(1);
  });
