import React, { useState, useEffect, useCallback } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Navbar from './Navbar';
import Sidebar from './Sidebar';
import BottomNav from './BottomNav';
import { walletApi } from '../../api/wallet';
import { useMarket } from '../../hooks/useMarket';
import { formatCurrency, formatKwh } from '../../utils/formatters';
import { Zap, Activity } from 'lucide-react';

export const AppLayout = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [wallet, setWallet] = useState(null);
  const { liveTrades, refreshCounter } = useMarket();
  const location = useLocation();

  // Fetch wallet balance
  const fetchWallet = useCallback(async () => {
    try {
      const data = await walletApi.getWallet();
      setWallet(data);
    } catch (err) {
      console.warn('Failed to load wallet balance:', err);
    }
  }, []);

  useEffect(() => {
    fetchWallet();
  }, [fetchWallet, refreshCounter, location.pathname]);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col antialiased transition-colors duration-150">
      {/* Real-time Market Marquee Ticker */}
      <div className="bg-slate-900 text-slate-300 text-xs py-2 px-4 overflow-hidden border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center space-x-2 shrink-0 pr-4">
          <span className="flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="font-bold text-[11px] text-white uppercase tracking-wider">
            Live Clearing Stream:
          </span>
        </div>

        <div className="flex-1 overflow-x-auto whitespace-nowrap scrollbar-none flex items-center space-x-6 text-[11px]">
          {liveTrades.length > 0 ? (
            liveTrades.slice(0, 5).map((t, idx) => (
              <span
                key={`${t.id || 'trade'}-${idx}`}
                className="inline-flex items-center space-x-1.5 text-slate-300 font-medium shrink-0"
              >
                <Zap className="w-3 h-3 text-slate-400" />
                <span className="text-slate-400">Trade:</span>
                <span className="text-white font-bold">{formatKwh(t.quantity_kwh)}</span>
                <span className="text-slate-400">@</span>
                <span className="text-emerald-400 font-semibold">{formatCurrency(t.price_per_kwh)}/kWh</span>
                <span className="text-slate-400 text-[10px]">
                  (Settled: {formatCurrency(t.total_amount)})
                </span>
              </span>
            ))
          ) : (
            <span className="text-slate-400 text-[11px] font-medium">
              Network double auction active • Continuous 5s dispatch cycles with transmission loss routing
            </span>
          )}
        </div>

        <div className="hidden lg:flex items-center space-x-2 pl-4 text-slate-400 text-[11px] shrink-0">
          <Activity className="w-3.5 h-3.5 text-slate-400" />
          <span>Base Line Loss:</span>
          <span className="text-emerald-400 font-bold">~2.0%</span>
        </div>
      </div>

      {/* Main App Shell */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

        {/* Content Viewport */}
        <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
          <Navbar
            onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
            walletBalance={wallet}
            onWalletRefresh={fetchWallet}
          />

          <main className="flex-1 p-3.5 sm:p-6 lg:p-8 pb-24 lg:pb-8 max-w-7xl w-full mx-auto">
            <Outlet />
          </main>
        </div>
      </div>

      {/* Mobile Bottom Thumb Navigation */}
      <BottomNav />
    </div>
  );
};

export default AppLayout;
