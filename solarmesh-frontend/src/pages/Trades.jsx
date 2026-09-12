import React, { useState, useEffect, useCallback } from 'react';
import {
  History,
  Download,
  RefreshCw,
  Search,
  ShieldCheck,
  Zap,
  Sun,
  Coins,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useMarket } from '../hooks/useMarket';
import { useToast } from '../hooks/useToast';
import { marketApi } from '../api/market';
import PageHeader from '../components/layout/PageHeader';
import Button from '../components/common/Button';
import Card from '../components/common/Card';
import StatCard from '../components/common/StatCard';
import TradeExplainabilityModal from '../components/trades/TradeExplainabilityModal';
import DemoSandboxDrawer from '../components/common/DemoSandboxDrawer';
import {
  formatCurrency,
  formatKwh,
  formatDate,
} from '../utils/formatters';

export const Trades = () => {
  const { user } = useAuth();
  const { refreshCounter } = useMarket();
  const toast = useToast();

  const [trades, setTrades] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedTrade, setSelectedTrade] = useState(null);

  const fetchTrades = useCallback(async () => {
    try {
      setLoading(true);
      const data = await marketApi.getMyTrades(100);
      setTrades(data);
    } catch (err) {
      console.warn('Failed to load trades:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTrades();
  }, [fetchTrades, refreshCounter]);

  const filteredTrades = trades.filter((t) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      t.id?.toLowerCase().includes(term) ||
      t.seller_id?.toLowerCase().includes(term) ||
      t.buyer_id?.toLowerCase().includes(term)
    );
  });

  const totalVolume = trades.reduce((acc, t) => acc + (t.quantity_kwh || 0), 0);
  const totalValue = trades.reduce((acc, t) => acc + (t.total_amount || 0), 0);

  const handleExportCsv = () => {
    if (trades.length === 0) return;
    const headers = ['Trade_ID', 'Type', 'Quantity_kWh', 'Price_per_kWh', 'Grid_Delivery_Fee', 'Total_Amount', 'Date'];
    const rows = trades.map((t) => [
      t.id,
      t.seller_id === user?.id ? 'Sold Solar' : 'Bought Clean Energy',
      t.quantity_kwh,
      t.price_per_kwh,
      t.network_cost_per_kwh,
      t.total_amount,
      t.created_at,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `solarmesh_trades_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Exported trades to CSV');
  };

  return (
    <div className="space-y-6 sm:space-y-8">
      <PageHeader
        title="Trade History & Receipts"
        subtitle="Review your completed peer-to-peer energy trades, earnings, and receipts"
        actions={
          <div className="flex items-center space-x-2">
            <Button
              variant="secondary"
              size="sm"
              icon={RefreshCw}
              onClick={fetchTrades}
              isLoading={loading}
            >
              Sync
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={Download}
              onClick={handleExportCsv}
              disabled={trades.length === 0}
            >
              Export CSV
            </Button>
          </div>
        }
      />

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Total Energy Traded"
          value={formatKwh(totalVolume, 1)}
          subtitle="Lifetime community volume"
          icon={Zap}
          accent="emerald"
        />

        <StatCard
          title="Total Value Settled"
          value={formatCurrency(totalValue)}
          subtitle="Processed via smart escrow"
          icon={Coins}
          accent="blue"
        />

        <StatCard
          title="Settled Deals"
          value={trades.length}
          subtitle="100% fulfilled without dispute"
          icon={ShieldCheck}
          accent="emerald"
        />
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by Trade ID..."
            className="w-full pl-9 pr-3 py-1.5 border border-slate-300 rounded-lg text-xs bg-white text-slate-800 placeholder-slate-400 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
          />
        </div>

        <div className="text-xs text-slate-500">
          Showing <span className="font-bold text-slate-800">{filteredTrades.length}</span> settled trades
        </div>
      </div>

      {/* Trades Table Card */}
      <Card noPadding className="overflow-hidden">
        {filteredTrades.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-xs">
            No energy trades match your search criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Trade ID</th>
                  <th className="py-3 px-4">Transaction Type</th>
                  <th className="py-3 px-4">Energy Amount</th>
                  <th className="py-3 px-4">Unit Price</th>
                  <th className="py-3 px-4">Grid Delivery Fee</th>
                  <th className="py-3 px-4">Total Settled</th>
                  <th className="py-3 px-4">Date & Time</th>
                  <th className="py-3 px-4 text-right">Receipt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {filteredTrades.map((trade, idx) => {
                  const isSeller = trade.seller_id === user?.id;

                  return (
                    <tr
                      key={`${trade.id || 'trade'}-${idx}`}
                      className="hover:bg-slate-50/70 transition-colors cursor-pointer"
                      onClick={() => setSelectedTrade(trade)}
                    >
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">
                        #{trade.id?.slice(0, 8)}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold ${
                            isSeller
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {isSeller ? '☀️ Sold Solar' : '⚡️ Bought Clean Energy'}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-bold text-slate-900">
                        {formatKwh(trade.quantity_kwh)}
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-800">
                        {formatCurrency(trade.price_per_kwh, '₹', 3)}/kWh
                      </td>
                      <td className="py-3 px-4 text-emerald-700">
                        +{formatCurrency(trade.network_cost_per_kwh, '₹', 3)}
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-900 text-right">
                        {formatCurrency(trade.total_amount)}
                      </td>
                      <td className="py-3 px-4 text-slate-400">{formatDate(trade.created_at)}</td>
                      <td className="py-3 px-4 text-right">
                        <span className="inline-flex items-center space-x-1 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors">
                          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                          <span>View Receipt</span>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Trade Explainability Modal */}
      <TradeExplainabilityModal
        trade={selectedTrade}
        isOpen={!!selectedTrade}
        onClose={() => setSelectedTrade(null)}
      />

      {/* Demo Sandbox Drawer */}
      <DemoSandboxDrawer onActionComplete={fetchTrades} />
    </div>
  );
};

export default Trades;
