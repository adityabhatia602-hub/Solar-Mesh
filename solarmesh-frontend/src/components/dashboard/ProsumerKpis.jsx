import React from 'react';
import { Sun, IndianRupee, Battery, Leaf, TrendingUp, Zap } from 'lucide-react';
import StatCard from '../common/StatCard';
import { formatCurrency, formatKwh } from '../../utils/formatters';
import { CO2_KG_PER_KWH } from '../../utils/constants';

/** Prosumer KPI cards fed by live telemetry + wallet data. */
export const ProsumerKpis = ({
  wallet,
  productionKw = 0,
  consumptionKw = 0,
  batterySoc = 0,
  surplusKw = 0,
  trades = [],
}) => {
  const energySold = wallet?.energy_kwh_sold ?? 0;
  const balance = wallet?.balance ?? 0;

  // Earnings from trades the user sold into (approximation from trade totals).
  const tradeEarnings = trades.reduce((acc, t) => acc + (t.total_amount || 0), 0);
  const totalRevenue = tradeEarnings > 0 ? tradeEarnings : 0;

  // Carbon avoided uses live generation estimate.
  const co2AvoidedKg = Math.round(productionKw * CO2_KG_PER_KWH * 24 * 10) / 10;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
      <StatCard
        title="Solar Generation"
        value={formatKwh(productionKw, 2)}
        subtitle="Live PV output (kW)"
        icon={Sun}
        accent="amber"
        trend={productionKw > 0 ? 'Producing now' : 'No generation'}
        trendDirection={productionKw > 0 ? 'up' : 'down'}
      />

      <StatCard
        title="Exportable Surplus"
        value={formatKwh(surplusKw, 2)}
        subtitle={surplusKw > 0 ? 'Available to sell' : 'Consuming everything'}
        icon={Zap}
        accent="emerald"
        trend={surplusKw > 0 ? 'Sell now' : 'Balanced'}
        trendDirection={surplusKw > 0 ? 'up' : 'flat'}
      />

      <StatCard
        title="Wallet Balance"
        value={formatCurrency(balance)}
        subtitle={`${formatKwh(energySold, 1)} sold lifetime`}
        icon={IndianRupee}
        accent="blue"
        trend={totalRevenue > 0 ? `${formatCurrency(totalRevenue)} traded recently` : 'No trades yet'}
        trendDirection={totalRevenue > 0 ? 'up' : 'flat'}
      />

      <StatCard
        title="Battery Storage"
        value={`${batterySoc}%`}
        subtitle="State of charge"
        icon={Battery}
        accent="emerald"
        trend={batterySoc > 80 ? 'Nearly full' : batterySoc > 30 ? 'Healthy' : 'Low'}
        trendDirection={batterySoc > 30 ? 'up' : 'down'}
      />
    </div>
  );
};

export default ProsumerKpis;
