import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User } from '../types';
import { initializeCreditLines, mockCreditLines, resetCreditLine } from '../api/mockData';

interface AuthContextType {
  user: User | null;
  login: (user: User) => void;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const stored = localStorage.getItem('super_money_auth_user');
      if (stored) return JSON.parse(stored);
    } catch (e) {
      console.error(e);
    }
    return null;
  });
  const [isLoading, setIsLoading] = useState(false);

  // When the app loads, if there is a user, re-initialize their mock data if needed
  useEffect(() => {
    if (user) {
      if (user.vpa === 'existing@super.money' && mockCreditLines.length === 0) {
        initializeCreditLines([{ name: 'RBL Bank', approvedLimit: 25000, interestRate: 18.0, id: '1', lenderId: '1', type: 'CREDIT_CARD', processingFee: 0 }], 82);
      }
    }
  }, [user]);

  const login = (newUser: User) => {
    setIsLoading(true);
    setTimeout(() => {
      setUser(newUser);
      localStorage.setItem('super_money_auth_user', JSON.stringify(newUser));
      
      // Bootstrap the mock data appropriately based on persona
      if (newUser.vpa === 'existing@super.money') {
        initializeCreditLines([{ name: 'RBL Bank', approvedLimit: 25000, interestRate: 18.0, id: '1', lenderId: '1', type: 'CREDIT_CARD', processingFee: 0 }], 82);
      } else {
        resetCreditLine();
      }
      
      setIsLoading(false);
    }, 500);
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('super_money_auth_user');
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
