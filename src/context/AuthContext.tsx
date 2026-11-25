import React, { createContext, useContext, useState, useEffect } from 'react';
import { User } from '../types';

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<boolean>;
  register: (fullName: string, email: string, password: string) => Promise<boolean>;
  logout: () => void;
  isAuthenticated: boolean;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const DEFAULT_USER: User = {
  id: 1,
  email: 'admin@leadhunterpro.com',
  fullName: 'Abdul Hafiz (Architect)',
  role: 'Admin',
  createdAt: '2026-09-01T00:00:00Z',
  isActive: true,
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('leadhunter_user');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return DEFAULT_USER;
      }
    }
    return DEFAULT_USER;
  });

  const [token, setToken] = useState<string | null>(() => {
    return localStorage.getItem('leadhunter_jwt') || 'mock-jwt-bearer-token-leadhunter-pro';
  });

  useEffect(() => {
    if (user) {
      localStorage.setItem('leadhunter_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('leadhunter_user');
    }
  }, [user]);

  const login = async (email: string): Promise<boolean> => {
    // Simulate JWT authentication
    const authedUser: User = {
      id: 1,
      email,
      fullName: email.includes('admin') ? 'Super Admin' : 'Lead Specialist',
      role: email.includes('admin') ? 'Admin' : 'User',
      createdAt: '2026-09-01T00:00:00Z',
      isActive: true,
    };
    const mockJwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.leadhunter_authenticated_session';
    setUser(authedUser);
    setToken(mockJwt);
    localStorage.setItem('leadhunter_jwt', mockJwt);
    return true;
  };

  const register = async (fullName: string, email: string): Promise<boolean> => {
    const newUser: User = {
      id: Date.now(),
      email,
      fullName,
      role: 'User',
      createdAt: new Date().toISOString(),
      isActive: true,
    };
    setUser(newUser);
    const mockJwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.leadhunter_registered_user';
    setToken(mockJwt);
    localStorage.setItem('leadhunter_jwt', mockJwt);
    return true;
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('leadhunter_user');
    localStorage.removeItem('leadhunter_jwt');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        login,
        register,
        logout,
        isAuthenticated: !!user,
        isAdmin: user?.role === 'Admin',
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
