import React from 'react';
import { Loader2 } from 'lucide-react';

const VARIANTS = {
  primary: 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs focus-visible:ring-emerald-500 border border-transparent cursor-pointer',
  secondary: 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 shadow-2xs focus-visible:ring-slate-400 cursor-pointer',
  outline: 'bg-transparent hover:bg-emerald-50/60 text-emerald-700 border border-emerald-300 focus-visible:ring-emerald-500 cursor-pointer',
  amber: 'bg-slate-900 hover:bg-slate-800 text-white shadow-2xs focus-visible:ring-slate-400 border border-transparent cursor-pointer',
  danger: 'bg-rose-600 hover:bg-rose-700 text-white shadow-2xs focus-visible:ring-rose-500 border border-transparent cursor-pointer',
  ghost: 'bg-transparent hover:bg-slate-100 text-slate-600 hover:text-slate-900 focus-visible:ring-slate-400 border border-transparent cursor-pointer',
};

const SIZES = {
  xs: 'px-2 py-1 text-xs',
  sm: 'px-3 py-1.5 text-xs font-medium',
  md: 'px-4 py-2 text-sm font-medium',
  lg: 'px-5 py-2.5 text-base font-medium',
};

export const Button = ({
  children,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  disabled = false,
  className = '',
  icon: Icon = null,
  iconPosition = 'left',
  type = 'button',
  onClick,
  ...props
}) => {
  const variantClass = VARIANTS[variant] || VARIANTS.primary;
  const sizeClass = SIZES[size] || SIZES.md;

  return (
    <button
      type={type}
      disabled={disabled || isLoading}
      onClick={onClick}
      className={`inline-flex items-center justify-center rounded-lg transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${variantClass} ${sizeClass} ${className}`}
      {...props}
    >
      {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
      {!isLoading && Icon && iconPosition === 'left' && <Icon className="w-4 h-4 mr-2 shrink-0" />}
      <span>{children}</span>
      {!isLoading && Icon && iconPosition === 'right' && <Icon className="w-4 h-4 ml-2 shrink-0" />}
    </button>
  );
};

export default Button;
