import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

const ToastContext = createContext(null);

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((message, type = 'info', duration = 3500) => {
    const id = `${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    setToasts((prev) => [...prev, { id, message, type }]);

    if (duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, duration);
    }
  }, [removeToast]);

  const toast = {
    success: (msg, dur) => addToast(msg, 'success', dur),
    error: (msg, dur) => addToast(msg, 'error', dur),
    info: (msg, dur) => addToast(msg, 'info', dur),
  };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      {/* Toast Notification Container */}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col space-y-2 pointer-events-none max-w-sm w-full px-4 sm:px-0">
        {toasts.map((t) => {
          const isSuccess = t.type === 'success';
          const isError = t.type === 'error';
          const Icon = isSuccess ? CheckCircle2 : isError ? AlertCircle : Info;

          return (
            <div
              key={t.id}
              className={`pointer-events-auto flex items-start space-x-3 p-3.5 rounded-xl shadow-lg border text-xs font-medium transition-all duration-200 animate-in slide-in-from-bottom-5 ${
                isSuccess
                  ? 'bg-slate-900 text-white border-slate-800'
                  : isError
                  ? 'bg-rose-950 text-rose-100 border-rose-800'
                  : 'bg-slate-900 text-white border-slate-800'
              }`}
            >
              <Icon
                className={`w-4 h-4 shrink-0 mt-0.5 ${
                  isSuccess ? 'text-emerald-400' : isError ? 'text-rose-400' : 'text-blue-400'
                }`}
              />
              <div className="flex-1 min-w-0 pr-1">{t.message}</div>
              <button
                onClick={() => removeToast(t.id)}
                className="text-slate-400 hover:text-white shrink-0 p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return ctx;
};

export default ToastContext;
