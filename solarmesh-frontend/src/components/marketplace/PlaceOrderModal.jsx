import React, { useState, useEffect } from 'react';
import { Sun, Zap, AlertCircle, ChevronDown, ChevronUp, Sparkles, Check } from 'lucide-react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import { marketApi } from '../../api/market';
import { gridApi } from '../../api/grid';
import { useToast } from '../../hooks/useToast';
import { formatCurrency, formatKwh } from '../../utils/formatters';

export const PlaceOrderModal = ({
  isOpen,
  onClose,
  onOrderPlaced,
  initialSide = 'offer',
  initialPrice = '',
  initialQuantity = '',
}) => {
  const [side, setSide] = useState(initialSide);
  const [nodes, setNodes] = useState([]);
  const [nodeId, setNodeId] = useState('');
  const [pricePerKwh, setPricePerKwh] = useState(initialPrice || '0.15');
  const [quantityKwh, setQuantityKwh] = useState(initialQuantity || '5.0');
  const [expiresInHours, setExpiresInHours] = useState('48');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const toast = useToast();

  // Sync initial side and price when modal opens
  useEffect(() => {
    if (isOpen) {
      setSide(initialSide);
      if (initialPrice) setPricePerKwh(initialPrice);
      if (initialQuantity) setQuantityKwh(initialQuantity);
      setError(null);
    }
  }, [isOpen, initialSide, initialPrice, initialQuantity]);

  // Load grid nodes for selection & auto-assign
  useEffect(() => {
    if (!isOpen) return;
    const fetchNodes = async () => {
      try {
        const [nodeList, myDevices] = await Promise.all([
          gridApi.getNodes().catch(() => []),
          gridApi.getMyDevices().catch(() => []),
        ]);
        setNodes(nodeList);

        // Auto-assign to user's registered device node if available, else first node
        if (myDevices && myDevices.length > 0 && myDevices[0].node_id) {
          setNodeId(myDevices[0].node_id);
        } else if (nodeList.length > 0 && !nodeId) {
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
  const deliveryFee = numQty * 0.015;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!nodeId) {
      setError('A valid neighborhood grid connection is required.');
      return;
    }
    if (numPrice <= 0) {
      setError('Price per kWh must be greater than $0.00');
      return;
    }
    if (numQty <= 0) {
      setError('Quantity must be greater than 0 kWh');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const res = await marketApi.placeOrder({
        side,
        price_per_kwh: numPrice,
        quantity_kwh: numQty,
        node_id: nodeId,
        expires_in_hours: Number(expiresInHours),
      });

      toast.success(
        `Posted: ${side === 'offer' ? 'Selling' : 'Buying'} ${formatKwh(numQty)} @ ${formatCurrency(numPrice)}/kWh`
      );

      if (onOrderPlaced) onOrderPlaced(res);
      onClose();
    } catch (err) {
      const msg = err.response?.data?.detail || err.message || 'Failed to submit order';
      setError(msg);
      toast.error('Order error: ' + msg);
    } finally {
      setLoading(false);
    }
  };

  const selectedNodeObj = nodes.find((n) => n.id === nodeId);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={side === 'offer' ? 'Sell Excess Solar Energy' : 'Buy Local Clean Energy'}
      subtitle={
        side === 'offer'
          ? 'Share your rooftop solar power with neighborhood homes and earn money'
          : 'Purchase renewable solar electricity directly from nearby solar homes'
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
        <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-xl border border-slate-200/60">
          <button
            type="button"
            onClick={() => setSide('offer')}
            className={`flex items-center justify-center space-x-2 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              side === 'offer'
                ? 'bg-white text-slate-900 shadow-2xs border border-slate-200/80'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <Sun className="w-3.5 h-3.5 text-amber-600" />
            <span>Sell Solar Energy</span>
          </button>
          <button
            type="button"
            onClick={() => setSide('bid')}
            className={`flex items-center justify-center space-x-2 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              side === 'bid'
                ? 'bg-white text-slate-900 shadow-2xs border border-slate-200/80'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <Zap className="w-3.5 h-3.5 text-emerald-600" />
            <span>Buy Clean Energy</span>
          </button>
        </div>

        {/* Energy Quantity & Quick Presets */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-semibold text-slate-700">
              Energy Quantity (kWh)
            </label>
            <span className="text-[11px] text-slate-400">
              {side === 'offer' ? 'Amount to sell' : 'Amount needed'}
            </span>
          </div>
          <div className="relative">
            <input
              type="number"
              step="0.1"
              min="0.1"
              max="5000"
              value={quantityKwh}
              onChange={(e) => setQuantityKwh(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 bg-white text-slate-900 rounded-lg text-xs font-semibold focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              placeholder="5.0"
              required
            />
            <span className="absolute right-3 top-2 text-slate-400 text-xs font-bold">kWh</span>
          </div>

          {/* Quick Quantity Buttons */}
          <div className="flex items-center space-x-2 mt-2">
            <span className="text-[10px] font-semibold text-slate-400">Quick set:</span>
            {['2.5', '5.0', '10.0', '15.0'].map((qty) => (
              <button
                key={qty}
                type="button"
                onClick={() => setQuantityKwh(qty)}
                className={`px-2 py-0.5 rounded text-[11px] font-medium border transition-colors cursor-pointer ${
                  quantityKwh === qty
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {qty} kWh
              </button>
            ))}
          </div>
        </div>

        {/* Price & Reference Comparison */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-semibold text-slate-700">
              Unit Price ($/kWh)
            </label>
            <span className="text-[11px] text-slate-500 font-medium">
              Utility Grid Tariff: ~$0.28/kWh
            </span>
          </div>
          <div className="relative">
            <span className="absolute left-3 top-2 text-slate-400 text-xs font-bold">$</span>
            <input
              type="number"
              step="0.001"
              min="0.01"
              max="2.00"
              value={pricePerKwh}
              onChange={(e) => setPricePerKwh(e.target.value)}
              className="w-full pl-7 pr-3 py-2 border border-slate-300 bg-white text-slate-900 rounded-lg text-xs font-semibold focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              placeholder="0.15"
              required
            />
          </div>

          {/* Quick Price Strategy Presets */}
          <div className="grid grid-cols-3 gap-2 mt-2">
            <button
              type="button"
              onClick={() => setPricePerKwh('0.14')}
              className={`p-1.5 rounded-lg border text-left transition-colors cursor-pointer ${
                pricePerKwh === '0.14'
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                  : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
            >
              <span className="text-[10px] font-bold block">⚡ Fast Match</span>
              <span className="text-[10px] text-slate-500">$0.14/kWh</span>
            </button>

            <button
              type="button"
              onClick={() => setPricePerKwh('0.18')}
              className={`p-1.5 rounded-lg border text-left transition-colors cursor-pointer ${
                pricePerKwh === '0.18'
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                  : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
            >
              <span className="text-[10px] font-bold block">⚖️ Fair Market</span>
              <span className="text-[10px] text-slate-500">$0.18/kWh</span>
            </button>

            <button
              type="button"
              onClick={() => setPricePerKwh('0.22')}
              className={`p-1.5 rounded-lg border text-left transition-colors cursor-pointer ${
                pricePerKwh === '0.22'
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                  : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
            >
              <span className="text-[10px] font-bold block">💎 Peak Value</span>
              <span className="text-[10px] text-slate-500">$0.22/kWh</span>
            </button>
          </div>
        </div>

        {/* Financial Summary Card */}
        <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5 text-xs">
          <div className="flex justify-between text-slate-600">
            <span>{side === 'offer' ? 'Energy Sale Value:' : 'Base Energy Cost:'}</span>
            <span className="font-semibold text-slate-900">{formatCurrency(totalValue)}</span>
          </div>
          <div className="flex justify-between text-slate-600">
            <span>Estimated Grid Delivery Fee:</span>
            <span className="font-semibold text-emerald-700">~{formatCurrency(deliveryFee)}</span>
          </div>
          <div className="pt-1.5 border-t border-slate-200/80 flex justify-between font-bold text-slate-900">
            <span>{side === 'offer' ? 'Estimated Total Earnings:' : 'Estimated Total Cost:'}</span>
            <span className="text-emerald-700 text-sm">
              {formatCurrency(side === 'offer' ? Math.max(0, totalValue - deliveryFee) : totalValue + deliveryFee)}
            </span>
          </div>
        </div>

        {/* Collapsible Advanced Settings (Node Selection & Expiry) */}
        <div className="border-t border-slate-100 pt-2">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center justify-between w-full py-1 text-[11px] font-semibold text-slate-500 hover:text-slate-800 cursor-pointer"
          >
            <span>
              ⚙️ Advanced Grid Settings ({selectedNodeObj ? selectedNodeObj.name : 'Auto-detected'})
            </span>
            {showAdvanced ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>

          {showAdvanced && (
            <div className="pt-3 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Grid Interconnection Substation
                </label>
                <select
                  value={nodeId}
                  onChange={(e) => setNodeId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 bg-white text-slate-900 rounded-lg text-xs font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                >
                  {nodes.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.code} — {n.name} ({n.region})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Order Validity Duration
                </label>
                <select
                  value={expiresInHours}
                  onChange={(e) => setExpiresInHours(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 bg-white text-slate-900 rounded-lg text-xs font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                >
                  <option value="12">12 Hours</option>
                  <option value="24">24 Hours (1 Day)</option>
                  <option value="48">48 Hours (2 Days - Standard)</option>
                  <option value="168">7 Days</option>
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end space-x-3 pt-3 border-t border-slate-100">
          <Button variant="secondary" onClick={onClose} type="button">
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            isLoading={loading}
          >
            {side === 'offer' ? 'Post Solar for Sale' : 'Submit Energy Order'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default PlaceOrderModal;
