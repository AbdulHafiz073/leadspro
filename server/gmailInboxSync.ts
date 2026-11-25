import { ImapFlow } from 'imapflow';
import {
  db,
  getAppSetting,
  getAllLeadsFromDb,
  getLeadByEmailFromDb,
  saveGmailReplyToDb,
  updateLeadInDb,
  addUnsubscribe,
} from './db';
import type { GmailReplyRecord } from '../src/types';

interface GmailSmtpConfig {
  email: string;
  appPassword: string;
}

export interface SyncInboxResult {
  success: boolean;
  totalChecked: number;
  newRepliesCount: number;
  replies: GmailReplyRecord[];
  error?: string;
}

function cleanBodySnippet(raw: string): string {
  if (!raw) return '';
  return raw
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function analyzeEmailIntent(subject: string, bodyText: string): {
  replyType: GmailReplyRecord['replyType'];
  intentCategory: GmailReplyRecord['intentCategory'];
  wantsCreate: boolean;
  wantsUpdate: boolean;
  extractedPhone: string | null;
} {
  const combined = `${subject} ${bodyText}`.toLowerCase();

  const phoneMatch = bodyText.match(/(?:\+?\d[\d\s\-()]{7,18}\d)/);
  const extractedPhone = phoneMatch ? phoneMatch[0].trim() : null;

  const isNotInterested =
    /not interested|don'?t need|remove me|unsubscribe|stop|no thanks|nahi chahiye|mat bhejo/i.test(combined);

  if (isNotInterested) {
    return {
      replyType: 'NO (Not Interested)',
      intentCategory: 'NotInterested',
      wantsCreate: false,
      wantsUpdate: false,
      extractedPhone,
    };
  }

  const wantsCreate = /new website|build website|make website|create website|naya banwana|app banwana|game/i.test(
    combined
  );
  const wantsUpdate = /update website|redesign|revamp|fix website|speed|badalna|purani website/i.test(
    combined
  );
  const isDemo = /demo|free demo|quote|pricing|cost|charge|kitna lagega/i.test(combined);
  const isPositive = /yes|haan|interested|call me|contact me|baat karo|details bhejo|please send/i.test(combined);

  if (wantsCreate) {
    return {
      replyType: 'Website Create Approved',
      intentCategory: 'ApprovedWebsiteCreate',
      wantsCreate: true,
      wantsUpdate: false,
      extractedPhone,
    };
  }

  if (wantsUpdate) {
    return {
      replyType: 'Website Update Requested',
      intentCategory: 'RequestedWebsiteUpdate',
      wantsCreate: false,
      wantsUpdate: true,
      extractedPhone,
    };
  }

  if (isDemo || isPositive) {
    return {
      replyType: 'YES (Interested)',
      intentCategory: 'Interested',
      wantsCreate: false,
      wantsUpdate: false,
      extractedPhone,
    };
  }

  if (extractedPhone) {
    return {
      replyType: 'Contact Number Shared',
      intentCategory: 'SentContactNumber',
      wantsCreate: false,
      wantsUpdate: false,
      extractedPhone,
    };
  }

  return {
    replyType: 'Question',
    intentCategory: 'Interested',
    wantsCreate: false,
    wantsUpdate: false,
    extractedPhone,
  };
}

export async function syncGmailInboxViaImap(): Promise<SyncInboxResult> {
  const config = getAppSetting<GmailSmtpConfig>('gmail_smtp_config');
  if (!config?.email || !config?.appPassword) {
    return {
      success: false,
      totalChecked: 0,
      newRepliesCount: 0,
      replies: [],
      error: 'Gmail App Password configure nahi hai. Pehle Settings me apna 16-digit Google App Password jodein.',
    };
  }

  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: {
      user: config.email.trim(),
      pass: config.appPassword.replace(/\s+/g, ''),
    },
    logger: false,
  });

  try {
    await client.connect();
  } catch (connErr: any) {
    return {
      success: false,
      totalChecked: 0,
      newRepliesCount: 0,
      replies: [],
      error: `Gmail IMAP connect fail: ${connErr?.message || 'Google ne password reject kiya'}. 16-digit App Password check karein.`,
    };
  }

  const lock = await client.getMailboxLock('INBOX');
  const savedReplies: GmailReplyRecord[] = [];
  let checked = 0;

  try {
    const mailboxStatus = await client.status('INBOX', { messages: true });
    const total = (mailboxStatus && typeof mailboxStatus === 'object' && typeof mailboxStatus.messages === 'number')
      ? mailboxStatus.messages
      : 0;
    if (total === 0) {
      return {
        success: true,
        totalChecked: 0,
        newRepliesCount: 0,
        replies: [],
      };
    }

    // Check up to the last 50 incoming messages
    const fetchCount = Math.min(total, 50);
    const startSeq = Math.max(1, total - fetchCount + 1);
    const fetchRange = `${startSeq}:${total}`;

    const allLeads = getAllLeadsFromDb();
    const leadsByEmail = new Map<string, (typeof allLeads)[0]>();
    allLeads.forEach((l) => {
      if (l.email) leadsByEmail.set(l.email.toLowerCase().trim(), l);
    });

    const myEmail = config.email.trim().toLowerCase();

    for await (const msg of client.fetch(fetchRange, {
      envelope: true,
      bodyParts: ['text'],
      source: true,
    })) {
      checked++;
      const envelope = msg.envelope;
      if (!envelope) continue;

      const fromObj = envelope.from?.[0];
      const fromEmail = (fromObj?.address || '').toLowerCase().trim();
      const fromName = fromObj?.name || fromEmail.split('@')[0] || 'Client';

      // Skip self emails
      if (!fromEmail || fromEmail === myEmail) continue;

      const subject = envelope.subject || '(No Subject)';
      const receivedDate = envelope.date ? new Date(envelope.date).toISOString() : new Date().toISOString();

      let bodyText = '';
      if (msg.bodyParts?.has('text')) {
        bodyText = msg.bodyParts.get('text')?.toString() || '';
      } else if (msg.source) {
        bodyText = msg.source.toString();
      }
      const cleanBody = cleanBodySnippet(bodyText);

      // Auto-blacklist any bounced / blocked / Address-not-found email from mailer-daemon
      if (/mailer-daemon|postmaster/i.test(fromEmail)) {
        const bounceMatch =
          bodyText.match(/Final-Recipient:\s*rfc822;\s*([^\s\r\n<>]+)/i) ||
          cleanBody.match(/delivered to\s+([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
        if (bounceMatch && bounceMatch[1]) {
          const bouncedEmail = bounceMatch[1].trim().toLowerCase();
          if (bouncedEmail && bouncedEmail !== myEmail) {
            addUnsubscribe(bouncedEmail, 'Auto-blocked: Address not found / Message blocked');
            db.prepare('DELETE FROM email_campaigns WHERE lower(recipient_email) = ?').run(bouncedEmail);
            db.prepare("UPDATE leads SET outreach_status = 'EmailError' WHERE lower(email) = ?").run(bouncedEmail);
          }
        }
        continue;
      }

      if (/noreply|no-reply|google\.com|notifications@|discover\.pinterest/i.test(fromEmail)) {
        continue;
      }

      // Match with CRM leads by email or business name
      const matchedLead = leadsByEmail.get(fromEmail) || getLeadByEmailFromDb(fromEmail);
      const bizName = matchedLead?.businessName || fromName;

      const intent = analyzeEmailIntent(subject, cleanBody);
      const replySnippet = cleanBody.length > 120 ? cleanBody.slice(0, 117) + '...' : cleanBody;

      const replyId = `imap_${msg.uid || msg.seq}_${fromEmail.replace(/[^a-z0-9]/gi, '')}`;

      const replyRecord: GmailReplyRecord = {
        id: replyId,
        leadId: matchedLead?.id,
        businessName: bizName,
        clientEmail: fromEmail,
        clientPhone: intent.extractedPhone || matchedLead?.ownerPhone || matchedLead?.phoneNumber || undefined,
        extractedPhone: intent.extractedPhone,
        location: matchedLead
          ? [matchedLead.address, matchedLead.city, matchedLead.countryName].filter(Boolean).join(', ')
          : undefined,
        address: matchedLead?.address || undefined,
        city: matchedLead?.city || undefined,
        countryName: matchedLead?.countryName || undefined,
        googleMapsUrl: matchedLead?.googleMapsUrl || undefined,
        subject,
        replySnippet: replySnippet || subject,
        fullMessage: cleanBody || subject,
        replyType: intent.replyType,
        intentCategory: intent.intentCategory,
        wantsWebsiteCreate: intent.wantsCreate,
        wantsWebsiteUpdate: intent.wantsUpdate,
        serviceMode: intent.wantsUpdate ? 'Update' : intent.wantsCreate ? 'New Create' : undefined,
        finalDecision: intent.replyType.includes('NO') ? 'NO' : intent.replyType.includes('YES') ? 'YES' : undefined,
        channelSource: 'Direct Gmail Inbox',
        receivedAt: receivedDate,
        threadUrl: `https://mail.google.com/mail/u/0/#search/from%3A${encodeURIComponent(fromEmail)}`,
        notes: `Live synced via Gmail IMAP from ${config.email}`,
      };

      saveGmailReplyToDb(replyRecord);
      savedReplies.push(replyRecord);

      if (matchedLead) {
        const leadReplyType =
          intent.intentCategory === 'NotInterested'
            ? 'NotInterested'
            : intent.intentCategory === 'Interested' ||
              intent.intentCategory === 'ApprovedWebsiteCreate' ||
              intent.intentCategory === 'RequestedWebsiteUpdate' ||
              intent.intentCategory === 'SentContactNumber'
            ? 'Interested'
            : 'General';

        updateLeadInDb(matchedLead.id, {
          outreachStatus: 'Replied',
          replyReceived: true,
          replyType: leadReplyType,
        });
      }
    }
  } finally {
    lock.release();
    try {
      await client.logout();
    } catch {}
  }

  return {
    success: true,
    totalChecked: checked,
    newRepliesCount: savedReplies.length,
    replies: savedReplies,
  };
}
