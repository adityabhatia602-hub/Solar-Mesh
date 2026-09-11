import React, { useState, useEffect } from 'react';
import { Route, ArrowRight, Zap, AlertCircle, ShieldCheck, CheckCircle2 } from 'lucide-react';
import Button from '../common/Button';
import { gridApi } from '../../api/grid';
import { formatCurrency, formatPercent } from '../../utils/formatters';

export const RouteCalculator = ({ nodes = [] }) => {
  const [fromNode, setFromNode] = useState('');
  const [toNode, setToNode] = useState('');
  const [quote, setQuote] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (nodes.length >= 2) {
      if (!fromNode) setFromNode(nodes[0].id);
      if (!toNode) setToNode(nodes[1].id);
    }
  }, [nodes, fromNode, toNode]);

  const handleCalculateRoute = async () => {
    if (!fromNode || !toNode) return;
    try {
      setLoading(true);
      setError(null);
      const data = await gridApi.quoteRoute(fromNode, toNode);
      setQuote(data);
    } catch (err) {
      const msg = err.response?.data?.detail || err.message || 'Route calculation failed';
      setError(msg);
      setQuote(null);
    } finally {
      setLoading(false);
    }
  };

  // Find human readable names
  const getNodeLabel = (id) => {
    const node = nodes.find((n) => n.id === id);
    return node ? `${node.code} (${node.name})` : id;
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs">
      <div className="flex items-center space-x-2.5 pb-4 mb-4 border-b border-slate-100">
        <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
          <Route className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-base font-bold text-slate-800">Dynamic Route & Loss Calculator</h3>
          <p className="text-xs text-slate-500">
            Dijkstra path-finding with transmission loss minimization & congestion penalties
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Selectors Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Source Prosumer Node (From)
          </label>
          <select
            value={fromNode}
            onChange={(e) => setFromNode(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-medium bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
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
            Target Consumer Node (To)
          </label>
          <select
            value={toNode}
            onChange={(e) => setToNode(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-medium bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
          >
            {nodes.map((n) => (
              <option key={n.id} value={n.id}>
                {n.code} — {n.name} ({n.region})
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex justify-end mb-4">
        <Button
          size="sm"
          variant="primary"
          onClick={handleCalculateRoute}
          isLoading={loading}
          disabled={!fromNode || !toNode}
        >
          Compute Optimal Delivery Path
        </Button>
      </div>

      {/* Quote Outcome */}
      {quote && (
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-800">Route Feasibility:</span>
            {quote.feasible ? (
              <span className="inline-flex items-center text-xs font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-emerald-600" /> Feasible & Open
              </span>
            ) : (
              <span className="inline-flex items-center text-xs font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded">
                Congestion Blocked
              </span>
            )}
          </div>

          {/* Path Nodes Flow */}
          {quote.path_node_ids && quote.path_node_ids.length > 0 && (
            <div>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                Physical Substation Flow Path:
              </span>
              <div className="flex items-center flex-wrap gap-1.5">
                {quote.path_node_ids.map((nid, i) => (
                  <React.Fragment key={nid}>
                    <span className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg font-mono text-xs font-bold text-slate-800 shadow-2xs">
                      {getNodeLabel(nid)}
                    </span>
                    {i < quote.path_node_ids.length - 1 && (
                      <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    )}
                  </React.Fragment>
                ))}
              </div>
            </div>
          )}

          {/* Metrics Breakdown */}
          <div className="grid grid-cols-3 gap-3 pt-2 border-t border-slate-200 text-xs">
            <div>
              <span className="text-[10px] text-slate-500 block">Accumulated Line Loss</span>
              <span className="font-bold text-slate-800">{formatPercent(quote.path_loss, 2)}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 block">Congestion Penalty</span>
              <span className="font-bold text-amber-700">
                {formatCurrency(quote.congestion_penalty, '$', 4)}/kWh
              </span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 block">Total Grid Delivery Fee</span>
              <span className="font-bold text-emerald-700 text-sm">
                {formatCurrency(quote.total_network_cost_per_kwh, '$', 4)}/kWh
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RouteCalculator;
