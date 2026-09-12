import React, { useState } from 'react';
import { Play, Sparkles, CheckCircle2 } from 'lucide-react';
import Button from '../common/Button';
import { marketApi } from '../../api/market';
import { useToast } from '../../hooks/useToast';
import { formatCurrency, formatKwh } from '../../utils/formatters';

export const MarketClearingTrigger = ({ onMatched }) => {
  const [loading, setLoading] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const toast = useToast();

  const handleRunMatching = async () => {
    try {
      setLoading(true);
      const result = await marketApi.triggerMatching();
      setLastResult(result);
      if (onMatched) onMatched(result);

      if (result.matched_trades > 0) {
        toast.success(
          `Market cleared: ${result.matched_trades} trade${
            result.matched_trades > 1 ? 's' : ''
          } settled (${formatKwh(result.total_volume_kwh)}, ${formatCurrency(result.total_value)})`
        );
      } else {
        toast.info('Matching cycle finished: No matching bid/offer pairs currently fulfill price & route constraints.');
      }
    } catch (err) {
      toast.error('Matching engine run failed: ' + (err.response?.data?.detail || err.message));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 sm:p-5 rounded-2xl bg-slate-900 text-white border border-slate-800 shadow-2xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
      <div className="space-y-1">
        <div className="flex items-center space-x-2">
          <Sparkles className="w-4 h-4 text-emerald-400" />
          <h4 className="text-sm font-bold text-white tracking-tight">
            Network-Constrained Market Clearing
          </h4>
          <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-white/10 text-slate-300 border border-white/10">
            Dijkstra Routing
          </span>
        </div>
        <p className="text-xs text-slate-400 max-w-xl">
          Clears bilateral orders accounting for line loss factors and substation congestion.
          Matches highest bids with lowest asks subject to available grid capacity.
        </p>
      </div>

      <div className="flex items-center space-x-3 w-full md:w-auto shrink-0 justify-between md:justify-end">
        {lastResult && (
          <div className="text-left md:text-right text-xs">
            <span className="text-emerald-400 font-semibold block flex items-center md:justify-end space-x-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{lastResult.matched_trades} {lastResult.matched_trades === 1 ? 'trade' : 'trades'} settled</span>
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
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shrink-0 shadow-2xs"
        >
          Run Clearing Engine
        </Button>
      </div>
    </div>
  );
};

export default MarketClearingTrigger;
