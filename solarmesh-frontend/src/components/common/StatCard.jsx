import React from 'react';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';

const ACCENTS = {
  emerald: {
    bg: 'bg-white',
    iconBg: 'bg-emerald-50 text-emerald-700 border border-emerald-200/60',
    border: 'border-slate-200/80',
  },
  amber: {
    bg: 'bg-white',
    iconBg: 'bg-slate-100 text-slate-700 border border-slate-200',
    border: 'border-slate-200/80',
  },
  blue: {
    bg: 'bg-white',
    iconBg: 'bg-slate-100 text-slate-700 border border-slate-200',
    border: 'border-slate-200/80',
  },
  purple: {
    bg: 'bg-white',
    iconBg: 'bg-slate-100 text-slate-700 border border-slate-200',
    border: 'border-slate-200/80',
  },
  slate: {
    bg: 'bg-white',
    iconBg: 'bg-slate-100 text-slate-700 border border-slate-200',
    border: 'border-slate-200/80',
  },
};

export const StatCard = ({
  title,
  value,
  unit,
  subtitle,
  icon: Icon,
  trend,
  trendDirection = 'up',
  accent = 'emerald',
  className = '',
}) => {
  const style = ACCENTS[accent] || ACCENTS.emerald;

  return (
    <div
      className={`bg-white rounded-xl border border-slate-200/80 p-5 shadow-xs hover:shadow-sm transition-all duration-150 relative overflow-hidden ${className}`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">{title}</p>
          <div className="flex items-baseline mt-1.5 space-x-1.5">
            <span className="text-2xl font-bold tracking-tight text-slate-900">{value}</span>
            {unit && <span className="text-sm font-semibold text-slate-500">{unit}</span>}
          </div>
        </div>

        {Icon && (
          <div className={`p-2.5 rounded-xl ${style.iconBg}`}>
            <Icon className="w-5 h-5" />
          </div>
        )}
      </div>

      {(subtitle || trend) && (
        <div className="mt-3 flex items-center justify-between text-xs pt-2 border-t border-slate-100">
          {subtitle && <span className="text-slate-500 truncate">{subtitle}</span>}
          {trend && (
            <span
              className={`inline-flex items-center font-medium ${
                trendDirection === 'up' ? 'text-emerald-600' : 'text-rose-600'
              }`}
            >
              {trendDirection === 'up' ? (
                <ArrowUpRight className="w-3.5 h-3.5 mr-0.5" />
              ) : (
                <ArrowDownRight className="w-3.5 h-3.5 mr-0.5" />
              )}
              {trend}
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export default StatCard;
