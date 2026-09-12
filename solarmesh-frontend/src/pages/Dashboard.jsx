import React, { useState, useEffect, useCallback } from 'react';
import {
  Sun,
  Zap,
  ArrowRight,
  RefreshCw,
  TrendingUp,
  Activity,
  ShieldCheck,
  Coins,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { useAuth } from '../hooks/useAuth';
import { useMarket } from '../hooks/useMarket';
import { useToast } from '../hooks/useToast';
import { walletApi } from '../api/wallet';
import { marketApi } from '../api/market';

import PageHeader from '../components/layout/PageHeader';
import Button from '../components/common/Button';
import Card from '../components/common/Card';
import EnergyFlowVisualizer from '../components/dashboard/EnergyFlowVisualizer';
import ProsumerKpis from '../components/dashboard/ProsumerKpis';
import ConsumerKpis from '../components/dashboard/ConsumerKpis';
import LiveActivityFeed from '../components/dashboard/LiveActivityFeed';
import PlaceOrderModal from '../components/marketplace/PlaceOrderModal';
import TradeExplainabilityModal from '../components/trades/TradeExplainabilityModal';
import DemoSandboxDrawer from '../components/common/DemoSandboxDrawer';
import { formatCurrency, formatKwh, formatDate } from '../utils/formatters';

// 24h realistic solar vs household load profile
const HOURLY_DATA = [
  { time: '00:00', solar: 0.0, load: 1.2 },
  { time: '03:00', solar: 0.0, load: 0.9 },
  { time: '06:00', solar: 0.8, load: 2.1 },
  { time: '09:00', solar: 4.8, load: 2.5 },
  { time: '12:00', solar: 8.5, load: 3.1 },
  { time: '15:00', solar: 6.2, load: 2.8 },
  { time: '18:00', solar: 1.9, load: 4.2 },
  { time: '21:00', solar: 0.0, load: 3.5 },
];

export const Dashboard = () => {
  const { user, isProsumer } = useAuth();
  const { recentEvents, lastTelemetry, refreshCounter } = useMarket();
  const toast = useToast();

  const [wallet, setWallet] = useState(null);
  const [trades, setTrades] = useState([]);
  const [telemetry, setTelemetry] = useState({
    production_kwh: isProsumer ? 8.4 : 1.2,
    consumption_kwh: isProsumer ? 3.2 : 5.8,
    battery_kwh: 11.2,
  });

  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [orderModalSide, setOrderModalSide] = useState(isProsumer ? 'offer' : 'bid');
  const [orderModalQty, setOrderModalQty] = useState('');
  const [selectedTrade, setSelectedTrade] = useState(null);

  const loadData = useCallback(async () => {
    try {
      const [walletData, tradesData] = await Promise.all([
        walletApi.getWallet().catch(() => null),
        marketApi.getMyTrades(10).catch(() => []),
      ]);
      if (walletData) setWallet(walletData);
      if (tradesData) setTrades(tradesData);
    } catch (err) {
      console.warn('Dashboard data loading warning:', err);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData, refreshCounter]);

  // Update telemetry if WebSocket pushed reading
  useEffect(() => {
    if (lastTelemetry) {
      setTelemetry((prev) => ({
        ...prev,
        production_kwh: lastTelemetry.production_kwh ?? prev.production_kwh,
        consumption_kwh: lastTelemetry.consumption_kwh ?? prev.consumption_kwh,
        battery_kwh: lastTelemetry.battery_kwh ?? prev.battery_kwh,
      }));
    }
  }, [lastTelemetry]);

  const handleOpenOrderWithParams = (side, qty) => {
    setOrderModalSide(side);
    if (qty) setOrderModalQty(qty.toFixed(1));
    setIsOrderModalOpen(true);
  };

  const surplus = Math.max(0, (telemetry.production_kwh || 0) - (telemetry.consumption_kwh || 0));

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Top Header */}
      <PageHeader
        title={isProsumer ? 'Solar Home Dashboard' : 'Clean Energy Hub'}
        subtitle={
          isProsumer
            ? 'Track rooftop solar production, home usage, and trade surplus energy with neighbors'
            : 'Buy clean solar electricity directly from nearby homes and save on utility bills'
        }
        actions={
          <div className="flex items-center space-x-2">
            <Button
              variant="primary"
              size="sm"
              icon={isProsumer ? Sun : Zap}
              onClick={() => handleOpenOrderWithParams(isProsumer ? 'offer' : 'bid', surplus > 0 ? surplus : 5.0)}
            >
              {isProsumer ? 'Sell Excess Solar' : 'Buy Clean Energy'}
            </Button>
          </div>
        }
      />

      {/* Role-Specific Metric KPI Cards */}
      {isProsumer ? (
        <ProsumerKpis
          wallet={wallet}
          productionKwh={telemetry.production_kwh}
          consumptionKwh={telemetry.consumption_kwh}
          trades={trades}
        />
      ) : (
        <ConsumerKpis
          wallet={wallet}
          consumptionKwh={telemetry.consumption_kwh}
          trades={trades}
        />
      )}

      {/* Household Energy Flow Visualizer with 1-Click Action Hook */}
      <EnergyFlowVisualizer
        productionKwh={telemetry.production_kwh}
        consumptionKwh={telemetry.consumption_kwh}
        batteryKwh={telemetry.battery_kwh}
        isProsumer={isProsumer}
        onActionClick={handleOpenOrderWithParams}
      />

      {/* 2-Column Section: Generation Chart & Live Market Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Generation vs Consumption Trend Chart */}
        <div className="lg:col-span-2">
          <Card
            title="Today's Solar Production vs Home Usage"
            subtitle="Hourly daylight energy generation compared to active appliances (kWh)"
            icon={TrendingUp}
          >
            <div className="h-64 sm:h-72 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={HOURLY_DATA} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="solarGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#059669" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#059669" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="loadGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#64748b" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#64748b" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="time" stroke="#94a3b8" fontSize={11} tickLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} unit=" kWh" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      borderRadius: '8px',
                      color: '#f8fafc',
                      fontSize: '11px',
                      border: '1px solid #1e293b',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="solar"
                    name="Solar Generation"
                    stroke="#059669"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#solarGrad)"
                  />
                  <Area
                    type="monotone"
                    dataKey="load"
                    name="Home Consumption"
                    stroke="#64748b"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#loadGrad)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center justify-center space-x-6 text-xs text-slate-500 pt-3 border-t border-slate-100">
              <span className="flex items-center space-x-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 inline-block" />
                <span className="font-semibold text-slate-700">Solar Power (Generation)</span>
              </span>
              <span className="flex items-center space-x-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-500 inline-block" />
                <span className="font-semibold text-slate-700">Home Electricity Usage</span>
              </span>
            </div>
          </Card>
        </div>

        {/* Right 1 Col: Live Streaming Activity Feed */}
        <div className="lg:col-span-1">
          <Card
            title="Community Energy Activity"
            subtitle="Real-time trades and grid updates"
            icon={Activity}
          >
            <LiveActivityFeed events={recentEvents} />
          </Card>
        </div>
      </div>

      {/* Recent Trades Table */}
      <Card
        title="Recent Energy Trades"
        subtitle="Completed peer-to-peer clean energy transactions"
        icon={Zap}
        action={
          <Button
            variant="ghost"
            size="xs"
            onClick={() => loadData()}
            icon={RefreshCw}
          >
            Refresh
          </Button>
        }
      >
        {trades.length === 0 ? (
          <div className="py-8 text-center text-slate-400 text-xs">
            No completed trades yet. Post an offer to sell your excess solar energy.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-4">Trade ID</th>
                  <th className="py-2.5 px-4">Energy Sold/Bought</th>
                  <th className="py-2.5 px-4">Unit Price</th>
                  <th className="py-2.5 px-4">Grid Delivery Fee</th>
                  <th className="py-2.5 px-4">Total Settled</th>
                  <th className="py-2.5 px-4">Date & Time</th>
                  <th className="py-2.5 px-4 text-right">Receipt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {trades.slice(0, 5).map((t, idx) => (
                  <tr key={`${t.id || 'trade'}-${idx}`} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-2.5 px-4 font-mono font-semibold text-slate-800">
                      #{t.id?.slice(0, 8)}
                    </td>
                    <td className="py-2.5 px-4 font-bold text-slate-900">
                      {formatKwh(t.quantity_kwh)}
                    </td>
                    <td className="py-2.5 px-4 font-semibold text-slate-800">
                      {formatCurrency(t.price_per_kwh, '$', 3)}/kWh
                    </td>
                    <td className="py-2.5 px-4 text-emerald-700 font-medium">
                      +{formatCurrency(t.network_cost_per_kwh, '$', 3)}
                    </td>
                    <td className="py-2.5 px-4 font-bold text-slate-900">
                      {formatCurrency(t.total_amount)}
                    </td>
                    <td className="py-2.5 px-4 text-slate-400">{formatDate(t.created_at)}</td>
                    <td className="py-2.5 px-4 text-right">
                      <button
                        onClick={() => setSelectedTrade(t)}
                        className="px-2.5 py-1 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-transparent rounded-lg transition-colors cursor-pointer"
                      >
                        View Receipt
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Modals */}
      <PlaceOrderModal
        isOpen={isOrderModalOpen}
        onClose={() => setIsOrderModalOpen(false)}
        initialSide={orderModalSide}
        initialQuantity={orderModalQty}
        onOrderPlaced={() => loadData()}
      />

      <TradeExplainabilityModal
        trade={selectedTrade}
        isOpen={!!selectedTrade}
        onClose={() => setSelectedTrade(null)}
      />

      {/* Demo / Judge Floating Sandbox Drawer */}
      <DemoSandboxDrawer onActionComplete={() => loadData()} />
    </div>
  );
};

export default Dashboard;
