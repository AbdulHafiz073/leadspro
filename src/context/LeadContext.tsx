import React, { createContext, useContext, useState, useMemo, useEffect, useCallback } from 'react';
import {
  Country,
  Lead,
  WebsiteStatus,
  DetectedNeed,
  GmailReplyRecord,
  DashboardMetricsSummary,
  DiscoveryRunRecord,
  QualityTier,
  OpportunityLevel,
  PrimaryCategoryGroup,
} from '../types';
import { initialCountries } from '../data/mockData';
import { calculateLeadScore } from '../utils/leadScore';
import { markEmailAsReplied } from '../utils/deliverability';
import {
  fetchDbLeads,
  fetchDbMetrics,
  fetchDbHistory,
  fetchDbReplies,
  saveDbReply,
  deleteDbReply,
  updateDbLead,
  deleteDbLead,
  createDbLead,
} from '../services/googleLeadsApi';

export interface FilterState {
  countryId: number | 'all';
  countryName: string;
  state: string;
  city: string;
  region: string;
  categoryGroup: 'all' | PrimaryCategoryGroup;
  category: string;
  serviceRequired: string;
  hasWebsite: 'all' | 'yes' | 'no';
  websiteStatus: WebsiteStatus | 'all';
  detectedNeed: DetectedNeed | 'all';
  verifiedEmailOnly: boolean;
  personalGmailOnly: boolean;
  verifiedPhoneOnly: boolean;
  contactedFilter: 'all' | 'new_only' | 'not_contacted' | 'contacted';
  qualityTier: 'all' | QualityTier;
  opportunityLevel: 'all' | OpportunityLevel;
  buyingIntentLevel: 'all' | 'HIGH INTENT' | 'MEDIUM INTENT';
  buyerNeedType: 'all' | 'Buy' | 'Update' | 'New Create';
  sourcePlatform: string;
  searchQuery: string;
  minScore: number;
}

interface LeadContextType {
  countries: Country[];
  leads: Lead[];
  isLoadingLeads: boolean;
  metrics: DashboardMetricsSummary;
  discoveryHistory: DiscoveryRunRecord[];
  refreshLeadsFromDb: () => Promise<void>;
  filteredLeads: Lead[];
  selectedCountryId: number | 'all';
  setSelectedCountryId: (id: number | 'all') => void;
  filters: FilterState;
  setFilters: React.Dispatch<React.SetStateAction<FilterState>>;
  resetFilters: () => void;

  // Selection
  selectedLeadIds: Set<number>;
  toggleSelectLead: (id: number) => void;
  selectAllPage: (leadIds: number[]) => void;
  unselectAllPage: (leadIds: number[]) => void;
  selectAllFiltered: () => void;
  unselectAll: () => void;
  isAllPageSelected: (leadIds: number[]) => boolean;
  selectedLeads: Lead[];

  // CRUD
  addLead: (lead: Omit<Lead, 'id' | 'createdAt' | 'updatedAt' | 'leadScore'>) => Promise<Lead | null>;
  importScannedLeads: (scannedLeads: Lead[]) => number;
  updateLead: (id: number, lead: Partial<Lead>) => void;
  deleteLead: (id: number) => void;
  deleteSelectedLeads: () => void;
  updateWebsiteStatus: (id: number, status: WebsiteStatus) => void;

  // Outreach & Pipeline Status Tracking
  markLeadPitched: (
    id: number,
    channel: 'WhatsApp' | 'Email' | 'Both',
    details?: { subject?: string; message?: string; app?: string; recipient?: string }
  ) => void;
  markLeadError: (
    id: number,
    errorType: 'InvalidPhone' | 'NoWhatsApp' | 'InvalidEmail' | 'EmailBounced' | 'ApiFailed',
    errorMessage: string
  ) => void;
  markLeadReply: (
    id: number,
    replyType: 'Interested' | 'DealWon' | 'DemoScheduled' | 'NotInterested' | 'General',
    notes: string
  ) => void;
  resetLeadStatus: (id: number) => void;

  // Gmail Replies (Client Inbox & Admin Reply Tracker)
  gmailReplies: GmailReplyRecord[];
  addGmailReply: (reply: Omit<GmailReplyRecord, 'id' | 'receivedAt'> & { id?: string; receivedAt?: string }) => void;
  deleteGmailReply: (id: string) => void;

  // Export
  exportLeadsCSV: (leadsToExport?: Lead[]) => void;
  exportLeadsJSON: (leadsToExport?: Lead[]) => void;
  resetToVerifiedRealLeads: () => void;
}

const DEFAULT_METRICS: DashboardMetricsSummary = {
  totalLeadsFound: 0,
  newUniqueLeads: 0,
  verifiedEmails: 0,
  verifiedPhoneNumbers: 0,
  availableWebsites: 0,
  potentialOpportunities: 0,
  emailsSent: 0,
  pendingEmails: 0,
  duplicateLeadsPrevented: 0,
  unsubscribedCount: 0,
};

const LeadContext = createContext<LeadContextType | undefined>(undefined);

export const LeadProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [countries] = useState<Country[]>(initialCountries);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [isLoadingLeads, setIsLoadingLeads] = useState<boolean>(true);
  const [metrics, setMetrics] = useState<DashboardMetricsSummary>(DEFAULT_METRICS);
  const [discoveryHistory, setDiscoveryHistory] = useState<DiscoveryRunRecord[]>([]);

  const refreshLeadsFromDb = useCallback(async () => {
    try {
      setIsLoadingLeads(true);
      const [leadsRes, metricsRes, histRes] = await Promise.all([
        fetchDbLeads(),
        fetchDbMetrics(),
        fetchDbHistory(),
      ]);
      if (leadsRes.success && Array.isArray(leadsRes.leads)) {
        setLeads(leadsRes.leads);
      }
      if (metricsRes.success && metricsRes.metrics) {
        setMetrics(metricsRes.metrics);
      }
      if (histRes.success && Array.isArray(histRes.runs)) {
        setDiscoveryHistory(histRes.runs);
      }
    } catch (err) {
      console.error('[LeadContext] Failed to load SQLite leads:', err);
    } finally {
      setIsLoadingLeads(false);
    }
  }, []);

  useEffect(() => {
    // Purge legacy hardcoded localStorage cache so zero unverified static leads appear
    try {
      localStorage.removeItem('leadhunter_leads');
      localStorage.removeItem('leadhunter_scanned_history');
    } catch {}
    refreshLeadsFromDb();
  }, [refreshLeadsFromDb]);

  const [gmailReplies, setGmailReplies] = useState<GmailReplyRecord[]>([]);

  const loadRepliesFromDb = useCallback(async () => {
    try {
      const res = await fetchDbReplies();
      if (res.success && Array.isArray(res.replies)) {
        setGmailReplies(res.replies);
      }
    } catch {
      // ignore initial error
    }
  }, []);

  useEffect(() => {
    loadRepliesFromDb();
  }, [loadRepliesFromDb]);

  // Also refresh replies whenever refreshLeadsFromDb runs
  const refreshAll = useCallback(async () => {
    await refreshLeadsFromDb();
    await loadRepliesFromDb();
  }, [refreshLeadsFromDb, loadRepliesFromDb]);

  const addGmailReply = (
    reply: Omit<GmailReplyRecord, 'id' | 'receivedAt'> & { id?: string; receivedAt?: string }
  ) => {
    const cleanEmail = (reply.clientEmail || '').trim().toLowerCase();
    const matchedLead =
      (reply.leadId ? leads.find((l) => l.id === reply.leadId) : undefined) ||
      leads.find((l) => (l.email || '').toLowerCase().trim() === cleanEmail);

    const resolvedLocation =
      reply.location ||
      (matchedLead
        ? [matchedLead.address, matchedLead.city, matchedLead.state, matchedLead.countryName]
            .filter(Boolean)
            .join(', ')
        : '');

    const newRecord: GmailReplyRecord = {
      ...reply,
      id: reply.id || `reply_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      leadId: matchedLead?.id || reply.leadId,
      clientEmail: cleanEmail,
      clientPhone:
        reply.clientPhone ||
        matchedLead?.ownerPhone ||
        matchedLead?.phoneNumber ||
        reply.extractedPhone ||
        undefined,
      location: resolvedLocation || undefined,
      address: reply.address || matchedLead?.address || undefined,
      city: reply.city || matchedLead?.city || undefined,
      countryName: reply.countryName || matchedLead?.countryName || undefined,
      googleMapsUrl: reply.googleMapsUrl || matchedLead?.googleMapsUrl || undefined,
      receivedAt: reply.receivedAt || new Date().toISOString(),
    };

    setGmailReplies((prev) => {
      const filtered = prev.filter((item) => item.id !== newRecord.id);
      return [newRecord, ...filtered];
    });

    if (cleanEmail) {
      markEmailAsReplied(cleanEmail);
    }

    const rType = reply.replyType.includes('NO')
      ? 'NotInterested'
      : reply.replyType.includes('Demo')
      ? 'DemoScheduled'
      : reply.replyType.includes('Won')
      ? 'DealWon'
      : 'Interested';

    if (matchedLead) {
      updateLead(matchedLead.id, {
        outreachStatus: 'Replied',
        replyReceived: true,
        replyType: rType,
        replyIntent: newRecord.intentCategory || 'Interested',
        approvedWebsiteCreate: Boolean(matchedLead.approvedWebsiteCreate || newRecord.wantsWebsiteCreate),
        requestedWebsiteUpdate: Boolean(matchedLead.requestedWebsiteUpdate || newRecord.wantsWebsiteUpdate),
        replyExtractedPhone: newRecord.extractedPhone || matchedLead.replyExtractedPhone || null,
        ownerPhone: newRecord.extractedPhone || matchedLead.ownerPhone || null,
        whatsAppNumber: newRecord.extractedPhone || matchedLead.whatsAppNumber || null,
        replyNotes: newRecord.fullMessage,
        repliedAt: newRecord.receivedAt,
      });
    }

    saveDbReply(newRecord).catch((err) => {
      console.error('[LeadContext] Failed to persist Gmail reply:', err);
    });
  };

  const deleteGmailReply = (id: string) => {
    setGmailReplies((prev) => prev.filter((r) => r.id !== id));
    deleteDbReply(id).catch(() => {});
  };

  const [selectedCountryId, setSelectedCountryId] = useState<number | 'all'>('all');
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<number>>(new Set());

  const [filters, setFilters] = useState<FilterState>({
    countryId: 'all',
    countryName: 'all',
    state: 'all',
    city: 'all',
    region: 'all',
    categoryGroup: 'all',
    category: 'all',
    serviceRequired: 'all',
    hasWebsite: 'all',
    websiteStatus: 'all',
    detectedNeed: 'all',
    verifiedEmailOnly: false,
    personalGmailOnly: false,
    verifiedPhoneOnly: false,
    contactedFilter: 'all',
    qualityTier: 'all',
    opportunityLevel: 'all',
    buyingIntentLevel: 'all',
    buyerNeedType: 'all',
    sourcePlatform: 'all',
    searchQuery: '',
    minScore: 0,
  });

  const effectiveCountryId = selectedCountryId !== 'all' ? selectedCountryId : filters.countryId;

  const resetFilters = () => {
    setFilters({
      countryId: selectedCountryId,
      countryName: 'all',
      state: 'all',
      city: 'all',
      region: 'all',
      categoryGroup: 'all',
      category: 'all',
      serviceRequired: 'all',
      hasWebsite: 'all',
      websiteStatus: 'all',
      detectedNeed: 'all',
      verifiedEmailOnly: false,
      personalGmailOnly: false,
      verifiedPhoneOnly: false,
      contactedFilter: 'all',
      qualityTier: 'all',
      opportunityLevel: 'all',
      buyingIntentLevel: 'all',
      buyerNeedType: 'all',
      sourcePlatform: 'all',
      searchQuery: '',
      minScore: 0,
    });
  };

  const filteredLeads = useMemo(() => {
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    return leads.filter((lead) => {
      if (effectiveCountryId !== 'all' && lead.countryId !== effectiveCountryId) {
        return false;
      }
      if (filters.countryName !== 'all' && (lead.countryName || '').toLowerCase() !== filters.countryName.toLowerCase()) {
        return false;
      }
      if (filters.state !== 'all' && (lead.state || '').toLowerCase() !== filters.state.toLowerCase()) {
        return false;
      }
      if (filters.city !== 'all' && (lead.city || '').toLowerCase() !== filters.city.toLowerCase()) {
        return false;
      }
      if (filters.region !== 'all' && (lead.region || '').toLowerCase() !== filters.region.toLowerCase()) {
        return false;
      }
      if (filters.categoryGroup !== 'all' && lead.primaryGroup !== filters.categoryGroup) {
        return false;
      }
      if (filters.category !== 'all' && lead.category.toLowerCase() !== filters.category.toLowerCase()) {
        return false;
      }
      if (
        filters.serviceRequired !== 'all' &&
        (lead.serviceRequired || '').toLowerCase() !== filters.serviceRequired.toLowerCase()
      ) {
        return false;
      }
      if (filters.hasWebsite === 'yes' && !lead.hasWebsite) return false;
      if (filters.hasWebsite === 'no' && lead.hasWebsite) return false;
      if (filters.websiteStatus !== 'all' && lead.websiteStatus !== filters.websiteStatus) return false;
      if (filters.detectedNeed !== 'all' && lead.detectedNeed !== filters.detectedNeed) return false;

      if (filters.verifiedEmailOnly && (!lead.email || lead.emailVerificationStatus !== 'Publicly Listed + MX Verified')) {
        return false;
      }
      if (filters.personalGmailOnly && !/@(gmail|googlemail)\.com$/i.test(lead.email || '')) {
        return false;
      }
      if (filters.verifiedPhoneOnly && !lead.phoneNumber && !lead.ownerPhone && !lead.locationPhone) {
        return false;
      }

      const isContacted =
        lead.outreachStatus === 'EmailSent' ||
        lead.outreachStatus === 'WhatsAppSent' ||
        lead.outreachStatus === 'BothSent' ||
        lead.outreachStatus === 'Replied';
      if (filters.contactedFilter === 'contacted' && !isContacted) return false;
      if (filters.contactedFilter === 'not_contacted' && isContacted) return false;
      if (filters.contactedFilter === 'new_only') {
        const ts = new Date(lead.discoveredAt || lead.createdAt).getTime();
        if (isContacted || ts < oneDayAgo) return false;
      }

      if (filters.qualityTier !== 'all' && lead.qualityTier !== filters.qualityTier) return false;
      if (filters.opportunityLevel !== 'all' && lead.opportunityLevel !== filters.opportunityLevel) return false;
      if (filters.buyingIntentLevel !== 'all' && lead.buyingIntentLevel !== filters.buyingIntentLevel) return false;
      if (filters.buyerNeedType !== 'all') {
        const inferredNeed =
          lead.buyerNeedType ||
          (!lead.hasWebsite || lead.websiteStatus === 'NoWebsite'
            ? 'New Create'
            : lead.buyingIntentLevel === 'HIGH INTENT' && Boolean(lead.requirementPostingUrl)
            ? 'Buy'
            : 'Update');
        if (inferredNeed !== filters.buyerNeedType) return false;
      }
      if (filters.sourcePlatform !== 'all') {
        const plat = (lead.sourcePlatform || lead.source || '').toLowerCase();
        if (!plat.includes(filters.sourcePlatform.toLowerCase())) return false;
      }
      if (lead.leadScore < filters.minScore) return false;

      if (filters.searchQuery.trim()) {
        const query = filters.searchQuery.toLowerCase();
        const hay = [
          lead.businessName,
          lead.contactPerson,
          lead.designation,
          lead.city,
          lead.state,
          lead.countryName,
          lead.category,
          lead.serviceRequired,
          lead.exactProjectRequirement,
          lead.sourcePlatform,
          lead.phoneNumber,
          lead.ownerPhone,
          lead.email,
          lead.websiteUrl,
          lead.evidenceSummary,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!hay.includes(query)) return false;
      }

      return true;
    });
  }, [leads, effectiveCountryId, filters]);

  const selectedLeads = useMemo(() => leads.filter((l) => selectedLeadIds.has(l.id)), [leads, selectedLeadIds]);

  const toggleSelectLead = (id: number) => {
    setSelectedLeadIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllPage = (leadIds: number[]) => {
    setSelectedLeadIds((prev) => {
      const next = new Set(prev);
      leadIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const unselectAllPage = (leadIds: number[]) => {
    setSelectedLeadIds((prev) => {
      const next = new Set(prev);
      leadIds.forEach((id) => next.delete(id));
      return next;
    });
  };

  const selectAllFiltered = () => {
    const next = new Set<number>();
    filteredLeads.forEach((l) => next.add(l.id));
    setSelectedLeadIds(next);
  };

  const unselectAll = () => setSelectedLeadIds(new Set());

  const isAllPageSelected = (leadIds: number[]) => leadIds.length > 0 && leadIds.every((id) => selectedLeadIds.has(id));

  const addLead = async (leadData: Omit<Lead, 'id' | 'createdAt' | 'updatedAt' | 'leadScore'>): Promise<Lead | null> => {
    const now = new Date().toISOString();
    const country = countries.find((c) => c.id === leadData.countryId);
    const payload: any = {
      ...leadData,
      countryName: leadData.countryName || country?.name || 'United States',
      countryCode: leadData.countryCode || country?.code || 'US',
      createdAt: now,
      updatedAt: now,
      discoveredAt: now,
      leadScore: calculateLeadScore({ ...leadData, createdAt: now, updatedAt: now }),
    };
    const res = await createDbLead(payload);
    if (res.success && res.lead) {
      await refreshLeadsFromDb();
      return res.lead;
    }
    return null;
  };

  const importScannedLeads = (scannedLeads: Lead[]): number => {
    if (!scannedLeads || scannedLeads.length === 0) return 0;
    const existingIds = new Set(leads.map((l) => l.id));
    const toAdd = scannedLeads.filter((l) => !existingIds.has(l.id));
    if (toAdd.length > 0) {
      setLeads((prev) => [...toAdd, ...prev]);
      refreshLeadsFromDb();
    }
    return toAdd.length;
  };

  const updateLead = (id: number, updates: Partial<Lead>) => {
    setLeads((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l;
        const merged = { ...l, ...updates, updatedAt: new Date().toISOString() };
        return { ...merged, leadScore: calculateLeadScore(merged) };
      })
    );
    updateDbLead(id, updates).catch(() => {});
  };

  const markLeadPitched = (
    id: number,
    channel: 'WhatsApp' | 'Email' | 'Both',
    details?: { subject?: string; message?: string; app?: string; recipient?: string }
  ) => {
    const statusMap = {
      WhatsApp: 'WhatsAppSent' as const,
      Email: 'EmailSent' as const,
      Both: 'BothSent' as const,
    };
    updateLead(id, {
      outreachStatus: statusMap[channel] || 'EmailSent',
      pitchChannel: channel,
      lastPitchedAt: new Date().toISOString(),
      pitchSubject: details?.subject || null,
      pitchMessage: details?.message || null,
      pitchApp: details?.app || (channel === 'Email' ? 'Gmail' : channel),
      pitchRecipient: details?.recipient || null,
      errorMessage: null,
      errorType: undefined,
    });
  };

  const markLeadError = (
    id: number,
    errorType: 'InvalidPhone' | 'NoWhatsApp' | 'InvalidEmail' | 'EmailBounced' | 'ApiFailed',
    errorMessage: string
  ) => {
    const status = errorType === 'InvalidEmail' || errorType === 'EmailBounced' ? 'EmailError' : 'PhoneError';
    updateLead(id, { outreachStatus: status, errorType, errorMessage });
  };

  const markLeadReply = (
    id: number,
    replyType: 'Interested' | 'DealWon' | 'DemoScheduled' | 'NotInterested' | 'General',
    notes: string
  ) => {
    updateLead(id, {
      outreachStatus: 'Replied',
      replyReceived: true,
      replyType,
      replyNotes: notes,
      repliedAt: new Date().toISOString(),
    });
  };

  const resetLeadStatus = (id: number) => {
    updateLead(id, {
      outreachStatus: 'Pending',
      lastPitchedAt: undefined,
      pitchChannel: undefined,
      errorMessage: null,
      errorType: undefined,
      replyReceived: false,
      replyType: undefined,
      replyNotes: null,
      repliedAt: null,
    });
  };

  const updateWebsiteStatus = (id: number, status: WebsiteStatus) => {
    updateLead(id, {
      websiteStatus: status,
      hasWebsite: status !== 'NoWebsite',
      lastCheckedAt: new Date().toISOString(),
    });
  };

  const deleteLead = (id: number) => {
    setLeads((prev) => prev.filter((l) => l.id !== id));
    setSelectedLeadIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    deleteDbLead(id).then(() => refreshLeadsFromDb());
  };

  const deleteSelectedLeads = () => {
    const ids = Array.from(selectedLeadIds);
    setLeads((prev) => prev.filter((l) => !selectedLeadIds.has(l.id)));
    setSelectedLeadIds(new Set());
    Promise.all(ids.map((id) => deleteDbLead(id))).then(() => refreshLeadsFromDb());
  };

  const exportLeadsCSV = (leadsToExport?: Lead[]) => {
    const targetLeads = leadsToExport || (selectedLeads.length > 0 ? selectedLeads : filteredLeads);
    if (targetLeads.length === 0) return;

    const headers = [
      'ID',
      'Business Name',
      'Category Group',
      'Category',
      'Service Required',
      'Quality Tier',
      'Opportunity Level',
      'Verified Business Email',
      'Email Verification Status',
      'Email Source URL',
      'Location Phone',
      'Owner Phone',
      'Official Website',
      'Address',
      'City',
      'State',
      'Country',
      'Source URLs',
      'Evidence Summary',
      'Lead Score',
      'Outreach Status',
    ];

    const rows = targetLeads.map((l) => [
      l.id,
      `"${(l.businessName || '').replace(/"/g, '""')}"`,
      `"${l.primaryGroup || ''}"`,
      `"${(l.category || '').replace(/"/g, '""')}"`,
      `"${(l.serviceRequired || '').replace(/"/g, '""')}"`,
      `"${l.qualityTier || ''}"`,
      `"${l.opportunityLevel || ''}"`,
      `"${l.email || ''}"`,
      `"${l.emailVerificationStatus || ''}"`,
      `"${l.emailSourceUrl || ''}"`,
      `"${l.locationPhone || l.phoneNumber || ''}"`,
      `"${l.ownerPhone || ''}"`,
      `"${l.websiteUrl || ''}"`,
      `"${(l.address || '').replace(/"/g, '""')}"`,
      `"${(l.city || '').replace(/"/g, '""')}"`,
      `"${(l.state || '').replace(/"/g, '""')}"`,
      `"${(l.countryName || '').replace(/"/g, '""')}"`,
      `"${(l.sourceUrls || []).join(' | ').replace(/"/g, '""')}"`,
      `"${(l.evidenceSummary || '').replace(/"/g, '""')}"`,
      l.leadScore,
      `"${l.outreachStatus || 'Pending'}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const link = document.createElement('a');
    link.setAttribute('href', encodeURI(csvContent));
    link.setAttribute('download', `LeadHunterPro_Verified_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportLeadsJSON = (leadsToExport?: Lead[]) => {
    const targetLeads = leadsToExport || (selectedLeads.length > 0 ? selectedLeads : filteredLeads);
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(targetLeads, null, 2));
    const link = document.createElement('a');
    link.setAttribute('href', dataStr);
    link.setAttribute('download', `LeadHunterPro_Verified_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const resetToVerifiedRealLeads = () => {
    refreshLeadsFromDb();
  };

  return (
    <LeadContext.Provider
      value={{
        countries,
        leads,
        isLoadingLeads,
        metrics,
        discoveryHistory,
        refreshLeadsFromDb: refreshAll,
        filteredLeads,
        selectedCountryId,
        setSelectedCountryId,
        filters,
        setFilters,
        resetFilters,
        selectedLeadIds,
        toggleSelectLead,
        selectAllPage,
        unselectAllPage,
        selectAllFiltered,
        unselectAll,
        isAllPageSelected,
        selectedLeads,
        addLead,
        importScannedLeads,
        updateLead,
        deleteLead,
        deleteSelectedLeads,
        updateWebsiteStatus,
        markLeadPitched,
        markLeadError,
        markLeadReply,
        resetLeadStatus,
        gmailReplies,
        addGmailReply,
        deleteGmailReply,
        exportLeadsCSV,
        exportLeadsJSON,
        resetToVerifiedRealLeads,
      }}
    >
      {children}
    </LeadContext.Provider>
  );
};

export const useLeads = () => {
  const context = useContext(LeadContext);
  if (!context) throw new Error('useLeads must be used within LeadProvider');
  return context;
};
