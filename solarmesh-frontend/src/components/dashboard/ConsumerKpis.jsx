import React from 'react';
import { Zap, IndianRupee, PiggyBank, Home } from 'lucide-react';
import StatCard from '../common/StatCard';
import { formatCurrency, formatKwh } from '../../utils/formatters';
import { UTILITY_GRID_TARIFF } from '../../utils/constants';

/** Consumer KPI cards fed by live telemetry + wallet data. */
export const ConsumerKpis = ({
  wallet,
  consumptionKw = 0,
  deficitKw = 0,
  trades = [],
}) => {
  const energyBought = wallet?.energy_kwh_bought ?? 0;
  const balance = wallet?.balance ?? 0;

  // Average price paid across this user's settled trades.
  const avgPrice = trades.length > 0
    ? trades.reduce((acc, t) => acc + (t.price_per_kwh || 0), 0) / trades.length
    : 0;

  const totalSpent = trades.reduce((acc, t) => acc + (t.total_amount || 0), 0);
  const costIfUtility = energyBought * UTILITY_GRID_TARIFF;
  const savings = energyBought > 0 ? Math.max(0, costIfUtility - totalSpent) : 0;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
      <StatCard
        title="Home Consumption"
        value={formatKwh(consumptionKw, 2)}
        subtitle="Live household load (kW)"
        icon={Home}
        accent="amber"
        trend={deficitKw > 0 ? `Deficit ${formatKwh(deficitKw, 2)}` : 'Self-balanced'}
        trendDirection={deficitKw > 0 ? 'down' : 'up'}
      />

      <StatCard
        title="Clean Energy Bought"
        value={formatKwh(energyBought, 1)}
        subtitle="Lifetime peer-to-peer purchases"
        icon={Zap}
        accent="emerald"
        trend={energyBought > 0 ? 'P2P supplied' : 'No purchases yet'}
        trendDirection={energyBought > 0 ? 'up' : 'flat'}
      />

      <StatCard
        title="Wallet Balance"
        value={formatCurrency(balance)}
        subtitle="Available for bids"
        icon={IndianRupee}
        accent="blue"
        trend={totalSpent > 0 ? `${formatCurrency(totalSpent)} spent trading` : 'No trades yet'}
        trendDirection="flat"
      />

      <StatCard
        title="Avg Price Paid"
        value={avgPrice > 0 ? formatCurrency(avgPrice, '₹', 3) : '—'}
        unit={avgPrice > 0 ? '/kWh' : ''}
        subtitle={savings > 0 ? `Saved ${formatCurrency(savings)} vs utility` : `Utility ref: ${formatCurrency(UTILITY_GRID_TARIFF)}/kWh`}
        icon={PiggyBank}
        accent="emerald"
        trend={savings > 0 ? 'Saving vs grid tariff' : 'Market price'}
        trendDirection={savings > 0 ? 'up' : 'flat'}
      />
    </div>
  );
};

export default ConsumerKpis;
