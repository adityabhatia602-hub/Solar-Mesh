import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  ArrowLeftRight,
  Radio,
  Network,
  User,
} from 'lucide-react';

const MOBILE_NAV_ITEMS = [
  {
    name: 'Home',
    path: '/',
    icon: LayoutDashboard,
  },
  {
    name: 'Market',
    path: '/marketplace',
    icon: ArrowLeftRight,
  },
  {
    name: 'Telemetry',
    path: '/telemetry',
    icon: Radio,
  },
  {
    name: 'Grid',
    path: '/network',
    icon: Network,
  },
  {
    name: 'Profile',
    path: '/profile',
    icon: User,
  },
];

export const BottomNav = () => {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-30 lg:hidden bg-white/95 backdrop-blur-md border-t border-slate-200 shadow-lg pb-safe"
      aria-label="Mobile Navigation"
    >
      <div className="flex items-center justify-around h-14 max-w-lg mx-auto px-2">
        {MOBILE_NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center flex-1 py-1 text-[10px] font-medium transition-colors ${
                  isActive
                    ? 'text-emerald-700 font-bold'
                    : 'text-slate-400 hover:text-slate-600'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <div
                    className={`p-1 rounded-lg transition-transform ${
                      isActive ? 'bg-emerald-50 text-emerald-700 scale-110' : ''
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <span className="truncate mt-0.5">{item.name}</span>
                </>
              )}
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNav;
