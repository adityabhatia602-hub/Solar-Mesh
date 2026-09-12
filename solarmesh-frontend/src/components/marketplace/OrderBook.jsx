import React from 'react';
import { formatCurrency, formatKwh } from '../../utils/formatters';
import { TrendingDown, TrendingUp, Layers, Sun, Zap } from 'lucide-react';

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
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden transition-colors duration-150">
      {/* Header */}
      <div className="p-4 sm:px-5 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center space-x-2.5">
          <div className="p-1.5 bg-slate-100 text-slate-700 rounded-lg">
            <Layers className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-800">Live Community Energy Listings</h3>
            <p className="text-[11px] text-slate-500">Real-time solar offers & buy requests • Click any row to prefill</p>
          </div>
        </div>

        {/* Spread & Midpoint Badge */}
        <div className="flex items-center space-x-3 text-xs">
          <div className="text-right">
            <span className="text-[10px] text-slate-400 block font-medium">Average Price</span>
            <span className="font-bold text-slate-800">{formatCurrency(midpoint, '$', 3)}/kWh</span>
          </div>
        </div>
      </div>

      {/* Column Headers */}
      <div className="grid grid-cols-3 px-4 py-2 bg-slate-50/80 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
        <span>Unit Price</span>
        <span className="text-right">Available Volume</span>
        <span className="text-right">Listings</span>
      </div>

      {/* Book Tables Container */}
      <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-100">
        {/* Offers (Solar for Sale) */}
        <div className="p-2 sm:p-3">
          <div className="flex items-center justify-between px-2 py-1 mb-1">
            <div className="flex items-center space-x-1.5 text-xs font-semibold text-amber-700">
              <Sun className="w-3.5 h-3.5 text-amber-600" />
              <span>Solar for Sale (Sellers)</span>
            </div>
            <span className="text-[10px] text-slate-400">Click to Buy</span>
          </div>

          {offers.length === 0 ? (
            <div className="py-8 text-center text-slate-400 text-xs italic">
              No active solar listings right now
            </div>
          ) : (
            <div className="space-y-1">
              {offers.slice(0, 8).map((o, idx) => {
                const depthPct = Math.min(100, Math.round((o.quantity_kwh / maxOverall) * 100));
                return (
                  <div
                    key={`offer-${o.price_per_kwh}-${idx}`}
                    onClick={() => onSelectPrice && onSelectPrice(o.price_per_kwh, 'bid')}
                    className="relative grid grid-cols-3 px-2 py-1.5 text-xs rounded-lg hover:bg-amber-50/60 cursor-pointer transition-colors group"
                    title={`Click to buy at $${o.price_per_kwh}/kWh`}
                  >
                    {/* Depth bar indicator */}
                    <div
                      className="absolute right-0 top-0 bottom-0 bg-amber-500/10 rounded-r-lg pointer-events-none transition-all duration-300"
                      style={{ width: `${depthPct}%` }}
                    />
                    <span className="font-semibold text-slate-800 z-10">
                      {formatCurrency(o.price_per_kwh, '$', 3)}/kWh
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

        {/* Bids (Energy Requests) */}
        <div className="p-2 sm:p-3">
          <div className="flex items-center justify-between px-2 py-1 mb-1">
            <div className="flex items-center space-x-1.5 text-xs font-semibold text-emerald-800">
              <Zap className="w-3.5 h-3.5 text-emerald-600" />
              <span>Energy Requests (Buyers)</span>
            </div>
            <span className="text-[10px] text-slate-400">Click to Sell</span>
          </div>

          {bids.length === 0 ? (
            <div className="py-8 text-center text-slate-400 text-xs italic">
              No active energy requests right now
            </div>
          ) : (
            <div className="space-y-1">
              {bids.slice(0, 8).map((b, idx) => {
                const depthPct = Math.min(100, Math.round((b.quantity_kwh / maxOverall) * 100));
                return (
                  <div
                    key={`bid-${b.price_per_kwh}-${idx}`}
                    onClick={() => onSelectPrice && onSelectPrice(b.price_per_kwh, 'offer')}
                    className="relative grid grid-cols-3 px-2 py-1.5 text-xs rounded-lg hover:bg-emerald-50/60 cursor-pointer transition-colors group"
                    title={`Click to sell at $${b.price_per_kwh}/kWh`}
                  >
                    {/* Depth bar indicator */}
                    <div
                      className="absolute right-0 top-0 bottom-0 bg-emerald-500/10 rounded-r-lg pointer-events-none transition-all duration-300"
                      style={{ width: `${depthPct}%` }}
                    />
                    <span className="font-semibold text-emerald-800 z-10">
                      {formatCurrency(b.price_per_kwh, '$', 3)}/kWh
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
