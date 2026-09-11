import React from 'react';

const VARIANTS = {
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200/60',
  green: 'bg-green-50 text-green-700 border-green-200/60',
  amber: 'bg-amber-50 text-amber-700 border-amber-200/60',
  blue: 'bg-blue-50 text-blue-700 border-blue-200/60',
  rose: 'bg-rose-50 text-rose-700 border-rose-200/60',
  purple: 'bg-purple-50 text-purple-700 border-purple-200/60',
  slate: 'bg-slate-100 text-slate-700 border-slate-200',
};

const DOT_COLORS = {
  emerald: 'bg-emerald-500',
  green: 'bg-green-500',
  amber: 'bg-amber-500',
  blue: 'bg-blue-500',
  rose: 'bg-rose-500',
  purple: 'bg-purple-500',
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
