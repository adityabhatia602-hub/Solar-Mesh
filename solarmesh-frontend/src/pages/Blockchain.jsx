import React, { useState, useEffect } from 'react';
import { Blocks, RefreshCw, ShieldCheck, CheckCircle2 } from 'lucide-react';
import PageHeader from '../components/layout/PageHeader';
import Button from '../components/common/Button';
import BlockchainLedger from '../components/blockchain/BlockchainLedger';
import { marketApi } from '../api/market';
import { useMarket } from '../hooks/useMarket';

export const Blockchain = () => {
  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(false);
  const { refreshCounter } = useMarket();

  const fetchBlockchainTrades = async () => {
    try {
      setLoading(true);
      const data = await marketApi.getMyTrades(50);
      setTrades(data);
    } catch (err) {
      console.warn('Failed to load blockchain trades:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBlockchainTrades();
  }, [refreshCounter]);

  return (
    <div className="space-y-6 sm:space-y-8">
      <PageHeader
        title="Blockchain Settlement & Smart Escrow Explorer"
        subtitle="Verifiable ledger proofs, cryptographic trade hashes, and sub-second PoA consensus finality"
        actions={
          <Button
            variant="secondary"
            size="sm"
            icon={RefreshCw}
            onClick={fetchBlockchainTrades}
            isLoading={loading}
          >
            Query Latest Blocks
          </Button>
        }
      />

      <BlockchainLedger trades={trades} />
    </div>
  );
};

export default Blockchain;
