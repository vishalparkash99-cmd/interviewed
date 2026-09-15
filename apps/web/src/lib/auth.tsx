"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "./api";
import type { User } from "@interviewed/types";

export type RegisterInput = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  companyName: string;
};

export type RegisterResult = {
  message?: string;
  user?: { id: string; email: string; firstName: string; lastName: string; role: string };
  devVerifyUrl?: string;
  error?: string;
};

type LoginResponse = {
  token?: string;
  user?: User;
  error?: string;
  code?: string;
};

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (data: RegisterInput) => Promise<RegisterResult>;
  logout: () => Promise<void>;
  refresh: () => Promise<User | null>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const STORAGE_KEY = "interviewed.user";

function readStoredUser(): User | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async (): Promise<User | null> => {
    try {
      const data = await api.get<User & { error?: string }>("/api/v1/auth/me");
      if (!data || data.error) return null;
      const u: User = {
        id: data.id,
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        role: data.role,
        isActive: data.isActive,
      };
      setUser(u);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(u));
      } catch {
        // ignore storage errors
      }
      return u;
    } catch {
      setUser(null);
      return null;
    }
  }, []);

  useEffect(() => {
    const stored = readStoredUser();
    if (stored) {
      setUser(stored);
    }
    refresh()
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [refresh]);

  const login = useCallback(async (email: string, password: string): Promise<User> => {
    const data = await api.post<LoginResponse>("/api/v1/auth/login", { email, password });
    if (!data?.user) {
      throw new Error(data?.error || data?.code || "Login failed");
    }
    const u = data.user;
    setUser(u);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(u));
    } catch {
      // ignore storage errors
    }
    return u;
  }, []);

  const register = useCallback(async (input: RegisterInput): Promise<RegisterResult> => {
    const data = await api.post<RegisterResult & { error?: string }>("/api/v1/auth/register", input);
    if (data.error) {
      throw new Error(data.error);
    }
    return data;
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    try {
      await api.post("/api/v1/auth/logout");
    } catch {
      // ignore logout errors
    }
    setUser(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore storage errors
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, login, register, logout, refresh }),
    [user, loading, login, register, logout, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}