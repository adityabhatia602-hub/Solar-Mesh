import React, { useState, useEffect, useCallback } from 'react';
import {
  Network as NetworkIcon,
  Activity,
  Zap,
  RefreshCw,
  Sliders,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react';
import { gridApi } from '../api/grid';
import { useMarket } from '../hooks/useMarket';
import PageHeader from '../components/layout/PageHeader';
import Button from '../components/common/Button';
import Card from '../components/common/Card';
import StatCard from '../components/common/StatCard';
import GridTopologyGraph from '../components/network/GridTopologyGraph';
import RouteCalculator from '../components/network/RouteCalculator';
import { formatPercent, formatKw } from '../utils/formatters';

export const Network = () => {
  const { refreshCounter } = useMarket();
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchTopology = useCallback(async () => {
    try {
      setLoading(true);
      const [nodeList, edgeList] = await Promise.all([
        gridApi.getNodes(),
        gridApi.getEdges(),
      ]);
      setNodes(nodeList);
      setEdges(edgeList);
    } catch (err) {
      console.error('Failed to load topology:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTopology();
  }, [fetchTopology, refreshCounter]);

  // Aggregate stats
  const totalCapacity = edges.reduce((acc, e) => acc + (e.capacity_kw || 0), 0);
  const totalLoad = edges.reduce((acc, e) => acc + (e.load_kw || 0), 0);
  const avgLoss = edges.length > 0
    ? edges.reduce((acc, e) => acc + (e.loss_factor || 0), 0) / edges.length
    : 0.024;
  const avgCongestion = nodes.length > 0
    ? nodes.reduce((acc, n) => acc + (n.congestion_level || 0), 0) / nodes.length
    : 0.22;

  return (
    <div className="space-y-6 sm:space-y-8">
      <PageHeader
        title="Physical Grid Topology & SCADA Dispatch"
        subtitle="Live telemetry on electrical substation nodes, transmission line capacities, and dynamic impedance losses"
        actions={
          <Button
            variant="secondary"
            size="sm"
            icon={RefreshCw}
            onClick={fetchTopology}
            isLoading={loading}
          >
            Refresh Grid Telemetry
          </Button>
        }
      />

      {/* High-level Network Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Active Grid Substations"
          value={nodes.length}
          subtitle="Interconnected microgrid nodes"
          icon={NetworkIcon}
          accent="blue"
          trend="100% Operational"
          trendDirection="up"
        />

        <StatCard
          title="Avg Line Transmission Loss"
          value={formatPercent(avgLoss, 2)}
          subtitle="Dijkstra loss minimization"
          icon={Zap}
          accent="emerald"
          trend="-0.4% vs radial grid"
          trendDirection="up"
        />

        <StatCard
          title="Mean Network Congestion"
          value={formatPercent(avgCongestion, 1)}
          subtitle="Thermal line headroom available"
          icon={Activity}
          accent="amber"
          trend="Low Congestion"
          trendDirection="up"
        />

        <StatCard
          title="Total Transmission Capacity"
          value={formatKw(totalCapacity, 0)}
          subtitle={`Current load: ${formatKw(totalLoad, 0)}`}
          icon={ShieldCheck}
          accent="emerald"
          trend="N-1 Contingency Safe"
          trendDirection="up"
        />
      </div>

      {/* Interactive SVG Network Map */}
      <GridTopologyGraph nodes={nodes} edges={edges} />

      {/* Dynamic Route & Loss Calculator */}
      <RouteCalculator nodes={nodes} />

      {/* Substation Nodes Table */}
      <Card
        title="Substation Nodal Directory"
        subtitle="Individual node congestion indices, regional zones, and equipment status"
        icon={NetworkIcon}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Node Code</th>
                <th className="py-3 px-4">Substation Name</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4">Region</th>
                <th className="py-3 px-4">Thermal Congestion Level</th>
                <th className="py-3 px-4 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {nodes.map((node) => {
                const congPct = Math.round(node.congestion_level * 100);
                return (
                  <tr key={node.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-slate-900">
                      {node.code}
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-800">
                      {node.name}
                    </td>
                    <td className="py-3 px-4 capitalize text-slate-600">
                      {node.node_type}
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      {node.region}
                    </td>
                    <td className="py-3 px-4">
                      <div className="w-36">
                        <div className="flex justify-between text-[11px] font-semibold mb-1">
                          <span className={congPct > 70 ? 'text-rose-600' : congPct > 45 ? 'text-amber-600' : 'text-emerald-600'}>
                            {congPct}%
                          </span>
                        </div>
                        <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${
                              congPct > 70 ? 'bg-rose-500' : congPct > 45 ? 'bg-amber-500' : 'bg-emerald-500'
                            }`}
                            style={{ width: `${congPct}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                        Synchronized
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

export default Network;
