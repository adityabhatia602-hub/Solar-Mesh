import React from 'react';

const VARIANTS = {
  emerald: 'bg-emerald-50 text-emerald-800 border-emerald-200/70',
  green: 'bg-emerald-50 text-emerald-800 border-emerald-200/70',
  amber: 'bg-amber-50 text-amber-800 border-amber-200/70',
  blue: 'bg-slate-100 text-slate-700 border-slate-200',
  rose: 'bg-rose-50 text-rose-800 border-rose-200/70',
  purple: 'bg-slate-100 text-slate-700 border-slate-200',
  slate: 'bg-slate-100 text-slate-700 border-slate-200',
};

const DOT_COLORS = {
  emerald: 'bg-emerald-500',
  green: 'bg-emerald-500',
  amber: 'bg-amber-500',
  blue: 'bg-slate-500',
  rose: 'bg-rose-500',
  purple: 'bg-slate-500',
  slate: 'bg-slate-400',
};

export const Badge = ({
  children,
  variant = 'slate',
  size = 'md',
  dot = false,
  className = '',
}) => {
  const variantClass = VARIANTS[variant] || VARIANTS.slate;
  const dotColor = DOT_COLORS[variant] || DOT_COLORS.slate;
  const sizeClass = size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs';

  return (
    <span
      className={`inline-flex items-center font-medium rounded-full border ${variantClass} ${sizeClass} ${className}`}
    >
      {dot && <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${dotColor}`} />}
      {children}
    </span>
  );
};

export default Badge;
