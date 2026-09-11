import React, { useState, useEffect } from 'react';
import { Sun, Zap, Check, AlertCircle, Info, ShieldCheck } from 'lucide-react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import { marketApi } from '../../api/market';
import { gridApi } from '../../api/grid';
import { formatCurrency } from '../../utils/formatters';

export const PlaceOrderModal = ({
  isOpen,
  onClose,
  onOrderPlaced,
  initialSide = 'offer',
  initialPrice = '',
}) => {
  const [side, setSide] = useState(initialSide);
  const [nodes, setNodes] = useState([]);
  const [nodeId, setNodeId] = useState('');
  const [pricePerKwh, setPricePerKwh] = useState(initialPrice || '0.18');
  const [quantityKwh, setQuantityKwh] = useState('10');
  const [expiresInHours, setExpiresInHours] = useState('48');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Sync initial side and price when modal opens
  useEffect(() => {
    if (isOpen) {
      setSide(initialSide);
      if (initialPrice) setPricePerKwh(initialPrice);
      setError(null);
    }
  }, [isOpen, initialSide, initialPrice]);

  // Load grid nodes for selection
  useEffect(() => {
    if (!isOpen) return;
    const fetchNodes = async () => {
      try {
        const nodeList = await gridApi.getNodes();
        setNodes(nodeList);
        if (nodeList.length > 0 && !nodeId) {
          setNodeId(nodeList[0].id);
        }
      } catch (err) {
        console.error('Failed to load grid nodes:', err);
      }
    };
    fetchNodes();
  }, [isOpen, nodeId]);

  const numPrice = Number(pricePerKwh) || 0;
  const numQty = Number(quantityKwh) || 0;
  const totalValue = numPrice * numQty;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!nodeId) {
      setError('Please select a valid grid node connection');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await marketApi.placeOrder({
        side,
        price_per_kwh: numPrice,
        quantity_kwh: numQty,
        node_id: nodeId,
        expires_in_hours: Number(expiresInHours),
      });

      if (onOrderPlaced) onOrderPlaced();
      onClose();
    } catch (err) {
      const msg = err.response?.data?.detail || err.message || 'Failed to submit order';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={side === 'offer' ? 'Post Solar Energy Offer' : 'Place Clean Energy Bid'}
      subtitle={
        side === 'offer'
          ? 'Sell surplus rooftop solar power to local community peers'
          : 'Purchase clean solar electricity directly from neighboring prosumers'
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs font-semibold text-rose-800 flex items-start space-x-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Order Side Selector Tabs */}
        <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-xl">
          <button
            type="button"
            onClick={() => setSide('offer')}
            className={`flex items-center justify-center space-x-2 py-2 rounded-lg text-xs font-bold transition-all ${
              side === 'offer'
                ? 'bg-amber-500 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Sun className="w-3.5 h-3.5" />
            <span>Sell Solar (Offer)</span>
          </button>
          <button
            type="button"
            onClick={() => setSide('bid')}
            className={`flex items-center justify-center space-x-2 py-2 rounded-lg text-xs font-bold transition-all ${
              side === 'bid'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Buy Energy (Bid)</span>
          </button>
        </div>

        {/* Grid Node Selection */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Interconnection Grid Node
          </label>
          <select
            value={nodeId}
            onChange={(e) => setNodeId(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-medium bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            required
          >
            {nodes.map((n) => (
              <option key={n.id} value={n.id}>
                {n.code} — {n.name} ({n.region}, Congestion: {(n.congestion_level * 100).toFixed(0)}%)
              </option>
            ))}
          </select>
          <p className="text-[11px] text-slate-400 mt-1">
            Physical substation node used to calculate transmission loss and dynamic line fees.
          </p>
        </div>

        {/* Price & Quantity Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Unit Price ($/kWh)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2 text-slate-400 text-xs font-bold">$</span>
              <input
                type="number"
                step="0.001"
                min="0.01"
                max="2.00"
                value={pricePerKwh}
                onChange={(e) => setPricePerKwh(e.target.value)}
                className="w-full pl-7 pr-3 py-2 border border-slate-300 rounded-lg text-xs font-semibold focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                placeholder="0.18"
                required
              />
            </div>
            <span className="text-[10px] text-slate-400 mt-1 block">Utility tariff: ~$0.28/kWh</span>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Energy Quantity (kWh)
            </label>
            <div className="relative">
              <input
                type="number"
                step="0.1"
                min="0.1"
                max="5000"
                value={quantityKwh}
                onChange={(e) => setQuantityKwh(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-semibold focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                placeholder="10.0"
                required
              />
              <span className="absolute right-3 top-2 text-slate-400 text-xs font-bold">kWh</span>
            </div>
          </div>
        </div>

        {/* Order Expiry */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Order Validity
          </label>
          <select
            value={expiresInHours}
            onChange={(e) => setExpiresInHours(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-medium bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
          >
            <option value="12">12 Hours</option>
            <option value="24">24 Hours (Day Ahead)</option>
            <option value="48">48 Hours (Standard)</option>
            <option value="168">7 Days</option>
          </select>
        </div>

        {/* Calculation Summary Card */}
        <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5 text-xs">
          <div className="flex justify-between text-slate-600">
            <span>Base Energy Value:</span>
            <span className="font-semibold text-slate-900">{formatCurrency(totalValue)}</span>
          </div>
          <div className="flex justify-between text-slate-600">
            <span>Grid Transmission Estimate:</span>
            <span className="font-semibold text-emerald-600">~{formatCurrency(numQty * 0.015)}</span>
          </div>
          <div className="pt-1.5 border-t border-slate-200/80 flex justify-between font-bold text-slate-900">
            <span>Estimated Total:</span>
            <span className="text-emerald-700 text-sm">
              {formatCurrency(totalValue + numQty * 0.015)}
            </span>
          </div>
        </div>

        {/* Submit Actions */}
        <div className="flex justify-end space-x-3 pt-3 border-t border-slate-100">
          <Button variant="secondary" onClick={onClose} type="button">
            Cancel
          </Button>
          <Button
            type="submit"
            variant={side === 'offer' ? 'amber' : 'primary'}
            isLoading={loading}
          >
            {side === 'offer' ? 'Publish Solar Offer' : 'Submit Energy Bid'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default PlaceOrderModal;
