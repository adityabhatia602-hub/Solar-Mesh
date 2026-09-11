import React from 'react';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';

const ACCENTS = {
  emerald: {
    bg: 'bg-emerald-50/70',
    iconBg: 'bg-emerald-500/10 text-emerald-600',
    border: 'border-emerald-100',
  },
  amber: {
    bg: 'bg-amber-50/70',
    iconBg: 'bg-amber-500/10 text-amber-600',
    border: 'border-amber-100',
  },
  blue: {
    bg: 'bg-blue-50/70',
    iconBg: 'bg-blue-500/10 text-blue-600',
    border: 'border-blue-100',
  },
  purple: {
    bg: 'bg-purple-50/70',
    iconBg: 'bg-purple-500/10 text-purple-600',
    border: 'border-purple-100',
  },
  slate: {
    bg: 'bg-slate-50/70',
    iconBg: 'bg-slate-500/10 text-slate-600',
    border: 'border-slate-200',
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
