const hre = require("hardhat");

async function main() {
  const BottomsInTopsIn = await hre.ethers.getContractFactory("BottomsInTopsIn");
  const bottomsInTopsIn = await BottomsInTopsIn.attach("DEPLOYED_CONTRACT_ADDRESS");

  const bottomAmount = ethers.utils.parseEther("1000");
  const topAmount = ethers.utils.parseEther("1000");

  await bottomsInTopsIn.addLiquidityToThruster(bottomAmount, topAmount);

  console.log("Liquidity added successfully");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
