import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Sun,
  Zap,
  Wallet,
  LogOut,
  User,
  PlusCircle,
  Wifi,
  WifiOff,
  Menu,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useMarket } from '../../hooks/useMarket';
import { formatCurrency } from '../../utils/formatters';
import { walletApi } from '../../api/wallet';
import Button from '../common/Button';
import Modal from '../common/Modal';

export const Navbar = ({ onToggleSidebar, walletBalance, onWalletRefresh }) => {
  const { user, logout, isProsumer } = useAuth();
  const { connectionStatus } = useMarket();
  const navigate = useNavigate();

  const [isDepositOpen, setIsDepositOpen] = useState(false);
  const [depositAmount, setDepositAmount] = useState('100');
  const [isDepositing, setIsDepositing] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleQuickDeposit = async () => {
    try {
      setIsDepositing(true);
      await walletApi.depositSelf(Number(depositAmount));
      if (onWalletRefresh) onWalletRefresh();
      setIsDepositOpen(false);
    } catch (err) {
      console.error('Deposit error:', err);
    } finally {
      setIsDepositing(false);
    }
  };

  return (
    <>
      <header className="h-16 bg-white border-b border-slate-200/80 sticky top-0 z-30 flex items-center justify-between px-4 sm:px-6">
        {/* Left: Mobile Menu & Breadcrumbs / Title */}
        <div className="flex items-center space-x-3">
          <button
            onClick={onToggleSidebar}
            className="lg:hidden p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg"
          >
            <Menu className="w-5 h-5" />
          </button>

          <Link to="/" className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-600 to-amber-500 flex items-center justify-center text-white shadow-xs">
              <Sun className="w-5 h-5 text-white animate-spin-slow" />
            </div>
            <div>
              <div className="flex items-center space-x-1.5">
                <span className="font-extrabold text-slate-900 tracking-tight text-base sm:text-lg">
                  Solar<span className="text-emerald-600">Mesh</span>
                </span>
                <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 bg-emerald-100 text-emerald-800 rounded">
                  P2P Grid
                </span>
              </div>
              <p className="hidden sm:block text-[11px] text-slate-400 font-medium">
                Network-Aware Decentralized Energy Exchange
              </p>
            </div>
          </Link>
        </div>

        {/* Right: Real-time Status, Wallet, Profile */}
        <div className="flex items-center space-x-3 sm:space-x-4">
          {/* Live WS Status Indicator */}
          <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-slate-50 border border-slate-200 text-xs text-slate-600">
            {connectionStatus === 'connected' ? (
              <>
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="hidden sm:inline font-medium text-emerald-700">Live Feed</span>
              </>
            ) : connectionStatus === 'connecting' ? (
              <>
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                <span className="hidden sm:inline text-amber-700">Syncing...</span>
              </>
            ) : (
              <>
                <span className="w-2 h-2 rounded-full bg-slate-400" />
                <span className="hidden sm:inline text-slate-500">Offline</span>
              </>
            )}
          </div>

          {/* Quick Role Badge */}
          <div
            className={`hidden md:flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-semibold border ${
              isProsumer
                ? 'bg-amber-50 text-amber-800 border-amber-200'
                : 'bg-blue-50 text-blue-800 border-blue-200'
            }`}
          >
            {isProsumer ? <Sun className="w-3.5 h-3.5 text-amber-600" /> : <Zap className="w-3.5 h-3.5 text-blue-600" />}
            <span className="capitalize">{user?.role || 'Guest'}</span>
          </div>

          {/* Wallet Balance & Faucet Button */}
          <div className="flex items-center space-x-2 bg-slate-100/80 hover:bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200/80 transition-colors">
            <Wallet className="w-4 h-4 text-emerald-600 shrink-0" />
            <div className="text-right">
              <span className="text-xs font-bold text-slate-800">
                {formatCurrency(walletBalance?.available ?? 0)}
              </span>
            </div>
            <button
              onClick={() => setIsDepositOpen(true)}
              title="Hackathon Test Faucet"
              className="p-1 text-slate-400 hover:text-emerald-600 transition-colors"
            >
              <PlusCircle className="w-4 h-4" />
            </button>
          </div>

          {/* User Menu */}
          <div className="flex items-center space-x-2 pl-2 border-l border-slate-200">
            <Link
              to="/profile"
              className="flex items-center space-x-2 p-1 text-slate-700 hover:text-emerald-600 rounded-lg text-xs font-medium"
              title={user?.email}
            >
              <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-xs uppercase">
                {user?.full_name ? user.full_name.charAt(0) : 'U'}
              </div>
              <span className="hidden lg:inline max-w-[110px] truncate font-medium">
                {user?.full_name?.split(' ')[0] || user?.email}
              </span>
            </Link>

            <button
              onClick={handleLogout}
              className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Quick Faucet Modal */}
      <Modal
        isOpen={isDepositOpen}
        onClose={() => setIsDepositOpen(false)}
        title="Hackathon Wallet Faucet"
        subtitle="Instant test token funding for testing buy/sell orders"
      >
        <div className="space-y-4">
          <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-xs text-emerald-800 flex items-start space-x-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <p>
              This is a sandbox testnet faucet. You can instantly mint mock USD test funds to
              simulate energy bidding and settlement.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Select Deposit Amount
            </label>
            <div className="grid grid-cols-3 gap-2 mb-3">
              {['50', '100', '500'].map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => setDepositAmount(amt)}
                  className={`py-2 px-3 rounded-lg text-sm font-semibold border transition-all ${
                    depositAmount === amt
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  ${amt}
                </button>
              ))}
            </div>

            <div className="relative">
              <span className="absolute left-3 top-2.5 text-slate-400 font-semibold">$</span>
              <input
                type="number"
                min="1"
                max="10000"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                className="w-full pl-8 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 font-semibold"
                placeholder="Custom amount"
              />
            </div>
          </div>

          <div className="flex justify-end space-x-3 pt-3 border-t border-slate-100">
            <Button variant="secondary" onClick={() => setIsDepositOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              isLoading={isDepositing}
              onClick={handleQuickDeposit}
            >
              Deposit Funds
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
};

export default Navbar;
