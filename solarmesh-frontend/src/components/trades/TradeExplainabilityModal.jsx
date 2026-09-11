import React from 'react';
import { HelpCircle, ArrowRight, ShieldCheck, Zap, DollarSign, Activity, FileCode } from 'lucide-react';
import Modal from '../common/Modal';
import Badge from '../common/Badge';
import { formatCurrency, formatKwh, formatDate, pseudoTxHash } from '../../utils/formatters';
import { BLOCKCHAIN_CONFIG } from '../../utils/constants';

export const TradeExplainabilityModal = ({ trade, isOpen, onClose }) => {
  if (!trade) return null;

  const txHash = pseudoTxHash(trade.id);
  const pathNodes = trade.path_nodes || [];
  const baseEnergyAmount = (trade.quantity_kwh || 0) * (trade.price_per_kwh || 0);
  const networkCostTotal = (trade.quantity_kwh || 0) * (trade.network_cost_per_kwh || 0);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Trade Explainability & Settlement Audit"
      subtitle={`Detailed algorithmic matching rationale for Trade #${trade.id?.slice(0, 8)}`}
      maxWidth="max-w-2xl"
    >
      <div className="space-y-5 text-xs text-slate-600">
        {/* Top Summary Banner */}
        <div className="p-4 rounded-xl bg-slate-900 text-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 block">
              Execution Status: Settled
            </span>
            <div className="text-xl font-extrabold text-white mt-0.5">
              {formatKwh(trade.quantity_kwh)} @ {formatCurrency(trade.price_per_kwh)}/kWh
            </div>
            <span className="text-[11px] text-slate-400">Total Cleared Value: {formatCurrency(trade.total_amount)}</span>
          </div>

          <div className="text-left sm:text-right">
            <span className="text-[10px] text-slate-400 block">Settled On</span>
            <span className="font-semibold text-slate-200">{formatDate(trade.created_at)}</span>
          </div>
        </div>

        {/* 1. Algorithmic Matching Justification */}
        <div className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-200/80 space-y-2">
          <div className="flex items-center space-x-2 text-emerald-900 font-bold text-sm">
            <HelpCircle className="w-4 h-4 text-emerald-700" />
            <span>Why Was This Trade Matched?</span>
          </div>
          <p className="text-emerald-800 leading-relaxed">
            The SolarMesh double-auction algorithm selected this pair by maximizing overall social welfare.
            The buyer’s bid was sufficient to cover both the prosumer’s asking price and the physical transmission
            wheeling charge across intermediate substations, while remaining strictly within network line capacity limits.
          </p>
        </div>

        {/* 2. Physical Grid Flow Path */}
        <div className="space-y-2">
          <span className="font-bold text-slate-800 text-xs uppercase tracking-wider block">
            Physical Power Delivery Path:
          </span>
          {pathNodes.length > 0 ? (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center flex-wrap gap-2">
              {pathNodes.map((node, i) => (
                <React.Fragment key={i}>
                  <span className="px-3 py-1 bg-white border border-slate-300 rounded-lg font-mono font-bold text-slate-800 shadow-2xs">
                    Substation {node}
                  </span>
                  {i < pathNodes.length - 1 && (
                    <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  )}
                </React.Fragment>
              ))}
            </div>
          ) : (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-500 italic">
              Direct intra-substation bilateral delivery (0 hop transmission loss)
            </div>
          )}
        </div>

        {/* 3. Cost & Tariff Financial Breakdown */}
        <div className="space-y-2">
          <span className="font-bold text-slate-800 text-xs uppercase tracking-wider block">
            Financial & Settlement Breakdown:
          </span>
          <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
            <div className="flex justify-between p-3 bg-white">
              <span>Gross Energy Price (To Seller Prosumer):</span>
              <span className="font-bold text-slate-900">
                {formatCurrency(baseEnergyAmount)} ({formatCurrency(trade.price_per_kwh)}/kWh)
              </span>
            </div>
            <div className="flex justify-between p-3 bg-white">
              <span>Grid Operator Transmission Wheeling Fee:</span>
              <span className="font-bold text-emerald-700">
                +{formatCurrency(networkCostTotal)} ({formatCurrency(trade.network_cost_per_kwh)}/kWh)
              </span>
            </div>
            <div className="flex justify-between p-3 bg-slate-50 font-bold text-slate-900">
              <span>Total Debited from Buyer:</span>
              <span className="text-emerald-800 text-sm">{formatCurrency(trade.total_amount)}</span>
            </div>
          </div>
        </div>

        {/* 4. Blockchain Smart Contract Audit Proof */}
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
          <div className="flex items-center space-x-2 text-slate-800 font-bold">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Cryptographic Settlement Audit</span>
          </div>
          <div className="space-y-1 font-mono text-[11px] text-slate-500 break-all">
            <div>
              <span className="text-slate-400">Tx Hash: </span>
              <span className="text-slate-800 font-semibold">{txHash}</span>
            </div>
            <div>
              <span className="text-slate-400">Contract: </span>
              <span className="text-slate-800">{BLOCKCHAIN_CONFIG.SETTLEMENT_CONTRACT}</span>
            </div>
            <div>
              <span className="text-slate-400">Consensus: </span>
              <span className="text-slate-800">{BLOCKCHAIN_CONFIG.CONSENSUS}</span>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default TradeExplainabilityModal;
