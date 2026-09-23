import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { DashboardLayout } from './layouts/DashboardLayout';

// Pages
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Onboarding } from './pages/Onboarding';
import { Pay } from './pages/Pay';
import { Transactions } from './pages/Transactions';
import { TransactionDetails } from './pages/TransactionDetails';
import { Bills } from './pages/Bills';
import { CreditHealth } from './pages/CreditHealth';
import { CreditCheck } from './pages/CreditCheck';
import { LendersMarketplace } from './pages/LendersMarketplace';
import { LimitHistory } from './pages/LimitHistory';
import { Security } from './pages/Security';
import { RiskLogs } from './pages/RiskLogs';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/" element={<DashboardLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="pay" element={<Pay />} />
            <Route path="transactions" element={<Transactions />} />
            <Route path="transactions/:id" element={<TransactionDetails />} />
            <Route path="bills" element={<Bills />} />
            <Route path="credit-health" element={<CreditHealth />} />
            <Route path="credit-check" element={<CreditCheck />} />
            <Route path="marketplace" element={<LendersMarketplace />} />
            <Route path="credit-health/history" element={<LimitHistory />} />
            <Route path="security" element={<Security />} />
            <Route path="risk-logs" element={<RiskLogs />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
