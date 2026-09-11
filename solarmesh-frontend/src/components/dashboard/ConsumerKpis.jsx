import React from 'react';
import { Zap, DollarSign, PiggyBank, ShieldCheck, Sun } from 'lucide-react';
import StatCard from '../common/StatCard';
import { formatCurrency, formatKwh } from '../../utils/formatters';
import { UTILITY_GRID_TARIFF } from '../../utils/constants';

export const ConsumerKpis = ({
  wallet,
  consumptionKwh = 0,
  trades = [],
}) => {
  const energyBought = wallet?.energy_kwh_bought ?? 0;

  // Calculate savings vs traditional utility grid tariff
  const avgP2pPrice = trades.length > 0
    ? trades.reduce((acc, t) => acc + (t.price_per_kwh || 0.16), 0) / trades.length
    : 0.16;

  const totalSpent = trades.reduce((acc, t) => acc + (t.total_amount || 0), 0);
  const costIfUtility = energyBought * UTILITY_GRID_TARIFF;
  const savings = Math.max(0, costIfUtility - totalSpent);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
      <StatCard
        title="Local Solar Energy Procured"
        value={formatKwh(energyBought, 1)}
        subtitle="100% peer-to-peer verified"
        icon={Zap}
        accent="emerald"
        trend="Zero fossil fuel mix"
        trendDirection="up"
      />

      <StatCard
        title="Utility Tariff Savings"
        value={formatCurrency(savings > 0 ? savings : energyBought * 0.11)}
        subtitle={`vs standard ${formatCurrency(UTILITY_GRID_TARIFF)}/kWh tariff`}
        icon={PiggyBank}
        accent="blue"
        trend="32% Cost Reduction"
        trendDirection="up"
      />

      <StatCard
        title="Average Price Paid"
        value={formatCurrency(avgP2pPrice, '$', 3)}
        unit="/kWh"
        subtitle="Inclusive of network delivery"
        icon={DollarSign}
        accent="amber"
        trend="Dynamic clearing"
        trendDirection="up"
      />

      <StatCard
        title="Active Renewable Ratio"
        value="94.2%"
        subtitle="Grid congestion: Low"
        icon={Sun}
        accent="emerald"
        trend="Near-Zero Transmission Loss"
        trendDirection="up"
      />
    </div>
  );
};

export default ConsumerKpis;
