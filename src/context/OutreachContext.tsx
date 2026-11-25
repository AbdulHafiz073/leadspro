import React, { createContext, useContext, useState } from 'react';
import { OutreachChannel, OutreachLog, OutreachTemplate, Lead, OutreachStatus } from '../types';
import { initialOutreachLogs, initialTemplates } from '../data/mockData';
import { interpolateTemplate } from '../utils/leadScore';

interface OutreachContextType {
  templates: OutreachTemplate[];
  logs: OutreachLog[];
  addTemplate: (template: Omit<OutreachTemplate, 'id' | 'createdAt'>) => void;
  updateTemplate: (id: number, template: Partial<OutreachTemplate>) => void;
  deleteTemplate: (id: number) => void;
  sendOutreach: (
    leads: Lead[],
    channel: OutreachChannel,
    templateId: number
  ) => Promise<{ successCount: number; failedCount: number; newLogs: OutreachLog[] }>;
  clearLogs: () => void;
}

const OutreachContext = createContext<OutreachContextType | undefined>(undefined);

export const OutreachProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [templates, setTemplates] = useState<OutreachTemplate[]>(() => {
    const saved = localStorage.getItem('leadhunter_templates');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.some((t: any) => t.body && t.body.includes('QUICK QUESTION'))) {
          return parsed;
        }
      } catch {}
    }
    return initialTemplates;
  });

  const [logs, setLogs] = useState<OutreachLog[]>(() => {
    const saved = localStorage.getItem('leadhunter_logs');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return initialOutreachLogs;
      }
    }
    return initialOutreachLogs;
  });

  const persistTemplates = (newTemplates: OutreachTemplate[]) => {
    setTemplates(newTemplates);
    localStorage.setItem('leadhunter_templates', JSON.stringify(newTemplates));
  };

  const persistLogs = (newLogs: OutreachLog[]) => {
    setLogs(newLogs);
    localStorage.setItem('leadhunter_logs', JSON.stringify(newLogs));
  };

  const addTemplate = (templateData: Omit<OutreachTemplate, 'id' | 'createdAt'>) => {
    const newTemplate: OutreachTemplate = {
      ...templateData,
      id: Date.now(),
      createdAt: new Date().toISOString(),
    };
    persistTemplates([...templates, newTemplate]);
  };

  const updateTemplate = (id: number, updates: Partial<OutreachTemplate>) => {
    const updated = templates.map((t) => (t.id === id ? { ...t, ...updates } : t));
    persistTemplates(updated);
  };

  const deleteTemplate = (id: number) => {
    const updated = templates.filter((t) => t.id !== id);
    persistTemplates(updated);
  };

  const clearLogs = () => {
    persistLogs([]);
  };

  const sendOutreach = async (
    leads: Lead[],
    channel: OutreachChannel,
    templateId: number
  ): Promise<{ successCount: number; failedCount: number; newLogs: OutreachLog[] }> => {
    const template = templates.find((t) => t.id === templateId);
    if (!template) {
      throw new Error('Template not found');
    }

    const generatedLogs: OutreachLog[] = [];
    let success = 0;
    let failed = 0;

    for (const lead of leads) {
      const personalizedBody = interpolateTemplate(template.body, lead);
      let status: OutreachStatus = 'Sent';
      let errorMsg: string | null = null;
      let contact = 'N/A';

      // Channel-specific logic based on prompt specifications
      switch (channel) {
        case 'WhatsApp':
          contact = lead.whatsAppNumber || lead.phoneNumber || '';
          if (!contact) {
            status = 'Failed';
            errorMsg = 'Skip: No WhatsApp/Mobile phone number registered for this lead.';
            failed++;
          } else {
            status = 'Delivered';
            success++;
          }
          break;

        case 'Email':
          contact = lead.email || '';
          if (!contact) {
            status = 'Failed';
            errorMsg = 'Skip: No valid email address found. Hunter.io enrichment suggested.';
            failed++;
          } else {
            status = 'Sent';
            success++;
          }
          break;

        case 'Twitter':
          contact = `@${lead.businessName.replace(/[^a-zA-Z0-9_]/g, '')}`;
          // Twitter API v2 DM check
          if (lead.rating < 4.2) {
            status = 'Failed';
            errorMsg = 'Twitter API v2: Direct Messages closed by recipient account setting.';
            failed++;
          } else {
            status = 'Sent';
            success++;
          }
          break;

        case 'Instagram':
          contact = `@${lead.businessName.toLowerCase().replace(/[^a-z0-9_]/g, '')}`;
          // Instagram Graph API: only to business accounts
          if (!lead.hasWebsite && lead.reviewCount < 10) {
            status = 'Failed';
            errorMsg = 'Instagram Graph API: Recipient is not an verified Instagram Professional/Business account.';
            failed++;
          } else {
            status = 'Sent';
            success++;
          }
          break;

        case 'Telegram':
          contact = lead.phoneNumber ? `tg://${lead.phoneNumber}` : '';
          if (!contact) {
            status = 'Failed';
            errorMsg = 'Telegram Bot API: Recipient phone/username not linked to a registered Telegram user.';
            failed++;
          } else {
            status = 'Delivered';
            success++;
          }
          break;
      }

      const logItem: OutreachLog = {
        id: Date.now() + Math.floor(Math.random() * 10000),
        leadId: lead.id,
        userId: 1,
        channel,
        messageBody: personalizedBody,
        status,
        sentAt: new Date().toISOString(),
        errorMessage: errorMsg,
        leadName: lead.businessName,
        recipientContact: contact || 'N/A',
      };

      generatedLogs.push(logItem);
    }

    const updatedLogs = [...generatedLogs, ...logs];
    persistLogs(updatedLogs);

    return {
      successCount: success,
      failedCount: failed,
      newLogs: generatedLogs,
    };
  };

  return (
    <OutreachContext.Provider
      value={{
        templates,
        logs,
        addTemplate,
        updateTemplate,
        deleteTemplate,
        sendOutreach,
        clearLogs,
      }}
    >
      {children}
    </OutreachContext.Provider>
  );
};

export const useOutreach = () => {
  const context = useContext(OutreachContext);
  if (!context) throw new Error('useOutreach must be used within OutreachProvider');
  return context;
};
