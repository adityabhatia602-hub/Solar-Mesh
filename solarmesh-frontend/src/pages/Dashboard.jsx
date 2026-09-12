import React, { useState, useEffect, useCallback } from 'react';
import {
  Sun,
  Zap,
  RefreshCw,
  TrendingUp,
  Activity,
  Radio,
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
import { walletApi } from '../api/wallet';
import { marketApi } from '../api/market';
import { gridApi } from '../api/grid';
import { telemetryApi } from '../api/telemetry';
import { simulationApi, analyticsApi } from '../api/simulation';

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
import { formatKwh } from '../utils/formatters';

/**
 * Live dashboard. All metrics come from backend APIs (wallet, trades,
 * telemetry, analytics, simulation status) and update in real time via
 * WebSocket-triggered refreshes. No hardcoded demo numbers.
 */
export const Dashboard = () => {
  const { user, isProsumer } = useAuth();
  const { recentEvents, lastTelemetry, refreshCounter } = useMarket();

  const [wallet, setWallet] = useState(null);
  const [trades, setTrades] = useState([]);
  const [devices, setDevices] = useState([]);
  const [latestTelemetry, setLatestTelemetry] = useState([]);
  const [timeseries, setTimeseries] = useState([]);
  const [simRunning, setSimRunning] = useState(false);
  const [loading, setLoading] = useState(true);

  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [orderModalSide, setOrderModalSide] = useState(isProsumer ? 'offer' : 'bid');
  const [orderModalQty, setOrderModalQty] = useState('');
  const [selectedTrade, setSelectedTrade] = useState(null);

  const loadData = useCallback(async () => {
    try {
      const [walletData, tradesData, deviceData, latestData, analyticsData, simStatus] = await Promise.all([
        walletApi.getWallet().catch(() => null),
        marketApi.getMyTrades(10).catch(() => []),
        gridApi.getMyDevices().catch(() => []),
        telemetryApi.getLatest(null, 20).catch(() => []),
        analyticsApi.getDashboard(24).catch(() => null),
        simulationApi.getStatus().catch(() => null),
      ]);
      if (walletData) setWallet(walletData);
      if (tradesData) setTrades(tradesData);
      setDevices(deviceData || []);
      setLatestTelemetry(latestData || []);
      if (analyticsData?.timeseries) setTimeseries(analyticsData.timeseries);
      if (simStatus) setSimRunning(simStatus.is_running);
    } catch (err) {
      console.warn('Dashboard data loading warning:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData, refreshCounter]);

  // Aggregate live telemetry for THIS user's devices; fall back to platform latest.
  const myDeviceIds = new Set(devices.map((d) => d.id));
  const myReadings = latestTelemetry.filter((t) => myDeviceIds.has(t.device_id));
  const readings = myReadings.length > 0 ? myReadings : latestTelemetry;

  const sum = (field) =>
    readings.reduce((acc, r) => acc + (Number(r[field]) || 0), 0);

  const wsTelemetry = lastTelemetry && myDeviceIds.has(lastTelemetry.device_id) ? lastTelemetry : null;

  const productionKw = wsTelemetry
    ? Number(wsTelemetry.production_kw) || 0
    : sum('production_kw');
  const consumptionKw = wsTelemetry
    ? Number(wsTelemetry.consumption_kw) || 0
    : sum('consumption_kw');
  const batterySoc = readings.length
    ? Math.round(readings.reduce((acc, r) => acc + (Number(r.battery_soc) || 0), 0) / readings.length)
    : 0;
  const surplus = Math.max(0, productionKw - consumptionKw);
  const deficit = Math.max(0, consumptionKw - productionKw);

  const handleOpenOrderWithParams = (side, qty) => {
    setOrderModalSide(side);
    if (qty) setOrderModalQty(Number(qty).toFixed(1));
    setIsOrderModalOpen(true);
  };

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
            {/* Data source badge — honest digital-twin labeling */}
            <span className="inline-flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-[11px] font-semibold text-slate-600">
              <Radio className={`w-3.5 h-3.5 ${simRunning ? 'text-emerald-600' : 'text-slate-400'}`} />
              <span>{simRunning ? 'Simulation: LIVE' : 'Simulation: OFF'}</span>
              {simRunning && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />}
            </span>
            <Button
              variant="primary"
              size="sm"
              icon={isProsumer ? Sun : Zap}
              onClick={() =>
                handleOpenOrderWithParams(
                  isProsumer ? 'offer' : 'bid',
                  isProsumer ? (surplus > 0.1 ? surplus : 5.0) : 5.0
                )
              }
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
          productionKw={productionKw}
          consumptionKw={consumptionKw}
          batterySoc={batterySoc}
          surplusKw={surplus}
          trades={trades}
        />
      ) : (
        <ConsumerKpis
          wallet={wallet}
          consumptionKw={consumptionKw}
          deficitKw={deficit}
          trades={trades}
        />
      )}

      {/* Household Energy Flow Visualizer with 1-Click Action Hook */}
      <EnergyFlowVisualizer
        productionKw={productionKw}
        consumptionKw={consumptionKw}
        batterySoc={batterySoc}
        isProsumer={isProsumer}
        onActionClick={handleOpenOrderWithParams}
      />

      {/* 2-Column Section: Generation Chart & Live Market Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Generation vs Consumption Trend Chart */}
        <div className="lg:col-span-2">
          <Card
            title="Generation vs Consumption (live)"
            subtitle="Average power per interval from simulated device telemetry (kW)"
            icon={TrendingUp}
          >
            {timeseries.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center text-center text-slate-400 text-xs space-y-2">
                <Activity className="w-6 h-6 text-slate-300" />
                <p>No telemetry recorded in the last 24h.</p>
                <p className="text-slate-500">
                  Start the simulation from the controls drawer to generate live data.
                </p>
              </div>
            ) : (
              <div className="h-64 sm:h-72 w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={timeseries} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
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
                    <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} unit=" kW" />
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
                      dataKey="generation"
                      name="Solar Generation"
                      stroke="#059669"
                      strokeWidth={2.5}
                      fillOpacity={1}
                      fill="url(#solarGrad)"
                    />
                    <Area
                      type="monotone"
                      dataKey="consumption"
                      name="Consumption"
                      stroke="#64748b"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#loadGrad)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
            <div className="flex items-center justify-center space-x-6 text-xs text-slate-500 pt-3 border-t border-slate-100">
              <span className="flex items-center space-x-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 inline-block" />
                <span className="font-semibold text-slate-700">Solar Generation</span>
              </span>
              <span className="flex items-center space-x-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-500 inline-block" />
                <span className="font-semibold text-slate-700">Consumption</span>
              </span>
            </div>
          </Card>
        </div>

        {/* Right 1 Col: Live Streaming Activity Feed */}
        <div className="lg:col-span-1">
          <Card
            title="Live Market Activity"
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
          <Button variant="ghost" size="xs" onClick={() => loadData()} icon={RefreshCw}>
            Refresh
          </Button>
        }
      >
        {trades.length === 0 ? (
          <div className="py-8 text-center text-slate-400 text-xs space-y-1">
            <p>No trades yet.</p>
            <p className="text-slate-500">Start the simulation to generate market activity.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-4">Trade ID</th>
                  <th className="py-2.5 px-4">Energy Sent</th>
                  <th className="py-2.5 px-4">Delivered</th>
                  <th className="py-2.5 px-4">Unit Price</th>
                  <th className="py-2.5 px-4">Route</th>
                  <th className="py-2.5 px-4">Total Settled</th>
                  <th className="py-2.5 px-4">Date &amp; Time</th>
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
                    <td className="py-2.5 px-4 text-emerald-700 font-semibold">
                      {formatKwh(t.delivered_kwh ?? t.quantity_kwh)}
                    </td>
                    <td className="py-2.5 px-4 font-semibold text-slate-800">
                      ${Number(t.price_per_kwh || 0).toFixed(3)}/kWh
                    </td>
                    <td className="py-2.5 px-4 font-mono text-[10px] text-slate-500">
                      {(t.path_nodes || []).join(' → ') || '—'}
                    </td>
                    <td className="py-2.5 px-4 font-bold text-slate-900">
                      ${Number(t.total_amount || 0).toFixed(2)}
                    </td>
                    <td className="py-2.5 px-4 text-slate-400">
                      {t.created_at ? new Date(t.created_at).toLocaleString() : '—'}
                    </td>
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

      {/* Digital-Twin Simulation Controls */}
      <DemoSandboxDrawer onActionComplete={() => loadData()} />
    </div>
  );
};

export default Dashboard;
