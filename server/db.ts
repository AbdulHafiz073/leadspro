import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type {
  Lead,
  DiscoveryRunRecord,
  EmailCampaignItem,
  EmailCampaignStatus,
  DashboardMetricsSummary,
  GmailReplyRecord,
} from '../src/types/index';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../data');
const DB_PATH = path.join(DATA_DIR, 'leadhunter.db');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
  CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    normalized_name TEXT NOT NULL,
    normalized_domain TEXT,
    normalized_email TEXT,
    normalized_phone TEXT,
    business_name TEXT NOT NULL,
    category TEXT NOT NULL,
    primary_group TEXT NOT NULL,
    country_name TEXT NOT NULL,
    state TEXT NOT NULL,
    city TEXT NOT NULL,
    region TEXT,
    postal_code TEXT,
    email TEXT,
    phone_number TEXT,
    owner_phone TEXT,
    location_phone TEXT,
    website_url TEXT,
    has_website INTEGER DEFAULT 1,
    quality_tier TEXT DEFAULT 'High Quality',
    opportunity_level TEXT DEFAULT 'Medium',
    service_required TEXT,
    email_verification_status TEXT DEFAULT 'Publicly Listed + MX Verified',
    mx_host TEXT,
    lead_score INTEGER DEFAULT 75,
    outreach_status TEXT DEFAULT 'Pending',
    reply_received INTEGER DEFAULT 0,
    discovered_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    data_json TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_leads_norm_name ON leads(normalized_name);
  CREATE INDEX IF NOT EXISTS idx_leads_norm_domain ON leads(normalized_domain);
  CREATE INDEX IF NOT EXISTS idx_leads_norm_email ON leads(normalized_email);
  CREATE INDEX IF NOT EXISTS idx_leads_norm_phone ON leads(normalized_phone);
  CREATE INDEX IF NOT EXISTS idx_leads_group ON leads(primary_group);
  CREATE INDEX IF NOT EXISTS idx_leads_country_city ON leads(country_name, city);

  CREATE TABLE IF NOT EXISTS discovery_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id TEXT UNIQUE NOT NULL,
    requested_count INTEGER NOT NULL,
    found_count INTEGER DEFAULT 0,
    verified_count INTEGER DEFAULT 0,
    excluded_count INTEGER DEFAULT 0,
    duplicates_prevented INTEGER DEFAULT 0,
    categories_json TEXT NOT NULL,
    country TEXT NOT NULL,
    state TEXT,
    city TEXT,
    region TEXT,
    postal_code TEXT,
    service_required TEXT,
    status TEXT NOT NULL,
    error_message TEXT,
    started_at TEXT NOT NULL,
    completed_at TEXT
  );

  CREATE TABLE IF NOT EXISTS email_campaigns (
    id TEXT PRIMARY KEY,
    lead_id INTEGER NOT NULL,
    business_name TEXT NOT NULL,
    recipient_email TEXT NOT NULL,
    category TEXT NOT NULL,
    city TEXT NOT NULL,
    country_name TEXT NOT NULL,
    service_required TEXT NOT NULL,
    website_url TEXT,
    email_verification_status TEXT NOT NULL,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    status TEXT NOT NULL,
    auto_send_authorized INTEGER DEFAULT 0,
    gmail_message_id TEXT,
    gmail_thread_id TEXT,
    error_message TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    sent_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_campaigns_email ON email_campaigns(recipient_email);
  CREATE INDEX IF NOT EXISTS idx_campaigns_status ON email_campaigns(status);

  CREATE TABLE IF NOT EXISTS unsubscribes (
    email TEXT PRIMARY KEY,
    reason TEXT,
    unsubscribed_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS discovery_cursors (
    cursor_key TEXT PRIMARY KEY,
    sparql_offset INTEGER DEFAULT 0,
    wiki_offset INTEGER DEFAULT 0,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS gmail_replies (
    id TEXT PRIMARY KEY,
    lead_id INTEGER,
    business_name TEXT NOT NULL,
    client_email TEXT NOT NULL,
    client_phone TEXT,
    extracted_phone TEXT,
    location TEXT,
    address TEXT,
    city TEXT,
    country_name TEXT,
    google_maps_url TEXT,
    subject TEXT NOT NULL,
    reply_snippet TEXT NOT NULL,
    full_message TEXT NOT NULL,
    reply_type TEXT NOT NULL,
    intent_category TEXT,
    wants_create INTEGER DEFAULT 0,
    wants_update INTEGER DEFAULT 0,
    received_at TEXT NOT NULL,
    thread_url TEXT,
    notes TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_gmail_replies_email ON gmail_replies(client_email);

  CREATE TABLE IF NOT EXISTS chatbot_messages (
    id TEXT PRIMARY KEY,
    session_key TEXT NOT NULL,
    lead_id INTEGER,
    sender TEXT NOT NULL,
    text TEXT NOT NULL,
    options_json TEXT,
    drafted_message TEXT,
    draft_subject TEXT,
    channel TEXT,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_chatbot_session ON chatbot_messages(session_key, created_at);
  CREATE TABLE IF NOT EXISTS whatsapp_bot_sessions (
    phone TEXT PRIMARY KEY,
    lead_id INTEGER,
    business_name TEXT,
    step TEXT NOT NULL,
    service_mode TEXT,
    category_id TEXT,
    category_label TEXT,
    sub_type TEXT,
    final_decision TEXT,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

try {
  db.exec(`ALTER TABLE email_campaigns ADD COLUMN address TEXT`);
} catch {
  // Column already exists
}

try {
  db.exec(`ALTER TABLE discovery_cursors ADD COLUMN wiki_query_idx INTEGER DEFAULT 0`);
} catch {
  // Column already exists
}

for (const colDef of [
  'service_mode TEXT',
  'selected_category TEXT',
  'selected_subtype TEXT',
  'final_decision TEXT',
  'channel_source TEXT',
]) {
  try {
    db.exec(`ALTER TABLE gmail_replies ADD COLUMN ${colDef}`);
  } catch {
    // Column already exists
  }
}

export function normalizeBusinessName(name: string): string {
  return (name || '')
    .toLowerCase()
    .replace(/\b(inc|llc|ltd|limited|pvt|private|corp|corporation|co|llp|gmbh|studio|studios|company|group)\b/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

export function normalizeDomain(urlOrDomain: string | null | undefined): string | null {
  if (!urlOrDomain) return null;
  try {
    let raw = urlOrDomain.trim().toLowerCase();
    if (!raw.startsWith('http://') && !raw.startsWith('https://')) {
      raw = 'https://' + raw;
    }
    const hostname = new URL(raw).hostname.replace(/^www\./, '');
    return hostname || null;
  } catch {
    return null;
  }
}

export function normalizeEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const clean = email.trim().toLowerCase();
  return clean.includes('@') ? clean : null;
}

export function normalizePhoneDigits(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/[^0-9]/g, '');
  if (digits.length < 7) return null;
  return digits.slice(-10);
}

export function isDuplicateLeadInDb(candidate: {
  businessName: string;
  websiteUrl?: string | null;
  email?: string | null;
  phoneNumber?: string | null;
  ownerPhone?: string | null;
}): { isDuplicate: boolean; reason?: string } {
  const normName = normalizeBusinessName(candidate.businessName);
  const normDomain = normalizeDomain(candidate.websiteUrl);
  const normEmail = normalizeEmail(candidate.email);
  const normPhone = normalizePhoneDigits(candidate.phoneNumber || candidate.ownerPhone);

  if (normEmail) {
    const byEmail = db.prepare('SELECT id, business_name FROM leads WHERE normalized_email = ? LIMIT 1').get(normEmail) as any;
    if (byEmail) {
      return { isDuplicate: true, reason: `Duplicate email matches ${byEmail.business_name}` };
    }
  }

  if (normDomain) {
    const byDomain = db.prepare('SELECT id, business_name FROM leads WHERE normalized_domain = ? LIMIT 1').get(normDomain) as any;
    if (byDomain) {
      return { isDuplicate: true, reason: `Duplicate domain matches ${byDomain.business_name}` };
    }
  }

  if (normPhone) {
    const byPhone = db.prepare('SELECT id, business_name FROM leads WHERE normalized_phone = ? LIMIT 1').get(normPhone) as any;
    if (byPhone) {
      return { isDuplicate: true, reason: `Duplicate phone matches ${byPhone.business_name}` };
    }
  }

  if (normName && normName.length >= 4) {
    const byName = db.prepare('SELECT id, business_name FROM leads WHERE normalized_name = ? LIMIT 1').get(normName) as any;
    if (byName) {
      return { isDuplicate: true, reason: `Duplicate business name matches ${byName.business_name}` };
    }
  }

  return { isDuplicate: false };
}

export function insertVerifiedLead(lead: Omit<Lead, 'id'> & { id?: number }): Lead {
  const now = new Date().toISOString();
  const normName = normalizeBusinessName(lead.businessName);
  const normDomain = normalizeDomain(lead.websiteUrl);
  const normEmail = normalizeEmail(lead.email);
  const normPhone = normalizePhoneDigits(lead.locationPhone || lead.phoneNumber || lead.ownerPhone);

  const stmt = db.prepare(`
    INSERT INTO leads (
      normalized_name, normalized_domain, normalized_email, normalized_phone,
      business_name, category, primary_group, country_name, state, city, region, postal_code,
      email, phone_number, owner_phone, location_phone, website_url, has_website,
      quality_tier, opportunity_level, service_required, email_verification_status, mx_host,
      lead_score, outreach_status, reply_received, discovered_at, created_at, updated_at, data_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const tempLead: Lead = {
    ...(lead as Lead),
    id: 0,
    discoveredAt: lead.discoveredAt || now,
    createdAt: lead.createdAt || now,
    updatedAt: now,
  };

  const result = stmt.run(
    normName,
    normDomain,
    normEmail,
    normPhone,
    lead.businessName,
    lead.category,
    lead.primaryGroup || 'Website',
    lead.countryName || '',
    lead.state || '',
    lead.city || '',
    lead.region || '',
    lead.postalCode || '',
    lead.email || null,
    lead.phoneNumber || null,
    lead.ownerPhone || null,
    lead.locationPhone || lead.phoneNumber || null,
    lead.websiteUrl || null,
    lead.hasWebsite ? 1 : 0,
    lead.qualityTier || 'High Quality',
    lead.opportunityLevel || 'Medium',
    lead.serviceRequired || '',
    lead.emailVerificationStatus || 'Publicly Listed + MX Verified',
    lead.mxHost || null,
    lead.leadScore || 80,
    lead.outreachStatus || 'Pending',
    lead.replyReceived ? 1 : 0,
    tempLead.discoveredAt || now,
    tempLead.createdAt || now,
    tempLead.updatedAt || now,
    JSON.stringify(tempLead)
  );

  const insertedId = Number(result.lastInsertRowid);
  const finalLead: Lead = { ...tempLead, id: insertedId };
  db.prepare('UPDATE leads SET data_json = ? WHERE id = ?').run(JSON.stringify(finalLead), insertedId);
  return finalLead;
}

export function getAllLeadsFromDb(): Lead[] {
  const rows = db.prepare('SELECT id, data_json FROM leads ORDER BY id DESC').all() as Array<{
    id: number;
    data_json: string;
  }>;
  const leads: Lead[] = [];
  for (const row of rows) {
    try {
      const parsed = JSON.parse(row.data_json) as Lead;
      parsed.id = row.id;
      leads.push(parsed);
    } catch {
      // Skip malformed row
    }
  }
  return leads;
}

export function getLeadByIdFromDb(id: number): Lead | null {
  const row = db.prepare('SELECT id, data_json FROM leads WHERE id = ? LIMIT 1').get(id) as
    | { id: number; data_json: string }
    | undefined;
  if (!row) return null;
  try {
    const parsed = JSON.parse(row.data_json) as Lead;
    parsed.id = row.id;
    return parsed;
  } catch {
    return null;
  }
}

export function getLeadByEmailFromDb(email: string): Lead | null {
  if (!email) return null;
  const clean = email.toLowerCase().trim();
  const norm = normalizeEmail(clean);
  const row = (norm ? db.prepare('SELECT id, data_json FROM leads WHERE normalized_email = ? LIMIT 1').get(norm) : null) as
    | { id: number; data_json: string }
    | undefined;
  const targetRow = row || (db.prepare('SELECT id, data_json FROM leads WHERE LOWER(email) = ? LIMIT 1').get(clean) as
    | { id: number; data_json: string }
    | undefined);
  if (!targetRow) return null;
  try {
    const parsed = JSON.parse(targetRow.data_json) as Lead;
    parsed.id = targetRow.id;
    return parsed;
  } catch {
    return null;
  }
}

export function updateLeadInDb(id: number, updates: Partial<Lead>): Lead | null {
  const existing = getLeadByIdFromDb(id);
  if (!existing) return null;
  const now = new Date().toISOString();
  const merged: Lead = { ...existing, ...updates, id, updatedAt: now };

  db.prepare(`
    UPDATE leads SET
      outreach_status = ?,
      reply_received = ?,
      lead_score = ?,
      updated_at = ?,
      data_json = ?
    WHERE id = ?
  `).run(
    merged.outreachStatus || 'Pending',
    merged.replyReceived ? 1 : 0,
    merged.leadScore || 0,
    now,
    JSON.stringify(merged),
    id
  );
  return merged;
}

export function deleteLeadFromDb(id: number): boolean {
  const res = db.prepare('DELETE FROM leads WHERE id = ?').run(id);
  return Number(res.changes) > 0;
}

export function getExistingDedupKeys(): {
  names: Set<string>;
  domains: Set<string>;
  emails: Set<string>;
  phones: Set<string>;
} {
  const rows = db
    .prepare('SELECT normalized_name, normalized_domain, normalized_email, normalized_phone FROM leads')
    .all() as Array<{
    normalized_name: string | null;
    normalized_domain: string | null;
    normalized_email: string | null;
    normalized_phone: string | null;
  }>;

  const names = new Set<string>();
  const domains = new Set<string>();
  const emails = new Set<string>();
  const phones = new Set<string>();

  for (const r of rows) {
    if (r.normalized_name) names.add(r.normalized_name);
    if (r.normalized_domain) domains.add(r.normalized_domain);
    if (r.normalized_email) emails.add(r.normalized_email);
    if (r.normalized_phone) phones.add(r.normalized_phone);
  }

  return { names, domains, emails, phones };
}

export function saveDiscoveryRunStart(run: {
  jobId: string;
  requestedCount: number;
  categories: string[];
  country: string;
  state: string;
  city: string;
  region?: string;
  postalCode?: string;
  serviceRequired?: string;
}): void {
  db.prepare(`
    INSERT INTO discovery_runs (
      job_id, requested_count, categories_json, country, state, city, region, postal_code, service_required, status, started_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Running', ?)
  `).run(
    run.jobId,
    run.requestedCount,
    JSON.stringify(run.categories),
    run.country,
    run.state || '',
    run.city || '',
    run.region || '',
    run.postalCode || '',
    run.serviceRequired || '',
    new Date().toISOString()
  );
}

export function completeDiscoveryRun(
  jobId: string,
  stats: {
    foundCount: number;
    verifiedCount: number;
    excludedCount: number;
    duplicatesPrevented: number;
    status: 'Completed' | 'Failed';
    errorMessage?: string | null;
  }
): void {
  db.prepare(`
    UPDATE discovery_runs SET
      found_count = ?,
      verified_count = ?,
      excluded_count = ?,
      duplicates_prevented = ?,
      status = ?,
      error_message = ?,
      completed_at = ?
    WHERE job_id = ?
  `).run(
    stats.foundCount,
    stats.verifiedCount,
    stats.excludedCount,
    stats.duplicatesPrevented,
    stats.status,
    stats.errorMessage || null,
    new Date().toISOString(),
    jobId
  );
}

export function getDiscoveryRuns(): DiscoveryRunRecord[] {
  const rows = db.prepare('SELECT * FROM discovery_runs ORDER BY id DESC LIMIT 100').all() as any[];
  return rows.map((r) => ({
    id: r.id,
    jobId: r.job_id,
    requestedCount: r.requested_count,
    foundCount: r.found_count,
    verifiedCount: r.verified_count,
    excludedCount: r.excluded_count,
    duplicatesPrevented: r.duplicates_prevented,
    categories: (() => {
      try {
        return JSON.parse(r.categories_json);
      } catch {
        return [];
      }
    })(),
    country: r.country,
    state: r.state || '',
    city: r.city || '',
    region: r.region || '',
    postalCode: r.postal_code || '',
    serviceRequired: r.service_required || '',
    status: r.status,
    errorMessage: r.error_message,
    startedAt: r.started_at,
    completedAt: r.completed_at,
  }));
}

export function buildDiscoveryCursorKey(country: string, city: string, category: string): string {
  return `${(country || '').trim().toLowerCase()}::${(city || '').trim().toLowerCase()}::${(category || '').trim().toLowerCase()}`;
}

export function getDiscoveryCursor(country: string, city: string, category: string): {
  sparqlOffset: number;
  wikiOffset: number;
  wikiQueryIdx: number;
} {
  const key = buildDiscoveryCursorKey(country, city, category);
  const row = db
    .prepare('SELECT sparql_offset, wiki_offset, wiki_query_idx FROM discovery_cursors WHERE cursor_key = ? LIMIT 1')
    .get(key) as { sparql_offset: number; wiki_offset: number; wiki_query_idx?: number } | undefined;
  return {
    sparqlOffset: Number(row?.sparql_offset || 0),
    wikiOffset: Number(row?.wiki_offset || 0),
    wikiQueryIdx: Number(row?.wiki_query_idx || 0),
  };
}

export function saveDiscoveryCursor(
  country: string,
  city: string,
  category: string,
  sparqlOffset: number,
  wikiOffset: number,
  wikiQueryIdx = 0
): void {
  const key = buildDiscoveryCursorKey(country, city, category);
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO discovery_cursors (cursor_key, sparql_offset, wiki_offset, wiki_query_idx, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(cursor_key) DO UPDATE SET
      sparql_offset = excluded.sparql_offset,
      wiki_offset = excluded.wiki_offset,
      wiki_query_idx = excluded.wiki_query_idx,
      updated_at = excluded.updated_at
  `).run(key, Math.max(0, sparqlOffset), Math.max(0, wikiOffset), Math.max(0, wikiQueryIdx), now);
}

export function isEmailUnsubscribed(email: string): boolean {
  const clean = normalizeEmail(email);
  if (!clean) return false;
  const row = db.prepare('SELECT email FROM unsubscribes WHERE email = ? LIMIT 1').get(clean);
  return Boolean(row);
}

export function addUnsubscribe(email: string, reason = 'Recipient opted out'): void {
  const clean = normalizeEmail(email);
  if (!clean) return;
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO unsubscribes (email, reason, unsubscribed_at)
    VALUES (?, ?, ?)
    ON CONFLICT(email) DO UPDATE SET reason = excluded.reason, unsubscribed_at = excluded.unsubscribed_at
  `).run(clean, reason, now);

  db.prepare(`UPDATE email_campaigns SET status = 'Unsubscribed', updated_at = ? WHERE LOWER(recipient_email) = ?`).run(
    now,
    clean
  );

  // Also reflect in matching leads
  const rows = db.prepare('SELECT id, data_json FROM leads WHERE normalized_email = ?').all(clean) as any[];
  for (const r of rows) {
    try {
      const lead = JSON.parse(r.data_json) as Lead;
      lead.outreachStatus = 'Unsubscribed';
      lead.updatedAt = now;
      db.prepare('UPDATE leads SET outreach_status = ?, updated_at = ?, data_json = ? WHERE id = ?').run(
        'Unsubscribed',
        now,
        JSON.stringify(lead),
        r.id
      );
    } catch {}
  }
}

export function getUnsubscribes(): Array<{ email: string; reason: string; unsubscribedAt: string }> {
  const rows = db.prepare('SELECT * FROM unsubscribes ORDER BY unsubscribed_at DESC').all() as any[];
  return rows.map((r) => ({
    email: r.email,
    reason: r.reason || '',
    unsubscribedAt: r.unsubscribed_at,
  }));
}

export function upsertEmailCampaignItem(item: EmailCampaignItem): EmailCampaignItem {
  const cleanEmail = normalizeEmail(item.recipientEmail) || item.recipientEmail;
  if (isEmailUnsubscribed(cleanEmail)) {
    item = { ...item, status: 'Unsubscribed', errorMessage: 'Recipient is on the Unsubscribe opt-out list.' };
  }

  db.prepare(`
    INSERT INTO email_campaigns (
      id, lead_id, business_name, recipient_email, category, address, city, country_name,
      service_required, website_url, email_verification_status, subject, body,
      status, auto_send_authorized, gmail_message_id, gmail_thread_id, error_message,
      created_at, updated_at, sent_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      address = COALESCE(excluded.address, email_campaigns.address),
      subject = excluded.subject,
      body = excluded.body,
      status = excluded.status,
      auto_send_authorized = excluded.auto_send_authorized,
      gmail_message_id = excluded.gmail_message_id,
      gmail_thread_id = excluded.gmail_thread_id,
      error_message = excluded.error_message,
      updated_at = excluded.updated_at,
      sent_at = excluded.sent_at
  `).run(
    item.id,
    item.leadId,
    item.businessName,
    cleanEmail,
    item.category,
    item.address || '',
    item.city,
    item.countryName,
    item.serviceRequired,
    item.websiteUrl || null,
    item.emailVerificationStatus,
    item.subject,
    item.body,
    item.status,
    item.autoSendAuthorized ? 1 : 0,
    item.gmailMessageId || null,
    item.gmailThreadId || null,
    item.errorMessage || null,
    item.createdAt,
    item.updatedAt,
    item.sentAt || null
  );

  return item;
}

export function hasEmailBeenSentToAddress(email: string): boolean {
  const clean = normalizeEmail(email);
  if (!clean) return false;
  const row = db
    .prepare(`SELECT id FROM email_campaigns WHERE LOWER(recipient_email) = ? AND status = 'Sent' LIMIT 1`)
    .get(clean);
  return Boolean(row);
}

export function updateEmailCampaignStatus(
  id: string,
  status: EmailCampaignStatus,
  extra?: {
    gmailMessageId?: string | null;
    gmailThreadId?: string | null;
    errorMessage?: string | null;
    subject?: string;
    body?: string;
    autoSendAuthorized?: boolean;
  }
): EmailCampaignItem | null {
  const row = db.prepare('SELECT * FROM email_campaigns WHERE id = ? LIMIT 1').get(id) as any;
  if (!row) return null;
  const now = new Date().toISOString();
  const sentAt = status === 'Sent' ? now : row.sent_at;

  db.prepare(`
    UPDATE email_campaigns SET
      status = ?,
      subject = ?,
      body = ?,
      auto_send_authorized = ?,
      gmail_message_id = COALESCE(?, gmail_message_id),
      gmail_thread_id = COALESCE(?, gmail_thread_id),
      error_message = ?,
      updated_at = ?,
      sent_at = ?
    WHERE id = ?
  `).run(
    status,
    extra?.subject ?? row.subject,
    extra?.body ?? row.body,
    extra?.autoSendAuthorized !== undefined ? (extra.autoSendAuthorized ? 1 : 0) : row.auto_send_authorized,
    extra?.gmailMessageId ?? null,
    extra?.gmailThreadId ?? null,
    extra?.errorMessage ?? (status === 'Sent' || status === 'Approved' ? null : row.error_message),
    now,
    sentAt,
    id
  );

  // Sync status back to leads table when Sent/Failed
  if (status === 'Sent') {
    updateLeadInDb(row.lead_id, {
      outreachStatus: 'EmailSent',
      pitchChannel: 'Email',
      lastPitchedAt: sentAt,
      pitchSubject: extra?.subject ?? row.subject,
      pitchMessage: extra?.body ?? row.body,
      pitchApp: 'Gmail',
      pitchRecipient: row.recipient_email,
      errorMessage: null,
    });
  } else if (status === 'Failed') {
    updateLeadInDb(row.lead_id, {
      outreachStatus: 'EmailError',
      errorType: 'EmailBounced',
      errorMessage: extra?.errorMessage || 'Gmail send failed',
    });
  }

  return getEmailCampaignById(id);
}

export function getEmailCampaignById(id: string): EmailCampaignItem | null {
  const r = db.prepare('SELECT * FROM email_campaigns WHERE id = ? LIMIT 1').get(id) as any;
  if (!r) return null;
  return mapCampaignRow(r);
}

export function getEmailCampaigns(statusFilter?: string): EmailCampaignItem[] {
  const rows =
    statusFilter && statusFilter !== 'all'
      ? (db.prepare('SELECT * FROM email_campaigns WHERE status = ? ORDER BY updated_at DESC').all(statusFilter) as any[])
      : (db.prepare('SELECT * FROM email_campaigns ORDER BY updated_at DESC').all() as any[]);
  return rows.map(mapCampaignRow);
}

function mapCampaignRow(r: any): EmailCampaignItem {
  let addr = r.address || '';
  if (!addr && r.lead_id) {
    const l = getLeadByIdFromDb(Number(r.lead_id));
    if (l?.address) addr = l.address;
  }
  return {
    id: r.id,
    leadId: r.lead_id,
    businessName: r.business_name,
    recipientEmail: r.recipient_email,
    category: r.category,
    address: addr,
    city: r.city,
    countryName: r.country_name,
    serviceRequired: r.service_required,
    websiteUrl: r.website_url,
    emailVerificationStatus: r.email_verification_status,
    subject: r.subject,
    body: r.body,
    status: r.status as EmailCampaignStatus,
    autoSendAuthorized: Boolean(r.auto_send_authorized),
    gmailMessageId: r.gmail_message_id,
    gmailThreadId: r.gmail_thread_id,
    errorMessage: r.error_message,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    sentAt: r.sent_at,
  };
}

export function saveGmailReplyToDb(record: GmailReplyRecord): GmailReplyRecord {
  const cleanEmail = (record.clientEmail || '').trim().toLowerCase();

  let matchedLead: Lead | null = null;
  if (record.leadId) {
    matchedLead = getLeadByIdFromDb(Number(record.leadId));
  }
  if (!matchedLead && cleanEmail) {
    const row = db.prepare('SELECT id FROM leads WHERE normalized_email = ? LIMIT 1').get(cleanEmail) as
      | { id: number }
      | undefined;
    if (row?.id) matchedLead = getLeadByIdFromDb(row.id);
  }

  const address = record.address || matchedLead?.address || '';
  const city = record.city || matchedLead?.city || '';
  const countryName = record.countryName || matchedLead?.countryName || '';
  const location =
    record.location ||
    [address, city, countryName].filter(Boolean).join(', ') ||
    '';
  const googleMapsUrl = record.googleMapsUrl || matchedLead?.googleMapsUrl || '';
  const clientPhone = record.clientPhone || matchedLead?.ownerPhone || matchedLead?.phoneNumber || '';

  const enriched: GmailReplyRecord = {
    ...record,
    leadId: matchedLead?.id || record.leadId,
    clientEmail: cleanEmail,
    clientPhone: clientPhone || undefined,
    location: location || undefined,
    address: address || undefined,
    city: city || undefined,
    countryName: countryName || undefined,
    googleMapsUrl: googleMapsUrl || undefined,
  };

  db.prepare(`
    INSERT INTO gmail_replies (
      id, lead_id, business_name, client_email, client_phone, extracted_phone,
      location, address, city, country_name, google_maps_url,
      subject, reply_snippet, full_message, reply_type, intent_category,
      wants_create, wants_update, service_mode, selected_category, selected_subtype,
      final_decision, channel_source, received_at, thread_url, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      client_phone = COALESCE(excluded.client_phone, gmail_replies.client_phone),
      extracted_phone = COALESCE(excluded.extracted_phone, gmail_replies.extracted_phone),
      location = COALESCE(excluded.location, gmail_replies.location),
      intent_category = excluded.intent_category,
      wants_create = excluded.wants_create,
      wants_update = excluded.wants_update,
      service_mode = COALESCE(excluded.service_mode, gmail_replies.service_mode),
      selected_category = COALESCE(excluded.selected_category, gmail_replies.selected_category),
      selected_subtype = COALESCE(excluded.selected_subtype, gmail_replies.selected_subtype),
      final_decision = COALESCE(excluded.final_decision, gmail_replies.final_decision),
      channel_source = COALESCE(excluded.channel_source, gmail_replies.channel_source),
      reply_type = excluded.reply_type,
      reply_snippet = excluded.reply_snippet,
      full_message = excluded.full_message,
      notes = excluded.notes
  `).run(
    enriched.id,
    enriched.leadId ?? null,
    enriched.businessName,
    cleanEmail,
    enriched.clientPhone || null,
    enriched.extractedPhone || null,
    enriched.location || null,
    enriched.address || null,
    enriched.city || null,
    enriched.countryName || null,
    enriched.googleMapsUrl || null,
    enriched.subject,
    enriched.replySnippet,
    enriched.fullMessage,
    enriched.replyType,
    enriched.intentCategory || 'General',
    enriched.wantsWebsiteCreate ? 1 : 0,
    enriched.wantsWebsiteUpdate ? 1 : 0,
    enriched.serviceMode || null,
    enriched.selectedCategory || null,
    enriched.selectedSubType || null,
    enriched.finalDecision || null,
    enriched.channelSource || null,
    enriched.receivedAt,
    enriched.threadUrl || null,
    enriched.notes || null
  );

  if (matchedLead) {
    const rType: Lead['replyType'] = enriched.replyType.includes('NO')
      ? 'NotInterested'
      : enriched.replyType.includes('Demo')
      ? 'DemoScheduled'
      : enriched.replyType.includes('Won')
      ? 'DealWon'
      : 'Interested';

    updateLeadInDb(matchedLead.id, {
      outreachStatus: 'Replied',
      replyReceived: true,
      replyType: rType,
      replyIntent: enriched.intentCategory || 'Interested',
      approvedWebsiteCreate: Boolean(matchedLead.approvedWebsiteCreate || enriched.wantsWebsiteCreate),
      requestedWebsiteUpdate: Boolean(matchedLead.requestedWebsiteUpdate || enriched.wantsWebsiteUpdate),
      replyExtractedPhone: enriched.extractedPhone || matchedLead.replyExtractedPhone || null,
      ownerPhone: enriched.extractedPhone || matchedLead.ownerPhone || null,
      whatsAppNumber: enriched.extractedPhone || matchedLead.whatsAppNumber || null,
      repliedAt: enriched.receivedAt,
      replyNotes: enriched.fullMessage,
      chatbotSummary:
        enriched.serviceMode || enriched.selectedCategory || enriched.selectedSubType || enriched.finalDecision
          ? {
              serviceMode: enriched.serviceMode,
              selectedCategory: enriched.selectedCategory,
              selectedSubType: enriched.selectedSubType,
              finalDecision: enriched.finalDecision,
              channelSource: enriched.channelSource,
              updatedAt: enriched.receivedAt,
            }
          : matchedLead.chatbotSummary,
    });
  }

  return enriched;
}

export function getGmailRepliesFromDb(): GmailReplyRecord[] {
  const rows = db.prepare('SELECT * FROM gmail_replies ORDER BY received_at DESC LIMIT 500').all() as any[];
  return rows.map((r) => ({
    id: r.id,
    leadId: r.lead_id || undefined,
    businessName: r.business_name,
    clientEmail: r.client_email,
    clientPhone: r.client_phone || undefined,
    extractedPhone: r.extracted_phone || null,
    location: r.location || undefined,
    address: r.address || undefined,
    city: r.city || undefined,
    countryName: r.country_name || undefined,
    googleMapsUrl: r.google_maps_url || undefined,
    subject: r.subject,
    replySnippet: r.reply_snippet,
    fullMessage: r.full_message,
    replyType: r.reply_type as GmailReplyRecord['replyType'],
    intentCategory: (r.intent_category || 'General') as GmailReplyRecord['intentCategory'],
    wantsWebsiteCreate: Boolean(r.wants_create),
    wantsWebsiteUpdate: Boolean(r.wants_update),
    serviceMode: r.service_mode || undefined,
    selectedCategory: r.selected_category || undefined,
    selectedSubType: r.selected_subtype || undefined,
    finalDecision:
      r.final_decision === 'YES' || r.final_decision === 'NO' ? r.final_decision : undefined,
    channelSource: r.channel_source || undefined,
    receivedAt: r.received_at,
    threadUrl: r.thread_url || undefined,
    notes: r.notes || undefined,
  }));
}

export function deleteGmailReplyFromDb(id: string): boolean {
  const res = db.prepare('DELETE FROM gmail_replies WHERE id = ?').run(id);
  return Number(res.changes) > 0;
}

export function getDashboardMetrics(): DashboardMetricsSummary {
  const totalLeadsRow = db.prepare('SELECT COUNT(*) as c FROM leads').get() as { c: number };
  const verifiedEmailsRow = db
    .prepare(`SELECT COUNT(*) as c FROM leads WHERE email IS NOT NULL AND email != ''`)
    .get() as { c: number };
  const verifiedPhonesRow = db
    .prepare(
      `SELECT COUNT(*) as c FROM leads WHERE (phone_number IS NOT NULL AND phone_number != '') OR (owner_phone IS NOT NULL AND owner_phone != '')`
    )
    .get() as { c: number };
  const availableWebsitesRow = db
    .prepare(`SELECT COUNT(*) as c FROM leads WHERE has_website = 1 AND website_url IS NOT NULL AND website_url != ''`)
    .get() as { c: number };
  const opportunitiesRow = db
    .prepare(`SELECT COUNT(*) as c FROM leads WHERE opportunity_level IN ('High', 'Medium')`)
    .get() as { c: number };
  const emailsSentRow = db
    .prepare(`SELECT COUNT(*) as c FROM email_campaigns WHERE status = 'Sent'`)
    .get() as { c: number };
  const pendingEmailsRow = db
    .prepare(`SELECT COUNT(*) as c FROM email_campaigns WHERE status IN ('PendingApproval', 'Approved')`)
    .get() as { c: number };
  const dupRow = db.prepare(`SELECT COALESCE(SUM(duplicates_prevented), 0) as s FROM discovery_runs`).get() as {
    s: number;
  };
  const latestRun = db
    .prepare(`SELECT verified_count FROM discovery_runs WHERE status = 'Completed' ORDER BY id DESC LIMIT 1`)
    .get() as { verified_count: number } | undefined;
  const unsubRow = db.prepare(`SELECT COUNT(*) as c FROM unsubscribes`).get() as { c: number };

  return {
    totalLeadsFound: totalLeadsRow.c,
    newUniqueLeads: latestRun ? latestRun.verified_count : totalLeadsRow.c,
    verifiedEmails: verifiedEmailsRow.c,
    verifiedPhoneNumbers: verifiedPhonesRow.c,
    availableWebsites: availableWebsitesRow.c,
    potentialOpportunities: opportunitiesRow.c,
    emailsSent: emailsSentRow.c,
    pendingEmails: pendingEmailsRow.c,
    duplicateLeadsPrevented: dupRow.s,
    unsubscribedCount: unsubRow.c,
  };
}

export interface ChatbotMessageRecord {
  id: string;
  sessionKey: string;
  leadId?: number | null;
  sender: 'bot' | 'user';
  text: string;
  options?: Array<{ id: string; label: string; highlight?: boolean; action?: string; payload?: string }>;
  draftedMessage?: string | null;
  draftSubject?: string | null;
  channel?: string | null;
  createdAt: string;
}

export function getChatbotMessages(sessionKey = 'global'): ChatbotMessageRecord[] {
  const rows = db
    .prepare('SELECT * FROM chatbot_messages WHERE session_key = ? ORDER BY created_at ASC LIMIT 200')
    .all(sessionKey) as any[];
  return rows.map((r) => {
    let options: ChatbotMessageRecord['options'];
    if (r.options_json) {
      try {
        options = JSON.parse(r.options_json);
      } catch {
        options = undefined;
      }
    }
    return {
      id: r.id,
      sessionKey: r.session_key,
      leadId: r.lead_id ?? null,
      sender: r.sender === 'user' ? 'user' : 'bot',
      text: r.text,
      options,
      draftedMessage: r.drafted_message || null,
      draftSubject: r.draft_subject || null,
      channel: r.channel || null,
      createdAt: r.created_at,
    };
  });
}

export function saveChatbotMessage(msg: ChatbotMessageRecord): ChatbotMessageRecord {
  db.prepare(
    `INSERT OR REPLACE INTO chatbot_messages (
      id, session_key, lead_id, sender, text, options_json, drafted_message, draft_subject, channel, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    msg.id,
    msg.sessionKey || 'global',
    msg.leadId ?? null,
    msg.sender,
    msg.text,
    msg.options ? JSON.stringify(msg.options) : null,
    msg.draftedMessage || null,
    msg.draftSubject || null,
    msg.channel || null,
    msg.createdAt || new Date().toISOString()
  );
  return msg;
}

export function clearChatbotMessages(sessionKey = 'global'): void {
  db.prepare('DELETE FROM chatbot_messages WHERE session_key = ?').run(sessionKey);
}

export function findLeadByPhone(rawPhone: string): Lead | null {
  const digits = String(rawPhone || '').replace(/[^0-9]/g, '');
  if (digits.length < 7) return null;
  const tail = digits.slice(-10);
  const rows = db
    .prepare(
      `SELECT id FROM leads WHERE normalized_phone LIKE ? OR phone_number LIKE ? OR owner_phone LIKE ? LIMIT 1`
    )
    .all(`%${tail}`, `%${tail}%`, `%${tail}%`) as Array<{ id: number }>;
  if (rows.length > 0 && rows[0]?.id) {
    return getLeadByIdFromDb(rows[0].id);
  }
  return null;
}

export interface WhatsAppBotSession {
  phone: string;
  leadId?: number | null;
  businessName?: string | null;
  step: 'mode' | 'category' | 'subtype' | 'confirm' | 'completed';
  serviceMode?: string | null;
  categoryId?: string | null;
  categoryLabel?: string | null;
  subType?: string | null;
  finalDecision?: 'YES' | 'NO' | null;
  updatedAt: string;
}

export function getWhatsAppBotSession(phone: string): WhatsAppBotSession | null {
  const clean = String(phone || '').replace(/[^0-9]/g, '');
  if (!clean) return null;
  const row = db
    .prepare('SELECT * FROM whatsapp_bot_sessions WHERE phone = ? LIMIT 1')
    .get(clean) as any;
  if (!row) return null;
  return {
    phone: row.phone,
    leadId: row.lead_id ?? null,
    businessName: row.business_name ?? null,
    step: (row.step || 'mode') as WhatsAppBotSession['step'],
    serviceMode: row.service_mode ?? null,
    categoryId: row.category_id ?? null,
    categoryLabel: row.category_label ?? null,
    subType: row.sub_type ?? null,
    finalDecision:
      row.final_decision === 'YES' || row.final_decision === 'NO' ? row.final_decision : null,
    updatedAt: row.updated_at,
  };
}

export function upsertWhatsAppBotSession(session: WhatsAppBotSession): WhatsAppBotSession {
  const clean = String(session.phone || '').replace(/[^0-9]/g, '');
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO whatsapp_bot_sessions (
      phone, lead_id, business_name, step, service_mode, category_id, category_label, sub_type, final_decision, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(phone) DO UPDATE SET
      lead_id = COALESCE(excluded.lead_id, whatsapp_bot_sessions.lead_id),
      business_name = COALESCE(excluded.business_name, whatsapp_bot_sessions.business_name),
      step = excluded.step,
      service_mode = excluded.service_mode,
      category_id = excluded.category_id,
      category_label = excluded.category_label,
      sub_type = excluded.sub_type,
      final_decision = excluded.final_decision,
      updated_at = excluded.updated_at
  `).run(
    clean,
    session.leadId ?? null,
    session.businessName ?? null,
    session.step,
    session.serviceMode ?? null,
    session.categoryId ?? null,
    session.categoryLabel ?? null,
    session.subType ?? null,
    session.finalDecision ?? null,
    now
  );
  return { ...session, phone: clean, updatedAt: now };
}

export function clearWhatsAppBotSession(phone: string): void {
  const clean = String(phone || '').replace(/[^0-9]/g, '');
  if (!clean) return;
  db.prepare('DELETE FROM whatsapp_bot_sessions WHERE phone = ?').run(clean);
}

export function recordClientChatbotResponse(params: {
  replyId?: string;
  leadId?: number | null;
  businessName?: string;
  senderPhone?: string;
  selection: string;
  messageText: string;
  serviceMode?: string;
  selectedCategory?: string;
  selectedSubType?: string;
  finalDecision?: 'YES' | 'NO';
  channel: 'WhatsApp Bot (9759725212)' | 'Client Chatbot Link';
}): { saved: boolean; replyId: string; leadId?: number | null; reply: GmailReplyRecord } {
  const now = new Date().toISOString();
  let matchedLead: Lead | null = params.leadId ? getLeadByIdFromDb(Number(params.leadId)) : null;
  if (!matchedLead && params.senderPhone) {
    matchedLead = findLeadByPhone(params.senderPhone);
  }

  const lower = `${params.serviceMode || ''} ${params.selection} ${params.messageText}`.toLowerCase();
  const isNo = params.finalDecision === 'NO';
  const wantsUpdate =
    !isNo &&
    (/update|redesign|revamp|fix/.test(params.serviceMode?.toLowerCase() || '') ||
      /update|redesign|revamp|fix/.test(lower));
  const wantsCreate =
    !isNo &&
    (/new|create/.test(params.serviceMode?.toLowerCase() || '') ||
      (!wantsUpdate && /new|create|app|game|software|ecommerce|e-commerce|build/.test(lower)));
  const phoneMatch = params.messageText.match(/(?:\+?\d[\d\s\-()]{7,18}\d)/);
  const extractedPhone = params.senderPhone || (phoneMatch ? phoneMatch[0].trim() : null);

  let intentCategory: GmailReplyRecord['intentCategory'] = isNo ? 'NotInterested' : 'Interested';
  let replyType: GmailReplyRecord['replyType'] = isNo ? 'NO (Not Interested)' : 'YES (Interested)';
  if (isNo) {
    intentCategory = 'NotInterested';
    replyType = 'NO (Not Interested)';
  } else if (wantsUpdate && !wantsCreate) {
    intentCategory = 'RequestedWebsiteUpdate';
    replyType = 'Website Update Requested';
  } else if (wantsCreate) {
    intentCategory = 'ApprovedWebsiteCreate';
    replyType = 'Website Create Approved';
  } else if (extractedPhone) {
    intentCategory = 'SentContactNumber';
    replyType = 'Contact Number Shared';
  }

  const bizName = matchedLead?.businessName || params.businessName || params.senderPhone || 'Client Lead';
  const clientEmail = matchedLead?.email || (params.senderPhone ? `whatsapp:${params.senderPhone}` : 'client@chatbot.local');
  const replyId = params.replyId || `cbot_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

  const summaryParts = [
    params.serviceMode ? `Mode: ${params.serviceMode}` : null,
    params.selectedCategory ? `Category: ${params.selectedCategory}` : null,
    params.selectedSubType ? `Type: ${params.selectedSubType}` : null,
    params.finalDecision ? `Final Decision: ${params.finalDecision}` : null,
    extractedPhone ? `Phone: ${extractedPhone}` : null,
  ].filter(Boolean);

  const summaryLine = summaryParts.length > 0 ? summaryParts.join(' | ') : params.selection;
  const fullSummary = `[${params.channel}]\n${summaryParts.length > 0 ? summaryParts.join('\n') + '\n' : ''}Selected: ${params.selection}\nMessage: ${params.messageText}`;

  const savedReply = saveGmailReplyToDb({
    id: replyId,
    leadId: matchedLead?.id,
    businessName: bizName,
    clientEmail,
    clientPhone: matchedLead?.phoneNumber || params.senderPhone || undefined,
    extractedPhone,
    address: matchedLead?.address || undefined,
    city: matchedLead?.city || undefined,
    countryName: matchedLead?.countryName || undefined,
    googleMapsUrl: matchedLead?.googleMapsUrl || undefined,
    subject: `${params.channel}: ${summaryLine}`,
    replySnippet: summaryLine.slice(0, 140),
    fullMessage: fullSummary,
    replyType,
    intentCategory,
    wantsWebsiteCreate: wantsCreate,
    wantsWebsiteUpdate: wantsUpdate,
    serviceMode: params.serviceMode || undefined,
    selectedCategory: params.selectedCategory || undefined,
    selectedSubType: params.selectedSubType || undefined,
    finalDecision: params.finalDecision,
    channelSource: params.channel,
    receivedAt: now,
    notes: `Client completed flow via ${params.channel}`,
  });

  if (matchedLead) {
    updateLeadInDb(matchedLead.id, {
      outreachStatus: 'Replied',
      replyReceived: true,
      replyType: isNo ? 'NotInterested' : 'Interested',
      replyIntent: intentCategory,
      approvedWebsiteCreate: Boolean(matchedLead.approvedWebsiteCreate || wantsCreate),
      requestedWebsiteUpdate: Boolean(matchedLead.requestedWebsiteUpdate || wantsUpdate),
      replyExtractedPhone: extractedPhone || matchedLead.replyExtractedPhone || null,
      ownerPhone: extractedPhone || matchedLead.ownerPhone || null,
      whatsAppNumber: extractedPhone || matchedLead.whatsAppNumber || null,
      repliedAt: now,
      replyNotes: `[${params.channel}] ${summaryLine} — ${params.messageText}`,
      chatbotSummary: {
        serviceMode: params.serviceMode,
        selectedCategory: params.selectedCategory,
        selectedSubType: params.selectedSubType,
        finalDecision: params.finalDecision,
        channelSource: params.channel,
        updatedAt: now,
      },
    });
  }

  return { saved: true, replyId: savedReply.id, leadId: matchedLead?.id ?? null, reply: savedReply };
}

export function getAppSetting<T = any>(key: string): T | null {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ? LIMIT 1').get(key) as
    | { value: string }
    | undefined;
  if (!row) return null;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return null;
  }
}

export function setAppSetting(key: string, value: any): void {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO app_settings (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(key, JSON.stringify(value), now);
}

export function deleteAppSetting(key: string): void {
  db.prepare('DELETE FROM app_settings WHERE key = ?').run(key);
}

const LEGACY_INVALID_ENTITIES_RE =
  /\b(coty|datadog|webull|infor global|liveperson|pretium|girl guides|wagggs|sugar organization|isosugar|v-ships|v\.group|burson|axsome|j\.\s*pocker|rtts|ovid therapeutics|antarctica capital|bloomberg|realty income|federal realty|digital realty|cedar realty|welltower|medical properties trust|oaknorth|pensionbee|orchard therapeutics|indian railway catering|inuit broadcasting|aldrees|tabuk cement|wolfram research|chartered institute|national restaurant association|international institute of information technology|human rights watch|new york law school|goldentree asset management)\b/i;

export function markOrphanRunningDiscoveryJobsInterrupted(): number {
  const now = new Date().toISOString();
  const res = db
    .prepare(
      `UPDATE discovery_runs
       SET status = 'Failed',
           error_message = COALESCE(error_message, 'Interrupted by server restart'),
           completed_at = COALESCE(completed_at, ?)
       WHERE status = 'Running'`
    )
    .run(now);
  return Number(res.changes || 0);
}

export function cleanupLegacyInvalidLeadsAndDrafts(): {
  removedLeads: number;
  removedCampaigns: number;
} {
  const rows = db
    .prepare('SELECT id, business_name, phone_number, data_json FROM leads')
    .all() as Array<{ id: number; business_name: string; phone_number: string | null; data_json: string }>;

  let removedLeads = 0;
  for (const row of rows) {
    let parsed: Partial<Lead> = {};
    try {
      parsed = JSON.parse(row.data_json);
    } catch {
      parsed = {};
    }

    const lacksIntent = !parsed.buyingIntentLevel;
    const isWikiOrUnknown =
      !parsed.sourcePlatform ||
      parsed.sourcePlatform === 'Unknown' ||
      (Array.isArray(parsed.sourceUrls) &&
        parsed.sourceUrls.some((u) => /wikidata\.org|wikipedia\.org/i.test(String(u))));
    const matchesInvalidEntity = LEGACY_INVALID_ENTITIES_RE.test(row.business_name || '');
    const phoneDigits = String(row.phone_number || '').replace(/[^0-9]/g, '');
    const isTollFreeLegacy = /^(1?(800|888|877|866|855|844|833)\d{7}|(?:91|0)?1(?:800|860)\d+|(?:44|0)?8(?:00|08|44|45|70|71|72)\d+)$/.test(
      phoneDigits
    );
    const hasPrivacySite = /\/privacy|global-data-privacy|\/for-candidates\//i.test(String(parsed.websiteUrl || ''));
    const hasBadLocation =
      (parsed.address && (parsed.address.includes('London, India') || parsed.address.includes('Singapore, United States') || parsed.address.includes('Dubai, India'))) ||
      (parsed.businessName && (/Branch \d+/i.test(parsed.businessName) || /Pod-\d+/i.test(parsed.businessName) || /Unit \d+/i.test(parsed.businessName) || parsed.businessName.includes('Nexus Cloud Systems')));

    if (
      (lacksIntent && (isWikiOrUnknown || matchesInvalidEntity || isTollFreeLegacy)) ||
      matchesInvalidEntity ||
      isTollFreeLegacy ||
      hasPrivacySite ||
      hasBadLocation
    ) {
      db.prepare('DELETE FROM leads WHERE id = ?').run(row.id);
      db.prepare(`DELETE FROM email_campaigns WHERE lead_id = ? AND status != 'Sent'`).run(row.id);
      removedLeads += 1;
    }
  }

  // Also delete orphaned un-sent campaigns whose lead no longer exists
  const orphanRes = db
    .prepare(
      `DELETE FROM email_campaigns
       WHERE status != 'Sent'
         AND lead_id NOT IN (SELECT id FROM leads)`
    )
    .run();

  return {
    removedLeads,
    removedCampaigns: Number(orphanRes.changes || 0),
  };
}
