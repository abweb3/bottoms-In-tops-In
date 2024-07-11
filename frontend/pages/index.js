import { useState, useEffect } from "react";
import TokenBuyForm from "../components/TokenBuyform";
import PriceChart from "../components/PriceChart";
import { getWorkingProvider } from "../utils/rpcHelper";

export default function Home() {
  const [provider, setProvider] = useState(null);

  useEffect(() => {
    async function initProvider() {
      const workingProvider = await getWorkingProvider();
      setProvider(workingProvider);
    }
    initProvider();
  }, []);

  return (
    <div>
      <h1>Bottoms In Tops In</h1>
      <TokenBuyForm provider={provider} />
      <PriceChart provider={provider} />
    </div>
  );
}
