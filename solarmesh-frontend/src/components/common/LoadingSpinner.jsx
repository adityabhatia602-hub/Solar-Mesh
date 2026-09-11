import React from 'react';
import { Loader2 } from 'lucide-react';

export const LoadingSpinner = ({
  message = 'Loading data...',
  size = 'md',
  fullHeight = false,
}) => {
  const sizeMap = {
    sm: 'w-4 h-4',
    md: 'w-7 h-7',
    lg: 'w-10 h-10',
  };

  return (
    <div
      className={`flex flex-col items-center justify-center p-8 text-center ${
        fullHeight ? 'min-h-[300px]' : ''
      }`}
    >
      <Loader2 className={`${sizeMap[size] || sizeMap.md} text-emerald-600 animate-spin mb-3`} />
      {message && <p className="text-sm font-medium text-slate-500">{message}</p>}
    </div>
  );
};

export default LoadingSpinner;
