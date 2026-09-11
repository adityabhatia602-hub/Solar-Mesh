import React from 'react';
import { formatCurrency, formatKwh } from '../../utils/formatters';
import { TrendingDown, TrendingUp, Layers } from 'lucide-react';

export const OrderBook = ({ orderBook, onSelectPrice }) => {
  const bids = orderBook?.bids || [];
  const offers = orderBook?.offers || [];
  const spread = orderBook?.spread ?? 0;
  const midpoint = orderBook?.midpoint ?? 0;

  // Compute maximum quantity for depth bars
  const maxBidQty = Math.max(...bids.map((b) => b.quantity_kwh), 1);
  const maxOfferQty = Math.max(...offers.map((o) => o.quantity_kwh), 1);
  const maxOverall = Math.max(maxBidQty, maxOfferQty, 1);

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
      {/* Header */}
      <div className="p-4 sm:px-5 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center space-x-2.5">
          <div className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg">
            <Layers className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-800">Decentralized Order Book</h3>
            <p className="text-[11px] text-slate-500">Continuous double-auction depth chart</p>
          </div>
        </div>

        {/* Spread & Midpoint Badge */}
        <div className="flex items-center space-x-3 text-xs">
          <div className="text-right">
            <span className="text-[10px] text-slate-400 block">Midpoint</span>
            <span className="font-bold text-slate-800">{formatCurrency(midpoint, '$', 3)}</span>
          </div>
          <div className="text-right pl-3 border-l border-slate-200">
            <span className="text-[10px] text-slate-400 block">Spread</span>
            <span className="font-bold text-emerald-600">{formatCurrency(spread, '$', 3)}</span>
          </div>
        </div>
      </div>

      {/* Column Headers */}
      <div className="grid grid-cols-3 px-4 py-2 bg-slate-50/80 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
        <span>Price ($/kWh)</span>
        <span className="text-right">Volume (kWh)</span>
        <span className="text-right">Orders</span>
      </div>

      {/* Book Tables Container */}
      <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-100">
        {/* Offers (Sell Surplus) */}
        <div className="p-2 sm:p-3">
          <div className="flex items-center space-x-1.5 px-2 py-1 text-xs font-bold text-rose-600 mb-1">
            <TrendingDown className="w-3.5 h-3.5" />
            <span>Asks / Sell Offers (Solar Prosumers)</span>
          </div>

          {offers.length === 0 ? (
            <div className="py-8 text-center text-slate-400 text-xs italic">
              No active sell offers on the mesh
            </div>
          ) : (
            <div className="space-y-1">
              {offers.slice(0, 8).map((o, idx) => {
                const depthPct = Math.min(100, Math.round((o.quantity_kwh / maxOverall) * 100));
                return (
                  <div
                    key={`offer-${idx}`}
                    onClick={() => onSelectPrice && onSelectPrice(o.price_per_kwh, 'bid')}
                    className="relative grid grid-cols-3 px-2 py-1.5 text-xs rounded-md hover:bg-rose-50/60 cursor-pointer transition-colors group"
                  >
                    {/* Depth bar indicator */}
                    <div
                      className="absolute right-0 top-0 bottom-0 bg-rose-100/40 rounded-r-md pointer-events-none transition-all duration-300"
                      style={{ width: `${depthPct}%` }}
                    />
                    <span className="font-bold text-rose-600 z-10">
                      {formatCurrency(o.price_per_kwh, '$', 3)}
                    </span>
                    <span className="text-right font-medium text-slate-700 z-10">
                      {formatKwh(o.quantity_kwh, 1)}
                    </span>
                    <span className="text-right text-slate-400 font-medium z-10">
                      {o.order_count}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Bids (Buy Clean Energy) */}
        <div className="p-2 sm:p-3">
          <div className="flex items-center space-x-1.5 px-2 py-1 text-xs font-bold text-emerald-600 mb-1">
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Bids / Buy Demand (Consumers)</span>
          </div>

          {bids.length === 0 ? (
            <div className="py-8 text-center text-slate-400 text-xs italic">
              No active buy bids on the mesh
            </div>
          ) : (
            <div className="space-y-1">
              {bids.slice(0, 8).map((b, idx) => {
                const depthPct = Math.min(100, Math.round((b.quantity_kwh / maxOverall) * 100));
                return (
                  <div
                    key={`bid-${idx}`}
                    onClick={() => onSelectPrice && onSelectPrice(b.price_per_kwh, 'offer')}
                    className="relative grid grid-cols-3 px-2 py-1.5 text-xs rounded-md hover:bg-emerald-50/60 cursor-pointer transition-colors group"
                  >
                    {/* Depth bar indicator */}
                    <div
                      className="absolute right-0 top-0 bottom-0 bg-emerald-100/40 rounded-r-md pointer-events-none transition-all duration-300"
                      style={{ width: `${depthPct}%` }}
                    />
                    <span className="font-bold text-emerald-600 z-10">
                      {formatCurrency(b.price_per_kwh, '$', 3)}
                    </span>
                    <span className="text-right font-medium text-slate-700 z-10">
                      {formatKwh(b.quantity_kwh, 1)}
                    </span>
                    <span className="text-right text-slate-400 font-medium z-10">
                      {b.order_count}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default OrderBook;
