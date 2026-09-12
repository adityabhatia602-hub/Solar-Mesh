import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  ArrowLeftRight,
  History,
  Network,
  BarChart3,
  Blocks,
  Cpu,
  X,
  Zap,
  Activity,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

const NAV_ITEMS = [
  {
    name: 'Dashboard',
    path: '/',
    icon: LayoutDashboard,
    description: 'Live solar generation & home energy balance',
  },
  {
    name: 'Community Market',
    path: '/marketplace',
    icon: ArrowLeftRight,
    description: 'Buy & sell excess solar power locally',
  },
  {
    name: 'Trade Receipts',
    path: '/trades',
    icon: History,
    description: 'Completed transactions & receipts',
  },
  {
    name: 'Grid Network',
    path: '/network',
    icon: Network,
    description: 'Neighborhood substations & power flow',
  },
  {
    name: 'Analytics',
    path: '/analytics',
    icon: BarChart3,
    description: 'Clean energy savings & carbon offset',
  },
  {
    name: 'Blockchain Ledger',
    path: '/blockchain',
    icon: Blocks,
    description: 'Cryptographic proof & smart escrow',
  },
  {
    name: 'Energy Devices',
    path: '/profile',
    icon: Cpu,
    description: 'Solar panels, battery & account',
  },
];

export const Sidebar = ({ isOpen, onClose }) => {
  const { user, isProsumer } = useAuth();

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-slate-900/40 z-40 lg:hidden backdrop-blur-xs transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-40 w-64 bg-white border-r border-slate-200 flex flex-col transition-transform duration-200 ease-in-out lg:translate-x-0 lg:static lg:z-auto ${
          isOpen ? 'translate-x-0 shadow-xl' : '-translate-x-full'
        }`}
      >
        {/* Sidebar Header (Mobile close button) */}
        <div className="h-16 flex items-center justify-between px-6 border-b border-slate-100 lg:hidden">
          <span className="font-bold text-slate-800 text-sm">SolarMesh Navigation</span>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Items */}
        <div className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          <div className="px-3 pb-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Navigation
            </span>
          </div>

          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={onClose}
                end={item.path === '/'}
                className={({ isActive }) =>
                  `flex items-center space-x-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-colors duration-150 ${
                    isActive
                      ? 'bg-slate-100 text-slate-900 border border-slate-200/80 shadow-2xs'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 border border-transparent'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon
                      className={`w-4 h-4 shrink-0 transition-colors ${
                        isActive ? 'text-emerald-700' : 'text-slate-400'
                      }`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="truncate">{item.name}</div>
                    </div>
                  </>
                )}
              </NavLink>
            );
          })}
        </div>

        {/* Grid Health Status Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/50">
          <div className="p-3 bg-white rounded-xl border border-slate-200/80 shadow-2xs space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-1.5 text-xs font-bold text-slate-800">
                <Activity className="w-3.5 h-3.5 text-slate-600" />
                <span>Grid Status</span>
              </div>
              <span className="text-[10px] font-bold px-1.5 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-200/60 rounded">
                Online & Healthy
              </span>
            </div>

            <div className="space-y-1 text-[11px] text-slate-500">
              <div className="flex justify-between">
                <span>Avg Transmission Loss:</span>
                <span className="font-semibold text-slate-700">~2.1%</span>
              </div>
              <div className="flex justify-between">
                <span>Routing:</span>
                <span className="font-semibold text-slate-700">Smart Local Path</span>
              </div>
            </div>

            <div className="pt-1 border-t border-slate-100 text-[10px] text-slate-400 flex items-center justify-between">
              <span>Substation Headroom:</span>
              <span className="text-emerald-700 font-semibold">Normal (76%)</span>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
