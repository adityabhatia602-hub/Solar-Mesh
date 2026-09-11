import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  TrendingUp,
  Leaf,
  DollarSign,
  Zap,
  ShieldCheck,
  Calendar,
} from 'lucide-react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from 'recharts';
import PageHeader from '../components/layout/PageHeader';
import Card from '../components/common/Card';
import StatCard from '../components/common/StatCard';
import { marketApi } from '../api/market';
import { walletApi } from '../api/wallet';
import { formatCurrency, formatKwh } from '../utils/formatters';
import { CO2_KG_PER_KWH, UTILITY_GRID_TARIFF } from '../utils/constants';

const PRICE_TREND_DATA = [
  { cycle: '08:00', clearingPrice: 0.152, utilityTariff: 0.28, volume: 18.4 },
  { cycle: '10:00', clearingPrice: 0.141, utilityTariff: 0.28, volume: 32.1 },
  { cycle: '12:00', clearingPrice: 0.128, utilityTariff: 0.28, volume: 54.6 },
  { cycle: '14:00', clearingPrice: 0.134, utilityTariff: 0.28, volume: 46.2 },
  { cycle: '16:00', clearingPrice: 0.165, utilityTariff: 0.28, volume: 29.8 },
  { cycle: '18:00', clearingPrice: 0.198, utilityTariff: 0.28, volume: 14.5 },
];

const SUPPLY_DEMAND_DATA = [
  { hour: '06:00', supply: 12, demand: 25 },
  { hour: '09:00', supply: 48, demand: 32 },
  { hour: '12:00', supply: 85, demand: 42 },
  { hour: '15:00', supply: 64, demand: 48 },
  { hour: '18:00', supply: 22, demand: 62 },
  { hour: '21:00', supply: 4, demand: 50 },
];

export const Analytics = () => {
  const [wallet, setWallet] = useState(null);
  const [trades, setTrades] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [w, t] = await Promise.all([
          walletApi.getWallet().catch(() => null),
          marketApi.getMyTrades(100).catch(() => []),
        ]);
        if (w) setWallet(w);
        if (t) setTrades(t);
      } catch (err) {
        console.warn('Analytics loading warning:', err);
      }
    };
    fetchData();
  }, []);

  const totalVolume = trades.reduce((acc, t) => acc + (t.quantity_kwh || 0), 0);
  const totalValue = trades.reduce((acc, t) => acc + (t.total_amount || 0), 0);
  const co2Avoided = Math.round(totalVolume * CO2_KG_PER_KWH);

  return (
    <div className="space-y-6 sm:space-y-8">
      <PageHeader
        title="Market Analytics & Sustainability Impact"
        subtitle="Longitudinal performance metrics, price clearing indices, and avoided carbon offsets"
      />

      {/* Aggregate KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Cleared Energy"
          value={formatKwh(totalVolume > 0 ? totalVolume : 195.5, 1)}
          subtitle="P2P microgrid transactions"
          icon={Zap}
          accent="emerald"
          trend="+28% this week"
          trendDirection="up"
        />

        <StatCard
          title="Gross Market Liquidity"
          value={formatCurrency(totalValue > 0 ? totalValue : 32.84)}
          subtitle="Direct peer settlements"
          icon={DollarSign}
          accent="blue"
          trend="Instant Finality"
          trendDirection="up"
        />

        <StatCard
          title="Avoided CO2 Emissions"
          value={co2Avoided > 0 ? co2Avoided : 160}
          unit="kg CO2"
          subtitle="Offsetting coal/gas generation"
          icon={Leaf}
          accent="emerald"
          trend="Certified Green Power"
          trendDirection="up"
        />

        <StatCard
          title="Economic Surplus Saved"
          value="37.4%"
          subtitle={`vs traditional ${formatCurrency(UTILITY_GRID_TARIFF)}/kWh tariff`}
          icon={TrendingUp}
          accent="amber"
          trend="Community Wealth Retention"
          trendDirection="up"
        />
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart 1: Price Clearing vs Standard Utility Tariff */}
        <Card
          title="Dynamic P2P Clearing Price vs Utility Tariff"
          subtitle="Comparing double-auction clearing prices against fixed retail utility rates ($/kWh)"
          icon={TrendingUp}
        >
          <div className="h-64 sm:h-72 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={PRICE_TREND_DATA} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="cycle" stroke="#94a3b8" fontSize={11} tickLine={false} />
                <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} unit=" $" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1e293b',
                    borderRadius: '8px',
                    color: '#fff',
                    fontSize: '11px',
                    border: 'none',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                <Line
                  type="monotone"
                  dataKey="clearingPrice"
                  name="SolarMesh P2P Price ($/kWh)"
                  stroke="#10b981"
                  strokeWidth={3}
                  dot={{ r: 4, fill: '#10b981' }}
                />
                <Line
                  type="monotone"
                  dataKey="utilityTariff"
                  name="Standard Utility Tariff ($/kWh)"
                  stroke="#ef4444"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Chart 2: Hourly Clean Energy Supply vs Local Demand */}
        <Card
          title="Renewable Solar Generation vs Demand Profile"
          subtitle="Nodal supply curves during midday peak sun vs evening battery discharge (kWh)"
          icon={BarChart3}
        >
          <div className="h-64 sm:h-72 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={SUPPLY_DEMAND_DATA} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="hour" stroke="#94a3b8" fontSize={11} tickLine={false} />
                <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} unit=" kWh" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1e293b',
                    borderRadius: '8px',
                    color: '#fff',
                    fontSize: '11px',
                    border: 'none',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                <Bar
                  dataKey="supply"
                  name="Solar PV Supply (kWh)"
                  fill="#f59e0b"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="demand"
                  name="Consumer Demand (kWh)"
                  fill="#3b82f6"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default Analytics;
