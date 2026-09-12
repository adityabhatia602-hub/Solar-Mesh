import React, { useState, useEffect, useCallback } from 'react';
import {
  BarChart3,
  TrendingUp,
  Leaf,
  DollarSign,
  Zap,
  AlertTriangle,
  Activity,
  RefreshCw,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from 'recharts';
import { useMarket } from '../hooks/useMarket';
import PageHeader from '../components/layout/PageHeader';
import Card from '../components/common/Card';
import StatCard from '../components/common/StatCard';
import DemoSandboxDrawer from '../components/common/DemoSandboxDrawer';
import { analyticsApi } from '../api/simulation';
import { formatCurrency, formatKwh } from '../utils/formatters';
import { CO2_KG_PER_KWH } from '../utils/constants';

/** Live analytics: all values derived from backend aggregates, no hardcoded data. */
export const Analytics = () => {
  const { refreshCounter } = useMarket();
  const [dash, setDash] = useState(null);
  const [market, setMarket] = useState(null);
  const [grid, setGrid] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [d, m, g] = await Promise.all([
        analyticsApi.getDashboard(24).catch(() => null),
        analyticsApi.getMarket().catch(() => null),
        analyticsApi.getGrid().catch(() => null),
      ]);
      setDash(d);
      setMarket(m);
      setGrid(g);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData, refreshCounter]);

  const totalTraded = dash?.total_energy_traded_kwh ?? 0;
  const co2Avoided = Math.round(totalTraded * CO2_KG_PER_KWH);
  const timeseries = dash?.timeseries ?? [];

  return (
    <div className="space-y-6 sm:space-y-8">
      <PageHeader
        title="Energy Analytics & Green Impact"
        subtitle="Platform-wide generation, trading volumes, losses, and carbon offsets (last 24h)"
        actions={
          <Button variant="secondary" size="sm" icon={RefreshCw} onClick={fetchData} isLoading={loading}>
            Refresh
          </Button>
        }
      />

      {/* Aggregate KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Clean Energy Traded"
          value={formatKwh(totalTraded, 1)}
          subtitle="Settled peer-to-peer volume"
          icon={Zap}
          accent="emerald"
        />
        <StatCard
          title="Total Value Settled"
          value={market ? formatCurrency(market.total_network_fees + totalTraded * (market.average_price || 0)) : '—'}
          subtitle="Energy + network fees"
          icon={DollarSign}
          accent="blue"
        />
        <StatCard
          title="Energy Lost in Transit"
          value={formatKwh(dash?.total_energy_lost_kwh ?? 0, 2)}
          subtitle="Line losses on settled trades"
          icon={Activity}
          accent="amber"
        />
        <StatCard
          title="CO2 Avoided"
          value={co2Avoided}
          unit="kg"
          subtitle="vs fossil grid generation"
          icon={Leaf}
          accent="emerald"
        />
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart 1: Generation vs Consumption (live timeseries) */}
        <Card
          title="Generation vs Consumption"
          subtitle="Average power per interval (kW) from live telemetry"
          icon={BarChart3}
        >
          {timeseries.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-slate-400 text-xs space-y-2">
              <Activity className="w-6 h-6 text-slate-300" />
              <p>No telemetry data yet — start the simulation to collect analytics.</p>
            </div>
          ) : (
            <div className="h-64 sm:h-72 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={timeseries} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
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
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                  <Bar dataKey="generation" name="Generation (kW)" fill="#059669" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="consumption" name="Consumption (kW)" fill="#64748b" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        {/* Chart 2: Grid congestion overview */}
        <Card
          title="Grid Edge Utilization"
          subtitle="Current load vs capacity per corridor"
          icon={TrendingUp}
        >
          {grid?.highest_load_edge ? (
            <div className="space-y-3 pt-2">
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5 text-xs">
                <div className="flex justify-between font-semibold text-slate-700">
                  <span>Highest-load corridor:</span>
                  <span className="font-mono text-slate-900">
                    {grid.highest_load_edge.from_code} → {grid.highest_load_edge.to_code}
                  </span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Load:</span>
                  <span>{formatKwh(grid.highest_load_edge.load_kw, 2)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Utilization:</span>
                  <span className={grid.highest_load_edge.utilization > 0.8 ? 'text-rose-600 font-bold' : 'text-slate-800'}>
                    {(grid.highest_load_edge.utilization * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Avg line loss factor:</span>
                  <span>{(grid.average_loss_factor * 100).toFixed(2)}%</span>
                </div>
              </div>

              {grid.congested_edges?.length > 0 ? (
                <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 space-y-2">
                  <div className="flex items-center space-x-1.5 text-rose-700 font-bold text-xs">
                    <AlertTriangle className="w-4 h-4" />
                    <span>⚠ Grid Congestion ({grid.congested_edges.length} edges)</span>
                  </div>
                  {grid.congested_edges.map((e) => (
                    <div key={e.edge_id} className="flex justify-between text-[11px] text-rose-800">
                      <span className="font-mono">
                        {e.from_code} → {e.to_code}
                      </span>
                      <span className="font-semibold">
                        Utilization: {(e.utilization * 100).toFixed(0)}%
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold text-center">
                  ✓ No congestion — all corridors within capacity
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                  <span className="text-slate-500 block">Total grid load</span>
                  <span className="font-bold text-slate-800">{formatKwh(grid.total_load_kw, 2)}</span>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                  <span className="text-slate-500 block">Congestion events (24h)</span>
                  <span className="font-bold text-slate-800">{dash?.congestion_events ?? 0}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center text-slate-400 text-xs">
              Loading grid analytics...
            </div>
          )}
        </Card>
      </div>

      {/* Market summary */}
      {market && (
        <Card title="Market Summary" subtitle="All-time market aggregates" icon={DollarSign}>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-1">
            {[
              ['Buy Volume', formatKwh(market.buy_volume_kwh, 1)],
              ['Sell Volume', formatKwh(market.sell_volume_kwh, 1)],
              ['Matched', formatKwh(market.matched_volume_kwh, 1)],
              ['Avg Price', `$${market.average_price?.toFixed(3) ?? '—'}`],
              ['Avg Loss', formatKwh(market.average_loss_kwh, 3)],
              ['Network Fees', formatCurrency(market.total_network_fees)],
            ].map(([label, value]) => (
              <div key={label} className="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                <span className="text-[10px] text-slate-400 uppercase font-bold block">{label}</span>
                <span className="text-sm font-bold text-slate-900">{value}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Digital-Twin Simulation Controls */}
      <DemoSandboxDrawer onActionComplete={fetchData} />
    </div>
  );
};

export default Analytics;
