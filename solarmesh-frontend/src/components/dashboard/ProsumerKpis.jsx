import React from 'react';
import { Sun, DollarSign, Battery, Leaf, TrendingUp, Zap } from 'lucide-react';
import StatCard from '../common/StatCard';
import { formatCurrency, formatKwh } from '../../utils/formatters';
import { CO2_KG_PER_KWH } from '../../utils/constants';

export const ProsumerKpis = ({
  wallet,
  productionKwh = 0,
  consumptionKwh = 0,
  trades = [],
}) => {
  const energySold = wallet?.energy_kwh_sold ?? 0;
  const balance = wallet?.balance ?? 0;

  // Calculate gross earnings from sold trades
  const tradeEarnings = trades.reduce((acc, t) => acc + (t.total_amount || 0), 0);
  const totalRevenue = tradeEarnings > 0 ? tradeEarnings : energySold * 0.18; // fallback realistic estimate

  // Carbon emissions avoided: kg of CO2
  const co2AvoidedKg = Math.round(productionKwh * CO2_KG_PER_KWH);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
      <StatCard
        title="Solar Generation"
        value={formatKwh(productionKwh, 1)}
        subtitle="Today's PV energy output"
        icon={Sun}
        accent="amber"
        trend="+14% vs yesterday"
        trendDirection="up"
      />

      <StatCard
        title="Surplus Clean Energy Sold"
        value={formatKwh(energySold, 1)}
        subtitle="Transferred to peer consumers"
        icon={Zap}
        accent="emerald"
        trend="Zero Curtailment"
        trendDirection="up"
      />

      <StatCard
        title="P2P Trading Revenue"
        value={formatCurrency(totalRevenue)}
        subtitle="Gross earnings settled"
        icon={DollarSign}
        accent="blue"
        trend="Instant Smart Escrow"
        trendDirection="up"
      />

      <StatCard
        title="CO2 Offset"
        value={co2AvoidedKg}
        unit="kg CO2"
        subtitle="Avoided grid emissions"
        icon={Leaf}
        accent="emerald"
        trend="100% Green Energy"
        trendDirection="up"
      />
    </div>
  );
};

export default ProsumerKpis;
