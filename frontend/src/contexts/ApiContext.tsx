/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import { api } from '../services/api';

export type ApiType = typeof api;

interface ApiContextValue {
  api: ApiType;
  isGuest: boolean;
}

const ApiContext = createContext<ApiContextValue | null>(null);

export function ServerApiProvider({ children }: { children: ReactNode }) {
  return (
    <ApiContext.Provider value={{ api, isGuest: false }}>
      {children}
    </ApiContext.Provider>
  );
}

export function GuestApiProvider({ guestApi, children }: { guestApi: ApiType; children: ReactNode }) {
  return (
    <ApiContext.Provider value={{ api: guestApi, isGuest: true }}>
      {children}
    </ApiContext.Provider>
  );
}

export function useApi(): ApiContextValue {
  const context = useContext(ApiContext);
  if (!context) {
    // Fallback: return server api when no provider (e.g. auth-only pages)
    return { api, isGuest: false };
  }
  return context;
}
