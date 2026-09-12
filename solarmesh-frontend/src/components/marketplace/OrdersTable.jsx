import React from 'react';
import { formatCurrency, formatKwh, formatDate } from '../../utils/formatters';
import Badge from '../common/Badge';
import Button from '../common/Button';
import { XCircle, Clock } from 'lucide-react';

export const OrdersTable = ({ orders = [], onCancelOrder, cancellingId }) => {
  if (orders.length === 0) {
    return (
      <div className="py-12 text-center text-slate-400 text-xs bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
        <Clock className="w-6 h-6 mx-auto mb-2 opacity-50" />
        <span>No listings or orders recorded for your account.</span>
      </div>
    );
  }

  const getStatusBadge = (status) => {
    switch (status) {
      case 'open':
        return <Badge variant="slate" dot>Active</Badge>;
      case 'filled':
        return <Badge variant="emerald" dot>Completed</Badge>;
      case 'partially_filled':
        return <Badge variant="amber" dot>Partial</Badge>;
      case 'cancelled':
        return <Badge variant="rose">Cancelled</Badge>;
      default:
        return <Badge variant="slate">{status}</Badge>;
    }
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs text-slate-600">
        <thead className="bg-slate-50/80 text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-200/80">
          <tr>
            <th className="py-3 px-4">Listing Type</th>
            <th className="py-3 px-4">Price (₹/kWh)</th>
            <th className="py-3 px-4">Energy Amount</th>
            <th className="py-3 px-4">Fill Progress</th>
            <th className="py-3 px-4">Status</th>
            <th className="py-3 px-4">Placed At</th>
            <th className="py-3 px-4 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {orders.map((order) => {
            const fillPct = order.quantity_kwh > 0
              ? Math.min(100, Math.round((order.filled_kwh / order.quantity_kwh) * 100))
              : 0;

            return (
              <tr key={order.id} className="hover:bg-slate-50/60 transition-colors">
                <td className="py-3 px-4">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold tracking-wider ${
                      order.side === 'offer'
                        ? 'bg-amber-50 text-amber-800 border border-amber-200/60'
                        : 'bg-emerald-50 text-emerald-800 border border-emerald-200/60'
                    }`}
                  >
                    {order.side === 'offer' ? '☀️ Selling Solar' : '⚡️ Buying Energy'}
                  </span>
                </td>
                <td className="py-3 px-4 font-bold text-slate-800">
                  {formatCurrency(order.price_per_kwh, '₹', 3)}
                </td>
                <td className="py-3 px-4 font-semibold text-slate-700">
                  {formatKwh(order.quantity_kwh, 1)}
                </td>
                <td className="py-3 px-4">
                  <div className="w-28">
                    <div className="flex justify-between text-[10px] text-slate-500 mb-1">
                      <span>{fillPct}%</span>
                      <span>{formatKwh(order.filled_kwh, 1)}</span>
                    </div>
                    <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-emerald-600 h-full rounded-full transition-all duration-300"
                        style={{ width: `${fillPct}%` }}
                      />
                    </div>
                  </div>
                </td>
                <td className="py-3 px-4">{getStatusBadge(order.status)}</td>
                <td className="py-3 px-4 text-slate-500">{formatDate(order.created_at)}</td>
                <td className="py-3 px-4 text-right">
                  {order.status === 'open' && (
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => onCancelOrder && onCancelOrder(order.id)}
                      isLoading={cancellingId === order.id}
                      className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 cursor-pointer"
                      icon={XCircle}
                    >
                      Cancel
                    </Button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default OrdersTable;
