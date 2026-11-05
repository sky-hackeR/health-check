'use client';

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  AdminIdentity,
  ApiError,
  fetchAdminSession,
  loginAdmin,
  logoutAdmin,
} from '@/lib/api';

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated' | 'error';

interface AdminAuthContextValue {
  admin: AdminIdentity | null;
  status: AuthStatus;
  error: string | null;
  refreshSession: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState<AdminIdentity | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [error, setError] = useState<string | null>(null);

  const refreshSession = useCallback(async () => {
    setStatus('loading');
    setError(null);
    try {
      const identity = await fetchAdminSession();
      setAdmin(identity);
      setStatus('authenticated');
    } catch (cause) {
      setAdmin(null);
      if (cause instanceof ApiError && cause.status === 401) {
        setStatus('unauthenticated');
      } else {
        setError(
          cause instanceof Error
            ? cause.message
            : 'We could not verify your session.',
        );
        setStatus('error');
      }
    }
  }, []);

  useEffect(() => {
    let active = true;
    fetchAdminSession()
      .then((identity) => {
        if (!active) return;
        setAdmin(identity);
        setStatus('authenticated');
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setAdmin(null);
        if (cause instanceof ApiError && cause.status === 401) {
          setStatus('unauthenticated');
          return;
        }
        setError(
          cause instanceof Error
            ? cause.message
            : 'We could not verify your session.',
        );
        setStatus('error');
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    function handleSessionExpired() {
      setAdmin(null);
      setStatus('unauthenticated');
      setError(null);
    }
    window.addEventListener('admin-session-expired', handleSessionExpired);
    return () =>
      window.removeEventListener('admin-session-expired', handleSessionExpired);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setError(null);
    const identity = await loginAdmin(email, password);
    setAdmin(identity);
    setStatus('authenticated');
  }, []);

  const logout = useCallback(async () => {
    await logoutAdmin();
    setAdmin(null);
    setError(null);
    setStatus('unauthenticated');
  }, []);

  const value = useMemo(
    () => ({ admin, status, error, refreshSession, login, logout }),
    [admin, status, error, refreshSession, login, logout],
  );

  return (
    <AdminAuthContext.Provider value={value}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth(): AdminAuthContextValue {
  const context = useContext(AdminAuthContext);
  if (!context) {
    throw new Error('useAdminAuth must be used within AdminAuthProvider.');
  }
  return context;
}
