import {
  Lead,
  DetectedNeed,
  DiscoveryRunRecord,
  EmailCampaignItem,
  DashboardMetricsSummary,
  GmailReplyRecord,
} from '../types';

export interface DiscoverParams {
  query?: string;
  location?: string;
  category?: string;
  categories?: string[];
  country?: string;
  state?: string;
  city?: string;
  region?: string;
  postalCode?: string;
  serviceRequired?: string;
  itServiceFilter?: string;
  discoveryMode?: 'high_intent_buyers' | 'local_audit';
  countryCode?: string;
  focusNeed?: 'ALL' | 'NO_WEBSITE' | 'OUTDATED_WEBSITE' | 'LOCAL_SEO' | 'WHATSAPP_BOT';
  limit?: number;
  customQuery?: string;
  excludeNames?: string[];
  emailFilterMode?: 'all' | 'prefer_gmail' | 'gmail_only';
  requireContactReady?: boolean;
  buyerNeedFilter?: 'ALL' | 'Buy' | 'Update' | 'New Create';
  channelId?: string;
  channels?: string[];
}

export interface DiscoverySourceChannel {
  id: string;
  name: string;
  icon: string;
  category: string;
  description: string;
  active: boolean;
  leadCount: number;
  status?: string;
}

export async function fetchDiscoverySources(): Promise<{ success: boolean; channels: DiscoverySourceChannel[] }> {
  try {
    const res = await fetch('/api/leads/sources');
    return await res.json();
  } catch {
    return { success: false, channels: [] };
  }
}

export interface DiscoveryProgressResponse {
  success: boolean;
  job?: {
    jobId: string;
    status: 'running' | 'completed' | 'failed';
    stage: string;
    progressPercent: number;
    batchesCompleted: number;
    totalBatches: number;
    rawCandidatesFound: number;
    verifiedCount: number;
    highIntentCount: number;
    mediumIntentCount: number;
    excludedMissingContact: number;
    excludedLocationMismatch: number;
    excludedLowIntent: number;
    duplicatesPrevented: number;
    requestedCount: number;
    sourceLimitations?: string[];
    error?: string | null;
    leads: Lead[];
    startedAt: string;
    completedAt?: string | null;
  };
  error?: string;
}

export interface DiscoverResponse {
  success: boolean;
  count: number;
  requestedCount?: number;
  highIntentCount?: number;
  mediumIntentCount?: number;
  excludedLowIntent?: number;
  duplicatesPrevented?: number;
  excludedCount?: number;
  sourceLimitations?: string[];
  query: string;
  source: string;
  leads: Lead[];
  error?: string;
}

export interface SingleAuditParams {
  businessName: string;
  websiteUrl?: string;
  location?: string;
}

export interface SingleAuditResponse {
  success: boolean;
  audit?: {
    businessName: string;
    websiteFound: boolean;
    websiteUrl: string | null;
    digitalHealthScore: number;
    primaryNeed: DetectedNeed;
    needSummary: string;
    identifiedFlaws: string[];
    recommendedPitchPackage: string;
    estimatedValue: string;
    readyWhatsAppPitch: string;
    readyEmailPitch: {
      subject: string;
      body: string;
    };
  };
  liveSignals?: any;
  error?: string;
}

export async function startDiscoveryJob(params: DiscoverParams): Promise<{ success: boolean; jobId?: string; error?: string }> {
  const response = await fetch('/api/leads/discover', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Discovery API error HTTP ${response.status}`);
  }
  return data;
}

export async function pollDiscoveryJob(jobId: string): Promise<DiscoveryProgressResponse> {
  const response = await fetch(`/api/leads/discover/${encodeURIComponent(jobId)}`);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Discovery poll error HTTP ${response.status}`);
  }
  return data;
}

export async function discoverGoogleLeads(params: DiscoverParams): Promise<DiscoverResponse> {
  const response = await fetch('/api/leads/google-discover', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Google Leads API returned status ${response.status}`);
  }
  return data;
}

export async function auditSingleBusiness(params: SingleAuditParams): Promise<SingleAuditResponse> {
  const response = await fetch('/api/leads/audit-business', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Audit API returned status ${response.status}`);
  }
  return data;
}

export async function fetchDbLeads(): Promise<{ success: boolean; leads: Lead[] }> {
  const res = await fetch('/api/db/leads');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function createDbLead(lead: Partial<Lead>): Promise<{ success: boolean; lead?: Lead; error?: string }> {
  const res = await fetch('/api/db/leads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(lead),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export async function updateDbLead(id: number, updates: Partial<Lead>): Promise<{ success: boolean; lead?: Lead }> {
  const res = await fetch(`/api/db/leads/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  return res.json();
}

export async function deleteDbLead(id: number): Promise<{ success: boolean }> {
  const res = await fetch(`/api/db/leads/${id}`, { method: 'DELETE' });
  return res.json();
}

export async function fetchDbMetrics(): Promise<{ success: boolean; metrics: DashboardMetricsSummary }> {
  const res = await fetch('/api/db/metrics');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchDbHistory(): Promise<{ success: boolean; runs: DiscoveryRunRecord[] }> {
  const res = await fetch('/api/db/history');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function prepareEmailCampaign(payload: {
  leadIds: number[];
  senderName?: string;
  senderEmail?: string;
  senderPhone?: string;
  companyName?: string;
  companyWebsite?: string;
}): Promise<{ success: boolean; prepared: EmailCampaignItem[]; skipped: Array<{ leadId: number; reason: string }> }> {
  const res = await fetch('/api/campaigns/prepare', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export async function fetchEmailCampaigns(status = 'all'): Promise<{ success: boolean; items: EmailCampaignItem[] }> {
  const res = await fetch(`/api/campaigns/emails?status=${encodeURIComponent(status)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function approveEmailCampaign(payload: {
  id?: string;
  ids?: string[];
  subject?: string;
  body?: string;
  autoSendAuthorized?: boolean;
}): Promise<{ success: boolean; item?: EmailCampaignItem; updated?: EmailCampaignItem[] }> {
  const res = await fetch('/api/campaigns/approve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export async function rejectEmailCampaign(id: string): Promise<{ success: boolean; item?: EmailCampaignItem }> {
  const res = await fetch('/api/campaigns/reject', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  });
  return res.json();
}

export async function recordCampaignSend(payload: {
  id: string;
  success: boolean;
  gmailMessageId?: string | null;
  gmailThreadId?: string | null;
  errorMessage?: string | null;
  subject?: string;
  body?: string;
}): Promise<{ success: boolean; item?: EmailCampaignItem }> {
  const res = await fetch('/api/campaigns/record-send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export async function unsubscribeEmail(email: string, reason?: string): Promise<{ success: boolean }> {
  const res = await fetch('/api/campaigns/unsubscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, reason }),
  });
  return res.json();
}

export async function fetchUnsubscribes(): Promise<{
  success: boolean;
  list: Array<{ email: string; reason: string; unsubscribedAt: string }>;
}> {
  const res = await fetch('/api/campaigns/unsubscribes');
  return res.json();
}

export async function fetchDbReplies(): Promise<{ success: boolean; replies: GmailReplyRecord[] }> {
  const res = await fetch('/api/replies');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function saveDbReply(reply: Partial<GmailReplyRecord>): Promise<{ success: boolean; reply?: GmailReplyRecord }> {
  const res = await fetch('/api/replies', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(reply),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export async function deleteDbReply(id: string): Promise<{ success: boolean }> {
  const res = await fetch(`/api/replies/${encodeURIComponent(id)}`, { method: 'DELETE' });
  return res.json();
}

export async function fetchCustomPitchTemplates(): Promise<{
  success: boolean;
  templates: Record<string, string> | null;
  senderEmail: string | null;
  senderPhone: string | null;
}> {
  const res = await fetch('/api/settings/pitch-templates');
  return res.json();
}

export async function saveCustomPitchTemplatesToDb(payload: {
  templates: Record<string, string>;
  senderEmail?: string;
  senderPhone?: string;
}): Promise<{ success: boolean }> {
  const res = await fetch('/api/settings/pitch-templates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export async function resetCustomPitchTemplatesInDb(): Promise<{ success: boolean }> {
  const res = await fetch('/api/settings/pitch-templates', { method: 'DELETE' });
  return res.json();
}

export async function cleanupInvalidDbLeads(): Promise<{
  success: boolean;
  removedLeads: number;
  removedCampaigns: number;
}> {
  const res = await fetch('/api/db/cleanup-invalid', { method: 'POST' });
  return res.json();
}
