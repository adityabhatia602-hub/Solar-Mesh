import React, { useState } from 'react';
import { Network, Zap, AlertTriangle, ShieldCheck, Activity } from 'lucide-react';
import { formatPercent, formatKw } from '../../utils/formatters';

export const GridTopologyGraph = ({ nodes = [], edges = [], onSelectNode }) => {
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [hoveredNodeId, setHoveredNodeId] = useState(null);

  // Layout node coordinates in a circular or structured mesh layout
  const getNodeCoordinates = (index, total) => {
    if (total === 0) return { x: 300, y: 200 };
    // Center at (320, 200), radius 140
    const centerX = 360;
    const centerY = 200;
    const radius = 130;
    const angle = (index / total) * 2 * Math.PI - Math.PI / 2;
    return {
      x: Math.round(centerX + radius * Math.cos(angle)),
      y: Math.round(centerY + radius * Math.sin(angle)),
    };
  };

  // Pre-calculate positions
  const nodePositionMap = {};
  nodes.forEach((node, idx) => {
    nodePositionMap[node.id] = getNodeCoordinates(idx, nodes.length);
  });

  const handleNodeClick = (node) => {
    setSelectedNodeId(node.id);
    if (onSelectNode) onSelectNode(node);
  };

  const getNodeColor = (congestion) => {
    if (congestion > 0.75) return { fill: '#fee2e2', stroke: '#ef4444', text: '#991b1b', dot: '#ef4444' };
    if (congestion > 0.45) return { fill: '#fef3c7', stroke: '#f59e0b', text: '#92400e', dot: '#f59e0b' };
    return { fill: '#ecfdf5', stroke: '#10b981', text: '#065f46', dot: '#10b981' };
  };

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 mb-2 border-b border-slate-100 gap-2">
        <div className="flex items-center space-x-2.5">
          <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
            <Network className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-800">Physical Grid Substation Topology</h3>
            <p className="text-xs text-slate-500">
              Real-time nodal capacity, power flow constraints, and dynamic loss factors
            </p>
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center space-x-3 text-[11px] font-medium text-slate-600">
          <span className="flex items-center space-x-1">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            <span>Optimal (&lt;45%)</span>
          </span>
          <span className="flex items-center space-x-1">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
            <span>Moderate (45-75%)</span>
          </span>
          <span className="flex items-center space-x-1">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
            <span>Congested (&gt;75%)</span>
          </span>
        </div>
      </div>

      {/* SVG Canvas Map */}
      <div className="relative w-full aspect-16/9 sm:aspect-21/9 bg-slate-900 rounded-xl overflow-hidden border border-slate-800 flex items-center justify-center">
        <svg
          viewBox="0 0 720 400"
          className="w-full h-full select-none"
          style={{ maxWidth: '100%' }}
        >
          {/* Subtle grid background pattern */}
          <defs>
            <pattern id="grid-pattern" width="30" height="30" patternUnits="userSpaceOnUse">
              <path d="M 30 0 L 0 0 0 30" fill="none" stroke="#1e293b" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="720" height="400" fill="url(#grid-pattern)" />

          {/* Edges (Transmission Lines) */}
          {edges.map((edge) => {
            const fromPos = nodePositionMap[edge.from_node_id];
            const toPos = nodePositionMap[edge.to_node_id];
            if (!fromPos || !toPos) return null;

            const isHighUtil = (edge.utilization || 0) > 0.75;
            const strokeColor = isHighUtil ? '#f43f5e' : '#10b981';

            return (
              <g key={edge.id} className="group cursor-pointer">
                {/* Background Line */}
                <line
                  x1={fromPos.x}
                  y1={fromPos.y}
                  x2={toPos.x}
                  y2={toPos.y}
                  stroke={strokeColor}
                  strokeWidth={isHighUtil ? '3' : '2'}
                  strokeOpacity="0.4"
                />
                {/* Animated Power Flow Particles */}
                <line
                  x1={fromPos.x}
                  y1={fromPos.y}
                  x2={toPos.x}
                  y2={toPos.y}
                  stroke={strokeColor}
                  strokeWidth="2.5"
                  strokeDasharray="6 8"
                  className="animate-flow"
                  strokeOpacity="0.9"
                />
                {/* Edge midpoint label badge */}
                <circle
                  cx={(fromPos.x + toPos.x) / 2}
                  cy={(fromPos.y + toPos.y) / 2}
                  r="7"
                  fill="#0f172a"
                  stroke={strokeColor}
                  strokeWidth="1.5"
                />
              </g>
            );
          })}

          {/* Nodes (Substations & Microgrid Hubs) */}
          {nodes.map((node, idx) => {
            const pos = nodePositionMap[node.id] || { x: 100 + idx * 80, y: 200 };
            const style = getNodeColor(node.congestion_level);
            const isSelected = selectedNodeId === node.id;
            const isHovered = hoveredNodeId === node.id;

            return (
              <g
                key={node.id}
                transform={`translate(${pos.x}, ${pos.y})`}
                onClick={() => handleNodeClick(node)}
                onMouseEnter={() => setHoveredNodeId(node.id)}
                onMouseLeave={() => setHoveredNodeId(null)}
                className="cursor-pointer transition-transform duration-150"
              >
                {/* Pulse Ring if selected or high congestion */}
                {(isSelected || node.congestion_level > 0.75) && (
                  <circle
                    r="32"
                    fill="none"
                    stroke={style.dot}
                    strokeWidth="2"
                    strokeOpacity="0.5"
                    className="animate-ping"
                  />
                )}

                {/* Node Outer Circle */}
                <circle
                  r={isSelected || isHovered ? '24' : '20'}
                  fill={style.fill}
                  stroke={style.stroke}
                  strokeWidth={isSelected ? '3.5' : '2.5'}
                  className="transition-all duration-150"
                />

                {/* Node Code */}
                <text
                  textAnchor="middle"
                  dy="4"
                  fontSize="11"
                  fontWeight="bold"
                  fill={style.text}
                  className="pointer-events-none font-mono"
                >
                  {node.code}
                </text>

                {/* Subtitle / Name label */}
                <text
                  textAnchor="middle"
                  dy="38"
                  fontSize="10"
                  fontWeight="600"
                  fill="#94a3b8"
                  className="pointer-events-none"
                >
                  {node.name}
                </text>

                {/* Congestion Level */}
                <text
                  textAnchor="middle"
                  dy="49"
                  fontSize="9"
                  fontWeight="bold"
                  fill={style.dot}
                  className="pointer-events-none"
                >
                  {(node.congestion_level * 100).toFixed(0)}% Load
                </text>
              </g>
            );
          })}
        </svg>

        {/* Selected Node Floating Details Card */}
        {selectedNode && (
          <div className="absolute top-3 left-3 bg-slate-800/95 backdrop-blur-md border border-slate-700 p-3.5 rounded-xl text-xs text-white max-w-xs shadow-lg animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-extrabold text-sm text-emerald-400">
                {selectedNode.code} — {selectedNode.name}
              </span>
              <button
                onClick={() => setSelectedNodeId(null)}
                className="text-slate-400 hover:text-white text-[11px]"
              >
                ✕
              </button>
            </div>
            <div className="space-y-1 text-slate-300 text-[11px]">
              <div>Region: <span className="text-white font-semibold">{selectedNode.region}</span></div>
              <div>Type: <span className="text-white font-semibold">{selectedNode.node_type}</span></div>
              <div>
                Congestion Index:{' '}
                <span
                  className={`font-bold ${
                    selectedNode.congestion_level > 0.7
                      ? 'text-rose-400'
                      : selectedNode.congestion_level > 0.4
                      ? 'text-amber-400'
                      : 'text-emerald-400'
                  }`}
                >
                  {(selectedNode.congestion_level * 100).toFixed(1)}%
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default GridTopologyGraph;
