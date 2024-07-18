require("@nomicfoundation/hardhat-ethers");
require("@nomicfoundation/hardhat-chai-matchers");
require("hardhat-deploy");
require("hardhat-deploy-ethers");
require('dotenv').config();

module.exports = {
  solidity: "0.8.20",
  networks: {
    blast: {
      url: process.env.BLAST_RPC_URL || "https://blastl2-sepolia.public.blastapi.io",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    }
  },
  etherscan: {
    apiKey: {
      blast: process.env.BLASTSCAN_API_KEY
    },
    customChains: [
      {
        network: "blast",
        chainId: 81457,
        urls: {
          apiURL: "https://api.blastscan.io/api",
          browserURL: "https://blastscan.io"
        }
      }
    ]
  }
};