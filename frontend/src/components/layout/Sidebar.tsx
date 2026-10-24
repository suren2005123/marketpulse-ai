import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Database,
  Radar,
  Sparkles,
  Compass,
  LineChart,
  Award,
  Bell,
  Star,
  Radio,
  Settings,
} from 'lucide-react';

const NAV_ITEMS = [
  { path: '/', label: 'Overview Dashboard', icon: LayoutDashboard },
  { path: '/stocks', label: 'All Stocks', icon: Database },
  { path: '/radar', label: 'Anomaly Radar', icon: Radar },
  { path: '/investigator', label: 'Move Investigator', icon: Sparkles },
  { path: '/explorer', label: 'Stock Explorer', icon: Compass },
  { path: '/stocks/RELIANCE', label: 'Stock Detail & Chart', icon: LineChart },
  { path: '/performance', label: 'Forecast Performance', icon: Award },
  { path: '/alerts', label: 'Price Alerts', icon: Bell },
  { path: '/watchlist', label: 'Personal Watchlist', icon: Star },
  { path: '/feed-status', label: 'Data Feed Status', icon: Radio },
  { path: '/settings', label: 'Settings & Security', icon: Settings },
];

export const Sidebar: React.FC = () => {
  return (
    <aside className="w-64 border-r border-slate-800/80 bg-[#07090e] flex flex-col justify-between p-4 hidden md:flex shrink-0">
      <div className="space-y-6">
        <div className="px-3">
          <p className="text-[11px] font-bold tracking-wider text-slate-500 uppercase font-mono">
            Platform Terminal
          </p>
        </div>

        <nav className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                    isActive
                      ? 'bg-blue-600/15 text-blue-400 border border-blue-500/30 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                  }`
                }
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
      </div>

      {/* Financial Disclaimer Banner */}
      <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 text-[11px] text-slate-400 leading-relaxed">
        <p className="font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
          Educational Forecasts
        </p>
        <p className="text-[10px] text-slate-500">
          Machine learning estimates are rolling statistical approximations, not certainties or investment advice.
        </p>
      </div>
    </aside>
  );
};
