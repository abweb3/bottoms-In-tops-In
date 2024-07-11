import { ethers } from "ethers";

export async function connectWallet() {
  if (typeof window.ethereum !== "undefined") {
    try {
      await window.ethereum.request({ method: "eth_requestAccounts" });
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      return { provider, signer };
    } catch (error) {
      console.error("Failed to connect wallet:", error);
      throw error;
    }
  } else {
    throw new Error("No Ethereum wallet found");
  }
}
