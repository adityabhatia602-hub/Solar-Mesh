import React from 'react';
import { Layers, Sun, Zap } from 'lucide-react';
import Card from '../common/Card';
import EmptyState from '../common/EmptyState';
import { formatKwh, formatDate } from '../../utils/formatters';

/**
 * Market-wide open orders (all participants). Shows user, node, energy,
 * price, and status. `sideFilter` toggles SELL/BUY/ALL.
 */
export const OpenOrdersTable = ({
  orders = [],
  nodeCodeMap = {},
  currentUserId = null,
  sideFilter = '',
  onSideFilterChange,
}) => {
  const SIDE_TABS = [
    { value: '', label: 'All' },
    { value: 'offer', label: 'SELL offers' },
    { value: 'bid', label: 'BUY bids' },
  ];

  return (
    <Card
      title="Market Orders (All Participants)"
      subtitle="Live offers and bids currently open across the community"
      icon={Layers}
      action={
        <div className="flex items-center space-x-1.5">
          {SIDE_TABS.map((t) => (
            <button
              key={t.value || 'all'}
              onClick={() => onSideFilterChange?.(t.value)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                sideFilter === t.value
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      }
    >
      {orders.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="No active orders"
          description="Start the simulation or post an offer/bid to see market activity."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-4">Side</th>
                <th className="py-2.5 px-4">User</th>
                <th className="py-2.5 px-4">Node</th>
                <th className="py-2.5 px-4">Energy</th>
                <th className="py-2.5 px-4">Price</th>
                <th className="py-2.5 px-4">Status</th>
                <th className="py-2.5 px-4">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {orders.map((o) => {
                const isOffer = o.side === 'offer';
                const isMine = o.user_id === currentUserId;
                const filledPct =
                  o.quantity_kwh > 0 ? Math.round((o.filled_kwh / o.quantity_kwh) * 100) : 0;
                return (
                  <tr key={o.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-2.5 px-4">
                      <span
                        className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-bold ${
                          isOffer ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        {isOffer ? <Sun className="w-3 h-3" /> : <Zap className="w-3 h-3" />}
                        <span>{isOffer ? 'SELL' : 'BUY'}</span>
                      </span>
                    </td>
                    <td className="py-2.5 px-4 font-semibold text-slate-800">
                      {isMine ? (
                        <span className="text-emerald-700">You</span>
                      ) : (
                        <span className="font-mono text-[11px] text-slate-500">
                          {o.user_id?.slice(0, 8)}…
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 font-mono font-bold text-slate-700">
                      {nodeCodeMap[o.node_id] || o.node_id?.slice(0, 8) || '—'}
                    </td>
                    <td className="py-2.5 px-4">
                      <span className="font-bold text-slate-900">{formatKwh(o.remaining_kwh ?? o.quantity_kwh)}</span>
                      {filledPct > 0 && (
                        <span className="text-[10px] text-slate-400 ml-1">({filledPct}% filled)</span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 font-semibold text-slate-800">
                      ${Number(o.price_per_kwh || 0).toFixed(3)}/kWh
                    </td>
                    <td className="py-2.5 px-4">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          o.status === 'open'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {o.status?.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-slate-400">{formatDate(o.created_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
};

export default OpenOrdersTable;
