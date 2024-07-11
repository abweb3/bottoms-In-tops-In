import { ethers } from "ethers";

const rpcEndpoints = [
  "https://rpc.blast.io",
  "https://rpc.ankr.com/blast",
  "https://blastl2-mainnet.public.blastapi.io",
  "https://blast.din.dev/rpc",
  "https://blast.blockpi.network/v1/rpc/public",
];

export async function getWorkingProvider() {
  for (const endpoint of rpcEndpoints) {
    try {
      const provider = new ethers.JsonRpcProvider(endpoint);
      await provider.getBlockNumber(); // Test the connection
      console.log(`Connected to ${endpoint}`);
      return provider;
    } catch (error) {
      console.warn(`Failed to connect to ${endpoint}: ${error.message}`);
    }
  }
  throw new Error("Unable to connect to any Blast RPC endpoint");
}

class RPCMonitor {
  constructor() {
    this.stats = {};
  }

  async checkEndpoint(url) {
    const start = Date.now();
    try {
      const provider = new ethers.JsonRpcProvider(url);
      await provider.getBlockNumber();
      const latency = Date.now() - start;
      this.logSuccess(url, latency);
    } catch (error) {
      this.logFailure(url, error);
    }
  }

  logSuccess(url, latency) {
    if (!this.stats[url])
      this.stats[url] = { successes: 0, failures: 0, avgLatency: 0 };
    this.stats[url].successes++;
    this.stats[url].avgLatency =
      (this.stats[url].avgLatency * (this.stats[url].successes - 1) + latency) /
      this.stats[url].successes;
  }

  logFailure(url, error) {
    if (!this.stats[url])
      this.stats[url] = { successes: 0, failures: 0, avgLatency: 0 };
    this.stats[url].failures++;
    console.error(`RPC Failure for ${url}:`, error.message);
  }

  getStats() {
    return this.stats;
  }
}

export default RPCMonitor;
