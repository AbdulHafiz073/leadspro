import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  isJidBroadcast,
  isJidGroup,
  isJidNewsletter,
  makeCacheableSignalKeyStore,
  proto,
  useMultiFileAuthState,
  type CacheStore,
  type WAMessageKey,
  type WASocket,
} from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import pino from 'pino';
import {
  findLeadByPhone,
  getAllLeadsFromDb,
  getAppSetting,
  getLeadByIdFromDb,
  getWhatsAppBotSession,
  clearWhatsAppBotSession,
  deleteAppSetting,
  recordClientChatbotResponse,
  setAppSetting,
  updateLeadInDb,
  upsertWhatsAppBotSession,
} from './db';
import {
  CATEGORY_SUBTYPES,
  PRODUCT_CATEGORIES,
  SERVICE_MODES,
  matchFinalDecision,
  matchProductCategory,
  matchServiceMode,
  matchSubType,
  type ProductCategoryId,
} from '../src/utils/chatbotFlowOptions';
import type { Lead } from '../src/types/index';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WA_AUTH_DIR = path.resolve(__dirname, '../data/whatsapp-auth');
const META_SETTING_KEY = 'meta_wa_config';

export interface MetaWhatsAppConfig {
  token: string;
  phoneNumberId: string;
  displayPhone?: string;
  verifiedName?: string;
  connectedAt: string;
}

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
  logs: Array<{
    leadId: number;
    businessName: string;
    phone: string;
    status: 'sent' | 'failed' | 'skipped';
    message: string;
    at: string;
  }>;
}

let waSocket: WASocket | null = null;
let pendingPairingPhone: string | null = null;
let pairingRequestedForAttempt = false;
let isShuttingDownSocket = false;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let connectInFlight: Promise<WhatsAppConnectionStatus> | null = null;
let libsignalGuardInstalled = false;
let lastSignalWarnAt = 0;
let shutdownHooksRegistered = false;

const RECENT_MESSAGES_MAX = 500;
const recentMessagesCache = new Map<string, proto.IMessage>();
const peerSessionResetCooldown = new Map<string, number>();

function createMemoryCacheStore(ttlMs = 60 * 60 * 1000): CacheStore {
  const store = new Map<string, { value: unknown; expiresAt: number }>();
  return {
    get<T>(key: string): T | undefined {
      const entry = store.get(key);
      if (!entry) return undefined;
      if (Date.now() > entry.expiresAt) {
        store.delete(key);
        return undefined;
      }
      return entry.value as T;
    },
    set<T>(key: string, value: T): void {
      if (store.size > 2000) {
        const now = Date.now();
        for (const [k, v] of store.entries()) {
          if (now > v.expiresAt) store.delete(k);
        }
        if (store.size > 2000) {
          const oldest = store.keys().next().value;
          if (oldest !== undefined) store.delete(oldest);
        }
      }
      store.set(key, { value, expiresAt: Date.now() + ttlMs });
    },
    del(key: string): void {
      store.delete(key);
    },
    flushAll(): void {
      store.clear();
    },
    close(): void {
      store.clear();
    },
  };
}

const msgRetryCounterCache = createMemoryCacheStore(60 * 60 * 1000);
const userDevicesCache = createMemoryCacheStore(5 * 60 * 1000);

function installLibsignalNoiseGuard(): void {
  if (libsignalGuardInstalled) return;
  libsignalGuardInstalled = true;
  const origConsoleError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    const first = typeof args[0] === 'string' ? args[0] : '';
    const joined = args
      .map((a) => (typeof a === 'string' ? a : a instanceof Error ? `${a.name}: ${a.message}` : ''))
      .join(' ');
    const isTransientSignalDecryptError =
      first.includes('Failed to decrypt message with any known session') ||
      (first.startsWith('Session error:') &&
        (joined.includes('Bad MAC') ||
          joined.includes('No matching sessions') ||
          joined.includes('No session record')));

    if (isTransientSignalDecryptError) {
      const now = Date.now();
      if (now - lastSignalWarnAt > 15000) {
        lastSignalWarnAt = now;
        console.warn('[WhatsApp Signal] Stale peer session detected (Bad MAC); auto-renegotiating session cleanly.');
      }
      return;
    }
    origConsoleError(...args);
  };
}

function registerShutdownCleanup(): void {
  if (shutdownHooksRegistered) return;
  shutdownHooksRegistered = true;
  const gracefulClose = () => {
    closeExistingSocket(false).catch(() => {});
  };
  process.once('SIGINT', gracefulClose);
  process.once('SIGTERM', gracefulClose);
}

function cacheOutboundMessage(sent: proto.IWebMessageInfo | undefined): void {
  const remoteJid = sent?.key?.remoteJid;
  const id = sent?.key?.id;
  const message = sent?.message;
  if (!remoteJid || !id || !message) return;
  const compositeKey = `${remoteJid}:${id}`;
  recentMessagesCache.set(compositeKey, message);
  if (recentMessagesCache.size > RECENT_MESSAGES_MAX) {
    const oldestKey = recentMessagesCache.keys().next().value;
    if (oldestKey !== undefined) {
      recentMessagesCache.delete(oldestKey);
    }
  }
}

function sanitizeWaAuthDir(): void {
  if (!fs.existsSync(WA_AUTH_DIR)) return;
  const credsPath = path.join(WA_AUTH_DIR, 'creds.json');
  if (fs.existsSync(credsPath)) {
    try {
      const raw = fs.readFileSync(credsPath, 'utf8').trim();
      if (!raw) throw new Error('Empty creds.json');
      JSON.parse(raw);
    } catch {
      fs.rmSync(WA_AUTH_DIR, { recursive: true, force: true });
      return;
    }
  }

  let files: string[] = [];
  try {
    files = fs.readdirSync(WA_AUTH_DIR);
  } catch {
    return;
  }

  for (const file of files) {
    if (file === 'creds.json' || !file.endsWith('.json')) continue;
    const fullPath = path.join(WA_AUTH_DIR, file);
    // Remove leftover status@broadcast sender keys so ignored broadcast traffic cannot trigger stale decrypts
    if (file.startsWith('sender-key-status@broadcast')) {
      try {
        fs.unlinkSync(fullPath);
      } catch {
        // ignore
      }
      continue;
    }
    if (
      file.startsWith('session-') ||
      file.startsWith('sender-key-') ||
      file.startsWith('app-state-sync-') ||
      file.startsWith('pre-key-') ||
      file.startsWith('identity-key-')
    ) {
      try {
        const raw = fs.readFileSync(fullPath, 'utf8').trim();
        if (!raw) throw new Error('Empty JSON');
        JSON.parse(raw);
      } catch {
        try {
          fs.unlinkSync(fullPath);
        } catch {
          // ignore
        }
      }
    }
  }
}

async function healPeerSignalSession(sock: WASocket, jid: string): Promise<void> {
  const userDigits = jid.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
  if (!userDigits) return;
  const now = Date.now();
  const prev = peerSessionResetCooldown.get(userDigits) || 0;
  if (now - prev < 30000) return;
  peerSessionResetCooldown.set(userDigits, now);

  try {
    if (fs.existsSync(WA_AUTH_DIR)) {
      const prefix = `session-${userDigits}`;
      for (const file of fs.readdirSync(WA_AUTH_DIR)) {
        if (file.startsWith(prefix) && file.endsWith('.json')) {
          try {
            fs.unlinkSync(path.join(WA_AUTH_DIR, file));
          } catch {
            // ignore
          }
        }
      }
    }
    await sock.assertSessions([jid], true).catch(() => {});
  } catch {
    // ignore peer recovery errors
  }
}

let connState: WhatsAppConnectionStatus = {
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

let bulkState: BulkWhatsAppStatus = {
  jobId: null,
  status: 'idle',
  total: 0,
  processed: 0,
  sentCount: 0,
  failedCount: 0,
  skippedCount: 0,
  currentBusiness: '',
  currentPhone: '',
  lastError: null,
  startedAt: null,
  completedAt: null,
  logs: [],
};
let stopBulkRequested = false;

const WA_COUNTRY_DIAL_CODES: Record<string, string> = {
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

function isTollFreePhone(digits: string): boolean {
  if (!digits) return true;
  if (/^1?(800|888|877|866|855|844|833)\d{7}$/.test(digits)) return true;
  if (/^(?:91|0)?1(?:800|860)\d{4,10}$/.test(digits)) return true;
  if (/^(?:44|0)?8(?:00|08|44|45|70|71|72)\d{5,9}$/.test(digits)) return true;
  return false;
}

function stripIntlTrunkZero(digits: string): string {
  // Handle +44(0)1618327271 -> 441618327271, +33(0)1..., +49(0)30..., +61(0)2..., +91(0)98..., +971(0)50..., etc.
  return digits.replace(/^(44|33|49|61|91|971|966|31)0(\d{6,12})$/, '$1$2');
}

export function normalizeWhatsAppDigits(rawPhone?: string | null, countryNameOrCode?: string | null): string {
  const rawStr = String(rawPhone || '').trim();
  let clean = stripIntlTrunkZero(rawStr.replace(/[^0-9]/g, ''));
  if (!clean || clean.length < 7 || clean.length > 15) return '';
  if (isTollFreePhone(clean)) return '';

  const hadExplicitPlus = rawStr.startsWith('+');
  const countryKey = String(countryNameOrCode || '').trim().toLowerCase();
  const targetDial = WA_COUNTRY_DIAL_CODES[countryKey] || '';

  if (hadExplicitPlus) {
    clean = stripIntlTrunkZero(clean);
    return isTollFreePhone(clean) ? '' : clean;
  }

  if (clean.startsWith('00')) {
    clean = stripIntlTrunkZero(clean.slice(2));
    return isTollFreePhone(clean) ? '' : clean;
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
      return isTollFreePhone(targetDial + rest) ? '' : targetDial + rest;
    }
    if (/^[6-9]\d{9}$/.test(rest)) {
      return '91' + rest;
    }
  }

  clean = stripIntlTrunkZero(clean);
  return isTollFreePhone(clean) ? '' : clean;
}

function formatReadablePhone(digits?: string | null): string | null {
  const clean = String(digits || '').replace(/[^0-9]/g, '');
  if (!clean) return null;
  return '+' + clean;
}

export function getMetaConfigFromStore(): MetaWhatsAppConfig | null {
  const dbCfg = getAppSetting<MetaWhatsAppConfig>(META_SETTING_KEY);
  if (dbCfg?.token && dbCfg?.phoneNumberId) return dbCfg;
  const envToken = process.env.META_WA_TOKEN || process.env.WHATSAPP_ACCESS_TOKEN;
  const envPhoneId = process.env.META_WA_PHONE_ID || process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (envToken && envPhoneId) {
    return {
      token: envToken,
      phoneNumberId: envPhoneId,
      displayPhone: '+91 97597 25212',
      verifiedName: 'MaxedLogic WhatsApp Business',
      connectedAt: new Date().toISOString(),
    };
  }
  return null;
}

export function getWhatsAppConnectionStatus(): WhatsAppConnectionStatus {
  if (waSocket && connState.mode === 'qr' && connState.status === 'connected') {
    return { ...connState };
  }
  const meta = getMetaConfigFromStore();
  if (meta && connState.status !== 'qr_ready' && connState.status !== 'connecting') {
    return {
      connected: true,
      mode: 'meta',
      status: 'connected',
      phoneNumber: meta.displayPhone || '+91 97597 25212',
      displayName: meta.verifiedName || 'MaxedLogic Business Cloud API',
      qrDataUrl: null,
      pairingCode: null,
      lastError: null,
      updatedAt: meta.connectedAt || new Date().toISOString(),
    };
  }
  return { ...connState };
}

function buildStep1TextForLead(
  lead: { id?: number; businessName?: string; hasWebsite?: boolean; websiteUrl?: string | null; evidenceSummary?: string | null; city?: string | null },
  origin?: string
): string {
  const biz = lead.businessName || 'Sir/Madam';
  const cleanOrigin = (origin || '').replace(/\/$/, '');
  const chatUrl =
    cleanOrigin && lead.id
      ? `${cleanOrigin}/?clientChat=1&leadId=${lead.id}&biz=${encodeURIComponent(biz)}`
      : cleanOrigin
      ? `${cleanOrigin}/?clientChat=1&biz=${encodeURIComponent(biz)}`
      : '';

  const auditNote =
    lead.hasWebsite && lead.websiteUrl
      ? `हमने *${biz}* की वेबसाइट (${lead.websiteUrl}) देखी — कुछ छोटे सुधार करके आपकी ग्राहक इंक्वायरी **2x तेजी** से बढ़ सकती है!`
      : `हमने *${biz}* का ऑनलाइन प्रोफाइल देखा — एक मॉडर्न वेबसाइट/ऐप और 1-क्लिक व्हाट्सएप बुकिंग से आपके रोज़ाना नए ग्राहक सीधे आपसे जुड़ सकते हैं!`;

  return (
    `नमस्ते *${biz}*! 😊\n` +
    `मैं *Abdul Hafiz* — Founder, *MaxedLogic* (+91 97597 25212)।\n\n` +
    `🔍 ${auditNote}\n\n` +
    `🎁 *हमारा 100% फ्री ऑफर (₹0 Advance):*\n` +
    `पैसे देने से पहले हम आपके लिए **24 घंटे में FREE Live Demo / Prototype** बनाकर दिखाएंगे। पसंद आए तभी आगे बढ़ें!\n\n` +
    `*शुरू करने के लिए नीचे से 1 विकल्प चुनें:*\n` +
    `👉 Reply *1* — *Update Existing* (Website / App / Software अपडेट)\n` +
    `👉 Reply *2* — *New Create* (नई Website / App / Game / Software)` +
    (chatUrl ? `\n\n💬 *1-Click Interactive Chatbot यहाँ खोलें:*\n${chatUrl}` : '') +
    `\n\n📞 Call / WhatsApp: *+91 97597 25212* | 🌐 maxedlogic.com`
  );
}

async function sendTextViaBaileys(jidOrPhone: string, text: string): Promise<void> {
  if (!waSocket || connState.status !== 'connected') {
    throw new Error('WhatsApp QR session is not connected.');
  }
  const jid = jidOrPhone.includes('@') ? jidOrPhone : `${normalizeWhatsAppDigits(jidOrPhone)}@s.whatsapp.net`;
  const sent = await waSocket.sendMessage(jid, { text });
  cacheOutboundMessage(sent);
}

async function handleIncomingBaileysMessage(remoteJid: string, pushName: string, rawText: string): Promise<void> {
  const fromPhone = remoteJid.split('@')[0].replace(/[^0-9]/g, '');
  if (!fromPhone) return;

  const trimmed = String(rawText || '').trim();
  if (!trimmed) return;

  const existingSession = getWhatsAppBotSession(fromPhone);
  const isGreetingOrReset = /^(hi|hello|hey|start|menu|restart|reset|namaste)$/i.test(trimmed);

  // Allow numeric selection shortcuts at every step in WhatsApp chat!
  let matchedMode = matchServiceMode(trimmed);
  let matchedCat = matchProductCategory(trimmed);
  let matchedSub = existingSession?.categoryId
    ? matchSubType(existingSession.categoryId as ProductCategoryId, trimmed)
    : null;
  let matchedFinal = matchFinalDecision(trimmed);

  if (existingSession?.step === 'category' && /^[1-4]$/.test(trimmed)) {
    matchedCat = PRODUCT_CATEGORIES[Number(trimmed) - 1] || null;
  }
  if (existingSession?.step === 'subtype' && existingSession.categoryId && /^[1-9]$/.test(trimmed)) {
    const subs = CATEGORY_SUBTYPES[existingSession.categoryId as ProductCategoryId] || [];
    matchedSub = subs[Number(trimmed) - 1] || null;
  }
  if (existingSession?.step === 'confirm') {
    if (trimmed === '1') matchedFinal = 'YES';
    if (trimmed === '2') matchedFinal = 'NO';
  }

  // Only respond automatically if user is replying to our outreach/menu or explicitly greeting/in session
  if (!existingSession && !isGreetingOrReset && !matchedMode) {
    return;
  }

  if (isGreetingOrReset) {
    upsertWhatsAppBotSession({
      phone: fromPhone,
      leadId: existingSession?.leadId ?? findLeadByPhone(fromPhone)?.id ?? null,
      businessName: pushName || existingSession?.businessName || null,
      step: 'mode',
      serviceMode: null,
      categoryId: null,
      categoryLabel: null,
      subType: null,
      finalDecision: null,
      updatedAt: new Date().toISOString(),
    });
    await sendTextViaBaileys(
      remoteJid,
      `Namaste${pushName ? ` *${pushName}*` : ''}! 😊\n` +
        `Please Select one of the *Options* below to start:\n\n` +
        `👉 Reply *1* — *Update Existing*\n` +
        `👉 Reply *2* — *New Create*`
    ).catch(() => {});
    return;
  }

  // Step 1 -> Step 2 (Category)
  if (matchedMode && (!existingSession || existingSession.step === 'mode' || existingSession.step === 'completed')) {
    upsertWhatsAppBotSession({
      phone: fromPhone,
      leadId: existingSession?.leadId ?? findLeadByPhone(fromPhone)?.id ?? null,
      businessName: pushName || existingSession?.businessName || null,
      step: 'category',
      serviceMode: matchedMode.label,
      categoryId: null,
      categoryLabel: null,
      subType: null,
      finalDecision: null,
      updatedAt: new Date().toISOString(),
    });

    await sendTextViaBaileys(
      remoteJid,
      `Great! You selected *${matchedMode.label}*.\n` +
        `Ab choose karein aapko kya chahiye (1 se 4 me reply karein):\n\n` +
        PRODUCT_CATEGORIES.map((c, i) => `👉 Reply *${i + 1}* — *${c.label}* (${c.description})`).join('\n')
    ).catch(() => {});
    return;
  }

  // Step 2 -> Step 3 (Sub-Types)
  if (matchedCat && (!existingSession || existingSession.step === 'category')) {
    const serviceMode = existingSession?.serviceMode || 'New Create';
    upsertWhatsAppBotSession({
      phone: fromPhone,
      leadId: existingSession?.leadId ?? findLeadByPhone(fromPhone)?.id ?? null,
      businessName: pushName || existingSession?.businessName || null,
      step: 'subtype',
      serviceMode,
      categoryId: matchedCat.id,
      categoryLabel: matchedCat.label,
      subType: null,
      finalDecision: null,
      updatedAt: new Date().toISOString(),
    });

    const subtypes = CATEGORY_SUBTYPES[matchedCat.id] || [];
    await sendTextViaBaileys(
      remoteJid,
      `*${serviceMode} → ${matchedCat.label}*\n` +
        `Kripya apna exact *${matchedCat.label}* type choose karein (number reply karein):\n\n` +
        subtypes.map((s, i) => `👉 Reply *${i + 1}* — *${s.label}*`).join('\n')
    ).catch(() => {});
    return;
  }

  // Step 3 -> Step 4 (Final YES / NO)
  if (matchedSub && existingSession && existingSession.step === 'subtype') {
    const serviceMode = existingSession.serviceMode || 'New Create';
    const categoryLabel = existingSession.categoryLabel || 'Website';
    upsertWhatsAppBotSession({
      phone: fromPhone,
      leadId: existingSession.leadId ?? findLeadByPhone(fromPhone)?.id ?? null,
      businessName: pushName || existingSession.businessName || null,
      step: 'confirm',
      serviceMode,
      categoryId: existingSession.categoryId || null,
      categoryLabel,
      subType: matchedSub.label,
      finalDecision: null,
      updatedAt: new Date().toISOString(),
    });

    await sendTextViaBaileys(
      remoteJid,
      `Aapne yeh details choose ki hain:\n` +
        `• Requirement: *${serviceMode}*\n` +
        `• Category: *${categoryLabel}*\n` +
        `• Type: *${matchedSub.label}*\n\n` +
        `Kya aap final confirm karte hain?\n` +
        `👉 Reply *YES* — Confirm & Send to Admin Team\n` +
        `👉 Reply *NO* — Not Interested Now`
    ).catch(() => {});
    return;
  }

  // Step 4 -> Save all choices to Admin Panel
  if (matchedFinal && existingSession && existingSession.step === 'confirm') {
    const serviceMode = existingSession.serviceMode || 'New Create';
    const categoryLabel = existingSession.categoryLabel || 'Website';
    const subTypeLabel = existingSession.subType || trimmed;

    recordClientChatbotResponse({
      leadId: existingSession.leadId ?? null,
      businessName: pushName || existingSession.businessName || undefined,
      senderPhone: fromPhone,
      selection: `${serviceMode} → ${categoryLabel} → ${subTypeLabel} → ${matchedFinal}`,
      messageText: `WhatsApp Bot Reply: ${matchedFinal} (${serviceMode} / ${categoryLabel} / ${subTypeLabel})`,
      serviceMode,
      selectedCategory: categoryLabel,
      selectedSubType: subTypeLabel,
      finalDecision: matchedFinal,
      channel: 'WhatsApp Bot (9759725212)',
    });

    clearWhatsAppBotSession(fromPhone);

    const finalMsg =
      matchedFinal === 'YES'
        ? `Dhanyawad${pushName ? ` *${pushName}*` : ''}! ✅ Aapki saari details (*${serviceMode} → ${categoryLabel} → ${subTypeLabel}*) humare Admin Panel me save ho gayi hain. Abdul Hafiz (+91 97597 25212) jald hi aapse sampark karenge!`
        : `Dhanyawad! Aapka *NO* response note kar liya gaya hai. Dobara start karne ke liye kabhi bhi "Hi" likhein.`;
    await sendTextViaBaileys(remoteJid, finalMsg).catch(() => {});
  }
}

async function closeExistingSocket(clearFiles = false): Promise<void> {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  isShuttingDownSocket = true;
  if (waSocket) {
    try {
      if (clearFiles) {
        await waSocket.logout().catch(() => {});
      }
      waSocket.ev.removeAllListeners('creds.update');
      waSocket.ev.removeAllListeners('connection.update');
      waSocket.ev.removeAllListeners('messages.upsert');
      waSocket.end(undefined);
    } catch {
      // ignore
    }
    waSocket = null;
  }
  if (clearFiles && fs.existsSync(WA_AUTH_DIR)) {
    fs.rmSync(WA_AUTH_DIR, { recursive: true, force: true });
  }
  isShuttingDownSocket = false;
}

export async function connectWhatsAppQr(options?: {
  pairingPhone?: string;
  forceFresh?: boolean;
}): Promise<WhatsAppConnectionStatus> {
  if (connectInFlight) {
    if (!options?.forceFresh) {
      return connectInFlight;
    }
    await connectInFlight.catch(() => {});
  }

  const runConnect = async (): Promise<WhatsAppConnectionStatus> => {
    installLibsignalNoiseGuard();
    registerShutdownCleanup();

    if (options?.forceFresh) {
      await closeExistingSocket(true);
    } else if (waSocket && (connState.status === 'connected' || connState.status === 'qr_ready')) {
      return getWhatsAppConnectionStatus();
    } else {
      await closeExistingSocket(false);
    }

    pendingPairingPhone = options?.pairingPhone ? normalizeWhatsAppDigits(options.pairingPhone) : null;
    pairingRequestedForAttempt = false;

    sanitizeWaAuthDir();
    if (!fs.existsSync(WA_AUTH_DIR)) {
      fs.mkdirSync(WA_AUTH_DIR, { recursive: true });
    }

    connState = {
      connected: false,
      mode: 'qr',
      status: 'connecting',
      phoneNumber: null,
      displayName: null,
      qrDataUrl: null,
      pairingCode: null,
      lastError: null,
      updatedAt: new Date().toISOString(),
    };

    try {
      const waLogger = pino({ level: 'silent' }) as any;
      const { state, saveCreds } = await useMultiFileAuthState(WA_AUTH_DIR);
      let waVersion: [number, number, number] | undefined;
      try {
        const latest = await fetchLatestBaileysVersion();
        waVersion = latest.version;
      } catch {
        waVersion = undefined;
      }

      const sock = makeWASocket({
        ...(waVersion ? { version: waVersion } : {}),
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, waLogger),
        },
        logger: waLogger,
        browser: Browsers.macOS('LeadHunter Pro'),
        printQRInTerminal: false,
        markOnlineOnConnect: false,
        syncFullHistory: false,
        shouldSyncHistoryMessage: () => false,
        enableAutoSessionRecreation: true,
        enableRecentMessageCache: true,
        retryRequestDelayMs: 350,
        maxMsgRetryCount: 3,
        msgRetryCounterCache,
        userDevicesCache,
        shouldIgnoreJid: (jid: string) =>
          !jid || Boolean(isJidBroadcast(jid) || isJidNewsletter(jid) || isJidGroup(jid)),
        getMessage: async (key: WAMessageKey) => {
          if (key?.remoteJid && key?.id) {
            return recentMessagesCache.get(`${key.remoteJid}:${key.id}`);
          }
          return undefined;
        },
      });

      waSocket = sock;

      sock.ev.on('creds.update', saveCreds);

      sock.ev.on('connection.update', async (update) => {
        if (waSocket !== sock) return;
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          try {
            const qrDataUrl = await QRCode.toDataURL(qr, {
              width: 260,
              margin: 2,
              color: { dark: '#0b141a', light: '#ffffff' },
            });
            let pairingCode: string | null = connState.pairingCode;
            if (pendingPairingPhone && !pairingRequestedForAttempt && !sock.authState.creds.registered) {
              pairingRequestedForAttempt = true;
              try {
                pairingCode = await sock.requestPairingCode(pendingPairingPhone);
              } catch {
                pairingCode = null;
              }
            }
            connState = {
              connected: false,
              mode: 'qr',
              status: 'qr_ready',
              phoneNumber: null,
              displayName: null,
              qrDataUrl,
              pairingCode,
              lastError: null,
              updatedAt: new Date().toISOString(),
            };
          } catch (err: any) {
            connState = {
              ...connState,
              status: 'error',
              lastError: err?.message || 'Failed to render QR code.',
              updatedAt: new Date().toISOString(),
            };
          }
        }

        if (connection === 'open') {
          const rawId = sock.user?.id || '';
          const digits = rawId.split(':')[0].split('@')[0].replace(/[^0-9]/g, '');
          connState = {
            connected: true,
            mode: 'qr',
            status: 'connected',
            phoneNumber: formatReadablePhone(digits) || '+91 97597 25212',
            displayName: sock.user?.name || 'WhatsApp Linked Device',
            qrDataUrl: null,
            pairingCode: null,
            lastError: null,
            updatedAt: new Date().toISOString(),
          };
        }

        if (connection === 'close') {
          const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
          const shouldLoggedOut = statusCode === DisconnectReason.loggedOut || statusCode === 401;

          if (isShuttingDownSocket) return;

          if (shouldLoggedOut) {
            if (fs.existsSync(WA_AUTH_DIR)) {
              fs.rmSync(WA_AUTH_DIR, { recursive: true, force: true });
            }
            waSocket = null;
            connState = {
              connected: false,
              mode: null,
              status: 'disconnected',
              phoneNumber: null,
              displayName: null,
              qrDataUrl: null,
              pairingCode: null,
              lastError: 'WhatsApp session was logged out from phone.',
              updatedAt: new Date().toISOString(),
            };
          } else if (statusCode === DisconnectReason.restartRequired || statusCode === 515) {
            if (reconnectTimer) clearTimeout(reconnectTimer);
            reconnectTimer = setTimeout(() => {
              reconnectTimer = null;
              connectWhatsAppQr().catch(() => {});
            }, 1200);
          } else {
            // Transient error or QR timeout
            const errText = (lastDisconnect?.error as any)?.message || `Connection closed (${statusCode || 'network'})`;
            if (sock.authState.creds.registered) {
              if (reconnectTimer) clearTimeout(reconnectTimer);
              reconnectTimer = setTimeout(() => {
                reconnectTimer = null;
                connectWhatsAppQr().catch(() => {});
              }, 3000);
            } else {
              waSocket = null;
              connState = {
                connected: false,
                mode: null,
                status: 'error',
                phoneNumber: null,
                displayName: null,
                qrDataUrl: null,
                pairingCode: null,
                lastError: errText,
                updatedAt: new Date().toISOString(),
              };
            }
          }
        }
      });

      sock.ev.on('messages.upsert', async (m) => {
        if (m.type !== 'notify') return;
        for (const msg of m.messages) {
          if (msg.key.fromMe) continue;
          const jid = msg.key.remoteJid || '';
          if (!jid || isJidGroup(jid) || isJidBroadcast(jid) || isJidNewsletter(jid)) continue;

          if (msg.messageStubType === proto.WebMessageInfo.StubType.CIPHERTEXT) {
            const stubErr = (msg.messageStubParameters || []).join(' ');
            if (
              stubErr.includes('Bad MAC') ||
              stubErr.includes('No matching sessions') ||
              stubErr.includes('No session record')
            ) {
              await healPeerSignalSession(sock, jid);
            }
            continue;
          }

          const text =
            msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text ||
            msg.message?.buttonsResponseMessage?.selectedDisplayText ||
            msg.message?.listResponseMessage?.title ||
            '';
          if (text) {
            await handleIncomingBaileysMessage(jid, msg.pushName || '', text);
          }
        }
      });

      // Wait briefly (up to 4s) so the initial QR code / connected state is immediately returned to caller
      for (let i = 0; i < 16; i++) {
        if (connState.status === 'qr_ready' || connState.status === 'connected' || connState.status === 'error') {
          break;
        }
        await new Promise((r) => setTimeout(r, 250));
      }

      return getWhatsAppConnectionStatus();
    } catch (err: any) {
      connState = {
        connected: false,
        mode: null,
        status: 'error',
        phoneNumber: null,
        displayName: null,
        qrDataUrl: null,
        pairingCode: null,
        lastError: err?.message || 'Could not start WhatsApp QR session.',
        updatedAt: new Date().toISOString(),
      };
      return getWhatsAppConnectionStatus();
    }
  };

  connectInFlight = runConnect().finally(() => {
    connectInFlight = null;
  });
  return connectInFlight;
}

export async function connectMetaWhatsApp(params: {
  token: string;
  phoneNumberId: string;
}): Promise<WhatsAppConnectionStatus> {
  const token = String(params.token || '').trim();
  const phoneNumberId = String(params.phoneNumberId || '').trim();
  if (!token || !phoneNumberId) {
    throw new Error('Meta Access Token and Phone Number ID are both required.');
  }

  const verifyUrl = `https://graph.facebook.com/v21.0/${encodeURIComponent(phoneNumberId)}?fields=display_phone_number,verified_name`;
  const resp = await fetch(verifyUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = (await resp.json().catch(() => ({}))) as any;
  if (!resp.ok) {
    throw new Error(data?.error?.message || `Meta Graph API verification failed (HTTP ${resp.status})`);
  }

  const cfg: MetaWhatsAppConfig = {
    token,
    phoneNumberId,
    displayPhone: data.display_phone_number || '+91 97597 25212',
    verifiedName: data.verified_name || 'MaxedLogic WhatsApp Business',
    connectedAt: new Date().toISOString(),
  };
  setAppSetting(META_SETTING_KEY, cfg);

  await closeExistingSocket(false);
  connState = {
    connected: true,
    mode: 'meta',
    status: 'connected',
    phoneNumber: cfg.displayPhone || null,
    displayName: cfg.verifiedName || null,
    qrDataUrl: null,
    pairingCode: null,
    lastError: null,
    updatedAt: cfg.connectedAt,
  };
  return getWhatsAppConnectionStatus();
}

export async function disconnectWhatsApp(targetMode?: 'qr' | 'meta' | 'all'): Promise<WhatsAppConnectionStatus> {
  if (!targetMode || targetMode === 'all' || targetMode === 'qr') {
    await closeExistingSocket(true);
  }
  if (!targetMode || targetMode === 'all' || targetMode === 'meta') {
    deleteAppSetting(META_SETTING_KEY);
  }
  connState = {
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
  return getWhatsAppConnectionStatus();
}

export function initWhatsAppOnBoot(): void {
  try {
    const credsPath = path.join(WA_AUTH_DIR, 'creds.json');
    if (fs.existsSync(credsPath)) {
      connectWhatsAppQr().catch(() => {});
      return;
    }
    const meta = getMetaConfigFromStore();
    if (meta) {
      connState = {
        connected: true,
        mode: 'meta',
        status: 'connected',
        phoneNumber: meta.displayPhone || '+91 97597 25212',
        displayName: meta.verifiedName || 'MaxedLogic WhatsApp Business',
        qrDataUrl: null,
        pairingCode: null,
        lastError: null,
        updatedAt: meta.connectedAt || new Date().toISOString(),
      };
    }
  } catch {
    // ignore boot errors
  }
}

export async function sendChatbotToLeadViaActiveConnection(
  lead: Lead,
  origin?: string
): Promise<{ success: boolean; phone: string; channel?: string; error?: string }> {
  const rawPhone = lead.whatsAppNumber || lead.ownerPhone || lead.locationPhone || lead.phoneNumber || '';
  const cleanPhone = normalizeWhatsAppDigits(rawPhone, lead.countryName || lead.countryCode);
  if (!cleanPhone) {
    return { success: false, phone: rawPhone, error: 'No valid non-toll-free WhatsApp phone number on lead' };
  }

  const active = getWhatsAppConnectionStatus();
  if (!active.connected) {
    return { success: false, phone: cleanPhone, error: 'WhatsApp is not connected. Click Connect WhatsApp first.' };
  }

  const textBody = buildStep1TextForLead(lead, origin);

  if (active.mode === 'qr' && waSocket) {
    try {
      const checkRes = await waSocket.onWhatsApp(`${cleanPhone}@s.whatsapp.net`);
      const targetJid = checkRes?.[0]?.jid || `${cleanPhone}@s.whatsapp.net`;
      if (checkRes && checkRes.length > 0 && !checkRes[0].exists) {
        updateLeadInDb(lead.id, {
          outreachStatus: 'PhoneError',
          errorType: 'NoWhatsApp',
          errorMessage: `+${cleanPhone} is not registered on WhatsApp`,
        });
        return { success: false, phone: `+${cleanPhone}`, error: 'Number not on WhatsApp' };
      }

      const sent = await waSocket.sendMessage(targetJid, { text: textBody });
      cacheOutboundMessage(sent);
      const actualPhone = targetJid.split('@')[0].replace(/[^0-9]/g, '') || cleanPhone;
      upsertWhatsAppBotSession({
        phone: actualPhone,
        leadId: lead.id,
        businessName: lead.businessName,
        step: 'mode',
        serviceMode: null,
        categoryId: null,
        categoryLabel: null,
        subType: null,
        finalDecision: null,
        updatedAt: new Date().toISOString(),
      });

      const nextStatus =
        lead.outreachStatus === 'EmailSent' || lead.outreachStatus === 'BothSent' ? 'BothSent' : 'WhatsAppSent';
      updateLeadInDb(lead.id, {
        outreachStatus: nextStatus,
        pitchChannel: nextStatus === 'BothSent' ? 'Both' : 'WhatsApp',
        lastPitchedAt: new Date().toISOString(),
        pitchMessage: textBody,
        pitchApp: nextStatus === 'BothSent' ? 'Both' : 'WhatsApp',
        pitchRecipient: `+${cleanPhone}`,
        errorMessage: null,
      });

      return { success: true, phone: `+${cleanPhone}`, channel: 'WhatsApp QR Linked' };
    } catch (err: any) {
      return { success: false, phone: `+${cleanPhone}`, error: err?.message || 'WhatsApp Web send failed' };
    }
  }

  // Meta Cloud API Mode
  const meta = getMetaConfigFromStore();
  if (!meta) {
    return { success: false, phone: `+${cleanPhone}`, error: 'Meta Cloud API credentials missing.' };
  }

  const cleanOrigin = (origin || '').replace(/\/$/, '');
  const chatUrl = cleanOrigin
    ? `${cleanOrigin}/?clientChat=1&leadId=${lead.id}&biz=${encodeURIComponent(lead.businessName)}`
    : '';

  const interactivePayload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: cleanPhone,
    type: 'interactive',
    interactive: {
      type: 'button',
      header: { type: 'text', text: 'MaxedLogic • +91 97597 25212' },
      body: {
        text:
          `Namaste *${lead.businessName}*! 😊 Main *Abdul Hafiz* (MaxedLogic • +91 97597 25212).\n` +
          `Hum *24h me 100% FREE Live Demo* bana kar bhej rahe hain (₹0 advance risk).\n\n` +
          `Please select an *Option* below to start:` +
          (chatUrl ? `\n\n💬 Interactive Chat: ${chatUrl}` : ''),
      },
      footer: { text: 'Step 1 of 4 • Update or New Create' },
      action: {
        buttons: SERVICE_MODES.map((m) => ({
          type: 'reply',
          reply: { id: m.id, title: m.shortTitle },
        })),
      },
    },
  };

  try {
    const resp = await fetch(`https://graph.facebook.com/v21.0/${meta.phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${meta.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(interactivePayload),
    });
    const data = (await resp.json().catch(() => ({}))) as any;
    if (!resp.ok) {
      const msg = data?.error?.message || `Meta API HTTP ${resp.status}`;
      updateLeadInDb(lead.id, {
        outreachStatus: 'PhoneError',
        errorType: 'ApiFailed',
        errorMessage: msg,
      });
      return { success: false, phone: `+${cleanPhone}`, error: msg };
    }

    upsertWhatsAppBotSession({
      phone: cleanPhone,
      leadId: lead.id,
      businessName: lead.businessName,
      step: 'mode',
      serviceMode: null,
      categoryId: null,
      categoryLabel: null,
      subType: null,
      finalDecision: null,
      updatedAt: new Date().toISOString(),
    });

    const nextStatus =
      lead.outreachStatus === 'EmailSent' || lead.outreachStatus === 'BothSent' ? 'BothSent' : 'WhatsAppSent';
    updateLeadInDb(lead.id, {
      outreachStatus: nextStatus,
      pitchChannel: nextStatus === 'BothSent' ? 'Both' : 'WhatsApp',
      lastPitchedAt: new Date().toISOString(),
      pitchMessage: textBody,
      pitchApp: nextStatus === 'BothSent' ? 'Both' : 'WhatsApp',
      pitchRecipient: `+${cleanPhone}`,
      errorMessage: null,
    });

    return { success: true, phone: `+${cleanPhone}`, channel: 'Meta WhatsApp Cloud API' };
  } catch (err: any) {
    return { success: false, phone: `+${cleanPhone}`, error: err?.message || 'Meta Cloud API send error' };
  }
}

export function getBulkWhatsAppStatus(): BulkWhatsAppStatus {
  return { ...bulkState, logs: [...bulkState.logs] };
}

export function stopBulkWhatsAppSend(): BulkWhatsAppStatus {
  stopBulkRequested = true;
  if (bulkState.status === 'running') {
    bulkState.status = 'stopped';
    bulkState.completedAt = new Date().toISOString();
  }
  return getBulkWhatsAppStatus();
}

export function startBulkWhatsAppSend(params: {
  leadIds?: number[];
  origin?: string;
  includeAlreadySent?: boolean;
}): { started: boolean; status: BulkWhatsAppStatus; error?: string } {
  const conn = getWhatsAppConnectionStatus();
  if (!conn.connected) {
    return {
      started: false,
      status: getBulkWhatsAppStatus(),
      error: 'WhatsApp is not connected. Connect via QR scan or Meta Cloud API first.',
    };
  }
  if (bulkState.status === 'running') {
    return {
      started: false,
      status: getBulkWhatsAppStatus(),
      error: 'A bulk WhatsApp send job is already running.',
    };
  }

  let pool: Lead[] = [];
  if (Array.isArray(params.leadIds) && params.leadIds.length > 0) {
    pool = params.leadIds
      .map((id) => getLeadByIdFromDb(Number(id)))
      .filter((l): l is Lead => Boolean(l));
  } else {
    pool = getAllLeadsFromDb();
  }

  const eligible = pool.filter((l) => {
    if (l.outreachStatus === 'Unsubscribed') return false;
    const digits = normalizeWhatsAppDigits(
      l.whatsAppNumber || l.ownerPhone || l.locationPhone || l.phoneNumber,
      l.countryName || l.countryCode
    );
    if (!digits) return false;
    if (!params.includeAlreadySent) {
      if (
        l.outreachStatus === 'WhatsAppSent' ||
        l.outreachStatus === 'BothSent' ||
        l.outreachStatus === 'Replied'
      ) {
        return false;
      }
    }
    return true;
  });

  if (eligible.length === 0) {
    return {
      started: false,
      status: getBulkWhatsAppStatus(),
      error: 'No unsent leads with available phone numbers found.',
    };
  }

  stopBulkRequested = false;
  const jobId = `wabulk_${Date.now()}`;
  bulkState = {
    jobId,
    status: 'running',
    total: eligible.length,
    processed: 0,
    sentCount: 0,
    failedCount: 0,
    skippedCount: 0,
    currentBusiness: eligible[0].businessName,
    currentPhone: normalizeWhatsAppDigits(
      eligible[0].whatsAppNumber || eligible[0].ownerPhone || eligible[0].locationPhone || eligible[0].phoneNumber,
      eligible[0].countryName || eligible[0].countryCode
    ),
    lastError: null,
    startedAt: new Date().toISOString(),
    completedAt: null,
    logs: [],
  };

  // Run sequential anti-ban background loop
  (async () => {
    const delayMs = conn.mode === 'qr' ? 1400 : 350;
    for (let i = 0; i < eligible.length; i++) {
      if (stopBulkRequested) {
        bulkState.status = 'stopped';
        bulkState.completedAt = new Date().toISOString();
        return;
      }

      const lead = eligible[i];
      const digits = normalizeWhatsAppDigits(
        lead.whatsAppNumber || lead.ownerPhone || lead.locationPhone || lead.phoneNumber,
        lead.countryName || lead.countryCode
      );
      bulkState.currentBusiness = lead.businessName;
      bulkState.currentPhone = `+${digits}`;

      const result = await sendChatbotToLeadViaActiveConnection(lead, params.origin);
      bulkState.processed += 1;
      if (result.success) {
        bulkState.sentCount += 1;
        bulkState.logs.unshift({
          leadId: lead.id,
          businessName: lead.businessName,
          phone: result.phone,
          status: 'sent',
          message: `Chatbot sent via ${result.channel}`,
          at: new Date().toISOString(),
        });
      } else {
        bulkState.failedCount += 1;
        bulkState.lastError = result.error || null;
        bulkState.logs.unshift({
          leadId: lead.id,
          businessName: lead.businessName,
          phone: result.phone,
          status: 'failed',
          message: result.error || 'Failed to send',
          at: new Date().toISOString(),
        });
      }

      if (bulkState.logs.length > 100) {
        bulkState.logs = bulkState.logs.slice(0, 100);
      }

      if (i < eligible.length - 1 && !stopBulkRequested) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }

    bulkState.status = stopBulkRequested ? 'stopped' : 'completed';
    bulkState.completedAt = new Date().toISOString();
  })().catch((err) => {
    bulkState.status = 'error';
    bulkState.lastError = err?.message || 'Bulk WhatsApp job failed';
    bulkState.completedAt = new Date().toISOString();
  });

  return { started: true, status: getBulkWhatsAppStatus() };
}
