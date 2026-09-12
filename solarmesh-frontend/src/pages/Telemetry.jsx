import React, { useState, useEffect, useCallback } from 'react';
import { Activity, RefreshCw, Radio, Sun, Home, Battery } from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from 'recharts';
import { useAuth } from '../hooks/useAuth';
import { useMarket } from '../hooks/useMarket';
import { telemetryApi } from '../api/telemetry';
import { gridApi } from '../api/grid';
import PageHeader from '../components/layout/PageHeader';
import Button from '../components/common/Button';
import Card from '../components/common/Card';
import EmptyState from '../components/common/EmptyState';
import DemoSandboxDrawer from '../components/common/DemoSandboxDrawer';

/** Telemetry monitor: latest device readings + generation vs consumption chart. */
export const Telemetry = () => {
  const { user } = useAuth();
  const { refreshCounter, lastTelemetry } = useMarket();
  const [readings, setReadings] = useState([]);
  const [devices, setDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [loading, setLoading] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [deviceData, latestData] = await Promise.all([
        gridApi.getMyDevices().catch(() => []),
        telemetryApi.getLatest(null, 100).catch(() => []),
      ]);
      setDevices(deviceData || []);
      setReadings(latestData || []);
      if (deviceData?.length > 0 && !selectedDeviceId) {
        setSelectedDeviceId(deviceData[0].id);
      }
    } finally {
      setLoading(false);
    }
  }, [selectedDeviceId]);

  useEffect(() => {
    loadData();
  }, [loadData, refreshCounter]);

  // Live update from WebSocket telemetry events for displayed devices.
  useEffect(() => {
    if (lastTelemetry?.device_id) {
      setReadings((prev) => {
        const others = prev.filter((r) => r.device_id !== lastTelemetry.device_id);
        return [lastTelemetry, ...others].slice(0, 100);
      });
    }
  }, [lastTelemetry]);

  const deviceMap = {};
  devices.forEach((d) => {
    deviceMap[d.id] = d;
  });

  // Chart: history of the selected device (oldest → newest).
  const [history, setHistory] = useState([]);
  useEffect(() => {
    if (!selectedDeviceId) return;
    let cancelled = false;
    telemetryApi
      .getDeviceHistory(selectedDeviceId, 60)
      .then((rows) => {
        if (!cancelled) {
          const sorted = [...(rows || [])].reverse();
          setHistory(
            sorted.map((r) => ({
              time: new Date(r.recorded_at).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              }),
              generation: Number(r.production_kw) || 0,
              consumption: Number(r.consumption_kw) || 0,
            }))
          );
        }
      })
      .catch(() => setHistory([]));
    return () => {
      cancelled = true;
    };
  }, [selectedDeviceId, refreshCounter]);

  return (
    <div className="space-y-6 sm:space-y-8">
      <PageHeader
        title="Device Telemetry"
        subtitle="Simulated smart-meter readings: solar, load, battery, voltage, and current"
        actions={
          <div className="flex items-center space-x-2">
            <span className="hidden sm:inline-flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-[11px] font-semibold text-slate-600">
              <Radio className="w-3.5 h-3.5 text-slate-400" />
              <span>Simulated Digital Twin</span>
            </span>
            <Button variant="secondary" size="sm" icon={RefreshCw} onClick={loadData} isLoading={loading}>
              Refresh
            </Button>
          </div>
        }
      />

      {/* Latest readings table */}
      <Card
        title="Latest Readings"
        subtitle="Most recent telemetry per device (live via WebSocket)"
        icon={Activity}
      >
        {readings.length === 0 ? (
          <EmptyState
            icon={Activity}
            title="No telemetry yet"
            description="Start the simulation or push a reading to see live device data."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-4">Timestamp</th>
                  <th className="py-2.5 px-4">Device</th>
                  <th className="py-2.5 px-4">Generation</th>
                  <th className="py-2.5 px-4">Consumption</th>
                  <th className="py-2.5 px-4">Net Power</th>
                  <th className="py-2.5 px-4">Voltage</th>
                  <th className="py-2.5 px-4">Current</th>
                  <th className="py-2.5 px-4">Battery</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {readings.map((r) => {
                  const device = deviceMap[r.device_id];
                  const isMine = device && device.owner_id === user?.id;
                  const net = Number(r.power_kw) || 0;
                  return (
                    <tr key={r.id || `${r.device_id}-${r.recorded_at}`} className="hover:bg-slate-50/60">
                      <td className="py-2.5 px-4 text-slate-400">
                        {new Date(r.recorded_at).toLocaleTimeString()}
                      </td>
                      <td className="py-2.5 px-4 font-semibold text-slate-800">
                        {device ? device.name : r.device_id?.slice(0, 8)}
                        {isMine && <span className="ml-1.5 text-[10px] text-emerald-600 font-bold">YOURS</span>}
                      </td>
                      <td className="py-2.5 px-4">
                        <span className="inline-flex items-center space-x-1 text-amber-700 font-semibold">
                          <Sun className="w-3 h-3" />
                          <span>{(Number(r.production_kw) || 0).toFixed(2)} kW</span>
                        </span>
                      </td>
                      <td className="py-2.5 px-4">
                        <span className="inline-flex items-center space-x-1 text-slate-700 font-semibold">
                          <Home className="w-3 h-3" />
                          <span>{(Number(r.consumption_kw) || 0).toFixed(2)} kW</span>
                        </span>
                      </td>
                      <td className={`py-2.5 px-4 font-bold ${net >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                        {net >= 0 ? '+' : ''}
                        {net.toFixed(2)} kW
                      </td>
                      <td className="py-2.5 px-4 text-slate-600">{(r.voltage ?? 0).toFixed(0)} V</td>
                      <td className="py-2.5 px-4 text-slate-600">{(r.current ?? 0).toFixed(1)} A</td>
                      <td className="py-2.5 px-4">
                        <span className="inline-flex items-center space-x-1.5">
                          <Battery className="w-3 h-3 text-slate-400" />
                          <span className="font-semibold text-slate-700">
                            {(Number(r.battery_soc) || 0).toFixed(0)}%
                          </span>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Device history chart */}
      <Card
        title="Generation vs Consumption"
        subtitle="Selected device history (kW per reading)"
        icon={Activity}
      >
        {devices.length > 0 && (
          <div className="mb-3">
            <select
              value={selectedDeviceId}
              onChange={(e) => setSelectedDeviceId(e.target.value)}
              className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-medium bg-white text-slate-800 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            >
              {devices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
        )}
        {history.length === 0 ? (
          <EmptyState
            icon={Activity}
            title="No history for this device"
            description="Telemetry will appear here once the simulation is running."
          />
        ) : (
          <div className="h-64 sm:h-72 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={history} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="time" stroke="#94a3b8" fontSize={10} tickLine={false} />
                <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} unit=" kW" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    borderRadius: '8px',
                    color: '#f8fafc',
                    fontSize: '11px',
                    border: '1px solid #1e293b',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                <Line
                  type="monotone"
                  dataKey="generation"
                  name="Generation"
                  stroke="#059669"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="consumption"
                  name="Consumption"
                  stroke="#64748b"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      {/* Digital-Twin Simulation Controls */}
      <DemoSandboxDrawer onActionComplete={loadData} />
    </div>
  );
};

export default Telemetry;
