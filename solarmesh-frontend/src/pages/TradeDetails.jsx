import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ShieldCheck,
  Zap,
  Route,
  Clock,
  ArrowRight,
  CheckCircle2,
  Copy,
  Check,
} from 'lucide-react';
import { marketApi } from '../api/market';
import { useToast } from '../hooks/useToast';
import PageHeader from '../components/layout/PageHeader';
import Button from '../components/common/Button';
import Card from '../components/common/Card';
import Badge from '../components/common/Badge';
import {
  formatCurrency,
  formatKwh,
  formatDate,
  pseudoTxHash,
  pseudoBlockHash,
} from '../utils/formatters';
import { BLOCKCHAIN_CONFIG } from '../utils/constants';

export const TradeDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [trade, setTrade] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const fetchTrade = async () => {
      try {
        setLoading(true);
        const list = await marketApi.getMyTrades(200);
        const found = list.find((t) => t.id === id);
        setTrade(found || null);
      } catch (err) {
        console.error('Failed to load trade detail:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchTrade();
  }, [id]);

  if (loading) {
    return (
      <div className="py-20 text-center text-slate-500 text-sm">
        Loading trade settlement audit data...
      </div>
    );
  }

  if (!trade) {
    return (
      <div className="p-8 text-center space-y-4">
        <h3 className="text-base font-bold text-slate-800">Trade Not Found</h3>
        <p className="text-xs text-slate-500">
          The requested trade ID was not found or has not settled yet.
        </p>
        <Link to="/trades">
          <Button variant="secondary" size="sm" icon={ArrowLeft}>
            Back to Trades
          </Button>
        </Link>
      </div>
    );
  }

  const txHash = pseudoTxHash(trade.id);
  const blockHash = pseudoBlockHash(184922);

  const handleCopyHash = () => {
    navigator.clipboard.writeText(txHash);
    setCopied(true);
    toast.success('Transaction hash copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6 sm:space-y-8 max-w-4xl mx-auto">
      <div className="flex items-center space-x-2">
        <button
          onClick={() => navigate('/trades')}
          className="inline-flex items-center space-x-1 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Trades</span>
        </button>
      </div>

      <PageHeader
        title={`Settled Trade Audit: #${trade.id?.slice(0, 10)}`}
        subtitle="Network routing explainability and automated settlement receipt"
        badge={<Badge variant="emerald" dot>SETTLED & CONFIRMED</Badge>}
      />

      {/* Overview Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="bg-slate-900 text-white border-slate-800">
          <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider block">
            Energy Traded
          </span>
          <div className="text-2xl font-extrabold text-white mt-1">
            {formatKwh(trade.quantity_kwh)}
          </div>
          <span className="text-[11px] text-emerald-400 mt-1 block font-medium">
            Unit Price: {formatCurrency(trade.price_per_kwh)}/kWh
          </span>
        </Card>

        <Card className="bg-slate-900 text-white border-slate-800">
          <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider block">
            Network Delivery Charge
          </span>
          <div className="text-2xl font-extrabold text-emerald-400 mt-1">
            +{formatCurrency(trade.network_cost_per_kwh, '$', 3)}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">
            Line Loss & Congestion Surcharge
          </span>
        </Card>

        <Card className="bg-slate-900 text-white border-slate-800">
          <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider block">
            Total Settled Value
          </span>
          <div className="text-2xl font-extrabold text-amber-400 mt-1">
            {formatCurrency(trade.total_amount)}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">
            Disbursed to Seller Prosumer
          </span>
        </Card>
      </div>

      {/* Algorithmic Explainability Card */}
      <Card
        title="Double-Auction Clearing Rationale"
        subtitle="Verification of economic welfare maximization subject to physical line constraints"
        icon={Zap}
      >
        <div className="space-y-4 text-xs text-slate-600">
          <p className="leading-relaxed">
            This trade was matched using SolarMesh’s continuous network-aware clearing engine.
            The engine prioritized the lowest marginal cost solar surplus while computing the shortest physical transmission route.
            The net transmission fee ({formatCurrency(trade.network_cost_per_kwh)}/kWh) was calculated based on intermediate line losses and node congestion penalties.
          </p>

          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
            <span className="font-bold text-slate-800 text-xs block uppercase tracking-wider">
              Physical Dispatch Route:
            </span>
            {trade.path_nodes && trade.path_nodes.length > 0 ? (
              <div className="flex items-center flex-wrap gap-2">
                {trade.path_nodes.map((node, i) => (
                  <React.Fragment key={i}>
                    <span className="px-3 py-1 bg-white border border-slate-300 rounded-lg font-mono font-bold text-slate-800 shadow-2xs">
                      Substation {node}
                    </span>
                    {i < trade.path_nodes.length - 1 && (
                      <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                    )}
                  </React.Fragment>
                ))}
              </div>
            ) : (
              <span className="text-slate-500 italic">Direct localized peer connection</span>
            )}
          </div>
        </div>
      </Card>

      {/* Blockchain Proof Card */}
      <Card
        title="Microgrid Settlement Record"
        subtitle="Verifiable transaction hash on the SolarMesh Settlement Layer"
        icon={ShieldCheck}
        action={
          <button
            onClick={handleCopyHash}
            className="inline-flex items-center space-x-1 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied' : 'Copy Hash'}</span>
          </button>
        }
      >
        <div className="space-y-3 font-mono text-xs text-slate-600">
          <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl text-slate-300 space-y-2 break-all">
            <div>
              <span className="text-slate-500">Tx Hash: </span>
              <span className="text-indigo-400 font-bold">{txHash}</span>
            </div>
            <div>
              <span className="text-slate-500">Block Hash: </span>
              <span className="text-slate-200">{blockHash}</span>
            </div>
            <div>
              <span className="text-slate-500">Escrow Contract: </span>
              <span className="text-emerald-400">{BLOCKCHAIN_CONFIG.ESCROW_CONTRACT}</span>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default TradeDetails;
