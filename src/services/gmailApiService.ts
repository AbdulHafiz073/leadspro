import {
  getAccessToken,
  getConnectedGoogleEmail,
  invalidateAccessToken,
  hasGmailSendScope,
  hasGmailReadScope,
} from './googleWorkspaceAuth';
import { isCustomerCareEmail, isEmailAwaitingReply, markEmailAwaitingReply } from '../utils/deliverability';

function bufferToBase64(uint8Array: Uint8Array): string {
  let binary = '';
  const len = uint8Array.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(uint8Array[i]);
  }
  return btoa(binary);
}

function createRawEmail(to: string, from: string, subject: string, bodyText: string): string {
  const encoder = new TextEncoder();
  const utf8Subject = `=?UTF-8?B?${bufferToBase64(encoder.encode(subject))}?=`;
  const cleanFrom = from.trim();
  const senderHeader = cleanFrom ? `<${cleanFrom}>` : '<aabdulhafiz073@gmail.com>';

  const emailLines = [
    `To: ${to.trim()}`,
    `From: ${senderHeader}`,
    `Subject: ${utf8Subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    bodyText,
  ];

  const fullEmail = emailLines.join('\r\n');
  const fullBytes = encoder.encode(fullEmail);
  return bufferToBase64(fullBytes)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export interface SendGmailResult {
  success: boolean;
  messageId?: string;
  threadId?: string;
  error?: string;
  mode?: 'gmail_api';
  needsAuth?: boolean;
  needsAppPassword?: boolean;
  gmailSentUrl?: string;
  alreadySent?: boolean;
  skipped?: boolean;
}

export interface SendGmailOptions {
  skipLocalStorageDupCheck?: boolean;
  leadId?: number | string | null;
  businessName?: string;
  html?: string;
}

export const GMAIL_SENT_FOLDER_URL = 'https://mail.google.com/mail/u/0/#sent';

const CLIENT_BLOCKED_PATTERNS = [
  'noreply@',
  'no-reply@',
  'donotreply@',
  'example.com',
  'test@',
  'placeholder',
  'dummy',
  'fake',
  '.invalid',
  '.test',
];

export function isValidSendTargetEmail(email: string): boolean {
  const clean = (email || '').trim().toLowerCase();
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(clean)) return false;
  if (isCustomerCareEmail(clean)) return false;
  return !CLIENT_BLOCKED_PATTERNS.some((p) => clean.includes(p));
}

export async function sendEmailViaGmailApi(
  to: string,
  from: string,
  subject: string,
  body: string,
  options?: SendGmailOptions
): Promise<SendGmailResult> {
  const cleanTo = to.trim();
  const resolvedFrom = getConnectedGoogleEmail() || from.trim() || 'aabdulhafiz073@gmail.com';

  if (!options?.skipLocalStorageDupCheck && isEmailAwaitingReply(cleanTo)) {
    return {
      success: false,
      alreadySent: true,
      skipped: true,
      error: `Duplicate outreach blocked: '${cleanTo}' has already been sent an email.`,
    };
  }

  if (!isValidSendTargetEmail(cleanTo)) {
    return {
      success: false,
      error: `Blocked unverified, customer-care, or invalid email address '${cleanTo}'.`,
    };
  }

  // Soft MX check for warnings only; never hard block valid email formats from Google SMTP delivery
  try {
    const mxRes = await fetch('/api/verify-mx', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: cleanTo }),
    });
    // Let Google SMTP handle direct delivery and bounce management
  } catch {
    // Non-blocking
  }

  let token = await getAccessToken();
  if (!token) {
    // If not OAuth-authenticated, fall back to direct backend sender / Gmail compose mode
    token = 'direct_sender';
  }

  // Handle direct Gmail SMTP sending
  if (token === 'smtp_active' || token === 'direct_sender') {
    try {
      const response = await fetch('/api/gmail/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: cleanTo,
          from: resolvedFrom,
          subject,
          body,
          leadId: options?.leadId,
          businessName: options?.businessName,
          html: options?.html,
        }),
      });
      const data = await response.json();
      if (response.ok && data.success) {
        markEmailAwaitingReply(cleanTo);
        if (data.mode === 'direct_sender' && data.gmailSentUrl && typeof window !== 'undefined') {
          // Open pre-filled Gmail Web compose tab in new tab
          window.open(data.gmailSentUrl, '_blank');
        }
        return {
          success: true,
          messageId: data.messageId,
          mode: 'gmail_api',
          gmailSentUrl: data.gmailSentUrl || GMAIL_SENT_FOLDER_URL,
        };
      } else {
        return {
          success: false,
          error: data.error || 'Failed to send via Gmail.',
          needsAppPassword: Boolean(data.needsAppPassword),
          gmailSentUrl: data.gmailSentUrl,
        };
      }
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || 'Network error connecting to Gmail service.',
      };
    }
  }

  if (!hasGmailSendScope()) {
    const scopeMsg =
      'Gmail Send permission missing on current Google token. Dubara Connect Gmail click karke popup me Gmail Send checkbox tick karein.';
    invalidateAccessToken(scopeMsg);
    return {
      success: false,
      needsAuth: true,
      error: scopeMsg,
    };
  }

  const raw = createRawEmail(cleanTo, resolvedFrom, subject, body);
  try {
    const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw }),
    });

    if (response.ok) {
      const data = await response.json();
      markEmailAwaitingReply(cleanTo);
      return {
        success: true,
        messageId: data.id,
        threadId: data.threadId,
        mode: 'gmail_api',
        gmailSentUrl: GMAIL_SENT_FOLDER_URL,
      };
    } else {
      const errData = await response.json().catch(() => ({}));
      const apiErrMsg = errData?.error?.message || `Gmail API Error HTTP ${response.status}`;
      const isAuthError =
        response.status === 401 ||
        (response.status === 403 && /insufficient|scope|auth|token|permission/i.test(apiErrMsg));
      if (isAuthError) {
        invalidateAccessToken(
          `Gmail permission incomplete (${apiErrMsg}). "Connect Gmail" click karke popup me Gmail Send + Read checkboxes tick karein.`
        );
      }
      return {
        success: false,
        needsAuth: isAuthError,
        error: isAuthError
          ? `Gmail OAuth error (${apiErrMsg}). Reconnect Gmail karke Google consent popup me Gmail permissions (Send & Read) tick karein.`
          : apiErrMsg,
      };
    }
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Network error while contacting Google Gmail API.',
    };
  }
}

export interface InboundGmailReply {
  id: string;
  threadId: string;
  senderEmail: string;
  senderName: string;
  subject: string;
  snippet: string;
  fullBody?: string;
  receivedAt: string;
  threadUrl: string;
  replyType:
    | 'YES (Interested)'
    | 'Website Create Approved'
    | 'Website Update Requested'
    | 'Contact Number Shared'
    | 'Demo Scheduled'
    | 'Deal Won'
    | 'NO (Not Interested)'
    | 'Question';
  intentCategory:
    | 'ApprovedWebsiteCreate'
    | 'RequestedWebsiteUpdate'
    | 'SentContactNumber'
    | 'Interested'
    | 'NotInterested'
    | 'General';
  wantsWebsiteCreate: boolean;
  wantsWebsiteUpdate: boolean;
  extractedPhone: string | null;
}

function decodeBase64UrlUtf8(data?: string): string {
  if (!data) return '';
  try {
    const normalized = data.replace(/-/g, '+').replace(/_/g, '/');
    const pad = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
    const bin = atob(normalized + pad);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
      bytes[i] = bin.charCodeAt(i);
    }
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    return '';
  }
}

function stripHtmlTags(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractFullBodyFromPayload(payload: any): string {
  if (!payload) return '';
  const collectParts = (node: any, out: { plain: string[]; html: string[] }) => {
    if (!node) return;
    if (node.mimeType === 'text/plain' && node.body?.data) {
      out.plain.push(decodeBase64UrlUtf8(node.body.data));
    } else if (node.mimeType === 'text/html' && node.body?.data) {
      out.html.push(stripHtmlTags(decodeBase64UrlUtf8(node.body.data)));
    } else if (node.body?.data && !node.parts) {
      const decoded = decodeBase64UrlUtf8(node.body.data);
      if (decoded.includes('<html') || decoded.includes('<div')) out.html.push(stripHtmlTags(decoded));
      else out.plain.push(decoded);
    }
    if (Array.isArray(node.parts)) {
      for (const p of node.parts) collectParts(p, out);
    }
  };
  const out = { plain: [] as string[], html: [] as string[] };
  collectParts(payload, out);
  return (out.plain.join('\n').trim() || out.html.join('\n').trim()).trim();
}

function stripQuotedOriginalEmail(body: string): string {
  const cutMarkers = [
    /\nOn\s.+wrote:\s*/i,
    /\n-{3,}\s*Original Message\s*-{3,}/i,
    /\nFrom:\s*.*aabdulhafiz073@gmail\.com/i,
    /\nSent from my .*\n\nOn\s.+wrote:/i,
  ];
  let trimmed = body;
  for (const rx of cutMarkers) {
    const idx = trimmed.search(rx);
    if (idx > 0) {
      trimmed = trimmed.slice(0, idx);
    }
  }
  const lines = trimmed
    .split('\n')
    .filter((l) => !l.trim().startsWith('>'));
  return lines.join('\n').trim();
}

export function extractPhoneFromReplyText(text: string): string | null {
  if (!text) return null;
  const cleaned = stripQuotedOriginalEmail(text);
  const matches = cleaned.match(/(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{2,5}\)?[\s.-]?){2,4}\d{3,5}/g) || [];
  for (const raw of matches) {
    const candidate = raw.trim();
    const digits = candidate.replace(/[^0-9]/g, '');
    if (digits.length < 9 || digits.length > 15) continue;
    // Exclude MaxedLogic's own sender phone number
    if (digits.endsWith('9759725212')) continue;
    // Exclude fake repeated digits or plain years/dates
    if (/^(\d)\1{6,}$/.test(digits)) continue;
    if (/^\d{4}[-/]\d{2}[-/]\d{2}$/.test(candidate)) continue;
    return candidate;
  }
  return null;
}

export function analyzeReplyContent(subject: string, rawBody: string): {
  replyType: InboundGmailReply['replyType'];
  intentCategory: InboundGmailReply['intentCategory'];
  wantsWebsiteCreate: boolean;
  wantsWebsiteUpdate: boolean;
  extractedPhone: string | null;
  cleanReplyText: string;
} {
  const cleanReplyText = stripQuotedOriginalEmail(rawBody || '') || rawBody || '';
  const combined = `${subject || ''}\n${cleanReplyText}`.toLowerCase();
  const extractedPhone = extractPhoneFromReplyText(cleanReplyText);

  const isNegative =
    /\b(no thanks|not interested|unsubscribe|stop emailing|remove me|don'?t contact|do not contact|no requirement|nahi chahiye)\b/i.test(
      combined
    );

  const wantsWebsiteCreate =
    /\b(create|build|make|develop|new website|start website|banwana|banwani|nai website|new site|create website|website creation|approve.*create|go ahead.*website)\b/i.test(
      combined
    );

  const wantsWebsiteUpdate =
    /\b(update|redesign|revamp|upgrade|refresh|rework|fix|maintain|maintenance|modify|old website|current website|purani website|website update)\b/i.test(
      combined
    );

  const isDemo = /\b(demo|schedule|meeting|zoom|google meet|calendar|slot)\b/i.test(combined);
  const isPositive =
    wantsWebsiteCreate ||
    wantsWebsiteUpdate ||
    Boolean(extractedPhone) ||
    /\b(yes|approve|approved|interested|ok|okay|sure|proceed|go ahead|price|pricing|quote|cost|call me|contact me|haan|ha\b|ji\b)\b/i.test(
      combined
    );

  let intentCategory: InboundGmailReply['intentCategory'] = 'General';
  let replyType: InboundGmailReply['replyType'] = 'Question';

  if (isNegative) {
    intentCategory = 'NotInterested';
    replyType = 'NO (Not Interested)';
  } else if (wantsWebsiteCreate) {
    intentCategory = 'ApprovedWebsiteCreate';
    replyType = 'Website Create Approved';
  } else if (wantsWebsiteUpdate) {
    intentCategory = 'RequestedWebsiteUpdate';
    replyType = 'Website Update Requested';
  } else if (extractedPhone) {
    intentCategory = 'SentContactNumber';
    replyType = 'Contact Number Shared';
  } else if (isDemo) {
    intentCategory = 'Interested';
    replyType = 'Demo Scheduled';
  } else if (isPositive) {
    intentCategory = 'Interested';
    replyType = 'YES (Interested)';
  }

  return {
    replyType,
    intentCategory,
    wantsWebsiteCreate: !isNegative && wantsWebsiteCreate,
    wantsWebsiteUpdate: !isNegative && wantsWebsiteUpdate,
    extractedPhone,
    cleanReplyText,
  };
}

export async function fetchInboundGmailReplies(): Promise<{
  success: boolean;
  replies: InboundGmailReply[];
  error?: string;
  needsAuth?: boolean;
}> {
  const combinedReplies: InboundGmailReply[] = [];

  // 1. Primary Inbound Sync: Live IMAP connection from connected Google App Password
  try {
    const imapRes = await fetch('/api/gmail/sync-inbox', { method: 'POST' });
    const imapData = await imapRes.json().catch(() => ({}));
    if (imapRes.ok && imapData.success && Array.isArray(imapData.replies)) {
      for (const r of imapData.replies) {
        combinedReplies.push({
          id: r.id,
          threadId: r.id,
          senderEmail: r.clientEmail,
          senderName: r.businessName || r.clientEmail.split('@')[0],
          subject: r.subject,
          snippet: r.replySnippet || (r.fullMessage ? r.fullMessage.slice(0, 110) : ''),
          fullBody: r.fullMessage,
          receivedAt: r.receivedAt,
          threadUrl: r.threadUrl || `https://mail.google.com/mail/u/0/#search/from%3A${encodeURIComponent(r.clientEmail)}`,
          replyType: r.replyType,
          intentCategory: r.intentCategory,
          wantsWebsiteCreate: r.wantsWebsiteCreate,
          wantsWebsiteUpdate: r.wantsWebsiteUpdate,
          extractedPhone: r.extractedPhone,
        });
      }
    }
  } catch (imapErr) {
    console.warn('Backend IMAP sync notice:', imapErr);
  }

  // 2. Secondary Inbound Sync: If Google OAuth Token is active, check Gmail API
  try {
    const token = await getAccessToken();
    if (token && token !== 'smtp_active' && token !== 'direct_sender' && hasGmailReadScope()) {
      const listRes = await fetch(
        'https://gmail.googleapis.com/gmail/v1/users/me/messages?q=is:inbox -from:me&maxResults=25',
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (listRes.ok) {
        const listData = await listRes.json();
        const messageIds = listData.messages || [];

        for (const item of messageIds.slice(0, 20)) {
          try {
            const msgRes = await fetch(
              `https://gmail.googleapis.com/gmail/v1/users/me/messages/${item.id}?format=full`,
              { headers: { Authorization: `Bearer ${token}` } }
            );
            if (!msgRes.ok) continue;
            const msg = await msgRes.json();

            const headers = msg.payload?.headers || [];
            const fromHeader = headers.find((h: any) => h.name.toLowerCase() === 'from')?.value || '';
            const subject = headers.find((h: any) => h.name.toLowerCase() === 'subject')?.value || 'No Subject';
            const dateHeader = headers.find((h: any) => h.name.toLowerCase() === 'date')?.value || '';

            const emailMatch = fromHeader.match(/<([^>]+)>/) || [null, fromHeader];
            const cleanEmail = (emailMatch[1] || fromHeader).trim().toLowerCase();
            if (/noreply|no-reply|mailer-daemon|postmaster|notifications@/i.test(cleanEmail)) {
              continue;
            }
            const senderName = fromHeader.replace(/<[^>]+>/, '').trim().replace(/['"]/g, '') || cleanEmail.split('@')[0];

            const decodedBody = extractFullBodyFromPayload(msg.payload);
            const rawBody = decodedBody || msg.snippet || '';
            const analysis = analyzeReplyContent(subject, rawBody);
            const cleanBody = analysis.cleanReplyText || msg.snippet || '';
            const snippet = cleanBody.length > 120 ? cleanBody.slice(0, 117) + '...' : cleanBody;

            if (!combinedReplies.some((cr) => cr.id === msg.id || (cr.senderEmail === cleanEmail && cr.subject === subject))) {
              combinedReplies.push({
                id: msg.id,
                threadId: msg.threadId,
                senderEmail: cleanEmail,
                senderName: senderName || 'Business Owner',
                subject,
                snippet: snippet || msg.snippet || '',
                fullBody: cleanBody,
                receivedAt: dateHeader ? new Date(dateHeader).toISOString() : new Date().toISOString(),
                threadUrl: `https://mail.google.com/mail/u/0/#inbox/${msg.threadId}`,
                replyType: analysis.replyType,
                intentCategory: analysis.intentCategory,
                wantsWebsiteCreate: analysis.wantsWebsiteCreate,
                wantsWebsiteUpdate: analysis.wantsWebsiteUpdate,
                extractedPhone: analysis.extractedPhone,
              });
            }
          } catch {}
        }
      }
    }
  } catch {}

  return {
    success: true,
    replies: combinedReplies,
  };
}
