import React from 'react';
import { Zap, RefreshCw, Layers, ArrowUpRight, Activity } from 'lucide-react';
import { formatRelativeTime, formatCurrency, formatKwh } from '../../utils/formatters';

export const LiveActivityFeed = ({ events = [] }) => {
  if (events.length === 0) {
    return (
      <div className="p-6 text-center text-slate-400 text-xs bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
        <Activity className="w-5 h-5 mx-auto mb-2 opacity-50" />
        <span>Waiting for live grid and market events...</span>
      </div>
    );
  }

  const renderEventBadge = (type) => {
    switch (type) {
      case 'trade':
        return (
          <div className="p-1.5 rounded-lg bg-emerald-100 text-emerald-700 shrink-0">
            <Zap className="w-3.5 h-3.5" />
          </div>
        );
      case 'order_created':
        return (
          <div className="p-1.5 rounded-lg bg-blue-100 text-blue-700 shrink-0">
            <Layers className="w-3.5 h-3.5" />
          </div>
        );
      case 'grid_update':
      case 'trade_settled':
        return (
          <div className="p-1.5 rounded-lg bg-purple-100 text-purple-700 shrink-0">
            <RefreshCw className="w-3.5 h-3.5" />
          </div>
        );
      default:
        return (
          <div className="p-1.5 rounded-lg bg-amber-100 text-amber-700 shrink-0">
            <Activity className="w-3.5 h-3.5" />
          </div>
        );
    }
  };

  const formatEventText = (event) => {
    if (event.type === 'trade') {
      const d = event.data || {};
      return (
        <div>
          <span className="font-semibold text-slate-800">Trade Executed: </span>
          <span className="text-emerald-600 font-bold">{formatKwh(d.quantity_kwh)}</span>
          <span className="text-slate-500"> @ </span>
          <span className="text-slate-900 font-semibold">{formatCurrency(d.price_per_kwh)}/kWh</span>
          <div className="text-[11px] text-slate-400 mt-0.5">
            Total {formatCurrency(d.total_amount)} • Network Fee: {formatCurrency(d.network_cost_per_kwh)}/kWh
          </div>
        </div>
      );
    }
    if (event.type === 'order_created') {
      const d = event.data || {};
      return (
        <div>
          <span className="font-semibold text-slate-800">New {d.side?.toUpperCase()} Order: </span>
          <span className="text-slate-700 font-medium">{formatKwh(d.quantity_kwh)}</span>
          <span className="text-slate-500"> @ </span>
          <span className="text-slate-900 font-semibold">{formatCurrency(d.price_per_kwh)}/kWh</span>
        </div>
      );
    }
    if (event.type === 'grid_update') {
      return (
        <div>
          <span className="font-semibold text-purple-800">Grid Recalibration: </span>
          <span className="text-slate-600">Updated line loads & congestion indices</span>
        </div>
      );
    }
    if (event.type === 'telemetry') {
      const d = event.data || {};
      return (
        <div>
          <span className="font-semibold text-amber-800">Smart Meter Telemetry: </span>
          <span className="text-slate-600">Gen {formatKwh(d.production_kwh)} | Load {formatKwh(d.consumption_kwh)}</span>
        </div>
      );
    }
    return <span className="text-slate-700 font-medium">{JSON.stringify(event)}</span>;
  };

  return (
    <div className="divide-y divide-slate-100 max-h-[360px] overflow-y-auto">
      {events.map((evt) => (
        <div key={evt.id} className="py-3 px-1 flex items-start space-x-3 text-xs">
          {renderEventBadge(evt.type)}
          <div className="flex-1 min-w-0">{formatEventText(evt)}</div>
          <span className="text-[10px] text-slate-400 shrink-0 font-medium">
            {formatRelativeTime(evt.timestamp)}
          </span>
        </div>
      ))}
    </div>
  );
};

export default LiveActivityFeed;
