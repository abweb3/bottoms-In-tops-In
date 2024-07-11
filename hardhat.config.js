require("@nomiclabs/hardhat-waffle");
require("@nomiclabs/hardhat-etherscan");
require('dotenv').config();

module.exports = {
  solidity: "0.8.20",
  networks: {
    blast: {
      url: process.env.BLAST_RPC_URL || "https://rpc.blast.io",
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