import { useEffect, useState } from "react";
import { getBottomsInTopsInContract } from "../utils/contracts";

export default function PriceChart({ provider }) {
  const [price, setPrice] = useState(null);

  useEffect(() => {
    if (!provider) return;

    const contract = getBottomsInTopsInContract(provider);
    const filter = contract.filters.PriceUpdated();

    const updatePrice = async () => {
      const lastPrice = await contract.lastPrice();
      setPrice(ethers.formatEther(lastPrice));
    };

    updatePrice();
    contract.on(filter, updatePrice);

    return () => {
      contract.off(filter, updatePrice);
    };
  }, [provider]);

  return (
    <div>
      <h2>Current Price</h2>
      {price ? <p>{price} ETH</p> : <p>Loading...</p>}
    </div>
  );
}
