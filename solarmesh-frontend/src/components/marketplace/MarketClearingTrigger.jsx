import React, { useState } from 'react';
import { Play, CheckCircle, Sparkles, RefreshCw, Zap } from 'lucide-react';
import Button from '../common/Button';
import { marketApi } from '../../api/market';
import { formatCurrency, formatKwh } from '../../utils/formatters';

export const MarketClearingTrigger = ({ onMatched }) => {
  const [loading, setLoading] = useState(false);
  const [lastResult, setLastResult] = useState(null);

  const handleRunMatching = async () => {
    try {
      setLoading(true);
      const result = await marketApi.triggerMatching();
      setLastResult(result);
      if (onMatched) onMatched(result);
    } catch (err) {
      console.error('Matching engine run failed:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-emerald-900 to-slate-900 text-white shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
      <div className="space-y-1">
        <div className="flex items-center space-x-2">
          <Sparkles className="w-4 h-4 text-emerald-400" />
          <h4 className="text-sm font-bold text-white tracking-tight">
            Autonomous Double-Auction Matching Engine
          </h4>
          <span className="text-[10px] uppercase font-extrabold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            Network-Constrained
          </span>
        </div>
        <p className="text-xs text-slate-300 max-w-xl">
          Solves multi-node bilateral clearing with transmission loss penalties and physical grid line capacity limits.
          Matches high bids with lowest asks subject to feasible physical power routes.
        </p>
      </div>

      <div className="flex items-center space-x-3 w-full md:w-auto shrink-0 justify-between md:justify-end">
        {lastResult && (
          <div className="text-left md:text-right text-xs">
            <span className="text-emerald-400 font-bold block">
              {lastResult.matched_trades} trades executed
            </span>
            <span className="text-[11px] text-slate-400">
              {formatKwh(lastResult.total_volume_kwh)} • {formatCurrency(lastResult.total_value)}
            </span>
          </div>
        )}

        <Button
          variant="primary"
          size="sm"
          isLoading={loading}
          onClick={handleRunMatching}
          icon={Play}
          className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold shadow-md shadow-emerald-500/20 text-xs shrink-0"
        >
          Run Matching Engine
        </Button>
      </div>
    </div>
  );
};

export default MarketClearingTrigger;
