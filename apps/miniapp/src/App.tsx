import type { MeResponse } from '@cyclefit/shared';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { api } from './api';
import CalendarScreen from './screens/CalendarScreen';
import Onboarding from './screens/Onboarding';
import Paywall from './screens/Paywall';
import Player from './screens/Player';
import Profile from './screens/Profile';
import Today from './screens/Today';
import { ErrorState, Spinner } from './ui';

interface MeContextValue {
  me: MeResponse;
  refreshMe: () => Promise<void>;
  setMe: (me: MeResponse) => void;
}

const MeContext = createContext<MeContextValue | null>(null);

export function useMe(): MeContextValue {
  const ctx = useContext(MeContext);
  if (!ctx) throw new Error('MeContext missing');
  return ctx;
}

export default function App() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [error, setError] = useState(false);
  const location = useLocation();

  const load = useCallback(async () => {
    setError(false);
    try {
      setMe(await api.me());
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <ErrorState onRetry={load} />;
  if (!me) return <Spinner />;

  const value: MeContextValue = {
    me,
    setMe,
    refreshMe: async () => setMe(await api.me()),
  };

  if (!me.onboardingCompleted && location.pathname !== '/onboarding') {
    return (
      <MeContext.Provider value={value}>
        <Navigate to="/onboarding" replace />
        <Onboarding />
      </MeContext.Provider>
    );
  }

  return (
    <MeContext.Provider value={value}>
      <div className="max-w-md mx-auto min-h-screen safe-px">
        <Routes>
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/" element={<Today />} />
          <Route path="/calendar" element={<CalendarScreen />} />
          <Route path="/workout/:id" element={<Player />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/paywall" element={<Paywall />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </MeContext.Provider>
  );
}
