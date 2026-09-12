import React from 'react';

export const Card = ({
  children,
  className = '',
  title,
  subtitle,
  action,
  icon: Icon,
  footer,
  noPadding = false,
  ...props
}) => {
  return (
    <div
      className={`bg-white rounded-xl border border-slate-200/80 shadow-xs transition-all duration-200 hover:shadow-sm ${className}`}
      {...props}
    >
      {(title || action || Icon) && (
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center space-x-3">
            {Icon && (
              <div className="p-2 bg-slate-100 text-slate-700 rounded-lg shrink-0">
                <Icon className="w-4 h-4" />
              </div>
            )}
            <div>
              {title && <h3 className="text-base font-semibold text-slate-800 tracking-tight">{title}</h3>}
              {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
            </div>
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}

      <div className={noPadding ? '' : 'p-5'}>{children}</div>

      {footer && (
        <div className="px-5 py-3 bg-slate-50/60 border-t border-slate-100 rounded-b-xl text-xs text-slate-500">
          {footer}
        </div>
      )}
    </div>
  );
};

export default Card;
