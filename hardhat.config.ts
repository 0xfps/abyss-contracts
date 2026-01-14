import type { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@nomicfoundation/hardhat-foundry";
import dotenv from "dotenv"

dotenv.config()

const PRIVATE_KEY = process.env.PRIVATE_KEY!
const ACCOUNTS_CONFIG = {
  accounts: [PRIVATE_KEY],
  allowUnlimitedContractSize: true
}

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: {
        enabled: true,
        runs: 1
      }
    }
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY!,
    customChains: [{
      network: "optimismSepolia",
      chainId: 11155420,
      urls: {
        apiURL: "https://api-sepolia-optimistic.etherscan.io/api",
        browserURL: "https://testnet-explorer.optimism.io"
      }
    }]
  },
  networks: {
    hardhat: {
      forking: {
        enabled: true,
        url: "https://arbitrum-sepolia.gateway.tenderly.co"
      }
    },
    arbitrumSepolia: {
      chainId: 421614,
      url: "https://arbitrum-sepolia.gateway.tenderly.co",
      ...ACCOUNTS_CONFIG
    },
    avalancheFuji: {
      chainId: 43113,
      url: "https://avalanche-fuji-c-chain-rpc.publicnode.com",
      ...ACCOUNTS_CONFIG
    },
    baseSepolia: {
      chainId: 84532,
      url: "https://base-sepolia.gateway.tenderly.co",
      ...ACCOUNTS_CONFIG
    },
    bscTestnet: {
      chainId: 97,
      url: "https://bsc-testnet-rpc.publicnode.com",
      ...ACCOUNTS_CONFIG
    },
    optimismSepolia: {
      chainId: 11155420,
      url: "https://optimism-sepolia.gateway.tenderly.co",
      ...ACCOUNTS_CONFIG
    },
    polygonAmoy: {
      chainId: 80002,
      url: "https://polygon-amoy.gateway.tenderly.co",
      ...ACCOUNTS_CONFIG
    },
    sepolia: {
      chainId: 11155111,
      url: "https://eth-sepolia.g.alchemy.com/v2/DhVf4WBbA1sl0bKUmrVAp",
      ...ACCOUNTS_CONFIG
    }
  },
  mocha: {
    timeout: 0
  },
  gasReporter: {
    enabled: false
  }
};

export default config;