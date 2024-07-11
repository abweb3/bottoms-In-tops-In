const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying contracts with the account:", deployer.address);

  const BottomToken = await ethers.getContractFactory("BottomToken");
  const bottomToken = await BottomToken.deploy(deployer.address);
  await bottomToken.deployed();

  const TopToken = await ethers.getContractFactory("TopToken");
  const topToken = await TopToken.deploy(deployer.address);
  await topToken.deployed();

  const BottomsInTopsIn = await ethers.getContractFactory("BottomsInTopsIn");
  const bottomsInTopsIn = await BottomsInTopsIn.deploy(
    bottomToken.address,
    topToken.address,
    deployer.address
  );
  await bottomsInTopsIn.deployed();

  console.log("BottomToken deployed to:", bottomToken.address);
  console.log("TopToken deployed to:", topToken.address);
  console.log("BottomsInTopsIn deployed to:", bottomsInTopsIn.address);

  // Verify contracts on Blastscan
  console.log("Verifying contracts on Blastscan...");
  await hre.run("verify:verify", {
    address: bottomToken.address,
    constructorArguments: [deployer.address],
  });
  await hre.run("verify:verify", {
    address: topToken.address,
    constructorArguments: [deployer.address],
  });
  await hre.run("verify:verify", {
    address: bottomsInTopsIn.address,
    constructorArguments: [
      bottomToken.address,
      topToken.address,
      deployer.address,
    ],
  });
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
