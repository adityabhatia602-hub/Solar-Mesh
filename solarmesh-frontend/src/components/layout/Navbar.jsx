import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Sun,
  Zap,
  Wallet,
  LogOut,
  User,
  PlusCircle,
  Menu,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useMarket } from '../../hooks/useMarket';
import { useToast } from '../../hooks/useToast';
import { formatCurrency } from '../../utils/formatters';
import { walletApi } from '../../api/wallet';
import Button from '../common/Button';
import Modal from '../common/Modal';
import logoImg from '../../assets/logo.png';

export const Navbar = ({ onToggleSidebar, walletBalance, onWalletRefresh }) => {
  const { user, logout, isProsumer } = useAuth();
  const { connectionStatus } = useMarket();
  const toast = useToast();
  const navigate = useNavigate();

  const [isDepositOpen, setIsDepositOpen] = useState(false);
  const [depositAmount, setDepositAmount] = useState('100');
  const [isDepositing, setIsDepositing] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
    toast.info('Logged out successfully');
  };

  const handleQuickDeposit = async () => {
    try {
      setIsDepositing(true);
      await walletApi.depositSelf(Number(depositAmount));
      if (onWalletRefresh) onWalletRefresh();
      setIsDepositOpen(false);
      toast.success(`Deposited $${Number(depositAmount).toFixed(2)} test funds to wallet`);
    } catch (err) {
      toast.error('Deposit failed: ' + (err.response?.data?.detail || err.message));
    } finally {
      setIsDepositing(false);
    }
  };

  return (
    <>
      <header className="h-16 bg-white border-b border-slate-200 sticky top-0 z-30 flex items-center justify-between px-4 sm:px-6 transition-colors duration-150">
        {/* Left: Mobile Menu & Logo / Branding */}
        <div className="flex items-center space-x-2 sm:space-x-3">
          <button
            onClick={onToggleSidebar}
            className="lg:hidden p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
            aria-label="Toggle navigation menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          <Link to="/" className="flex items-center space-x-2.5 group">
            <img
              src={logoImg}
              alt="SolarMesh"
              className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl object-cover shadow-xs shrink-0 group-hover:scale-105 transition-transform duration-150"
            />
            <div>
              <div className="flex items-center space-x-1.5">
                <span className="font-extrabold text-slate-900 tracking-tight text-sm sm:text-lg">
                  Solar<span className="text-emerald-700">Mesh</span>
                </span>
                <span className="hidden sm:inline-block text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 bg-slate-100 text-slate-600 border border-slate-200 rounded">
                  P2P Grid
                </span>
              </div>
              <p className="hidden sm:block text-[11px] text-slate-400 font-medium truncate max-w-[200px] md:max-w-none">
                Network-Aware Solar Energy Marketplace
              </p>
            </div>
          </Link>
        </div>

        {/* Right: Live Status, Role Badge, Wallet, Profile */}
        <div className="flex items-center space-x-1.5 sm:space-x-3">
          {/* Live WebSocket Status Indicator */}
          <div className="hidden sm:flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-slate-50 border border-slate-200 text-xs text-slate-600">
            {connectionStatus === 'connected' ? (
              <>
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="font-medium text-emerald-800 text-[11px]">Live Grid</span>
              </>
            ) : connectionStatus === 'connecting' ? (
              <>
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                <span className="text-amber-800 text-[11px]">Syncing...</span>
              </>
            ) : (
              <>
                <span className="w-2 h-2 rounded-full bg-slate-400" />
                <span className="text-slate-500 text-[11px]">Offline</span>
              </>
            )}
          </div>

          {/* User Role Badge (Desktop / Tablet) */}
          <div className="hidden md:flex items-center space-x-1.5 px-2.5 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700">
            {isProsumer ? (
              <Sun className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            ) : user?.role === 'admin' ? (
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            ) : (
              <Zap className="w-3.5 h-3.5 text-slate-600 shrink-0" />
            )}
            <span className="font-bold text-slate-800">
              {user?.full_name ? user.full_name.split(' ')[0] : 'User'}
            </span>
            <span className="capitalize text-[11px] text-slate-500">({user?.role})</span>
          </div>

          {/* Wallet Balance & Faucet Button */}
          <div className="flex items-center space-x-1.5 bg-slate-50 hover:bg-slate-100 px-2 sm:px-3 py-1 sm:py-1.5 rounded-xl border border-slate-200 transition-colors">
            <Wallet className="w-3.5 h-3.5 text-slate-600 shrink-0" />
            <div className="text-right">
              <span className="text-[11px] sm:text-xs font-bold text-slate-900">
                {formatCurrency(walletBalance?.available ?? 0)}
              </span>
            </div>
            <button
              onClick={() => setIsDepositOpen(true)}
              title="Add mock test funds"
              className="p-0.5 text-slate-400 hover:text-slate-800 transition-colors cursor-pointer"
            >
              <PlusCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>
          </div>

          {/* User Profile & Logout */}
          <div className="flex items-center space-x-1 pl-1 sm:pl-2 border-l border-slate-200">
            <Link
              to="/profile"
              className="flex items-center p-0.5 text-slate-700 hover:text-slate-900 rounded-lg text-xs font-medium transition-colors"
              title={`View ${user?.email}`}
            >
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-slate-100 text-slate-800 border border-slate-200 flex items-center justify-center font-bold text-xs uppercase shrink-0">
                {user?.full_name ? user.full_name.charAt(0) : 'U'}
              </div>
            </Link>

            <button
              onClick={handleLogout}
              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
              title="Log out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Testnet Faucet Modal */}
      <Modal
        isOpen={isDepositOpen}
        onClose={() => setIsDepositOpen(false)}
        title="Wallet Balance Faucet"
        subtitle="Add test Indian Rupee (₹) funds to simulate energy purchases and settlements"
      >
        <div className="space-y-4">
          <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-xs text-emerald-800 flex items-start space-x-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <p>
              This sandbox faucet adds test currency to your microgrid balance. Bids will
              automatically reserve funds in escrow until trades are settled.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Select Preset Amount
            </label>
            <div className="grid grid-cols-3 gap-2 mb-3">
              {['50', '100', '500'].map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => setDepositAmount(amt)}
                  className={`py-2 px-3 rounded-lg text-sm font-semibold border transition-all cursor-pointer ${
                    depositAmount === amt
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  ₹{amt}
                </button>
              ))}
            </div>

            <div className="relative">
              <span className="absolute left-3 top-2.5 text-slate-400 font-semibold text-xs">₹</span>
              <input
                type="number"
                min="1"
                max="10000"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                className="w-full pl-8 pr-4 py-2 border border-slate-300 bg-white text-slate-900 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 font-semibold"
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
