# BottomsInTopsIn

BottomsInTopsIn is a smart contract-based game where two tokens compete in epochs. The winner is determined by the change in total market cap, using Chainlink price feeds for token prices.

## Features

- Epoch-based competition between two tokens
- Winner determination based on market cap changes
- Reward distribution to token holders
- Liquidity provision to a DEX (Thruster)
- Checkpoints for tracking token supplies and market cap

## Smart Contracts

- `BottomsInTopsIn.sol`: Main contract implementing the game logic
- `BottomToken.sol`: ERC20 token contract for the Bottom token
- `TopToken.sol`: ERC20 token contract for the Top token

## Dependencies

- OpenZeppelin Contracts
- Chainlink Contracts

## Setup

1. Clone the repository
2. Install dependencies: `npm install`
3. Compile contracts: `npx hardhat compile`
4. Run tests: `npx hardhat test`

## Deployment

To deploy the contracts:

1. Set up your `.env` file with the required environment variables (see `.env.example`)
2. Run the deployment script: `npx hardhat run scripts/deploy.js --network <your-network>`

## Testing

The project includes a comprehensive test suite.

## Clean

Make sure to Run `npx hardhat clean` each time to make edits to the smart contract.
(Generally considered good practice to recompile when changes are made.)
