import React, { useState, useEffect, useCallback } from 'react';
import {
  Network as NetworkIcon,
  Activity,
  Zap,
  RefreshCw,
  ShieldCheck,
  AlertTriangle,
  Radio,
} from 'lucide-react';
import { gridApi } from '../api/grid';
import { analyticsApi } from '../api/simulation';
import { useMarket } from '../hooks/useMarket';
import PageHeader from '../components/layout/PageHeader';
import Button from '../components/common/Button';
import Card from '../components/common/Card';
import StatCard from '../components/common/StatCard';
import GridTopologyGraph from '../components/network/GridTopologyGraph';
import RouteCalculator from '../components/network/RouteCalculator';
import DemoSandboxDrawer from '../components/common/DemoSandboxDrawer';
import { formatPercent, formatKw } from '../utils/formatters';

export const Network = () => {
  const { refreshCounter } = useMarket();
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [gridEvents, setGridEvents] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchTopology = useCallback(async () => {
    try {
      setLoading(true);
      const [nodeList, edgeList, gridAnalytics] = await Promise.all([
        gridApi.getNodes(),
        gridApi.getEdges(),
        analyticsApi.getGrid().catch(() => null),
      ]);
      setNodes(nodeList);
      setEdges(edgeList);
      setGridEvents(gridAnalytics?.congestion_events || []);
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

  // Node-id → code map for readable edge labels.
  const nodeCodeMap = {};
  nodes.forEach((n) => {
    nodeCodeMap[n.id] = n.code;
  });

  // Congested edges drive the alert banner.
  const congestedEdges = edges.filter((e) => (e.status || 'normal') === 'congested');

  return (
    <div className="space-y-6 sm:space-y-8">
      <PageHeader
        title="Grid Digital Twin — Topology & Load"
        subtitle="Simulated distribution grid: nodes, lines, capacity, and live power flow"
        actions={
          <div className="flex items-center space-x-2">
            <span className="hidden sm:inline-flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-[11px] font-semibold text-slate-600">
              <Radio className="w-3.5 h-3.5 text-slate-400" />
              <span>Simulated Digital Twin</span>
            </span>
            <Button
              variant="secondary"
              size="sm"
              icon={RefreshCw}
              onClick={fetchTopology}
              isLoading={loading}
            >
              Refresh Grid
            </Button>
          </div>
        }
      />

      {/* Congestion Alert Banner */}
      {congestedEdges.length > 0 && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center space-x-2 text-rose-700">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <div>
              <span className="font-bold text-sm block">⚠ Grid Congestion</span>
              <span className="text-[11px] text-rose-600">
                {congestedEdges
                  .map(
                    (e) =>
                      `${nodeCodeMap[e.from_node_id] || '?'} → ${nodeCodeMap[e.to_node_id] || '?'}`
                  )
                  .join(', ')}{' '}
                  — matching engine will reroute or defer trades on these corridors.
              </span>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            {congestedEdges.slice(0, 3).map((e) => (
              <span
                key={e.id}
                className="px-2 py-1 rounded-lg bg-white border border-rose-200 text-[11px] font-bold text-rose-700"
              >
                Utilization: {Math.round((e.utilization || 0) * 100)}%
              </span>
            ))}
          </div>
        </div>
      )}

      {/* High-level Network Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Substation Nodes"
          value={nodes.length}
          subtitle="Interconnected local nodes"
          icon={NetworkIcon}
          accent="blue"
          trend="100% Operational"
          trendDirection="up"
        />

        <StatCard
          title="Avg Line Transmission Loss"
          value={formatPercent(avgLoss, 2)}
          subtitle="Optimized shortest paths"
          icon={Zap}
          accent="emerald"
          trend="Minimal Line Loss"
          trendDirection="up"
        />

        <StatCard
          title="Grid Congestion Level"
          value={formatPercent(avgCongestion, 1)}
          subtitle="Headroom available"
          icon={Activity}
          accent="amber"
          trend="Normal Load"
          trendDirection="up"
        />

        <StatCard
          title="Total Line Capacity"
          value={formatKw(totalCapacity, 0)}
          subtitle={`Current load: ${formatKw(totalLoad, 0)}`}
          icon={ShieldCheck}
          accent="emerald"
          trend="N-1 Safe"
          trendDirection="up"
        />
      </div>

      {/* Interactive SVG Network Map */}
      <GridTopologyGraph nodes={nodes} edges={edges} />

      {/* Dynamic Route & Loss Calculator */}
      <RouteCalculator nodes={nodes} />

      {/* Recent Grid Events */}
      {gridEvents.length > 0 && (
        <Card
          title="Recent Grid Events"
          subtitle="Congestion detections from the digital-twin monitor"
          icon={AlertTriangle}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-4">Type</th>
                  <th className="py-2.5 px-4">Detail</th>
                  <th className="py-2.5 px-4">Utilization</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {gridEvents.map((ev) => (
                  <tr key={ev.id} className="hover:bg-slate-50/60">
                    <td className="py-2.5 px-4">
                      <span className="px-2 py-0.5 rounded bg-rose-100 text-rose-800 text-[10px] font-bold uppercase">
                        {ev.event_type}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-slate-700">{ev.detail || '—'}</td>
                    <td className="py-2.5 px-4 font-semibold">{(ev.utilization * 100).toFixed(0)}%</td>
                    <td className="py-2.5 px-4">
                      {ev.resolved_at ? (
                        <span className="text-emerald-700 font-semibold">Resolved</span>
                      ) : (
                        <span className="text-rose-600 font-bold">Active</span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-slate-400">
                      {new Date(ev.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Substation Nodes Table */}
      <Card
        title="Node Directory"
        subtitle="Simulated grid nodes: type, region, and live load level"
        icon={NetworkIcon}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Node Code</th>
                <th className="py-3 px-4">Substation Name</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4">Neighborhood Zone</th>
                <th className="py-3 px-4">Load Level</th>
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
                          <span className={congPct > 70 ? 'text-rose-600' : congPct > 45 ? 'text-amber-600' : 'text-emerald-700'}>
                            {congPct}%
                          </span>
                        </div>
                        <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${
                              congPct > 70 ? 'bg-rose-500' : congPct > 45 ? 'bg-amber-500' : 'bg-emerald-600'
                            }`}
                            style={{ width: `${congPct}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                        Online
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Demo Sandbox Drawer */}
      <DemoSandboxDrawer onActionComplete={fetchTopology} />
    </div>
  );
};

export default Network;
