import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { User } from '../types';
import { ShieldCheck, User as UserIcon, UserPlus } from 'lucide-react';

export const Login = () => {
  const { login, isLoading } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async (type: 'existing' | 'new') => {
    let user: User;
    if (type === 'existing') {
      user = { id: 'U1', name: 'Existing User', vpa: 'existing@super.money' };
    } else {
      user = { id: 'U2', name: 'New User', vpa: 'new@super.money' };
    }
    
    await login(user);
    if (type === 'existing') {
      navigate('/');
    } else {
      navigate('/onboarding');
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden p-8 text-center">
        <ShieldCheck className="w-20 h-20 mx-auto mb-6 text-emerald-500" />
        <h1 className="text-3xl font-bold text-slate-900 mb-2">ConsumptionCredit</h1>
        <p className="text-slate-500 mb-8">Select a demo persona to login</p>

        <div className="space-y-4">
          <button 
            onClick={() => handleLogin('existing')}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-3 bg-emerald-50 border-2 border-emerald-500 text-emerald-800 font-bold py-4 rounded-xl hover:bg-emerald-100 transition shadow-sm disabled:opacity-50"
          >
            <UserIcon size={24} className="text-emerald-600" />
            <div className="text-left">
              <div className="text-lg">Existing User</div>
              <div className="text-xs font-medium text-emerald-600 opacity-80">existing@super.money</div>
            </div>
          </button>

          <button 
            onClick={() => handleLogin('new')}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-3 bg-blue-50 border-2 border-blue-500 text-blue-800 font-bold py-4 rounded-xl hover:bg-blue-100 transition shadow-sm disabled:opacity-50"
          >
            <UserPlus size={24} className="text-blue-600" />
            <div className="text-left">
              <div className="text-lg">New User</div>
              <div className="text-xs font-medium text-blue-600 opacity-80">new@super.money</div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};
