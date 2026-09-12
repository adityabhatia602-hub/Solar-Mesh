import React, { useState } from 'react';
import {
  Sliders,
  Play,
  Sparkles,
  Sun,
  Battery,
  Home,
  X,
  ShieldCheck,
  CheckCircle2,
  RefreshCw,
  Zap,
} from 'lucide-react';
import { marketApi } from '../../api/market';
import { telemetryApi } from '../../api/telemetry';
import { useToast } from '../../hooks/useToast';
import { useAuth } from '../../hooks/useAuth';
import { formatCurrency, formatKwh } from '../../utils/formatters';
import Button from './Button';

export const DemoSandboxDrawer = ({ onActionComplete }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [clearingLoading, setClearingLoading] = useState(false);
  const [lastClearingResult, setLastClearingResult] = useState(null);

  // Quick Telemetry State
  const [productionKwh, setProductionKwh] = useState(8.5);
  const [consumptionKwh, setConsumptionKwh] = useState(3.2);
  const [batteryKwh, setBatteryKwh] = useState(11.0);
  const [telemetryLoading, setTelemetryLoading] = useState(false);

  const { isProsumer } = useAuth();
  const toast = useToast();

  const handleRunClearing = async () => {
    try {
      setClearingLoading(true);
      const result = await marketApi.triggerMatching();
      setLastClearingResult(result);
      if (onActionComplete) onActionComplete();

      if (result.matched_trades > 0) {
        toast.success(
          `Market cleared: ${result.matched_trades} trade${
            result.matched_trades > 1 ? 's' : ''
          } settled (${formatKwh(result.total_volume_kwh)}, ${formatCurrency(result.total_value)})`
        );
      } else {
        toast.info('Clearing cycle finished: No matching order pairs ready to settle.');
      }
    } catch (err) {
      toast.error('Clearing failed: ' + (err.response?.data?.detail || err.message));
    } finally {
      setClearingLoading(false);
    }
  };

  const handlePushTelemetry = async (prod, cons, batt) => {
    try {
      setTelemetryLoading(true);
      const p = prod !== undefined ? prod : productionKwh;
      const c = cons !== undefined ? cons : consumptionKwh;
      const b = batt !== undefined ? batt : batteryKwh;

      await telemetryApi.postTelemetry({
        production_kwh: Number(p),
        consumption_kwh: Number(c),
        battery_kwh: Number(b),
      });

      setProductionKwh(Number(p));
      setConsumptionKwh(Number(c));
      setBatteryKwh(Number(b));

      toast.success(`Smart meter updated: ${p} kWh Solar / ${c} kWh Home Load`);
      if (onActionComplete) onActionComplete();
    } catch (err) {
      toast.error('Telemetry failed: ' + (err.response?.data?.detail || err.message));
    } finally {
      setTelemetryLoading(false);
    }
  };

  return (
    <>
      {/* Floating Pill Toggle Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-5 right-5 z-40 inline-flex items-center space-x-2 px-3.5 py-2.5 rounded-full bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-lg hover:shadow-xl border border-slate-700 transition-all cursor-pointer group"
        title="Open Live Simulation and Judge Controls"
      >
        <Sliders className="w-4 h-4 text-emerald-400 group-hover:rotate-45 transition-transform" />
        <span className="hidden sm:inline">Demo & Simulation Controls</span>
        <span className="sm:hidden">Demo</span>
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
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
              <h3 className="text-sm font-bold text-slate-900">Demo & Judge Sandbox</h3>
              <p className="text-[11px] text-slate-500">Live grid & market simulation tools</p>
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
          {/* Section 1: Market Clearing Engine */}
          <div className="p-4 rounded-xl bg-slate-900 text-white border border-transparent space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-1.5">
                <Sparkles className="w-4 h-4 text-emerald-400" />
                <span className="font-bold text-xs text-white">Double-Auction Clearing</span>
              </div>
              <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-white/10 text-emerald-300">
                Dijkstra Engine
              </span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Triggers the matching engine to pair open buy and sell orders, optimizing for minimum line loss and network delivery fees.
            </p>

            {lastClearingResult && (
              <div className="p-2.5 rounded-lg bg-white/5 border border-white/10 text-[11px] space-y-0.5">
                <div className="text-emerald-400 font-semibold flex items-center space-x-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{lastClearingResult.matched_trades} trades matched</span>
                </div>
                <div className="text-slate-300">
                  {formatKwh(lastClearingResult.total_volume_kwh)} • {formatCurrency(lastClearingResult.total_value)}
                </div>
              </div>
            )}

            <Button
              variant="primary"
              size="sm"
              isLoading={clearingLoading}
              onClick={handleRunClearing}
              icon={Play}
              className="w-full bg-emerald-600 hover:bg-emerald-700 font-semibold"
            >
              Run Clearing Cycle Now
            </Button>
          </div>

          {/* Section 2: Quick Solar Conditions Presets */}
          <div className="space-y-3">
            <div className="flex items-center space-x-1.5 font-bold text-slate-800 text-xs">
              <Sun className="w-4 h-4 text-amber-500" />
              <span>Simulate Solar Weather Presets</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => handlePushTelemetry(9.5, 2.5, 12.0)}
                disabled={telemetryLoading}
                className="p-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-emerald-50 hover:border-emerald-200 text-left transition-colors cursor-pointer"
              >
                <span className="font-bold text-slate-800 block">☀️ Sunny Noon</span>
                <span className="text-[10px] text-slate-500">9.5 kWh Solar (High Surplus)</span>
              </button>

              <button
                onClick={() => handlePushTelemetry(2.1, 4.8, 8.5)}
                disabled={telemetryLoading}
                className="p-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-emerald-50 hover:border-emerald-200 text-left transition-colors cursor-pointer"
              >
                <span className="font-bold text-slate-800 block">☁️ Cloudy Afternoon</span>
                <span className="text-[10px] text-slate-500">2.1 kWh Solar (Deficit)</span>
              </button>

              <button
                onClick={() => handlePushTelemetry(0.0, 5.2, 4.0)}
                disabled={telemetryLoading}
                className="p-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-emerald-50 hover:border-emerald-200 text-left transition-colors cursor-pointer"
              >
                <span className="font-bold text-slate-800 block">🌙 Evening Peak</span>
                <span className="text-[10px] text-slate-500">0.0 kWh Solar (High Load)</span>
              </button>

              <button
                onClick={() => handlePushTelemetry(5.0, 5.0, 10.0)}
                disabled={telemetryLoading}
                className="p-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-emerald-50 hover:border-emerald-200 text-left transition-colors cursor-pointer"
              >
                <span className="font-bold text-slate-800 block">⚖️ Grid Neutral</span>
                <span className="text-[10px] text-slate-500">5.0 kWh Gen / 5.0 kWh Load</span>
              </button>
            </div>
          </div>

          {/* Section 3: Fine-Grain Smart Meter Telemetry Sliders */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-3.5">
            <span className="font-bold text-slate-800 block text-xs">
              Manual Smart Meter Overrides
            </span>

            <div>
              <div className="flex justify-between text-[11px] mb-1">
                <span className="text-slate-600 font-medium">Solar Generation:</span>
                <span className="font-bold text-slate-900">{productionKwh} kWh</span>
              </div>
              <input
                type="range"
                min="0"
                max="15"
                step="0.5"
                value={productionKwh}
                onChange={(e) => setProductionKwh(parseFloat(e.target.value))}
                className="w-full accent-emerald-600 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-[11px] mb-1">
                <span className="text-slate-600 font-medium">Home Load:</span>
                <span className="font-bold text-slate-900">{consumptionKwh} kWh</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="12"
                step="0.5"
                value={consumptionKwh}
                onChange={(e) => setConsumptionKwh(parseFloat(e.target.value))}
                className="w-full accent-slate-600 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-[11px] mb-1">
                <span className="text-slate-600 font-medium">Battery Reserve:</span>
                <span className="font-bold text-slate-900">{batteryKwh} kWh</span>
              </div>
              <input
                type="range"
                min="0"
                max="20"
                step="0.5"
                value={batteryKwh}
                onChange={(e) => setBatteryKwh(parseFloat(e.target.value))}
                className="w-full accent-emerald-600 cursor-pointer"
              />
            </div>

            <Button
              variant="secondary"
              size="xs"
              isLoading={telemetryLoading}
              onClick={() => handlePushTelemetry()}
              icon={RefreshCw}
              className="w-full mt-2"
            >
              Push Custom Telemetry
            </Button>
          </div>
        </div>

        {/* Drawer Footer */}
        <div className="p-3 border-t border-slate-100 bg-slate-50 text-[11px] text-slate-400 text-center">
          SolarMesh SCADA Sandbox • Simulates IoT Telemetry & Clearing
        </div>
      </div>
    </>
  );
};

export default DemoSandboxDrawer;
