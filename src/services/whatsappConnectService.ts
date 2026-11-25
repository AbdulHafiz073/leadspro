import type { Lead } from '../types';

export interface WhatsAppConnectionStatus {
  connected: boolean;
  mode: 'qr' | 'meta' | null;
  status: 'disconnected' | 'connecting' | 'qr_ready' | 'connected' | 'error';
  phoneNumber: string | null;
  displayName: string | null;
  qrDataUrl: string | null;
  pairingCode: string | null;
  lastError: string | null;
  updatedAt: string;
}

export interface BulkWhatsAppLogEntry {
  leadId: number;
  businessName: string;
  phone: string;
  status: 'sent' | 'failed' | 'skipped';
  message: string;
  at: string;
}

export interface BulkWhatsAppStatus {
  jobId: string | null;
  status: 'idle' | 'running' | 'completed' | 'stopped' | 'error';
  total: number;
  processed: number;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  currentBusiness: string;
  currentPhone: string;
  lastError: string | null;
  startedAt: string | null;
  completedAt: string | null;
  logs: BulkWhatsAppLogEntry[];
}

const CLIENT_COUNTRY_DIAL_CODES: Record<string, string> = {
  'india': '91', 'in': '91',
  'united states': '1', 'usa': '1', 'us': '1', 'canada': '1', 'ca': '1',
  'united kingdom': '44', 'uk': '44', 'gb': '44',
  'germany': '49', 'de': '49',
  'france': '33', 'fr': '33',
  'australia': '61', 'au': '61',
  'singapore': '65', 'sg': '65',
  'united arab emirates': '971', 'uae': '971', 'ae': '971',
  'saudi arabia': '966', 'sa': '966',
  'netherlands': '31', 'nl': '31',
};

export function isTollFreePhoneDigits(digits: string): boolean {
  if (!digits) return true;
  if (/^1?(800|888|877|866|855|844|833)\d{7}$/.test(digits)) return true;
  if (/^(?:91|0)?1(?:800|860)\d{4,10}$/.test(digits)) return true;
  if (/^(?:44|0)?8(?:00|08|44|45|70|71|72)\d{5,9}$/.test(digits)) return true;
  return false;
}

function stripClientIntlTrunkZero(digits: string): string {
  return digits.replace(/^(44|33|49|61|91|971|966|31)0(\d{6,12})$/, '$1$2');
}

export function normalizeClientPhoneDigits(rawPhone?: string | null, countryNameOrCode?: string | null): string {
  const rawStr = String(rawPhone || '').trim();
  let clean = stripClientIntlTrunkZero(rawStr.replace(/[^0-9]/g, ''));
  if (!clean || clean.length < 7 || clean.length > 15) return '';
  if (isTollFreePhoneDigits(clean)) return '';

  const hadExplicitPlus = rawStr.startsWith('+');
  const countryKey = String(countryNameOrCode || '').trim().toLowerCase();
  const targetDial = CLIENT_COUNTRY_DIAL_CODES[countryKey] || '';

  if (hadExplicitPlus) {
    clean = stripClientIntlTrunkZero(clean);
    return isTollFreePhoneDigits(clean) ? '' : clean;
  }

  if (clean.startsWith('00')) {
    clean = stripClientIntlTrunkZero(clean.slice(2));
    return isTollFreePhoneDigits(clean) ? '' : clean;
  }

  if (clean.length === 10) {
    if (targetDial === '1' && /^[2-9]/.test(clean)) {
      return '1' + clean;
    }
    if (targetDial === '91' && /^[6-9]/.test(clean)) {
      return '91' + clean;
    }
    if (targetDial && targetDial !== '91' && targetDial !== '1') {
      return targetDial + clean;
    }
    if (!targetDial && /^[6-9]/.test(clean)) {
      return '91' + clean;
    }
    if (/^[2-9]/.test(clean)) {
      return '1' + clean;
    }
  } else if (clean.startsWith('0') && clean.length >= 10 && clean.length <= 12) {
    const rest = clean.slice(1);
    if (targetDial) {
      return isTollFreePhoneDigits(targetDial + rest) ? '' : targetDial + rest;
    }
    if (/^[6-9]\d{9}$/.test(rest)) {
      return '91' + rest;
    }
  }

  clean = stripClientIntlTrunkZero(clean);
  return isTollFreePhoneDigits(clean) ? '' : clean;
}

export function extractLeadPhoneDigits(
  lead: Pick<Lead, 'whatsAppNumber' | 'ownerPhone' | 'locationPhone' | 'phoneNumber' | 'countryName' | 'countryCode'>
): string {
  return normalizeClientPhoneDigits(
    lead.whatsAppNumber || lead.ownerPhone || lead.locationPhone || lead.phoneNumber || '',
    lead.countryName || lead.countryCode
  );
}

export function hasAvailableWhatsAppNumber(
  lead: Pick<Lead, 'whatsAppNumber' | 'ownerPhone' | 'locationPhone' | 'phoneNumber' | 'countryName' | 'countryCode'>
): boolean {
  return extractLeadPhoneDigits(lead).length >= 7;
}

let cachedStatus: WhatsAppConnectionStatus = {
  connected: false,
  mode: null,
  status: 'disconnected',
  phoneNumber: null,
  displayName: null,
  qrDataUrl: null,
  pairingCode: null,
  lastError: null,
  updatedAt: new Date().toISOString(),
};

type StatusListener = (status: WhatsAppConnectionStatus) => void;
const listeners = new Set<StatusListener>();
let pollTimer: ReturnType<typeof setInterval> | null = null;
let inFlightFetch: Promise<WhatsAppConnectionStatus> | null = null;

function notifyListeners(next: WhatsAppConnectionStatus) {
  cachedStatus = next;
  listeners.forEach((cb) => {
    try {
      cb(next);
    } catch {
      // ignore subscriber errors
    }
  });
}

export function getCachedWhatsAppStatus(): WhatsAppConnectionStatus {
  return cachedStatus;
}

export async function refreshWhatsAppStatus(): Promise<WhatsAppConnectionStatus> {
  if (inFlightFetch) return inFlightFetch;
  inFlightFetch = (async () => {
    try {
      const res = await fetch('/api/whatsapp/status');
      const data = await res.json().catch(() => null);
      if (data && typeof data.status === 'string') {
        const next: WhatsAppConnectionStatus = {
          connected: Boolean(data.connected),
          mode: data.mode || null,
          status: data.status,
          phoneNumber: data.phoneNumber || null,
          displayName: data.displayName || null,
          qrDataUrl: data.qrDataUrl || null,
          pairingCode: data.pairingCode || null,
          lastError: data.lastError || null,
          updatedAt: data.updatedAt || new Date().toISOString(),
        };
        notifyListeners(next);
        return next;
      }
    } catch {
      // keep existing status on transient network error
    } finally {
      inFlightFetch = null;
    }
    return cachedStatus;
  })();
  return inFlightFetch;
}

export function subscribeWhatsAppStatus(listener: StatusListener): () => void {
  listeners.add(listener);
  listener(cachedStatus);

  if (!pollTimer) {
    void refreshWhatsAppStatus();
    pollTimer = setInterval(() => {
      if (listeners.size > 0) {
        void refreshWhatsAppStatus();
      }
    }, 8000);
  }

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  };
}

export async function connectWhatsAppQr(options?: {
  pairingPhone?: string;
  forceFresh?: boolean;
}): Promise<WhatsAppConnectionStatus> {
  const res = await fetch('/api/whatsapp/connect-qr', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options || {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || 'Failed to initiate WhatsApp QR session.');
  }
  const next: WhatsAppConnectionStatus = {
    connected: Boolean(data.connected),
    mode: data.mode || null,
    status: data.status || 'disconnected',
    phoneNumber: data.phoneNumber || null,
    displayName: data.displayName || null,
    qrDataUrl: data.qrDataUrl || null,
    pairingCode: data.pairingCode || null,
    lastError: data.lastError || null,
    updatedAt: data.updatedAt || new Date().toISOString(),
  };
  notifyListeners(next);
  return next;
}

export async function connectMetaWhatsApp(params: {
  token: string;
  phoneNumberId: string;
}): Promise<WhatsAppConnectionStatus> {
  const res = await fetch('/api/whatsapp/connect-meta', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || 'Meta Cloud API connection failed.');
  }
  const next: WhatsAppConnectionStatus = {
    connected: Boolean(data.connected),
    mode: data.mode || 'meta',
    status: data.status || 'connected',
    phoneNumber: data.phoneNumber || null,
    displayName: data.displayName || null,
    qrDataUrl: null,
    pairingCode: null,
    lastError: null,
    updatedAt: data.updatedAt || new Date().toISOString(),
  };
  notifyListeners(next);
  return next;
}

export async function disconnectWhatsApp(mode?: 'qr' | 'meta' | 'all'): Promise<WhatsAppConnectionStatus> {
  const res = await fetch('/api/whatsapp/disconnect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: mode || 'all' }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || 'Failed to disconnect WhatsApp.');
  }
  const next: WhatsAppConnectionStatus = {
    connected: false,
    mode: null,
    status: 'disconnected',
    phoneNumber: null,
    displayName: null,
    qrDataUrl: null,
    pairingCode: null,
    lastError: null,
    updatedAt: data.updatedAt || new Date().toISOString(),
  };
  notifyListeners(next);
  return next;
}

export async function startBulkWhatsAppSend(params: {
  leadIds?: number[];
  origin?: string;
  includeAlreadySent?: boolean;
}): Promise<{ started: boolean; status: BulkWhatsAppStatus; error?: string }> {
  const res = await fetch('/api/whatsapp/bulk-send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      leadIds: params.leadIds,
      origin: params.origin || (typeof window !== 'undefined' ? window.location.origin : ''),
      includeAlreadySent: Boolean(params.includeAlreadySent),
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.started) {
    throw new Error(data?.error || 'Could not start bulk WhatsApp chatbot send.');
  }
  return {
    started: true,
    status: data.status,
  };
}

export async function fetchBulkWhatsAppStatus(): Promise<BulkWhatsAppStatus> {
  const res = await fetch('/api/whatsapp/bulk-status');
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || 'Failed to read bulk WhatsApp progress.');
  }
  return {
    jobId: data.jobId || null,
    status: data.status || 'idle',
    total: Number(data.total || 0),
    processed: Number(data.processed || 0),
    sentCount: Number(data.sentCount || 0),
    failedCount: Number(data.failedCount || 0),
    skippedCount: Number(data.skippedCount || 0),
    currentBusiness: data.currentBusiness || '',
    currentPhone: data.currentPhone || '',
    lastError: data.lastError || null,
    startedAt: data.startedAt || null,
    completedAt: data.completedAt || null,
    logs: Array.isArray(data.logs) ? data.logs : [],
  };
}

export async function stopBulkWhatsAppSend(): Promise<BulkWhatsAppStatus> {
  const res = await fetch('/api/whatsapp/bulk-stop', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || 'Failed to stop bulk send.');
  }
  return data;
}
