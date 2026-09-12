import React from 'react';
import {
  ArrowRight,
  ShieldCheck,
  Zap,
  Check,
  X,
  Route,
} from 'lucide-react';
import Modal from '../common/Modal';
import { useAuth } from '../../hooks/useAuth';
import { formatCurrency, formatKwh, formatDate } from '../../utils/formatters';

/**
 * Trade receipt + matching explanation. All data comes from the trade's
 * server-side `explanation` object (price check, route, losses, capacity).
 */
export const TradeExplainabilityModal = ({ trade, isOpen, onClose }) => {
  const { user } = useAuth();

  if (!trade) return null;

  const pathNodes = trade.path_nodes || [];
  const qty = Number(trade.quantity_kwh || 0);
  const delivered = Number(trade.delivered_kwh ?? qty);
  const lossKwh = Number(trade.energy_loss_kwh ?? 0);
  const lossPct = qty > 0 ? ((lossKwh / qty) * 100).toFixed(1) : '0.0';
  const energyCost = qty * Number(trade.price_per_kwh || 0);
  const networkCostTotal = qty * Number(trade.network_cost_per_kwh || 0);
  const isSeller = trade.seller_id === user?.id;
  const explanation = trade.explanation || {};

  // Explanation checklist derived from server-side match data.
  const checks = [
    {
      label: 'Buyer bid covered seller offer + network cost',
      ok: explanation.price_check !== false,
    },
    { label: 'Seller had available energy', ok: explanation.seller_has_energy !== false },
    { label: 'Route exists between nodes', ok: explanation.route_exists !== false },
    { label: 'Grid capacity available on path', ok: explanation.capacity_ok !== false },
    {
      label: `Estimated line losses acceptable (${lossPct}%)`,
      ok: parseFloat(lossPct) < 25,
    },
    {
      label: 'Network cost charged to buyer',
      ok: true,
      detail: formatCurrency(networkCostTotal),
    },
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Energy Trade Receipt"
      subtitle={`Settled trade #${trade.id?.slice(0, 8)} — matched by the network-aware engine`}
      maxWidth="max-w-xl"
    >
      <div className="space-y-4 text-xs text-slate-600">
        {/* Human Summary Card */}
        <div className="p-4 rounded-xl bg-slate-900 text-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 block">
              {isSeller ? '☀️ Solar Energy Sold' : '⚡️ Clean Energy Purchased'}
            </span>
            <div className="text-xl font-black text-white mt-0.5">
              {formatKwh(qty)} sent → {formatKwh(delivered)} delivered
            </div>
            <span className="text-[11px] text-slate-400">
              Buyer paid {formatCurrency(trade.total_amount)} • Seller received{' '}
              {formatCurrency(energyCost)}
            </span>
          </div>

          <div className="text-left sm:text-right">
            <span className="text-[10px] text-slate-400 block">Settled At</span>
            <span className="font-semibold text-slate-200">{formatDate(trade.created_at)}</span>
          </div>
        </div>

        {/* Route visualization */}
        <div>
          <span className="font-bold text-slate-800 block text-[11px] mb-1.5">
            <Route className="w-3.5 h-3.5 inline mr-1 text-emerald-600" />
            Delivery Route (Dijkstra shortest path)
          </span>
          {pathNodes.length > 0 ? (
            <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center flex-wrap gap-1.5">
              {pathNodes.map((node, i) => (
                <React.Fragment key={`${node}-${i}`}>
                  <span className="px-2.5 py-0.5 bg-white border border-slate-300 rounded font-mono font-bold text-slate-800 text-[11px] shadow-2xs">
                    {node}
                  </span>
                  {i < pathNodes.length - 1 && (
                    <ArrowRight className="w-3 h-3 text-slate-400 shrink-0" />
                  )}
                </React.Fragment>
              ))}
              {pathNodes.length === 1 && (
                <span className="text-[10px] text-slate-400">(same node — no transmission)</span>
              )}
            </div>
          ) : (
            <div className="p-2 bg-slate-50 border border-slate-200 rounded text-slate-500 italic text-[11px]">
              Direct peer connection within the same grid node
            </div>
          )}
        </div>

        {/* Loss breakdown */}
        <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
          <div className="flex justify-between p-3 bg-white">
            <span className="text-slate-600">Energy sent by seller:</span>
            <span className="font-bold text-slate-900">{formatKwh(qty)}</span>
          </div>
          <div className="flex justify-between p-3 bg-white">
            <span className="text-slate-600">
              Line losses ({lossPct}% of sent):
            </span>
            <span className="font-semibold text-amber-700">−{formatKwh(lossKwh)}</span>
          </div>
          <div className="flex justify-between p-3 bg-white">
            <span className="text-slate-600">Energy delivered to buyer:</span>
            <span className="font-bold text-emerald-700">{formatKwh(delivered)}</span>
          </div>
          <div className="flex justify-between p-3 bg-white">
            <span className="text-slate-600">Energy cost ({formatCurrency(trade.price_per_kwh)}/kWh):</span>
            <span className="font-semibold text-slate-900">{formatCurrency(energyCost)}</span>
          </div>
          <div className="flex justify-between p-3 bg-white">
            <span className="text-slate-600">
              Network delivery fee ({formatCurrency(trade.network_cost_per_kwh)}/kWh):
            </span>
            <span className="font-semibold text-emerald-700">+{formatCurrency(networkCostTotal)}</span>
          </div>
          <div className="flex justify-between p-3 bg-slate-50 font-bold text-slate-900">
            <span>{isSeller ? 'You received:' : 'Buyer paid in total:'}</span>
            <span className="text-emerald-800 text-sm">
              {formatCurrency(isSeller ? energyCost : trade.total_amount)}
            </span>
          </div>
        </div>

        {/* Why was this trade selected? */}
        <div className="border border-slate-200 rounded-xl bg-slate-50/70 overflow-hidden">
          <div className="flex items-center justify-between w-full p-3 text-xs font-bold text-slate-700">
            <div className="flex items-center space-x-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Why was this trade selected?</span>
            </div>
          </div>
          <div className="px-3 pb-3 space-y-1.5">
            {checks.map((c) => (
              <div key={c.label} className="flex items-center justify-between text-[11px]">
                <span className="flex items-center space-x-1.5">
                  {c.ok ? (
                    <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  ) : (
                    <X className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                  )}
                  <span className="text-slate-600">{c.label}</span>
                </span>
                {c.detail && <span className="font-semibold text-slate-800">{c.detail}</span>}
              </div>
            ))}
            {explanation.reason && (
              <div className="mt-2 p-2.5 bg-white border border-slate-200 rounded-lg text-[11px] text-slate-600 leading-relaxed">
                <strong className="text-slate-800">Engine reasoning:</strong> {explanation.reason}
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default TradeExplainabilityModal;
