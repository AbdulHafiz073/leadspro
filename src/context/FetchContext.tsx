import React, { createContext, useContext, useState } from 'react';
import { DailyFetchLog, ApiSettings } from '../types';
import { initialApiSettings } from '../data/mockData';
import { useLeads } from './LeadContext';
import { discoverGoogleLeads } from '../services/googleLeadsApi';

interface FetchContextType {
  logs: DailyFetchLog[];
  settings: ApiSettings;
  updateSettings: (newSettings: Partial<ApiSettings>) => void;
  isRunningJob: boolean;
  activeJobName: string | null;
  runDailyLeadFetchJob: () => Promise<number>;
  runWebsiteStatusCheckJob: () => Promise<number>;
  runEmailEnrichmentJob: () => Promise<number>;
}

const FetchContext = createContext<FetchContextType | undefined>(undefined);

export const FetchProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { refreshLeadsFromDb, leads } = useLeads();

  const [logs, setLogs] = useState<DailyFetchLog[]>([]);

  const [settings, setSettings] = useState<ApiSettings>(() => {
    const saved = localStorage.getItem('leadhunter_api_settings_v2');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return initialApiSettings;
      }
    }
    return initialApiSettings;
  });

  const [isRunningJob, setIsRunningJob] = useState(false);
  const [activeJobName, setActiveJobName] = useState<string | null>(null);

  const updateSettings = (newSettings: Partial<ApiSettings>) => {
    const updated = { ...settings, ...newSettings };
    setSettings(updated);
    localStorage.setItem('leadhunter_api_settings_v2', JSON.stringify(updated));
  };

  const runDailyLeadFetchJob = async (): Promise<number> => {
    setIsRunningJob(true);
    setActiveJobName('Google Live Grounded Lead Discovery');
    try {
      const res = await discoverGoogleLeads({
        categories: ['Business Websites'],
        country: 'United States',
        city: 'New York',
        limit: 10,
      });
      await refreshLeadsFromDb();
      const todayStr = new Date().toISOString().slice(0, 10);
      setLogs((prev) => [
        {
          id: Date.now(),
          fetchDate: todayStr,
          countryId: 2,
          countryName: 'United States',
          leadsAdded: res.count || 0,
          status: res.success ? 'Success' : 'Failed',
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          source: res.source || 'Google Search Grounding',
          category: 'Business Websites',
        },
        ...prev,
      ]);
      return res.count || 0;
    } finally {
      setIsRunningJob(false);
      setActiveJobName(null);
    }
  };

  const runWebsiteStatusCheckJob = async (): Promise<number> => {
    await refreshLeadsFromDb();
    return leads.length;
  };

  const runEmailEnrichmentJob = async (): Promise<number> => {
    await refreshLeadsFromDb();
    return leads.filter((l) => Boolean(l.email)).length;
  };

  return (
    <FetchContext.Provider
      value={{
        logs,
        settings,
        updateSettings,
        isRunningJob,
        activeJobName,
        runDailyLeadFetchJob,
        runWebsiteStatusCheckJob,
        runEmailEnrichmentJob,
      }}
    >
      {children}
    </FetchContext.Provider>
  );
};

export const useFetch = () => {
  const context = useContext(FetchContext);
  if (!context) throw new Error('useFetch must be used within FetchProvider');
  return context;
};
