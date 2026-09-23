import React, { useEffect, useState } from 'react';
import { Outlet, NavLink, useNavigate, Navigate } from 'react-router-dom';
import { LayoutDashboard, CreditCard, Activity, ReceiptText, ShieldCheck, Shield, Send, Clock, ShieldAlert, Database, Target, Landmark, FileSearch } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { creditApi } from '../api/creditApi';

export const DashboardLayout = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    if (user) {
      creditApi.getCreditStatus(user.id)
        .then((data) => {
          if (!data) {
            navigate('/onboarding');
          } else {
            setIsChecking(false);
          }
        })
        .catch(() => {
          // If no credit line exists, it rejects
          navigate('/onboarding');
        });
    }
  }, [user, navigate]);

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (isChecking) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-400">Loading your profile...</div>;
  }

  const navItems = [
    { to: '/', icon: <LayoutDashboard size={20} />, label: 'Dashboard' },
    { to: '/credit-check', icon: <FileSearch size={20} />, label: 'Credit Check' },
    { to: '/marketplace', icon: <Landmark size={20} />, label: 'Lenders Marketplace' },
    { to: '/pay', icon: <Send size={20} />, label: 'Pay' },
    { to: '/transactions', icon: <Clock size={20} />, label: 'Transactions' },
    { to: '/bills', icon: <ReceiptText size={20} />, label: 'Bills' },
    { to: '/credit-health', icon: <Activity size={20} />, label: 'Credit Health' },
    { to: '/security', icon: <ShieldCheck size={20} />, label: 'Security' }
  ];

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-fintech-background">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 bg-white border-r border-fintech-border min-h-screen p-4 sticky top-0 h-screen">
        <div className="font-bold text-xl text-fintech-primary mb-8 px-4 py-2">
          ConsumptionCredit
        </div>
        <nav className="space-y-1 flex-1">
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => 
                `flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${
                  isActive ? 'bg-fintech-primary text-white' : 'text-fintech-secondary hover:bg-gray-100'
                }`
              }
            >
              {item.icon}
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-4 mt-auto border-t border-fintech-border">
          <p className="text-sm font-semibold text-fintech-primary">{user?.name}</p>
          <p className="text-xs text-fintech-secondary">{user?.vpa}</p>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-4 md:p-8 overflow-y-auto mb-16 md:mb-0">
        <div className="md:hidden font-bold text-xl text-fintech-primary mb-6 text-center">
          ConsumptionCredit
        </div>
        <Outlet />
      </main>

      {/* Mobile Bottom Nav */}
      <nav className="md:hidden fixed bottom-0 w-full bg-white border-t border-fintech-border flex justify-around p-2 pb-safe shadow-lg z-50">
        {navItems.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => 
              `flex flex-col items-center p-2 rounded-lg ${
                isActive ? 'text-fintech-primary' : 'text-fintech-secondary'
              }`
            }
          >
            {item.icon}
            <span className="text-[10px] mt-1 font-medium">{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
};
