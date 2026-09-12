import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Zap,
  Route,
  ArrowRight,
  Check,
  X,
  ShieldCheck,
} from 'lucide-react';
import { marketApi } from '../api/market';
import { useAuth } from '../hooks/useAuth';
import PageHeader from '../components/layout/PageHeader';
import Button from '../components/common/Button';
import Card from '../components/common/Card';
import Badge from '../components/common/Badge';
import {
  formatCurrency,
  formatKwh,
  formatDate,
} from '../utils/formatters';

/** Trade audit page: settlement math + network routing explainability (real data). */
export const TradeDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [trade, setTrade] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const fetchTrade = async () => {
      try {
        setLoading(true);
        const data = await marketApi.getTrade(id);
        if (!cancelled) setTrade(data);
      } catch (err) {
        console.error('Failed to load trade detail:', err);
        if (!cancelled) setTrade(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchTrade();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="py-20 text-center text-slate-500 text-sm">
        Loading trade settlement audit data...
      </div>
    );
  }

  if (!trade) {
    return (
      <div className="p-8 text-center space-y-4">
        <h3 className="text-base font-bold text-slate-800">Trade Not Found</h3>
        <p className="text-xs text-slate-500">
          The requested trade ID was not found or you are not a party to it.
        </p>
        <Button variant="secondary" size="sm" icon={ArrowLeft} onClick={() => navigate('/trades')}>
          Back to Trades
        </Button>
      </div>
    );
  }

  const qty = Number(trade.quantity_kwh || 0);
  const delivered = Number(trade.delivered_kwh ?? qty);
  const lossKwh = Number(trade.energy_loss_kwh ?? 0);
  const lossPct = qty > 0 ? ((lossKwh / qty) * 100).toFixed(1) : '0.0';
  const energyCost = qty * Number(trade.price_per_kwh || 0);
  const networkCostTotal = qty * Number(trade.network_cost_per_kwh || 0);
  const isSeller = trade.seller_id === user?.id;
  const pathNodes = trade.path_nodes || [];
  const explanation = trade.explanation || {};

  const checks = [
    { label: 'Buyer bid covered seller offer + network cost', ok: explanation.price_check !== false },
    { label: 'Seller had available energy', ok: explanation.seller_has_energy !== false },
    { label: 'Route exists between nodes', ok: explanation.route_exists !== false },
    { label: 'Grid capacity available on path', ok: explanation.capacity_ok !== false },
    { label: `Estimated line losses acceptable (${lossPct}%)`, ok: parseFloat(lossPct) < 25 },
  ];

  return (
    <div className="space-y-6 sm:space-y-8 max-w-4xl mx-auto">
      <div className="flex items-center space-x-2">
        <button
          onClick={() => navigate('/trades')}
          className="inline-flex items-center space-x-1 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Trades</span>
        </button>
      </div>

      <PageHeader
        title={`Settled Trade Audit: #${trade.id?.slice(0, 10)}`}
        subtitle="Network routing explainability and automated settlement receipt"
        badge={<Badge variant="emerald" dot>SETTLED</Badge>}
      />

      {/* Overview Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="bg-slate-900 text-white border-slate-800">
          <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider block">
            Energy Sent → Delivered
          </span>
          <div className="text-2xl font-extrabold text-white mt-1">
            {formatKwh(qty)} → {formatKwh(delivered)}
          </div>
          <span className="text-[11px] text-emerald-400 mt-1 block font-medium">
            Loss: {formatKwh(lossKwh)} ({lossPct}%)
          </span>
        </Card>

        <Card className="bg-slate-900 text-white border-slate-800">
          <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider block">
            Network Delivery Charge
          </span>
          <div className="text-2xl font-extrabold text-emerald-400 mt-1">
            +{formatCurrency(networkCostTotal)}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">
            {formatCurrency(trade.network_cost_per_kwh)}/kWh · line loss &amp; routing
          </span>
        </Card>

        <Card className="bg-slate-900 text-white border-slate-800">
          <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider block">
            {isSeller ? 'You Received' : 'Buyer Paid'}
          </span>
          <div className="text-2xl font-extrabold text-amber-400 mt-1">
            {formatCurrency(isSeller ? energyCost : trade.total_amount)}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">
            Energy {formatCurrency(energyCost)} + delivery {formatCurrency(networkCostTotal)}
          </span>
        </Card>
      </div>

      {/* Route Card */}
      <Card
        title="Physical Dispatch Route"
        subtitle="Dijkstra shortest path over the digital-twin grid (loss + congestion weighted)"
        icon={Route}
      >
        {pathNodes.length > 0 ? (
          <div className="flex items-center flex-wrap gap-2">
            {pathNodes.map((node, i) => (
              <React.Fragment key={`${node}-${i}`}>
                <span className="px-3 py-1 bg-slate-50 border border-slate-300 rounded-lg font-mono font-bold text-slate-800 shadow-2xs">
                  {node}
                </span>
                {i < pathNodes.length - 1 && <ArrowRight className="w-3.5 h-3.5 text-slate-400" />}
              </React.Fragment>
            ))}
          </div>
        ) : (
          <span className="text-slate-500 italic text-xs">Direct localized peer connection</span>
        )}
      </Card>

      {/* Settlement Math Card */}
      <Card
        title="Settlement Breakdown"
        subtitle="Atomic wallet movements recorded in the ledger"
        icon={Zap}
      >
        <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100 text-xs">
          <div className="flex justify-between p-3 bg-white">
            <span className="text-slate-600">Energy sent by seller:</span>
            <span className="font-bold text-slate-900">{formatKwh(qty)}</span>
          </div>
          <div className="flex justify-between p-3 bg-white">
            <span className="text-slate-600">Line losses ({lossPct}):</span>
            <span className="font-semibold text-amber-700">−{formatKwh(lossKwh)}</span>
          </div>
          <div className="flex justify-between p-3 bg-white">
            <span className="text-slate-600">Energy delivered to buyer:</span>
            <span className="font-bold text-emerald-700">{formatKwh(delivered)}</span>
          </div>
          <div className="flex justify-between p-3 bg-white">
            <span className="text-slate-600">
              Energy cost ({formatCurrency(trade.price_per_kwh)}/kWh):
            </span>
            <span className="font-semibold text-slate-900">{formatCurrency(energyCost)}</span>
          </div>
          <div className="flex justify-between p-3 bg-white">
            <span className="text-slate-600">Network delivery fee:</span>
            <span className="font-semibold text-emerald-700">+{formatCurrency(networkCostTotal)}</span>
          </div>
          <div className="flex justify-between p-3 bg-slate-50 font-bold text-slate-900">
            <span>Buyer total:</span>
            <span className="text-emerald-800 text-sm">{formatCurrency(trade.total_amount)}</span>
          </div>
          <div className="flex justify-between p-3 bg-white text-slate-500">
            <span>Settled at:</span>
            <span>{formatDate(trade.created_at)}</span>
          </div>
        </div>
      </Card>

      {/* Matching Explanation Card */}
      <Card
        title="Why was this trade selected?"
        subtitle="Explainability checklist computed by the matching engine"
        icon={ShieldCheck}
      >
        <div className="space-y-2 text-xs">
          {checks.map((c) => (
            <div key={c.label} className="flex items-center space-x-2">
              {c.ok ? (
                <Check className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <X className="w-4 h-4 text-rose-500 shrink-0" />
              )}
              <span className="text-slate-600">{c.label}</span>
            </div>
          ))}
          {explanation.reason && (
            <div className="mt-3 p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-600 leading-relaxed">
              <strong className="text-slate-800">Engine reasoning:</strong> {explanation.reason}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
};

export default TradeDetails;
