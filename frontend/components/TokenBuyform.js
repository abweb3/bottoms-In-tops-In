import { useState } from "react";
import { ethers } from "ethers";
import { getBottomsInTopsInContract } from "../utils/contracts";

export default function TokenBuyForm({ provider }) {
  const [amount, setAmount] = useState("");
  const [tokenType, setTokenType] = useState("bottom");

  async function handleBuy() {
    if (!provider) return;
    const contract = getBottomsInTopsInContract(provider);
    const value = ethers.parseEther(amount);

    try {
      const tx = await contract[
        tokenType === "bottom" ? "buyBottomToken" : "buyTopToken"
      ](value, { value });
      await tx.wait();
      alert("Purchase successful!");
    } catch (error) {
      console.error("Purchase failed:", error);
      alert("Purchase failed. See console for details.");
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        handleBuy();
      }}
    >
      <input
        type="number"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="Amount"
      />
      <select value={tokenType} onChange={(e) => setTokenType(e.target.value)}>
        <option value="bottom">Bottom Token</option>
        <option value="top">Top Token</option>
      </select>
      <button type="submit">Buy</button>
    </form>
  );
}
