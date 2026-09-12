import React from 'react';
import { Sun, BatteryCharging, Home, Zap, CheckCircle2 } from 'lucide-react';
import { formatKwh } from '../../utils/formatters';

/** Live home energy balance using instantaneous kW readings + battery SOC. */
export const EnergyFlowVisualizer = ({
  productionKw = 0,
  consumptionKw = 0,
  batterySoc = 0,
  isProsumer = true,
  onActionClick,
}) => {
  const surplus = Math.max(0, productionKw - consumptionKw);
  const deficit = Math.max(0, consumptionKw - productionKw);
  const batteryPercent = Math.min(100, Math.max(0, Math.round(batterySoc)));

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-xs relative overflow-hidden transition-colors duration-150">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6">
        <div>
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <h3 className="text-base font-bold text-slate-900 tracking-tight">
              Live Home Energy Balance
            </h3>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Simulated digital-twin telemetry: generation, usage, battery, and market position
          </p>
        </div>

        {/* Live Status Badge */}
        <div className="flex items-center space-x-2">
          {surplus > 0.1 ? (
            <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200/60 text-emerald-800 text-xs font-bold">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span>Surplus Available (+{formatKwh(surplus, 2)})</span>
            </span>
          ) : deficit > 0.1 ? (
            <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold">
              <span className="w-2 h-2 rounded-full bg-slate-500" />
              <span>Deficit (-{formatKwh(deficit, 2)})</span>
            </span>
          ) : (
            <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Balanced</span>
            </span>
          )}
        </div>
      </div>

      {/* 4 Flow Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5 relative">
        {/* 1. Solar Generation */}
        <div className="flex flex-col items-center text-center p-4 rounded-xl bg-white border border-slate-200/80 shadow-2xs">
          <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-600 border border-amber-200/60 flex items-center justify-center mb-2.5">
            <Sun className="w-5 h-5" />
          </div>
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            Solar Generation
          </span>
          <div className="text-2xl font-black text-slate-900 mt-1">
            {formatKwh(productionKw, 2)}
          </div>
          <span className="text-[11px] text-slate-400 mt-0.5">Live PV output</span>
        </div>

        {/* 2. Home Consumption */}
        <div className="flex flex-col items-center text-center p-4 rounded-xl bg-white border border-slate-200/80 shadow-2xs">
          <div className="w-11 h-11 rounded-xl bg-slate-100 text-slate-700 border border-slate-200 flex items-center justify-center mb-2.5">
            <Home className="w-5 h-5" />
          </div>
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            Consumption
          </span>
          <div className="text-2xl font-black text-slate-900 mt-1">
            {formatKwh(consumptionKw, 2)}
          </div>
          <span className="text-[11px] text-slate-400 mt-0.5">Live household load</span>
        </div>

        {/* 3. Battery Storage */}
        <div className="flex flex-col items-center text-center p-4 rounded-xl bg-white border border-slate-200/80 shadow-2xs">
          <div className="w-11 h-11 rounded-xl bg-slate-100 text-slate-700 border border-slate-200 flex items-center justify-center mb-2.5">
            <BatteryCharging className="w-5 h-5" />
          </div>
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            Battery
          </span>
          <div className="text-2xl font-black text-slate-900 mt-1">{batteryPercent}%</div>
          <div className="w-full bg-slate-100 h-1.5 rounded-full mt-2 overflow-hidden">
            <div
              className="bg-emerald-600 h-full rounded-full transition-all duration-500"
              style={{ width: `${batteryPercent}%` }}
            />
          </div>
          <span className="text-[10px] text-slate-400 mt-1">State of charge</span>
        </div>

        {/* 4. Surplus / Deficit action card */}
        <div
          className={`flex flex-col items-center text-center p-4 rounded-xl border shadow-2xs transition-all ${
            surplus > 0.1
              ? 'bg-emerald-50/60 border-emerald-300'
              : 'bg-slate-50 border-slate-200'
          }`}
        >
          <div
            className={`w-11 h-11 rounded-xl flex items-center justify-center mb-2.5 ${
              surplus > 0.1 ? 'bg-emerald-600 text-white shadow-xs' : 'bg-slate-200 text-slate-700'
            }`}
          >
            <Zap className="w-5 h-5" />
          </div>
          <span
            className={`text-[11px] font-bold uppercase tracking-wider ${
              surplus > 0.1 ? 'text-emerald-800' : 'text-slate-600'
            }`}
          >
            {surplus > 0.1 ? 'Surplus to Market' : 'Market Position'}
          </span>
          <div
            className={`text-2xl font-black mt-1 ${
              surplus > 0.1 ? 'text-emerald-800' : 'text-slate-900'
            }`}
          >
            {formatKwh(surplus > 0.1 ? surplus : deficit, 2)}
          </div>

          {onActionClick && (
            <button
              onClick={() =>
                onActionClick(surplus > 0.1 ? 'offer' : 'bid', surplus > 0.1 ? surplus : Math.max(1, deficit))
              }
              className={`mt-2.5 w-full py-1.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                surplus > 0.1
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'
                  : 'bg-slate-900 hover:bg-slate-800 text-white'
              }`}
            >
              {surplus > 0.1 ? 'Sell Surplus' : 'Buy Energy'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default EnergyFlowVisualizer;
