import React, { useState } from 'react';
import {
  Blocks,
  CheckCircle2,
  ShieldCheck,
  Copy,
  Check,
  Layers,
  Cpu,
  Info,
} from 'lucide-react';
import {
  formatCurrency,
  formatKwh,
  formatDate,
  formatHash,
  pseudoTxHash,
  pseudoBlockHash,
} from '../../utils/formatters';
import { BLOCKCHAIN_CONFIG } from '../../utils/constants';
import { useToast } from '../../hooks/useToast';
import Badge from '../common/Badge';
import Modal from '../common/Modal';

export const BlockchainLedger = ({ trades = [] }) => {
  const [selectedTx, setSelectedTx] = useState(null);
  const [copiedHash, setCopiedHash] = useState(null);
  const toast = useToast();

  const handleCopy = (hash) => {
    navigator.clipboard.writeText(hash);
    setCopiedHash(hash);
    toast.success('Transaction hash copied to clipboard');
    setTimeout(() => setCopiedHash(null), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Informational Banner on Ledger Settlement Architecture */}
      <div className="p-5 rounded-2xl bg-slate-900 text-white border border-slate-800 shadow-2xs space-y-3">
        <div className="flex items-center space-x-2.5">
          <div className="p-2 bg-white/10 text-slate-300 rounded-xl">
            <Blocks className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">
              Automated Microgrid Settlement Ledger
            </h3>
            <p className="text-xs text-slate-400">
              Double-entry cryptographic ledger guaranteeing instantaneous prosumer payment upon verified smart meter telemetry.
            </p>
          </div>
        </div>

        {/* Technical Ledger Specs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 text-xs">
          <div className="p-2.5 rounded-xl bg-white/5 border border-white/10">
            <span className="text-[10px] text-slate-400 block">Consensus Protocol</span>
            <span className="font-bold text-white text-xs">{BLOCKCHAIN_CONFIG.CONSENSUS}</span>
          </div>
          <div className="p-2.5 rounded-xl bg-white/5 border border-white/10">
            <span className="text-[10px] text-slate-400 block">Settlement Finality</span>
            <span className="font-bold text-white text-xs">Sub-second (&lt;{BLOCKCHAIN_CONFIG.BLOCK_TIME_SEC}s)</span>
          </div>
          <div className="p-2.5 rounded-xl bg-white/5 border border-white/10">
            <span className="text-[10px] text-slate-400 block">Escrow Contract</span>
            <span className="font-mono font-bold text-emerald-400 text-xs">
              {formatHash(BLOCKCHAIN_CONFIG.SETTLEMENT_CONTRACT, 8, 6)}
            </span>
          </div>
          <div className="p-2.5 rounded-xl bg-white/5 border border-white/10">
            <span className="text-[10px] text-slate-400 block">Clearing Asset</span>
            <span className="font-bold text-slate-200 text-xs">USD-Mesh Stablecoin (USDM)</span>
          </div>
        </div>
      </div>

      {/* Transactions Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden transition-colors duration-150">
        <div className="p-4 sm:px-6 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <h4 className="text-sm font-bold text-slate-800">Verified Settlement Transaction Log</h4>
          </div>
          <Badge variant="emerald" dot>Instant Finality</Badge>
        </div>

        {trades.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-xs">
            No on-chain settlements recorded yet. Place orders and run matching to trigger escrow releases.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-200/80">
                <tr>
                  <th className="py-3 px-4">Tx Hash</th>
                  <th className="py-3 px-4">Block #</th>
                  <th className="py-3 px-4">Trade Ref</th>
                  <th className="py-3 px-4">Energy Volume</th>
                  <th className="py-3 px-4">Settled Amount</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Audit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {trades.map((trade, idx) => {
                  const txHash = pseudoTxHash(trade.id);
                  const blockNum = 184920 + idx * 3;

                  return (
                    <tr key={`${trade.id || 'tx'}-${idx}`} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3 px-4 font-semibold text-indigo-600 flex items-center space-x-1.5">
                        <span>{formatHash(txHash, 8, 6)}</span>
                        <button
                          onClick={() => handleCopy(txHash)}
                          className="text-slate-400 hover:text-slate-700 p-0.5 cursor-pointer"
                          title="Copy full hash"
                        >
                          {copiedHash === txHash ? (
                            <Check className="w-3 h-3 text-emerald-600" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </td>
                      <td className="py-3 px-4 text-slate-800 font-bold">
                        #{blockNum}
                      </td>
                      <td className="py-3 px-4 text-slate-500 font-sans">
                        Trade #{trade.id?.slice(0, 8)}
                      </td>
                      <td className="py-3 px-4 font-sans font-semibold text-slate-700">
                        {formatKwh(trade.quantity_kwh, 1)}
                      </td>
                      <td className="py-3 px-4 font-sans font-bold text-emerald-700">
                        {formatCurrency(trade.total_amount)}
                      </td>
                      <td className="py-3 px-4 font-sans">
                        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-transparent">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          <span>Confirmed</span>
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-sans">
                        <button
                          onClick={() => setSelectedTx({ trade, txHash, blockNum })}
                          className="px-2.5 py-1 text-xs rounded-lg text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-transparent transition-colors font-medium cursor-pointer"
                        >
                          View Receipt
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Raw Payload Inspection Modal */}
      {selectedTx && (
        <Modal
          isOpen={!!selectedTx}
          onClose={() => setSelectedTx(null)}
          title="Settlement Transaction Receipt"
          subtitle={`Verified on SolarMesh Private Rollup (Chain ID ${BLOCKCHAIN_CONFIG.CHAIN_ID})`}
          maxWidth="max-w-xl"
        >
          <div className="space-y-4 font-mono text-xs">
            <div className="p-3.5 bg-slate-900 rounded-xl text-slate-300 space-y-2 overflow-x-auto border border-transparent">
              <div>
                <span className="text-slate-500">Transaction Hash:</span>
                <div className="text-indigo-400 font-bold break-all flex items-center justify-between">
                  <span>{selectedTx.txHash}</span>
                  <button
                    onClick={() => handleCopy(selectedTx.txHash)}
                    className="text-slate-400 hover:text-white ml-2 shrink-0 cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div>
                <span className="text-slate-500">Block Number:</span>
                <div className="text-white font-bold">#{selectedTx.blockNum}</div>
              </div>
              <div>
                <span className="text-slate-500">Contract Address:</span>
                <div className="text-emerald-400 break-all">{BLOCKCHAIN_CONFIG.SETTLEMENT_CONTRACT}</div>
              </div>
              <div>
                <span className="text-slate-500">Gas & Wheeling Subsidy:</span>
                <div className="text-white">Zero-fee microgrid subsidy applied</div>
              </div>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5 font-sans">
              <span className="text-xs font-bold text-slate-800 block">Settlement Event Signatures:</span>
              <div className="text-xs text-slate-600 font-mono space-y-1">
                <div className="p-2 bg-white rounded border border-slate-200">
                  <span className="text-emerald-600 font-bold">event EnergyDelivered(</span>
                  <div>&nbsp;&nbsp;seller: {selectedTx.trade.seller_id?.slice(0, 10)}...,</div>
                  <div>&nbsp;&nbsp;buyer: {selectedTx.trade.buyer_id?.slice(0, 10)}...,</div>
                  <div>&nbsp;&nbsp;kwh: {selectedTx.trade.quantity_kwh},</div>
                  <div>&nbsp;&nbsp;wheeling_fee: {selectedTx.trade.network_cost_per_kwh}</div>
                  <span className="text-emerald-600 font-bold">)</span>
                </div>

                <div className="p-2 bg-white rounded border border-slate-200">
                  <span className="text-indigo-600 font-bold">event PaymentEscrowReleased(</span>
                  <div>&nbsp;&nbsp;amount_usdm: {selectedTx.trade.total_amount},</div>
                  <div>&nbsp;&nbsp;disbursed_to_seller: true</div>
                  <span className="text-indigo-600 font-bold">)</span>
                </div>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default BlockchainLedger;
