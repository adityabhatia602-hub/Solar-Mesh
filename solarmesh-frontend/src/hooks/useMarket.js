import { useMarketContext } from '../context/MarketContext';

export const useMarket = () => {
  return useMarketContext();
};

export default useMarket;
