import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import Button from './Button';

export const ErrorMessage = ({
  title = 'Something went wrong',
  message,
  onRetry,
  className = '',
}) => {
  return (
    <div
      className={`p-5 bg-rose-50/70 border border-rose-200/80 rounded-xl text-rose-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${className}`}
    >
      <div className="flex items-start space-x-3">
        <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
        <div>
          <h4 className="text-sm font-semibold text-rose-900">{title}</h4>
          {message && <p className="text-xs text-rose-700 mt-1">{message}</p>}
        </div>
      </div>
      {onRetry && (
        <Button
          variant="danger"
          size="sm"
          onClick={onRetry}
          icon={RefreshCw}
          className="shrink-0 text-xs"
        >
          Try Again
        </Button>
      )}
    </div>
  );
};

export default ErrorMessage;
