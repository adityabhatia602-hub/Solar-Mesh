import React from 'react';
import { Sun, BatteryCharging, Home, ArrowRight, Zap, RefreshCw } from 'lucide-react';
import { formatKwh } from '../../utils/formatters';

export const EnergyFlowVisualizer = ({
  productionKwh = 0,
  consumptionKwh = 0,
  batteryKwh = 0,
  batteryCapacity = 15,
  isProsumer = true,
  onSimulateClick,
}) => {
  const surplus = Math.max(0, productionKwh - consumptionKwh);
  const deficit = Math.max(0, consumptionKwh - productionKwh);
  const batteryPercent = Math.min(100, Math.round((batteryKwh / batteryCapacity) * 100));

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-xs relative overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6">
        <div>
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping"></span>
            <h3 className="text-base font-bold text-slate-800 tracking-tight">
              Real-Time Household Energy Balance
            </h3>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            {isProsumer
              ? 'Live generation, local home load, and dynamic exportable surplus'
              : 'Live demand, local storage, and peer microgrid import'}
          </p>
        </div>

        {onSimulateClick && (
          <button
            onClick={onSimulateClick}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-semibold border border-emerald-200 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Simulate Smart Meter</span>
          </button>
        )}
      </div>

      {/* Interactive Energy Flow Diagram */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 sm:gap-6 relative">
        {/* Node 1: Solar Generation */}
        <div className="flex flex-col items-center text-center p-4 rounded-xl bg-amber-50/60 border border-amber-200/80 relative">
          <div className="w-12 h-12 rounded-2xl bg-amber-500 text-white flex items-center justify-center shadow-md shadow-amber-500/20 mb-3">
            <Sun className="w-6 h-6 animate-spin-slow" />
          </div>
          <span className="text-[11px] font-bold text-amber-900 uppercase tracking-wider">
            Solar Generation
          </span>
          <div className="text-xl font-extrabold text-amber-700 mt-1">
            {formatKwh(productionKwh)}
          </div>
          <span className="text-[10px] text-amber-700/80 mt-1">Rooftop PV Arrays</span>
        </div>

        {/* Node 2: Home Consumption */}
        <div className="flex flex-col items-center text-center p-4 rounded-xl bg-blue-50/60 border border-blue-200/80 relative">
          <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20 mb-3">
            <Home className="w-6 h-6" />
          </div>
          <span className="text-[11px] font-bold text-blue-900 uppercase tracking-wider">
            Home Load
          </span>
          <div className="text-xl font-extrabold text-blue-700 mt-1">
            {formatKwh(consumptionKwh)}
          </div>
          <span className="text-[10px] text-blue-700/80 mt-1">Active Appliances</span>
        </div>

        {/* Node 3: Battery Storage */}
        <div className="flex flex-col items-center text-center p-4 rounded-xl bg-purple-50/60 border border-purple-200/80 relative">
          <div className="w-12 h-12 rounded-2xl bg-purple-600 text-white flex items-center justify-center shadow-md shadow-purple-500/20 mb-3">
            <BatteryCharging className="w-6 h-6" />
          </div>
          <span className="text-[11px] font-bold text-purple-900 uppercase tracking-wider">
            Battery Bank
          </span>
          <div className="text-xl font-extrabold text-purple-700 mt-1">
            {formatKwh(batteryKwh)}
          </div>
          <div className="w-full bg-purple-200 h-1.5 rounded-full mt-2 overflow-hidden">
            <div
              className="bg-purple-600 h-full rounded-full transition-all duration-500"
              style={{ width: `${batteryPercent}%` }}
            />
          </div>
          <span className="text-[10px] text-purple-700/80 mt-1">{batteryPercent}% State of Charge</span>
        </div>

        {/* Node 4: Net Mesh Exchange (Surplus to sell OR Deficit to buy) */}
        <div
          className={`flex flex-col items-center text-center p-4 rounded-xl border relative ${
            surplus > 0
              ? 'bg-emerald-50/70 border-emerald-300'
              : 'bg-rose-50/70 border-rose-300'
          }`}
        >
          <div
            className={`w-12 h-12 rounded-2xl text-white flex items-center justify-center shadow-md mb-3 ${
              surplus > 0
                ? 'bg-emerald-600 shadow-emerald-500/20'
                : 'bg-rose-600 shadow-rose-500/20'
            }`}
          >
            <Zap className="w-6 h-6" />
          </div>
          <span
            className={`text-[11px] font-bold uppercase tracking-wider ${
              surplus > 0 ? 'text-emerald-900' : 'text-rose-900'
            }`}
          >
            {surplus > 0 ? 'Surplus (For Sale)' : 'Grid Deficit (Demand)'}
          </span>
          <div
            className={`text-xl font-extrabold mt-1 ${
              surplus > 0 ? 'text-emerald-700' : 'text-rose-700'
            }`}
          >
            {formatKwh(surplus > 0 ? surplus : deficit)}
          </div>
          <span
            className={`text-[10px] font-medium mt-1 ${
              surplus > 0 ? 'text-emerald-700' : 'text-rose-700'
            }`}
          >
            {surplus > 0 ? 'Ready for P2P trading' : 'Procure from local peers'}
          </span>
        </div>
      </div>

      {/* Energy Flow Summary Banner */}
      <div className="mt-5 p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
        <div className="flex items-center space-x-2 text-slate-700">
          <span className="font-semibold">Self-Sufficiency Ratio:</span>
          <span className="font-bold text-emerald-600">
            {consumptionKwh > 0
              ? `${Math.min(100, Math.round((productionKwh / consumptionKwh) * 100))}%`
              : '100%'}
          </span>
        </div>

        <div className="flex items-center space-x-2 text-slate-700">
          <span className="font-semibold">Current Dispatch Action:</span>
          {surplus > 0 ? (
            <span className="font-bold text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded">
              Exporting {formatKwh(surplus)} to SolarMesh Market
            </span>
          ) : deficit > 0 ? (
            <span className="font-bold text-blue-700 bg-blue-100/80 px-2 py-0.5 rounded">
              Bidding for {formatKwh(deficit)} on Microgrid
            </span>
          ) : (
            <span className="font-bold text-slate-600 bg-slate-200 px-2 py-0.5 rounded">
              Grid Balanced (0 kWh Net)
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default EnergyFlowVisualizer;
