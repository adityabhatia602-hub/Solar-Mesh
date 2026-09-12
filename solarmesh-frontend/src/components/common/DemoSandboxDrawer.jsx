import React, { useEffect, useState, useCallback } from 'react';
import {
  Sliders,
  Play,
  Square,
  FastForward,
  Sun,
  Zap,
  X,
  Radio,
  RefreshCw,
  Info,
} from 'lucide-react';
import { simulationApi } from '../../api/simulation';
import { useToast } from '../../hooks/useToast';
import { useMarket } from '../../hooks/useMarket';
import { formatCurrency, formatKwh } from '../../utils/formatters';
import Button from './Button';

/**
 * Digital-twin simulation controls: start/stop the global loop, run manual
 * ticks, and monitor the current status. Replaces the old slider-based
 * telemetry mock (real telemetry now flows from the backend simulator).
 */
export const DemoSandboxDrawer = ({ onActionComplete }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(null); // 'start' | 'stop' | 'tick' | null
  const [tickCount, setTickCount] = useState(5);
  const [lastResult, setLastResult] = useState(null);

  const toast = useToast();
  const { refreshCounter, triggerGlobalRefresh } = useMarket();

  const refreshStatus = useCallback(async () => {
    try {
      const s = await simulationApi.getStatus();
      setStatus(s);
    } catch {
      setStatus(null);
    }
  }, []);

  useEffect(() => {
    if (isOpen) refreshStatus();
  }, [isOpen, refreshStatus, refreshCounter]);

  const handleStart = async () => {
    try {
      setBusy('start');
      await simulationApi.start();
      toast.success('Digital-twin simulation started — telemetry and trading are live.');
      await refreshStatus();
      if (onActionComplete) onActionComplete();
    } catch (err) {
      toast.error('Start failed: ' + (err.response?.data?.detail || err.message));
    } finally {
      setBusy(null);
    }
  };

  const handleStop = async () => {
    try {
      setBusy('stop');
      await simulationApi.stop();
      toast.info('Simulation stopped.');
      await refreshStatus();
      if (onActionComplete) onActionComplete();
    } catch (err) {
      toast.error('Stop failed: ' + (err.response?.data?.detail || err.message));
    } finally {
      setBusy(null);
    }
  };

  const handleTick = async () => {
    try {
      setBusy('tick');
      const result = await simulationApi.tick(Number(tickCount) || 1);
      setLastResult(result);
      if (result.total_trades > 0) {
        toast.success(
          `${result.ticks_run} tick(s): ${result.total_trades} trade(s), ${formatKwh(result.total_volume_kwh)} settled`
        );
      } else {
        toast.info(`${result.ticks_run} tick(s) completed — no new matches yet.`);
      }
      triggerGlobalRefresh();
      if (onActionComplete) onActionComplete();
    } catch (err) {
      toast.error('Tick failed: ' + (err.response?.data?.detail || err.message));
    } finally {
      setBusy(null);
    }
  };

  const running = status?.is_running || false;

  return (
    <>
      {/* Floating Pill Toggle Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-5 right-5 z-40 inline-flex items-center space-x-2 px-3.5 py-2.5 rounded-full bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-lg hover:shadow-xl border border-slate-700 transition-all cursor-pointer group"
        title="Open digital-twin simulation controls"
      >
        <Sliders className="w-4 h-4 text-emerald-400 group-hover:rotate-45 transition-transform" />
        <span className="hidden sm:inline">Simulation Controls</span>
        <span className="sm:hidden">Sim</span>
        <span className={`w-2 h-2 rounded-full ${running ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
      </button>

      {/* Slide-over Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-slate-900/40 z-50 backdrop-blur-xs transition-opacity"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Slide-over Drawer */}
      <div
        className={`fixed top-0 right-0 bottom-0 w-full sm:w-96 bg-white z-50 border-l border-slate-200 shadow-2xl flex flex-col transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Drawer Header */}
        <div className="p-4 sm:px-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center space-x-2">
            <div className="p-1.5 bg-slate-900 text-white rounded-lg">
              <Sliders className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Digital-Twin Simulation</h3>
              <p className="text-[11px] text-slate-500">Control the grid &amp; market simulation</p>
            </div>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Drawer Content */}
        <div className="flex-1 p-4 sm:p-6 overflow-y-auto space-y-6 text-xs text-slate-600">
          {/* Status Panel */}
          <div
            className={`p-4 rounded-xl border space-y-3 ${
              running ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-1.5">
                <Radio className={`w-4 h-4 ${running ? 'text-emerald-600' : 'text-slate-400'}`} />
                <span className="font-bold text-slate-800">
                  Simulation: {running ? 'LIVE' : 'OFF'}
                </span>
              </div>
              {running && (
                <span className="flex items-center space-x-1 text-[10px] font-bold uppercase text-emerald-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Streaming
                </span>
              )}
            </div>

            {status && (
              <div className="space-y-1 text-[11px] text-slate-600">
                <div className="flex justify-between">
                  <span>Tick interval:</span>
                  <span className="font-semibold text-slate-800">{status.interval_seconds}s</span>
                </div>
                <div className="flex justify-between">
                  <span>Ticks completed:</span>
                  <span className="font-semibold text-slate-800">{status.tick_count}</span>
                </div>
                {status.last_tick_at && (
                  <div className="flex justify-between">
                    <span>Last tick:</span>
                    <span className="font-semibold text-slate-800">
                      {new Date(status.last_tick_at).toLocaleTimeString()}
                    </span>
                  </div>
                )}
              </div>
            )}

            <div className="flex items-start space-x-1.5 pt-1 text-[10px] text-slate-500">
              <Info className="w-3 h-3 shrink-0 mt-0.5" />
              <span>
                Data source: <strong>Simulated Digital Twin</strong>. Telemetry, grid loads, and
                devices are simulated; matching, settlement, and wallets are real application logic.
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              {running ? (
                <Button
                  variant="secondary"
                  size="sm"
                  icon={Square}
                  isLoading={busy === 'stop'}
                  onClick={handleStop}
                  className="w-full"
                >
                  Stop
                </Button>
              ) : (
                <Button
                  variant="primary"
                  size="sm"
                  icon={Play}
                  isLoading={busy === 'start'}
                  onClick={handleStart}
                  className="w-full bg-emerald-600 hover:bg-emerald-700"
                >
                  Start
                </Button>
              )}
              <Button
                variant="secondary"
                size="sm"
                icon={FastForward}
                isLoading={busy === 'tick'}
                onClick={handleTick}
                className="w-full"
              >
                Tick
              </Button>
            </div>

            {!running && (
              <div className="flex items-center space-x-2 pt-1">
                <span className="text-[11px] font-medium text-slate-500 shrink-0">Ticks:</span>
                <input
                  type="range"
                  min="1"
                  max="20"
                  value={tickCount}
                  onChange={(e) => setTickCount(Number(e.target.value))}
                  className="flex-1 accent-emerald-600 cursor-pointer"
                />
                <span className="text-[11px] font-bold text-slate-800 w-6 text-right">{tickCount}</span>
              </div>
            )}
          </div>

          {/* Last Tick Result */}
          {lastResult && (
            <div className="p-4 rounded-xl bg-slate-900 text-white border border-transparent space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-1.5">
                  <Zap className="w-4 h-4 text-emerald-400" />
                  <span className="font-bold text-xs text-white">Last Tick Batch</span>
                </div>
                <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-white/10 text-emerald-300">
                  {lastResult.ticks_run} ticks
                </span>
              </div>
              <div className="text-[11px] text-slate-300 space-y-0.5">
                <div>Trades matched: <span className="text-white font-bold">{lastResult.total_trades}</span></div>
                <div>Volume settled: <span className="text-white font-bold">{formatKwh(lastResult.total_volume_kwh)}</span></div>
              </div>
            </div>
          )}

          {/* What the simulation does */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-2">
            <span className="font-bold text-slate-800 block text-xs">Each simulation tick:</span>
            <ol className="text-[11px] text-slate-600 space-y-1 list-decimal list-inside">
              <li>Generates realistic telemetry (solar curve, load profile, battery)</li>
              <li>Detects surplus / deficit per device</li>
              <li>Creates or refreshes automatic SELL / BUY orders</li>
              <li>Runs the network-aware matching engine (Dijkstra routing)</li>
              <li>Computes line losses, checks congestion, settles trades</li>
              <li>Updates wallets and broadcasts live WebSocket events</li>
            </ol>
          </div>

          <div className="text-[10px] text-slate-400 leading-relaxed">
            Note: the market engine, Dijkstra routing, loss math, settlement, and wallets are real
            application logic running on the API server. Only the physical readings and grid
            topology are simulated (digital twin).
          </div>
        </div>

        {/* Drawer Footer */}
        <div className="p-3 border-t border-slate-100 bg-slate-50 text-[11px] text-slate-400 text-center">
          SolarMesh Digital Twin • Simulated IoT &amp; Grid Telemetry
        </div>
      </div>
    </>
  );
};

export default DemoSandboxDrawer;
