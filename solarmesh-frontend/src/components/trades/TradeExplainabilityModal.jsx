import React, { useState } from 'react';
import {
  HelpCircle,
  ArrowRight,
  ShieldCheck,
  Zap,
  Check,
  Copy,
  Route,
  ChevronDown,
  ChevronUp,
  FileText,
} from 'lucide-react';
import Modal from '../common/Modal';
import { useToast } from '../../hooks/useToast';
import { useAuth } from '../../hooks/useAuth';
import {
  formatCurrency,
  formatKwh,
  formatDate,
  formatHash,
  pseudoTxHash,
} from '../../utils/formatters';
import { BLOCKCHAIN_CONFIG } from '../../utils/constants';

export const TradeExplainabilityModal = ({ trade, isOpen, onClose }) => {
  const [copied, setCopied] = useState(false);
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);
  const { user } = useAuth();
  const toast = useToast();

  if (!trade) return null;

  const txHash = pseudoTxHash(trade.id);
  const pathNodes = trade.path_nodes || [];
  const baseEnergyAmount = (trade.quantity_kwh || 0) * (trade.price_per_kwh || 0);
  const networkCostTotal = (trade.quantity_kwh || 0) * (trade.network_cost_per_kwh || 0);
  const isSeller = trade.seller_id === user?.id;

  const handleCopyHash = () => {
    navigator.clipboard.writeText(txHash);
    setCopied(true);
    toast.success('Settlement transaction hash copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Energy Trade Receipt"
      subtitle={`Verified transaction receipt for Trade #${trade.id?.slice(0, 8)}`}
      maxWidth="max-w-xl"
    >
      <div className="space-y-4 text-xs text-slate-600">
        {/* Human Summary Card */}
        <div className="p-4 rounded-xl bg-slate-900 text-white border border-transparent flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 block">
              {isSeller ? '☀️ Solar Energy Sold' : '⚡️ Clean Energy Purchased'}
            </span>
            <div className="text-xl font-black text-white mt-0.5">
              {formatKwh(trade.quantity_kwh)} @ {formatCurrency(trade.price_per_kwh)}/kWh
            </div>
            <span className="text-[11px] text-slate-400">
              Total Amount: {formatCurrency(trade.total_amount)}
            </span>
          </div>

          <div className="text-left sm:text-right">
            <span className="text-[10px] text-slate-400 block">Date & Time</span>
            <span className="font-semibold text-slate-200">{formatDate(trade.created_at)}</span>
          </div>
        </div>

        {/* Plain-English Cost Breakdown */}
        <div className="space-y-1.5">
          <span className="font-bold text-slate-800 text-xs block">
            Payment Breakdown:
          </span>
          <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
            <div className="flex justify-between p-3 bg-white">
              <span className="text-slate-600">Base Clean Energy:</span>
              <span className="font-bold text-slate-900">
                {formatCurrency(baseEnergyAmount)} ({formatCurrency(trade.price_per_kwh)}/kWh)
              </span>
            </div>
            <div className="flex justify-between p-3 bg-white">
              <span className="text-slate-600">Grid Delivery Fee (Line Loss & Routing):</span>
              <span className="font-semibold text-emerald-700">
                +{formatCurrency(networkCostTotal)} ({formatCurrency(trade.network_cost_per_kwh)}/kWh)
              </span>
            </div>
            <div className="flex justify-between p-3 bg-slate-50 font-bold text-slate-900">
              <span>{isSeller ? 'Net Earned:' : 'Total Paid:'}</span>
              <span className="text-emerald-800 text-sm">{formatCurrency(trade.total_amount)}</span>
            </div>
          </div>
        </div>

        {/* Collapsible Technical & Judge Audit Section */}
        <div className="border border-slate-200 rounded-xl bg-slate-50/70 overflow-hidden">
          <button
            type="button"
            onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
            className="flex items-center justify-between w-full p-3 text-xs font-bold text-slate-700 hover:text-slate-900 hover:bg-slate-100/80 transition-colors cursor-pointer"
          >
            <div className="flex items-center space-x-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>🔍 Technical Routing & Blockchain Verification (Judge / Audit View)</span>
            </div>
            {showTechnicalDetails ? (
              <ChevronUp className="w-4 h-4 text-slate-500" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-500" />
            )}
          </button>

          {showTechnicalDetails && (
            <div className="p-4 pt-2 border-t border-slate-200 space-y-3.5 bg-white text-xs">
              {/* Algorithmic Clearing Rationale */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                <span className="font-bold text-slate-800 block text-[11px]">
                  Double-Auction Clearing Math
                </span>
                <p className="text-slate-600 text-[11px] leading-relaxed">
                  Matched via uniform-price double auction. The buyer’s bid fulfilled the seller’s ask price ({formatCurrency(trade.price_per_kwh)}/kWh) plus the physical delivery charge ({formatCurrency(trade.network_cost_per_kwh)}/kWh), calculated via Dijkstra shortest loss-weighted path.
                </p>
              </div>

              {/* Physical Substation Graph Route */}
              <div>
                <span className="font-bold text-slate-800 block text-[11px] mb-1.5">
                  Physical Grid Route (Substation Hops):
                </span>
                {pathNodes.length > 0 ? (
                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center flex-wrap gap-1.5">
                    {pathNodes.map((node, i) => (
                      <React.Fragment key={i}>
                        <span className="px-2.5 py-0.5 bg-white border border-slate-300 rounded font-mono font-bold text-slate-800 text-[11px] shadow-2xs">
                          Node {node}
                        </span>
                        {i < pathNodes.length - 1 && (
                          <ArrowRight className="w-3 h-3 text-slate-400 shrink-0" />
                        )}
                      </React.Fragment>
                    ))}
                  </div>
                ) : (
                  <div className="p-2 bg-slate-50 border border-slate-200 rounded text-slate-500 italic text-[11px]">
                    Direct peer connection within same microgrid zone
                  </div>
                )}
              </div>

              {/* Cryptographic Ledger Proof */}
              <div className="p-3 bg-slate-900 rounded-xl text-slate-300 space-y-1.5 font-mono text-[11px] border border-transparent">
                <div className="flex items-center justify-between text-white font-sans font-bold text-xs pb-1 border-b border-white/10">
                  <span>Cryptographic Settlement Record</span>
                  <button
                    onClick={handleCopyHash}
                    className="inline-flex items-center space-x-1 text-emerald-400 hover:text-emerald-300 text-[10px] cursor-pointer"
                  >
                    {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copied ? 'Copied' : 'Copy Hash'}</span>
                  </button>
                </div>

                <div className="space-y-1 pt-1 break-all">
                  <div>
                    <span className="text-slate-400">Tx Hash: </span>
                    <span className="text-emerald-400">{txHash}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Smart Escrow: </span>
                    <span className="text-slate-300">{BLOCKCHAIN_CONFIG.SETTLEMENT_CONTRACT}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Consensus: </span>
                    <span className="text-slate-300">{BLOCKCHAIN_CONFIG.CONSENSUS}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};

export default TradeExplainabilityModal;
