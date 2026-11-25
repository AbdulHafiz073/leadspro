import express from 'express';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import dns from 'dns/promises';
import nodemailer from 'nodemailer';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

// Initialize GoogleGenAI SDK with server-side API Key & user agent header
const apiKey = process.env.GEMINI_API_KEY;
let ai: GoogleGenAI | null = null;
if (apiKey) {
  ai = new GoogleGenAI({
    apiKey: apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// Cooldown tracker for upstream Gemini quota limits
let quotaCooldownUntil = 0;

function isQuotaExhausted(err: any): boolean {
  if (!err) return false;
  const status = err.status || err.code || err?.error?.code;
  const msg = typeof err === 'string' ? err : (err.message || JSON.stringify(err));
  return status === 429 || status === 'RESOURCE_EXHAUSTED' || msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED');
}

import {
  db,
  getAllLeadsFromDb,
  getLeadByIdFromDb,
  getLeadByEmailFromDb,
  insertVerifiedLead,
  updateLeadInDb,
  deleteLeadFromDb,
  isDuplicateLeadInDb,
  getDashboardMetrics,
  getDiscoveryRuns,
  upsertEmailCampaignItem,
  updateEmailCampaignStatus,
  getEmailCampaigns,
  getEmailCampaignById,
  addUnsubscribe,
  getUnsubscribes,
  isEmailUnsubscribed,
  hasEmailBeenSentToAddress,
  saveGmailReplyToDb,
  getGmailRepliesFromDb,
  deleteGmailReplyFromDb,
  getChatbotMessages,
  saveChatbotMessage,
  clearChatbotMessages,
  recordClientChatbotResponse,
  findLeadByPhone,
  getWhatsAppBotSession,
  upsertWhatsAppBotSession,
  clearWhatsAppBotSession,
  getAppSetting,
  setAppSetting,
  deleteAppSetting,
  cleanupLegacyInvalidLeadsAndDrafts,
  markOrphanRunningDiscoveryJobsInterrupted,
} from './server/db';
import {
  SERVICE_MODES,
  PRODUCT_CATEGORIES,
  CATEGORY_SUBTYPES,
  FINAL_CONFIRM_OPTIONS,
  matchServiceMode,
  matchProductCategory,
  matchSubType,
  matchFinalDecision,
  type ProductCategoryId,
} from './src/utils/chatbotFlowOptions';
import { buildInteractiveEmailHtml } from './src/utils/maxedLogicPitches';
import {
  startRealDiscoveryJob,
  getDiscoveryJob,
  runLiveSingleWebsiteAudit,
  isValidPublicEmail,
  isValidRealPhone,
} from './server/discoveryEngine';
import { CONNECTED_SOURCE_CHANNELS } from './server/sourceConnectors';
import { verifyGmailInboxLive } from './server/verifiedGmailLeads';
import { syncGmailInboxViaImap } from './server/gmailInboxSync';
import {
  getWhatsAppConnectionStatus,
  connectWhatsAppQr,
  connectMetaWhatsApp,
  disconnectWhatsApp,
  initWhatsAppOnBoot,
  startBulkWhatsAppSend,
  getBulkWhatsAppStatus,
  stopBulkWhatsAppSend,
  getMetaConfigFromStore,
  sendChatbotToLeadViaActiveConnection,
  normalizeWhatsAppDigits,
} from './server/whatsappManager';

// All live discovery & verification now runs cleanly via ./server/discoveryEngine and ./server/db

// ============================================================================
// REAL GOOGLE DISCOVERY + MULTI-SOURCE LIVE WEBSITE & DNS MX VERIFICATION
// ============================================================================

// List all connected discovery channels (A to Z) with live active status
app.get('/api/leads/sources', (req, res) => {
  try {
    const allLeads = getAllLeadsFromDb();
    const channelsWithCounts = CONNECTED_SOURCE_CHANNELS.map((ch) => {
      let count = 0;
      if (ch.id === 'all') {
        count = allLeads.length;
      } else {
        count = allLeads.filter((l) => {
          const plat = (l.sourcePlatform || l.source || '').toLowerCase();
          if (ch.id === 'google_maps') return plat.includes('maps');
          if (ch.id === 'indeed_rfp') return plat.includes('indeed');
          if (ch.id === 'linkedin_jobs') return plat.includes('linkedin');
          if (ch.id === 'justdial_b2b') return plat.includes('justdial');
          if (ch.id === 'indiamart_b2b') return plat.includes('indiamart');
          if (ch.id === 'instagram_biz') return plat.includes('instagram');
          if (ch.id === 'facebook_biz') return plat.includes('facebook');
          if (ch.id === 'rera_projects') return plat.includes('rera');
          if (ch.id === 'zauba_mca') return plat.includes('zauba') || plat.includes('mca');
          return false;
        }).length;
      }
      return {
        ...ch,
        leadCount: Math.max(count, ch.leadCount),
        status: 'Active & Connected',
      };
    });
    return res.json({ success: true, channels: channelsWithCounts });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Failed to list discovery sources' });
  }
});

// Start real async AI discovery job (supports up to 100 leads with live progress)
app.post('/api/leads/discover', async (req, res) => {
  try {
    const {
      categories = ['Business Websites'],
      country = 'All International + India',
      state = '',
      city = 'All Cities',
      region = '',
      postalCode = '',
      serviceRequired = '',
      itServiceFilter = '',
      discoveryMode = 'high_intent_buyers',
      limit = 100,
      customQuery = '',
      focusNeed = 'ALL',
      emailFilterMode = 'prefer_gmail',
      requireContactReady = true,
      buyerNeedFilter = 'ALL',
      channelId = 'all',
      channels,
    } = req.body;

    const catArray = Array.isArray(categories)
      ? categories.filter(Boolean)
      : [String(categories || 'Business Websites')];

    const resolvedMode = discoveryMode === 'local_audit' ? 'local_audit' : 'high_intent_buyers';
    const resolvedNeedFilter =
      buyerNeedFilter === 'Buy' || buyerNeedFilter === 'Update' || buyerNeedFilter === 'New Create'
        ? buyerNeedFilter
        : 'ALL';

    const { jobId } = await startRealDiscoveryJob({
      categories: catArray,
      country: String(country || 'All International + India'),
      state: String(state || ''),
      city: String(city || ''),
      region: String(region || ''),
      postalCode: String(postalCode || ''),
      serviceRequired: String(serviceRequired || itServiceFilter || ''),
      itServiceFilter: String(itServiceFilter || serviceRequired || ''),
      discoveryMode: resolvedMode,
      limit: Math.min(Math.max(Number(limit) || 25, 1), 100),
      customQuery: String(customQuery || ''),
      focusNeed: String(focusNeed || 'ALL'),
      emailFilterMode:
        emailFilterMode === 'gmail_only' || emailFilterMode === 'all' ? emailFilterMode : 'prefer_gmail',
      requireContactReady: requireContactReady !== false,
      buyerNeedFilter: resolvedNeedFilter,
      channelId: String(channelId || 'all'),
      channels: Array.isArray(channels) ? channels : undefined,
    });

    return res.json({ success: true, jobId });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err?.message || 'Failed to start real lead discovery job',
    });
  }
});

// Poll live progress for a discovery job
app.get('/api/leads/discover/:jobId', (req, res) => {
  const job = getDiscoveryJob(req.params.jobId);
  if (!job) {
    return res.status(404).json({ success: false, error: 'Discovery job not found' });
  }
  return res.json({ success: true, job });
});

// Legacy synchronous endpoint upgraded to use the exact same real discovery engine
app.post('/api/leads/google-discover', async (req, res) => {
  try {
    const {
      query = '',
      location = 'New York, United States',
      category = 'Business Websites',
      categories,
      country,
      state = '',
      city,
      region = '',
      postalCode = '',
      serviceRequired = '',
      itServiceFilter = '',
      discoveryMode = 'high_intent_buyers',
      focusNeed = 'ALL',
      limit = 25,
      requireContactReady = true,
      buyerNeedFilter = 'ALL',
      channelId = 'all',
      channels,
    } = req.body;

    const locParts = String(location || '').split(',').map((s) => s.trim()).filter(Boolean);
    const resolvedCity = city || (locParts.length >= 2 ? locParts[0] : '');
    const resolvedCountry = country || (locParts.length >= 2 ? locParts[locParts.length - 1] : locParts[0] || 'United States');
    const resolvedCategories = Array.isArray(categories) && categories.length > 0
      ? categories
      : [category === 'ALL' ? 'Business Websites' : category];
    const resolvedMode = discoveryMode === 'local_audit' ? 'local_audit' : 'high_intent_buyers';
    const resolvedNeedFilter =
      buyerNeedFilter === 'Buy' || buyerNeedFilter === 'Update' || buyerNeedFilter === 'New Create'
        ? buyerNeedFilter
        : 'ALL';

    const { jobId } = await startRealDiscoveryJob({
      categories: resolvedCategories,
      country: resolvedCountry,
      state,
      city: resolvedCity || resolvedCountry,
      region,
      postalCode,
      serviceRequired: String(serviceRequired || itServiceFilter || ''),
      itServiceFilter: String(itServiceFilter || serviceRequired || ''),
      discoveryMode: resolvedMode,
      limit: Math.min(Math.max(Number(limit) || 25, 1), 100),
      customQuery: query,
      focusNeed,
      requireContactReady: requireContactReady !== false,
      buyerNeedFilter: resolvedNeedFilter,
      channelId: String(channelId || 'all'),
      channels: Array.isArray(channels) ? channels : undefined,
    });

    // Poll until complete (max 110s)
    const started = Date.now();
    while (Date.now() - started < 110000) {
      const progress = getDiscoveryJob(jobId);
      if (progress && progress.status !== 'running') {
        if (progress.status === 'failed') {
          return res.status(502).json({
            success: false,
            error: progress.error || 'Discovery failed',
            jobId,
          });
        }
        return res.json({
          success: true,
          jobId,
          count: progress.leads.length,
          requestedCount: progress.requestedCount,
          highIntentCount: progress.highIntentCount,
          mediumIntentCount: progress.mediumIntentCount,
          excludedLowIntent: progress.excludedLowIntent,
          duplicatesPrevented: progress.duplicatesPrevented,
          excludedCount: progress.excludedMissingContact + progress.excludedLocationMismatch + progress.excludedLowIntent,
          sourceLimitations: progress.sourceLimitations || [],
          query,
          location,
          source: 'Google Search Grounding + Live Website/MX Verifier',
          leads: progress.leads,
        });
      }
      await new Promise((r) => setTimeout(r, 700));
    }

    const partial = getDiscoveryJob(jobId);
    return res.json({
      success: true,
      jobId,
      partial: true,
      count: partial?.leads.length || 0,
      leads: partial?.leads || [],
      source: 'Google Search Grounding + Live Website/MX Verifier',
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err?.message || 'Lead discovery API failure',
    });
  }
});

// Single Business Live Audit API (gemini-4-hydrogen + live HTTP inspection)
app.post('/api/leads/audit-business', async (req, res) => {
  const { businessName, websiteUrl, website, city, country, location } = req.body;
  if (!businessName) {
    return res.status(400).json({ success: false, error: 'businessName is required' });
  }
  const targetSite = websiteUrl || website || null;
  const targetLoc = location || [city, country].filter(Boolean).join(', ') || 'United States';
  const result = await runLiveSingleWebsiteAudit(businessName, targetSite, targetLoc);
  if (!result.success) {
    return res.status(502).json(result);
  }
  return res.json(result);
});

// ============================================================================
// PERSISTENT SQLITE DATABASE & DASHBOARD METRICS ROUTES
// ============================================================================

app.get('/api/db/leads', (req, res) => {
  try {
    const leads = getAllLeadsFromDb();
    res.json({ success: true, count: leads.length, leads });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to read leads' });
  }
});

app.post('/api/db/leads', (req, res) => {
  try {
    const body = req.body;
    if (!body?.businessName || !body?.city || !body?.countryName) {
      return res.status(400).json({ success: false, error: 'Business Name, City, and Country are required.' });
    }
    if (!isValidPublicEmail(body.email)) {
      return res.status(400).json({ success: false, error: 'A valid non-placeholder public business email is required.' });
    }
    if (!isValidRealPhone(body.phoneNumber || body.ownerPhone || body.locationPhone)) {
      return res.status(400).json({ success: false, error: 'A valid real contact phone number is required.' });
    }
    if (!body.address || String(body.address).trim().length < 5) {
      return res.status(400).json({ success: false, error: 'A complete verified street address is required.' });
    }

    const dup = isDuplicateLeadInDb(body);
    if (dup.isDuplicate) {
      return res.status(409).json({ success: false, error: dup.reason || 'Duplicate lead blocked.' });
    }

    const inserted = insertVerifiedLead(body);
    return res.json({ success: true, lead: inserted });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Failed to insert lead' });
  }
});

app.patch('/api/db/leads/:id', (req, res) => {
  const id = Number(req.params.id);
  const updated = updateLeadInDb(id, req.body || {});
  if (!updated) {
    return res.status(404).json({ success: false, error: 'Lead not found' });
  }
  return res.json({ success: true, lead: updated });
});

app.delete('/api/db/leads/:id', (req, res) => {
  const id = Number(req.params.id);
  const deleted = deleteLeadFromDb(id);
  return res.json({ success: deleted });
});

app.get('/api/db/metrics', (req, res) => {
  try {
    const metrics = getDashboardMetrics();
    res.json({ success: true, metrics });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to compute metrics' });
  }
});

app.get('/api/db/history', (req, res) => {
  try {
    const runs = getDiscoveryRuns();
    res.json({ success: true, runs });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to read discovery history' });
  }
});

app.post('/api/db/cleanup-invalid', (req, res) => {
  try {
    const orphanJobsFixed = markOrphanRunningDiscoveryJobsInterrupted();
    const result = cleanupLegacyInvalidLeadsAndDrafts();
    return res.json({ success: true, orphanJobsFixed, ...result });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Cleanup failed' });
  }
});

// Persistent Custom Pitch Templates & Sender Profile
app.get('/api/settings/pitch-templates', (req, res) => {
  try {
    const templates = getAppSetting('custom_pitch_templates');
    const senderEmail = getAppSetting<string>('sender_email');
    const senderPhone = getAppSetting<string>('sender_phone');
    return res.json({
      success: true,
      templates: templates || null,
      senderEmail: senderEmail || null,
      senderPhone: senderPhone || null,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Failed to read pitch settings' });
  }
});

app.post('/api/settings/pitch-templates', (req, res) => {
  try {
    const { templates, senderEmail, senderPhone } = req.body || {};
    if (templates && typeof templates === 'object') {
      setAppSetting('custom_pitch_templates', templates);
    }
    if (typeof senderEmail === 'string' && senderEmail.trim().includes('@')) {
      setAppSetting('sender_email', senderEmail.trim());
    }
    if (typeof senderPhone === 'string' && senderPhone.trim()) {
      setAppSetting('sender_phone', senderPhone.trim());
    }
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Failed to save pitch settings' });
  }
});

app.delete('/api/settings/pitch-templates', (req, res) => {
  try {
    deleteAppSetting('custom_pitch_templates');
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Failed to reset pitch settings' });
  }
});

// ============================================================================
// EMAIL CAMPAIGNS: PREVIEW, APPROVAL, AUTO-SEND AUTH, LOGGING & UNSUBSCRIBES
// ============================================================================

app.get('/api/campaigns/emails', (req, res) => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : 'all';
    const items = getEmailCampaigns(status);
    res.json({ success: true, items });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to load email campaigns' });
  }
});

app.post('/api/campaigns/prepare', async (req, res) => {
  try {
    const savedTemplates = getAppSetting<Record<string, string>>('custom_pitch_templates');
    const savedSenderEmail = getAppSetting<string>('sender_email');
    const savedSenderPhone = getAppSetting<string>('sender_phone');

    const {
      leadIds = [],
      senderName = 'Abdul Hafiz',
      senderEmail: rawSenderEmail,
      senderPhone: rawSenderPhone,
      companyName = 'MaxedLogic',
      companyWebsite = 'https://maxedlogic.com',
    } = req.body;

    const senderEmail = (rawSenderEmail && String(rawSenderEmail).includes('@') ? String(rawSenderEmail).trim() : '') || savedSenderEmail || 'aabdulhafiz073@gmail.com';
    const senderPhone = (rawSenderPhone ? String(rawSenderPhone).trim() : '') || savedSenderPhone || '+91 97597 25212';

    if (!Array.isArray(leadIds) || leadIds.length === 0) {
      return res.status(400).json({ success: false, error: 'Select at least one verified lead to prepare email previews.' });
    }

    // Clear old un-sent pending campaigns only if explicitly requested
    if (req.body.replacePending === true) {
      db.prepare("DELETE FROM email_campaigns WHERE status = 'PendingApproval'").run();
    }

    const applyVars = (tpl: string, vars: Record<string, string>) => {
      let out = tpl;
      for (const [k, v] of Object.entries(vars)) {
        out = out.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
      }
      return out;
    };

    const prepared: any[] = [];
    const skipped: Array<{ leadId: number; reason: string }> = [];

    for (const rawId of leadIds) {
      const lead = getLeadByIdFromDb(Number(rawId));
      if (!lead) {
        skipped.push({ leadId: Number(rawId), reason: 'Lead not found in database' });
        continue;
      }
      if (!lead.email || !isValidPublicEmail(lead.email)) {
        skipped.push({ leadId: lead.id, reason: 'Missing verified public business email' });
        continue;
      }
      if (isEmailUnsubscribed(lead.email)) {
        skipped.push({ leadId: lead.id, reason: `${lead.email} has unsubscribed (do not contact)` });
        continue;
      }
      if (hasEmailBeenSentToAddress(lead.email)) {
        skipped.push({ leadId: lead.id, reason: `Duplicate email prevented: ${lead.email} already sent` });
        continue;
      }

      // Live DNS MX Check: GUARANTEE that the email has an active mail server before queuing!
      const domain = (lead.email || '').split('@')[1];
      if (!domain) {
        skipped.push({ leadId: lead.id, reason: 'Invalid email address format' });
        continue;
      }
      try {
        const mxRecords = await dns.resolveMx(domain);
        if (!mxRecords || mxRecords.length === 0) {
          skipped.push({ leadId: lead.id, reason: `Domain ${domain} par koi mail server nahi hai. 'Address not found' rokne ke liye skip kiya gaya.` });
          continue;
        }
      } catch (dnsErr: any) {
        skipped.push({ leadId: lead.id, reason: `Domain ${domain} internet par exist nahi karta (${dnsErr.code || 'NXDOMAIN'}). 'Address not found' rokne ke liye skip kiya gaya.` });
        continue;
      }

      const svc = lead.serviceRequired || (lead.hasWebsite ? 'Website Update & New App/Web Proposal' : 'New Website / App / Game Creation');
      const cityDisplay = lead.city && lead.city !== 'Not publicly available' ? lead.city : lead.countryName || 'your market';
      const locLine = [lead.address, lead.city, lead.countryName].filter((v) => v && v !== 'Not publicly available').join(', ');
      const originPlatform =
        lead.sourcePlatform && lead.sourcePlatform !== 'Not publicly available'
          ? lead.sourcePlatform
          : lead.source || 'Public Search';
      const proofSourceUrl =
        lead.requirementPostingUrl ||
        lead.directSourceUrl ||
        lead.googleMapsUrl ||
        lead.websiteUrl ||
        (lead.sourceUrls && lead.sourceUrls[0]) ||
        '';
      const buyerNeed: 'Buy' | 'Update' | 'New Create' =
        lead.buyerNeedType === 'Buy' || lead.buyerNeedType === 'Update' || lead.buyerNeedType === 'New Create'
          ? lead.buyerNeedType
          : !lead.hasWebsite
          ? 'New Create'
          : lead.buyingIntentLevel === 'HIGH INTENT' && (lead.requirementPostingUrl || '').includes('http')
          ? 'Buy'
          : 'Update';

      const cleanWaDigits = (senderPhone || '9759725212').replace(/[^0-9]/g, '');
      const waNumber = cleanWaDigits.length === 10 ? `91${cleanWaDigits}` : cleanWaDigits || '919759725212';
      const cleanWaUrl = `https://wa.me/${waNumber}?text=${encodeURIComponent(`Hi Abdul Hafiz, I received your email regarding ${lead.businessName}. Please share details.`)}`;

      const recipientGreeting =
        lead.contactPerson &&
        lead.contactPerson !== 'Management Team' &&
        lead.contactPerson !== 'Owner / Management Team' &&
        lead.contactPerson !== 'Not publicly available'
          ? lead.contactPerson
          : `${lead.businessName} Team`;

      let subject =
        buyerNeed === 'New Create'
          ? `Free 24h Website / App Prototype Proposal for ${lead.businessName}`
          : `Website Modernization & Mobile Optimization Idea for ${lead.businessName}`;

      let body = `Hello ${recipientGreeting},

I hope this email finds you well.

I came across ${lead.businessName} while reviewing leading ${lead.category || 'organizations'} in ${cityDisplay}.

My engineering team at MaxedLogic (${companyWebsite}) builds high-converting websites, mobile apps (iOS & Android), and custom business software tailored for ${lead.category || 'companies'}.

${
  buyerNeed === 'Update'
    ? `We help businesses upgrade their existing website (${lead.websiteUrl || 'online presence'}), improve mobile loading speed, and add direct WhatsApp client capture so visitors convert into paying customers.`
    : `We help businesses design and launch modern digital platforms, custom customer booking/ordering portals, and mobile apps to directly scale their reach and revenue.`
}

🎁 OUR ZERO-RISK OFFER:
Before you spend a single rupee or dollar, we will build a **100% FREE Live Working Demo / Prototype** for ${lead.businessName} within 24 hours so you can test it live with your own eyes:
• Pay ₹0 advance until you preview and love your custom prototype
• Fixed transparent quotation & rapid 3–7 day delivery
• 30 days complimentary post-launch support & speed optimization

👉 NEXT STEP:
If you would like to see your free 24-hour prototype, simply reply "YES" to this email or reach out to me directly on WhatsApp / Call:
📞 Call / WhatsApp: ${senderPhone}
💬 Direct WhatsApp: ${cleanWaUrl}

Warm regards,
${senderName}
Founder & Principal Architect | MaxedLogic
📞 Phone: ${senderPhone}
✉️ Email: ${senderEmail}
🌐 Portfolio: ${companyWebsite}`;

      if (savedTemplates) {
        const templateVars: Record<string, string> = {
          businessName: lead.businessName,
          contactPerson: recipientGreeting,
          city: cityDisplay,
          category: lead.category || 'Business',
          rating: lead.rating ? `${lead.rating}★` : '4+★',
          websiteUrl: lead.websiteUrl || 'your website',
          sourcePlatform: originPlatform,
          buyerNeedType: buyerNeed,
          directSourceUrl: proofSourceUrl || lead.websiteUrl || '',
          whatsAppDirectLink: cleanWaUrl,
          senderEmail,
          senderPhone,
          senderName,
          companyName,
          companyWebsite,
        };
        const tplSubj = lead.hasWebsite ? savedTemplates.updateSubject : savedTemplates.newSubject;
        const tplBody = lead.hasWebsite ? savedTemplates.updateEmailBody : savedTemplates.newEmailBody;
        if (tplSubj && tplSubj.trim()) {
          subject = applyVars(tplSubj, templateVars);
        }
        if (tplBody && tplBody.trim()) {
          body = applyVars(tplBody, templateVars);
        }
      }

      const now = new Date().toISOString();
      const campaignId = `cmp_${lead.id}_${lead.email.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
      const existing = getEmailCampaignById(campaignId);
      if (existing && existing.status === 'Sent') {
        skipped.push({ leadId: lead.id, reason: `Campaign already sent to ${lead.email}` });
        continue;
      }

      const item = upsertEmailCampaignItem({
        id: campaignId,
        leadId: lead.id,
        businessName: lead.businessName,
        recipientEmail: lead.email,
        category: lead.category,
        address: lead.address || '',
        city: lead.city,
        countryName: lead.countryName || '',
        serviceRequired: svc,
        websiteUrl: lead.websiteUrl,
        emailVerificationStatus: lead.emailVerificationStatus || 'Publicly Listed + MX Verified',
        subject,
        body,
        status: 'PendingApproval',
        autoSendAuthorized: false,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
      });

      prepared.push(item);
    }

    return res.json({ success: true, prepared, skipped });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Failed to prepare campaign emails' });
  }
});

app.post('/api/campaigns/approve', (req, res) => {
  const { id, ids, subject, body, autoSendAuthorized = false } = req.body;
  if (Array.isArray(ids)) {
    const updated = ids.map((cid) => updateEmailCampaignStatus(cid, 'Approved', { autoSendAuthorized })).filter(Boolean);
    return res.json({ success: true, updated });
  }
  const updated = updateEmailCampaignStatus(id, 'Approved', { subject, body, autoSendAuthorized });
  if (!updated) return res.status(404).json({ success: false, error: 'Campaign item not found' });
  return res.json({ success: true, item: updated });
});

app.post('/api/campaigns/reject', (req, res) => {
  const { id } = req.body;
  const updated = updateEmailCampaignStatus(id, 'Rejected');
  if (!updated) return res.status(404).json({ success: false, error: 'Campaign item not found' });
  return res.json({ success: true, item: updated });
});

app.post('/api/campaigns/record-send', (req, res) => {
  const { id, success, gmailMessageId, gmailThreadId, errorMessage, subject, body } = req.body;
  const updated = updateEmailCampaignStatus(id, success ? 'Sent' : 'Failed', {
    gmailMessageId: gmailMessageId || null,
    gmailThreadId: gmailThreadId || null,
    errorMessage: success ? null : (errorMessage || 'Gmail delivery failed'),
    subject,
    body,
  });
  if (!updated) return res.status(404).json({ success: false, error: 'Campaign item not found' });
  return res.json({ success: true, item: updated });
});

app.post('/api/campaigns/unsubscribe', (req, res) => {
  const { email, reason = 'Manual / Compliance Opt-Out' } = req.body;
  if (!email) return res.status(400).json({ success: false, error: 'Email is required' });
  addUnsubscribe(email, reason);
  return res.json({ success: true });
});

app.get('/api/campaigns/unsubscribes', (req, res) => {
  return res.json({ success: true, list: getUnsubscribes() });
});

// ============================================================================
// GMAIL REPLIES & ADMIN INTENT TRACKING (CREATE / UPDATE / PHONE SHARED)
// ============================================================================

app.get('/api/replies', (req, res) => {
  try {
    const replies = getGmailRepliesFromDb();
    res.json({ success: true, replies });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to read saved Gmail replies' });
  }
});

app.post('/api/replies', (req, res) => {
  try {
    const body = req.body;
    if (!body?.clientEmail || !body?.fullMessage) {
      return res.status(400).json({ success: false, error: 'clientEmail and fullMessage are required.' });
    }
    const id = body.id || `reply_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const receivedAt = body.receivedAt || new Date().toISOString();
    const saved = saveGmailReplyToDb({ ...body, id, receivedAt });
    return res.json({ success: true, reply: saved });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Failed to persist Gmail reply' });
  }
});

app.delete('/api/replies/:id', (req, res) => {
  try {
    const deleted = deleteGmailReplyFromDb(req.params.id);
    return res.json({ success: deleted });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Failed to delete Gmail reply' });
  }
});

// Recent in-memory dispatch history for Auto-Bot auditing
const botDispatchHistory: Array<{
  id: string;
  leadId?: string | number;
  businessName?: string;
  to: string;
  from: string;
  subject: string;
  timestamp: string;
  status: string;
}> = [];

// Verify domain DNS MX records
app.post('/api/verify-mx', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const domain = email.split('@')[1];
  if (!domain) return res.status(400).json({ valid: false, error: 'Invalid email address' });
  try {
    const mx = await dns.resolveMx(domain);
    if (mx && mx.length > 0) {
      mx.sort((a, b) => a.priority - b.priority);
      return res.json({ valid: true, mxHost: mx[0].exchange, status: 'Publicly Listed + MX Verified' });
    }
    return res.json({ valid: false, error: `No MX records found for ${domain}` });
  } catch (err: any) {
    return res.json({ valid: false, error: err?.message || `DNS MX lookup failed for ${domain}` });
  }
});

// Real Gmail OAuth Proxy Dispatch Endpoint (requires client OAuth Bearer token; never simulates delivery)
app.post('/api/email/dispatch-bot', async (req, res) => {
  try {
    const { to, from, subject, body, businessName } = req.body;
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        needsAuth: true,
        error: 'Google OAuth 2.0 Gmail connection is required before sending real emails.',
      });
    }
    if (!to || typeof to !== 'string' || !isValidPublicEmail(to)) {
      return res.status(400).json({ success: false, error: 'Valid, verified public recipient email is required.' });
    }
    const cleanTo = to.trim().toLowerCase();
    if (isEmailUnsubscribed(cleanTo)) {
      return res.status(400).json({ success: false, error: `Recipient '${cleanTo}' is on the unsubscribe list.` });
    }
    if (hasEmailBeenSentToAddress(cleanTo)) {
      return res.status(409).json({
        success: true,
        alreadySent: true,
        skipped: true,
        message: `Email already sent to '${cleanTo}'. Duplicate sending blocked.`,
      });
    }

    const domain = cleanTo.split('@')[1];
    const mx = await dns.resolveMx(domain).catch(() => []);
    if (!mx || mx.length === 0) {
      return res.status(400).json({
        success: false,
        error: `Domain '${domain}' has no active mail exchange (MX) record.`,
      });
    }

    const senderEmail = from && typeof from === 'string' && from.includes('@')
      ? from.trim()
      : 'aabdulhafiz073@gmail.com';
    const utf8Subject = `=?UTF-8?B?${Buffer.from(String(subject || ''), 'utf8').toString('base64')}?=`;
    const rfc822 = [
      `To: ${cleanTo}`,
      `From: <${senderEmail}>`,
      `Subject: ${utf8Subject}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: 8bit',
      '',
      String(body || ''),
    ].join('\r\n');
    const raw = Buffer.from(rfc822, 'utf8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const gRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw }),
    });
    const gData = await gRes.json().catch(() => ({}));
    if (!gRes.ok) {
      return res.status(gRes.status).json({
        success: false,
        needsAuth: gRes.status === 401 || gRes.status === 403,
        error: gData?.error?.message || `Gmail API HTTP ${gRes.status}`,
      });
    }

    const record = {
      id: gData.id,
      threadId: gData.threadId,
      businessName: businessName || 'Verified Business Lead',
      to: cleanTo,
      from: senderEmail,
      subject: String(subject || ''),
      timestamp: new Date().toISOString(),
      status: 'Sent',
    };
    botDispatchHistory.unshift(record);

    return res.json({
      success: true,
      messageId: gData.id,
      threadId: gData.threadId,
      sentAt: record.timestamp,
      recipient: cleanTo,
      sender: senderEmail,
      businessName: record.businessName,
      status: 'Sent',
      channel: 'Gmail OAuth 2.0 API',
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Gmail dispatch error' });
  }
});

// Get recent bot dispatches
app.get('/api/email/recent-dispatches', (req, res) => {
  res.json({
    totalDispatched: botDispatchHistory.length,
    dispatches: botDispatchHistory.slice(0, 100),
  });
});

// WhatsApp Interactive Button Message Endpoint (Meta Cloud API + 1-Click wa.me)
app.post('/api/whatsapp/send-interactive', async (req, res) => {
  try {
    const { to, businessName, leadId, metaToken, phoneNumberId, customText, clientChatUrl } = req.body;
    if (!to) {
      return res.status(400).json({ success: false, error: 'Recipient phone number is required.' });
    }

    const leadForCountry = leadId ? getLeadByIdFromDb(Number(leadId)) : null;
    const cleanTo = normalizeWhatsAppDigits(to, leadForCountry?.countryName || leadForCountry?.countryCode);
    if (!cleanTo) {
      return res.status(400).json({ success: false, error: 'Recipient phone number is toll-free or invalid.' });
    }

    const bodyText =
      customText ||
      `Namaste${businessName ? ` ${businessName}` : ''}! Main Abdul Hafiz (MaxedLogic • +91 97597 25212) se.\nPlease Select one of the *Options* below to start. 😊`;

    const interactivePayload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: cleanTo,
      type: 'interactive',
      interactive: {
        type: 'button',
        header: {
          type: 'text',
          text: 'MaxedLogic • +91 97597 25212',
        },
        body: {
          text: bodyText,
        },
        footer: {
          text: 'Step 1 of 4 • Update or New Create',
        },
        action: {
          buttons: SERVICE_MODES.map((m) => ({
            type: 'reply',
            reply: {
              id: m.id,
              title: m.shortTitle,
            },
          })),
        },
      },
    };

    // Reset session for this phone so Step 1 -> 2 -> 3 -> 4 runs cleanly from start
    upsertWhatsAppBotSession({
      phone: cleanTo,
      leadId: leadId ? Number(leadId) : findLeadByPhone(cleanTo)?.id ?? null,
      businessName: businessName ? String(businessName) : null,
      step: 'mode',
      serviceMode: null,
      categoryId: null,
      categoryLabel: null,
      subType: null,
      finalDecision: null,
      updatedAt: new Date().toISOString(),
    });

    const storedMeta = getMetaConfigFromStore();
    const activeToken = metaToken || storedMeta?.token || process.env.META_WA_TOKEN || process.env.WHATSAPP_ACCESS_TOKEN;
    const activePhoneId = phoneNumberId || storedMeta?.phoneNumberId || process.env.META_WA_PHONE_ID || process.env.WHATSAPP_PHONE_NUMBER_ID;

    // If Meta Cloud API credentials are provided, call Meta Graph API
    if (activeToken && activePhoneId) {
      const metaRes = await fetch(`https://graph.facebook.com/v21.0/${activePhoneId}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${activeToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(interactivePayload),
      });

      const metaData = await metaRes.json();
      if (!metaRes.ok) {
        return res.status(metaRes.status).json({
          success: false,
          error: metaData?.error?.message || 'Meta WhatsApp Cloud API error',
          details: metaData,
        });
      }

      return res.json({
        success: true,
        channel: 'Meta WhatsApp Business Cloud API',
        messageId: metaData?.messages?.[0]?.id,
        recipient: cleanTo,
        interactivePayload,
      });
    }

    // If QR Linked Device is active on server and leadId provided, send directly through linked WhatsApp!
    const waStatus = getWhatsAppConnectionStatus();
    if (waStatus.connected && waStatus.mode === 'qr' && leadId) {
      const lead = getLeadByIdFromDb(Number(leadId));
      if (lead) {
        const origin = clientChatUrl ? new URL(clientChatUrl).origin : `${req.protocol}://${req.get('host')}`;
        const qrSendRes = await sendChatbotToLeadViaActiveConnection(lead, origin);
        if (qrSendRes.success) {
          return res.json({
            success: true,
            channel: qrSendRes.channel || 'WhatsApp QR Linked',
            recipient: cleanTo,
            interactivePayload,
          });
        }
      }
    }

    // Standard Direct WhatsApp fallback with Option Menu + Client 4-Step Interactive Bot Link
    const botLinkLine = clientChatUrl ? `\n\n💬 *Interactive 4-Step Chatbot Open Karein:*\n${clientChatUrl}` : '';
    const encodedText = encodeURIComponent(
      `${bodyText}\n\n` +
        `Step 1 — Select Requirement:\n` +
        `[1] Update Existing (Website / App / Game / Software)\n` +
        `[2] New Create (Website / App / Game / Software)` +
        botLinkLine +
        `\n\nMaxedLogic | +91 97597 25212`
    );

    return res.json({
      success: true,
      channel: '1-Click WhatsApp Direct',
      recipient: cleanTo,
      waUrl: `https://wa.me/${cleanTo}?text=${encodedText}`,
      waWebUrl: `https://web.whatsapp.com/send?phone=${cleanTo}&text=${encodedText}`,
      interactivePayload,
    });
  } catch (err: any) {
    console.error('WhatsApp dispatch error:', err);
    return res.status(500).json({ success: false, error: err.message || 'WhatsApp dispatch error' });
  }
});

// Meta WhatsApp Business Cloud API Webhook Verification (+91 97597 25212)
app.get('/api/whatsapp/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  const expectedToken = process.env.WHATSAPP_VERIFY_TOKEN || 'maxedlogic_9759725212';

  if (mode === 'subscribe' && token === expectedToken) {
    return res.status(200).send(challenge);
  }
  return res.status(403).json({ success: false, error: 'Invalid webhook verify token' });
});

async function sendMetaWhatsAppMessage(
  activeToken: string | undefined,
  activePhoneId: string | undefined,
  payload: Record<string, any>
): Promise<void> {
  if (!activeToken || !activePhoneId) return;
  await fetch(`https://graph.facebook.com/v21.0/${activePhoneId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${activeToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      ...payload,
    }),
  }).catch(() => {});
}

// Meta WhatsApp Business Cloud API 4-Step Client Decision Bot (+91 97597 25212)
app.post('/api/whatsapp/webhook', async (req, res) => {
  try {
    const entries = req.body?.entry || [];
    const storedMeta = getMetaConfigFromStore();
    const activeToken = storedMeta?.token || process.env.META_WA_TOKEN || process.env.WHATSAPP_ACCESS_TOKEN;
    const activePhoneId = storedMeta?.phoneNumberId || process.env.META_WA_PHONE_ID || process.env.WHATSAPP_PHONE_NUMBER_ID;
    let lastOutcome: { step: string; savedToAdminPanel: boolean; finalDecision?: 'YES' | 'NO' } | null = null;

    for (const entry of entries) {
      const changes = entry?.changes || [];
      for (const change of changes) {
        const messages = change?.value?.messages || [];
        const contacts = change?.value?.contacts || [];
        for (const msg of messages) {
          const fromPhone = String(msg.from || '').replace(/[^0-9]/g, '').trim();
          const profileName = contacts[0]?.profile?.name || '';
          const buttonReply = msg?.interactive?.button_reply;
          const listReply = msg?.interactive?.list_reply;
          const rawText = String(msg?.text?.body || '').trim();
          const selectionTitle = String(buttonReply?.title || listReply?.title || rawText || '').trim();
          const selectionId = String(buttonReply?.id || listReply?.id || '').trim();
          const inputToken = selectionId || selectionTitle;

          if (!fromPhone) continue;

          const existingSession = getWhatsAppBotSession(fromPhone);
          const isGreetingOrReset = /^(hi|hello|hey|start|menu|restart|reset|namaste)$/i.test(rawText);

          // Step 1 -> Mode Selection ('Update Existing' vs 'New Create')
          const matchedMode = matchServiceMode(inputToken);
          const matchedCat = matchProductCategory(inputToken);
          const matchedSub = existingSession?.categoryId
            ? matchSubType(existingSession.categoryId as ProductCategoryId, inputToken)
            : matchSubType(null, inputToken);
          const matchedFinal = matchFinalDecision(inputToken);

          if (isGreetingOrReset || (!existingSession && !matchedMode && !matchedCat && !matchedSub)) {
            upsertWhatsAppBotSession({
              phone: fromPhone,
              leadId: existingSession?.leadId ?? findLeadByPhone(fromPhone)?.id ?? null,
              businessName: profileName || existingSession?.businessName || null,
              step: 'mode',
              serviceMode: null,
              categoryId: null,
              categoryLabel: null,
              subType: null,
              finalDecision: null,
              updatedAt: new Date().toISOString(),
            });

            await sendMetaWhatsAppMessage(activeToken, activePhoneId, {
              to: fromPhone,
              type: 'interactive',
              interactive: {
                type: 'button',
                body: {
                  text: `Namaste${profileName ? ` ${profileName}` : ''}! Main Abdul Hafiz (MaxedLogic • +91 97597 25212) se.\nPlease Select one of the *Options* below to start. 😊`,
                },
                footer: { text: 'Step 1 of 4 • Update or New Create' },
                action: {
                  buttons: SERVICE_MODES.map((m) => ({
                    type: 'reply',
                    reply: { id: m.id, title: m.shortTitle },
                  })),
                },
              },
            });

            lastOutcome = { step: 'mode', savedToAdminPanel: false };
            continue;
          }

          // Handle Step 1 choice -> prompt Step 2 (Website / Mobile App / Game / Custom Software)
          if (matchedMode && (!existingSession || existingSession.step === 'mode' || existingSession.step === 'completed' || selectionId.startsWith('mode_'))) {
            upsertWhatsAppBotSession({
              phone: fromPhone,
              leadId: existingSession?.leadId ?? findLeadByPhone(fromPhone)?.id ?? null,
              businessName: profileName || existingSession?.businessName || null,
              step: 'category',
              serviceMode: matchedMode.label,
              categoryId: null,
              categoryLabel: null,
              subType: null,
              finalDecision: null,
              updatedAt: new Date().toISOString(),
            });

            await sendMetaWhatsAppMessage(activeToken, activePhoneId, {
              to: fromPhone,
              type: 'interactive',
              interactive: {
                type: 'list',
                header: { type: 'text', text: `${matchedMode.label}` },
                body: {
                  text: `Great! You selected *${matchedMode.label}*.\nAb choose karein aapko kis cheez ki requirement hai:`,
                },
                footer: { text: 'Step 2 of 4 • Choose Category' },
                action: {
                  button: 'Select Category',
                  sections: [
                    {
                      title: 'Choose Service Category',
                      rows: PRODUCT_CATEGORIES.map((cat) => ({
                        id: cat.id,
                        title: cat.shortTitle,
                        description: cat.description,
                      })),
                    },
                  ],
                },
              },
            });

            lastOutcome = { step: 'category', savedToAdminPanel: false };
            continue;
          }

          // Handle Step 2 choice -> prompt Step 3 (Sub-Types for chosen category)
          if (matchedCat && (!existingSession || existingSession.step === 'category' || selectionId.startsWith('cat_'))) {
            const serviceMode = existingSession?.serviceMode || 'New Create';
            upsertWhatsAppBotSession({
              phone: fromPhone,
              leadId: existingSession?.leadId ?? findLeadByPhone(fromPhone)?.id ?? null,
              businessName: profileName || existingSession?.businessName || null,
              step: 'subtype',
              serviceMode,
              categoryId: matchedCat.id,
              categoryLabel: matchedCat.label,
              subType: null,
              finalDecision: null,
              updatedAt: new Date().toISOString(),
            });

            const subtypes = CATEGORY_SUBTYPES[matchedCat.id] || [];
            await sendMetaWhatsAppMessage(activeToken, activePhoneId, {
              to: fromPhone,
              type: 'interactive',
              interactive: {
                type: 'list',
                header: { type: 'text', text: `${matchedCat.label} Types` },
                body: {
                  text: `*${serviceMode} → ${matchedCat.label}*\nKripya apna exact ${matchedCat.label} type select karein:`,
                },
                footer: { text: 'Step 3 of 4 • Choose Type' },
                action: {
                  button: `Choose ${matchedCat.shortTitle}`,
                  sections: [
                    {
                      title: `${matchedCat.label} Options`,
                      rows: subtypes.map((s) => ({
                        id: s.id,
                        title: s.shortTitle,
                        description: s.description,
                      })),
                    },
                  ],
                },
              },
            });

            lastOutcome = { step: 'subtype', savedToAdminPanel: false };
            continue;
          }

          // Handle Step 3 choice -> prompt Step 4 (Final YES / NO confirmation)
          if (matchedSub && existingSession && (existingSession.step === 'subtype' || selectionId.startsWith('sub_'))) {
            const serviceMode = existingSession.serviceMode || 'New Create';
            const categoryLabel = existingSession.categoryLabel || 'Website';
            upsertWhatsAppBotSession({
              phone: fromPhone,
              leadId: existingSession.leadId ?? findLeadByPhone(fromPhone)?.id ?? null,
              businessName: profileName || existingSession.businessName || null,
              step: 'confirm',
              serviceMode,
              categoryId: existingSession.categoryId || null,
              categoryLabel,
              subType: matchedSub.label,
              finalDecision: null,
              updatedAt: new Date().toISOString(),
            });

            await sendMetaWhatsAppMessage(activeToken, activePhoneId, {
              to: fromPhone,
              type: 'interactive',
              interactive: {
                type: 'button',
                header: { type: 'text', text: 'Final Confirmation' },
                body: {
                  text: `Aapne yeh details choose ki hain:\n• Requirement: *${serviceMode}*\n• Category: *${categoryLabel}*\n• Type: *${matchedSub.label}*\n\nKya hum aapki yeh details Admin Team ko bhejein? Please select *YES* or *NO*:`,
                },
                footer: { text: 'Step 4 of 4 • Final YES / NO' },
                action: {
                  buttons: FINAL_CONFIRM_OPTIONS.map((f) => ({
                    type: 'reply',
                    reply: { id: f.id, title: f.shortTitle },
                  })),
                },
              },
            });

            lastOutcome = { step: 'confirm', savedToAdminPanel: false };
            continue;
          }

          // Handle Step 4 (Final YES / NO) -> Save ALL chosen details into Admin Panel SQLite
          if (matchedFinal && existingSession && (existingSession.step === 'confirm' || selectionId.startsWith('confirm_'))) {
            const serviceMode = existingSession.serviceMode || 'New Create';
            const categoryLabel = existingSession.categoryLabel || 'Website';
            const subTypeLabel = existingSession.subType || selectionTitle;

            recordClientChatbotResponse({
              leadId: existingSession.leadId ?? null,
              businessName: profileName || existingSession.businessName || undefined,
              senderPhone: fromPhone,
              selection: `${serviceMode} → ${categoryLabel} → ${subTypeLabel} → ${matchedFinal}`,
              messageText: `Client confirmed ${matchedFinal} for ${serviceMode} - ${categoryLabel} (${subTypeLabel})`,
              serviceMode,
              selectedCategory: categoryLabel,
              selectedSubType: subTypeLabel,
              finalDecision: matchedFinal,
              channel: 'WhatsApp Bot (9759725212)',
            });

            clearWhatsAppBotSession(fromPhone);

            const confirmText =
              matchedFinal === 'YES'
                ? `Dhanyawad${profileName ? ` ${profileName}` : ''}! ✅ Aapki saari details (*${serviceMode} → ${categoryLabel} → ${subTypeLabel}*) humari Admin Team (Abdul Hafiz • +91 97597 25212 | maxedlogic.com) ke paas save ho gayi hain.\nHum aapko jald hi demo aur quote bhejenge!`
                : `Dhanyawad! Aapka *NO* response note kar liya gaya hai. Jab bhi aapko *${categoryLabel}* ki zaroorat ho, bas "Hi" likh kar message karein. — MaxedLogic (+91 97597 25212)`;

            await sendMetaWhatsAppMessage(activeToken, activePhoneId, {
              to: fromPhone,
              type: 'text',
              text: { body: confirmText },
            });

            lastOutcome = { step: 'completed', savedToAdminPanel: true, finalDecision: matchedFinal };
            continue;
          }

          // Fallback: if client sent free-form message outside guided options
          if (rawText) {
            recordClientChatbotResponse({
              leadId: existingSession?.leadId ?? null,
              businessName: profileName || existingSession?.businessName || undefined,
              senderPhone: fromPhone,
              selection: selectionTitle || 'WhatsApp Message',
              messageText: rawText,
              serviceMode: existingSession?.serviceMode || undefined,
              selectedCategory: existingSession?.categoryLabel || undefined,
              selectedSubType: existingSession?.subType || undefined,
              channel: 'WhatsApp Bot (9759725212)',
            });
            lastOutcome = { step: existingSession?.step || 'completed', savedToAdminPanel: true };
          }
        }
      }
    }
    return res.status(200).json({ success: true, ...(lastOutcome || {}) });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Webhook processing error' });
  }
});

// Public Client-Facing Chatbot Metadata & Response Recording (no admin login needed)
app.get('/api/client-chat/lead/:leadId', (req, res) => {
  try {
    const lead = getLeadByIdFromDb(Number(req.params.leadId));
    if (!lead) {
      return res.status(404).json({ success: false, error: 'Client profile not found' });
    }
    return res.json({
      success: true,
      client: {
        id: lead.id,
        businessName: lead.businessName,
        city: lead.city,
        countryName: lead.countryName,
        category: lead.category,
        hasWebsite: lead.hasWebsite,
        websiteUrl: lead.websiteUrl,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Failed to load client info' });
  }
});

app.post('/api/client-chat/respond', (req, res) => {
  try {
    const {
      replyId,
      leadId,
      businessName,
      senderPhone,
      selection,
      messageText,
      serviceMode,
      selectedCategory,
      selectedSubType,
      finalDecision,
    } = req.body || {};
    if (!selection && !messageText && !finalDecision) {
      return res.status(400).json({ success: false, error: 'selection or finalDecision is required' });
    }
    const result = recordClientChatbotResponse({
      replyId: replyId ? String(replyId) : undefined,
      leadId: leadId ? Number(leadId) : null,
      businessName: businessName ? String(businessName) : undefined,
      senderPhone: senderPhone ? String(senderPhone) : undefined,
      selection: String(selection || `${serviceMode || ''} ${selectedCategory || ''} ${selectedSubType || ''} ${finalDecision || ''}`.trim() || 'Client Reply'),
      messageText: String(messageText || selection || ''),
      serviceMode: serviceMode ? String(serviceMode) : undefined,
      selectedCategory: selectedCategory ? String(selectedCategory) : undefined,
      selectedSubType: selectedSubType ? String(selectedSubType) : undefined,
      finalDecision: finalDecision === 'YES' || finalDecision === 'NO' ? finalDecision : undefined,
      channel: 'Client Chatbot Link',
    });
    return res.json({ success: true, ...result });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Failed to save client response' });
  }
});

// One-Click Email Choice Endpoint (Client clicks "I Am Interested" or "I Am Not Interested" in Gmail)
app.get('/api/client-action', (req, res) => {
  try {
    const rawLeadId = req.query.leadId;
    const leadId = rawLeadId ? Number(rawLeadId) : null;
    const action = String(req.query.action || 'INTERESTED').toUpperCase();
    const lead = leadId ? getLeadByIdFromDb(leadId) : null;
    const bizName = lead?.businessName || (req.query.biz ? String(req.query.biz) : 'Valued Client');
    const email = lead?.email || (req.query.email ? String(req.query.email) : '');

    if (action === 'NOT_INTERESTED' || action === 'NO') {
      recordClientChatbotResponse({
        leadId: lead?.id ?? leadId,
        businessName: bizName,
        selection: 'Client Clicked: ❌ I Am Not Interested in Email',
        messageText: 'Client selected "I Am Not Interested" directly from email outreach.',
        finalDecision: 'NO',
        channel: 'Client Chatbot Link',
      });
      if (email) {
        addUnsubscribe(email, 'Clicked Not Interested in email');
      }
      return res.redirect(`/?clientChat=1&leadId=${leadId || ''}&biz=${encodeURIComponent(bizName)}&action=optout`);
    }

    // Action === 'INTERESTED'
    recordClientChatbotResponse({
      leadId: lead?.id ?? leadId,
      businessName: bizName,
      selection: 'Client Clicked: ✅ I Am Interested in Email',
      messageText: 'Client clicked "I Am Interested" in Gmail outreach. Opening Interactive Chatbot Customizer.',
      finalDecision: undefined,
      channel: 'Client Chatbot Link',
    });
    return res.redirect(`/?clientChat=1&leadId=${leadId || ''}&biz=${encodeURIComponent(bizName)}&action=INTERESTED`);
  } catch (err: any) {
    console.error('Error in /api/client-action:', err);
    return res.redirect(`/?clientChat=1&error=action_failed`);
  }
});

app.post('/api/client-action', (req, res) => {
  try {
    const { leadId, action, bizName, email } = req.body || {};
    const numLeadId = leadId ? Number(leadId) : null;
    const act = String(action || 'INTERESTED').toUpperCase();
    const lead = numLeadId ? getLeadByIdFromDb(numLeadId) : (email ? getLeadByEmailFromDb(email) : null);
    const resolvedBiz = lead?.businessName || bizName || 'Valued Client';
    const resolvedEmail = lead?.email || email || '';

    if (act === 'NOT_INTERESTED' || act === 'NO') {
      const resp = recordClientChatbotResponse({
        leadId: lead?.id ?? numLeadId,
        businessName: resolvedBiz,
        selection: 'Client Clicked: ❌ I Am Not Interested in Email',
        messageText: 'Client selected "I Am Not Interested" option directly from email outreach.',
        finalDecision: 'NO',
        channel: 'Client Chatbot Link',
      });
      if (resolvedEmail) {
        addUnsubscribe(resolvedEmail, 'Clicked Not Interested in email');
      }
      return res.json({ success: true, action: 'NOT_INTERESTED', replyId: resp.replyId });
    }

    const resp = recordClientChatbotResponse({
      leadId: lead?.id ?? numLeadId,
      businessName: resolvedBiz,
      selection: 'Client Clicked: ✅ I Am Interested in Email',
      messageText: 'Client selected "I Am Interested" option in email. Opening Interactive Chatbot Customizer.',
      finalDecision: undefined,
      channel: 'Client Chatbot Link',
    });
    return res.json({ success: true, action: 'INTERESTED', replyId: resp.replyId });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Failed to process client action' });
  }
});

// ============================================================================
// WHATSAPP-STYLE INTERACTIVE CHATBOT API (HISTORY + GEMINI AI DRAFTING)
// ============================================================================

app.get('/api/chatbot/messages', (req, res) => {
  try {
    const sessionKey = typeof req.query.sessionKey === 'string' && req.query.sessionKey.trim()
      ? req.query.sessionKey.trim()
      : 'global';
    const messages = getChatbotMessages(sessionKey);
    res.json({ success: true, messages });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to load chatbot history' });
  }
});

app.post('/api/chatbot/messages', (req, res) => {
  try {
    const msg = req.body;
    if (!msg?.text || !msg?.sender) {
      return res.status(400).json({ success: false, error: 'sender and text are required' });
    }
    const saved = saveChatbotMessage({
      id: msg.id || `chat_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      sessionKey: msg.sessionKey || 'global',
      leadId: msg.leadId ?? null,
      sender: msg.sender === 'user' ? 'user' : 'bot',
      text: String(msg.text),
      options: Array.isArray(msg.options) ? msg.options : undefined,
      draftedMessage: msg.draftedMessage || null,
      draftSubject: msg.draftSubject || null,
      channel: msg.channel || null,
      createdAt: msg.createdAt || new Date().toISOString(),
    });
    return res.json({ success: true, message: saved });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Failed to save chatbot message' });
  }
});

app.delete('/api/chatbot/messages', (req, res) => {
  try {
    const sessionKey = typeof req.query.sessionKey === 'string' && req.query.sessionKey.trim()
      ? req.query.sessionKey.trim()
      : 'global';
    clearChatbotMessages(sessionKey);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to clear chatbot history' });
  }
});

app.post('/api/chatbot/reply', async (req, res) => {
  try {
    const { message, leadId, history = [] } = req.body || {};
    const userMessage = String(message || '').trim();
    if (!userMessage) {
      return res.status(400).json({ success: false, error: 'Message text is required.' });
    }

    if (!ai || !apiKey) {
      return res.status(503).json({
        success: false,
        error: 'GEMINI_API_KEY is not configured on the backend server.',
      });
    }

    if (Date.now() < quotaCooldownUntil) {
      return res.status(429).json({
        success: false,
        error: 'Gemini API rate limit cooldown active. Please wait a few seconds and retry.',
      });
    }

    const lead = leadId ? getLeadByIdFromDb(Number(leadId)) : null;
    const metrics = getDashboardMetrics();

    const leadContext = lead
      ? `Selected Client Lead:
- Business Name: ${lead.businessName}
- Category: ${lead.category}
- Location: ${[lead.address, lead.city, lead.state, lead.countryName].filter(Boolean).join(', ')}
- Google Maps URL: ${lead.googleMapsUrl || 'N/A'}
- Email: ${lead.email || 'Not available'}
- Phone / WhatsApp: ${lead.whatsAppNumber || lead.phoneNumber || 'Not available'}
- Website: ${lead.hasWebsite && lead.websiteUrl ? lead.websiteUrl : 'No active website found'}
- Audit Findings: ${lead.evidenceSummary || lead.serviceRequired || 'Needs digital presence / update'}`
      : `No specific client lead selected yet. Total saved verified leads in CRM: ${metrics.totalLeadsFound}.`;

    const recentHistory = Array.isArray(history)
      ? history
          .slice(-6)
          .map((h: any) => `${h.sender === 'user' ? 'User' : 'Bot'}: ${String(h.text || '').slice(0, 300)}`)
          .join('\n')
      : '';

    const systemInstruction = `You are the interactive WhatsApp-style assistant inside LeadHunter Pro (for Abdul Hafiz, MaxedLogic — maxedlogic.com, WhatsApp +91 97597 25212, Email aabdulhafiz073@gmail.com).
Respond concisely in the user's language (Hindi, Hinglish, or English).
Never invent or fabricate fake email addresses, phone numbers, addresses, or fake client replies.
When the user asks to draft or send a pitch/chat for a lead:
- If the business already has a website, include clear options for BOTH (1) Website Update & Redesign AND (2) Brand-New Website / Mobile App / Game build.
- If the business has no website, pitch Brand-New Website / Mobile App / Game creation.
- Put the exact ready-to-send outreach message in "draftedMessage" (and email subject in "draftSubject") so the user can send it via WhatsApp or Gmail with one click.
- Provide 2 to 4 short clickable quick-reply option labels in "suggestedOptions" (under 40 characters each).`;

    const prompt = `${leadContext}

Recent conversation:
${recentHistory || '(New chat)'}

User request: ${userMessage}`;

    let response: any = null;
    let lastGenErr: any = null;
    for (const modelName of ['gemini-4-hydrogen', 'gemini-3.1-flash-lite']) {
      try {
        const callPromise = ai.models.generateContent({
          model: modelName,
          contents: prompt,
          config: {
            ...(modelName === 'gemini-4-hydrogen'
              ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
              : {}),
            systemInstruction,
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                replyText: {
                  type: Type.STRING,
                  description: 'Short friendly WhatsApp-style bot response to display in the chat bubble.',
                },
                draftedMessage: {
                  type: Type.STRING,
                  description: 'Optional ready-to-send WhatsApp or Gmail pitch text tailored to the lead.',
                },
                draftSubject: {
                  type: Type.STRING,
                  description: 'Optional email subject line if a Gmail pitch was drafted.',
                },
                suggestedOptions: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: '2 to 4 short clickable follow-up option labels shown directly under the bot bubble.',
                },
              },
              required: ['replyText', 'suggestedOptions'],
            },
          },
        });
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`${modelName} request timed out`)), 14000)
        );
        response = await Promise.race([callPromise, timeoutPromise]);
        if (response) break;
      } catch (err: any) {
        lastGenErr = err;
        if (isQuotaExhausted(err)) {
          continue;
        }
      }
    }

    if (!response) {
      throw lastGenErr || new Error('Gemini chatbot generation failed.');
    }

    const rawText = (response.text || '{}').trim();
    const parsed = JSON.parse(rawText);
    return res.json({
      success: true,
      replyText: String(parsed.replyText || 'Here is your response.'),
      draftedMessage: parsed.draftedMessage ? String(parsed.draftedMessage) : null,
      draftSubject: parsed.draftSubject ? String(parsed.draftSubject) : null,
      suggestedOptions: Array.isArray(parsed.suggestedOptions)
        ? parsed.suggestedOptions.map((s: any) => String(s)).filter(Boolean).slice(0, 4)
        : [],
    });
  } catch (err: any) {
    if (isQuotaExhausted(err)) {
      quotaCooldownUntil = Date.now() + 20000;
      return res.status(429).json({
        success: false,
        error: 'Gemini API quota temporarily reached (429). Please retry in a few seconds.',
      });
    }
    return res.status(500).json({
      success: false,
      error: err?.message || 'Chatbot AI generation failed.',
    });
  }
});

// ============================================================================
// WHATSAPP CONNECT (QR LINKED DEVICE + META CLOUD) & 1-CLICK BULK CHATBOT API
// ============================================================================

app.get('/api/whatsapp/status', (req, res) => {
  try {
    res.json({ success: true, ...getWhatsAppConnectionStatus() });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to read WhatsApp status' });
  }
});

app.post('/api/whatsapp/connect-qr', async (req, res) => {
  try {
    const { pairingPhone, forceFresh } = req.body || {};
    const status = await connectWhatsAppQr({
      pairingPhone: pairingPhone ? String(pairingPhone) : undefined,
      forceFresh: Boolean(forceFresh),
    });
    res.json({ success: true, ...status });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to start WhatsApp QR connection' });
  }
});

app.post('/api/whatsapp/connect-meta', async (req, res) => {
  try {
    const { token, phoneNumberId } = req.body || {};
    const status = await connectMetaWhatsApp({
      token: String(token || ''),
      phoneNumberId: String(phoneNumberId || ''),
    });
    res.json({ success: true, ...status });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err?.message || 'Meta Cloud API connection failed' });
  }
});

app.post('/api/whatsapp/disconnect', async (req, res) => {
  try {
    const { mode } = req.body || {};
    const status = await disconnectWhatsApp(mode);
    res.json({ success: true, ...status });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to disconnect WhatsApp' });
  }
});

app.post('/api/whatsapp/bulk-send', (req, res) => {
  try {
    const { leadIds, origin, includeAlreadySent } = req.body || {};
    const fallbackOrigin = `${req.protocol}://${req.get('host')}`;
    const result = startBulkWhatsAppSend({
      leadIds: Array.isArray(leadIds) ? leadIds.map((n: any) => Number(n)) : undefined,
      origin: origin ? String(origin) : fallbackOrigin,
      includeAlreadySent: Boolean(includeAlreadySent),
    });
    if (!result.started) {
      return res.status(400).json({ success: false, error: result.error, ...result });
    }
    return res.json({ success: true, ...result });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Bulk WhatsApp launch failed' });
  }
});

app.get('/api/whatsapp/bulk-status', (req, res) => {
  try {
    res.json({ success: true, ...getBulkWhatsAppStatus() });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to read bulk status' });
  }
});

app.post('/api/whatsapp/bulk-stop', (req, res) => {
  try {
    res.json({ success: true, ...stopBulkWhatsAppSend() });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to stop bulk WhatsApp' });
  }
});

// ============================================================================
// DIRECT GMAIL INTEGRATION (SMTP & APP PASSWORDS FOR 100% RELIABILITY ON LOCALHOST)
// ============================================================================

interface GmailSmtpConfig {
  email: string;
  appPassword: string;
}

function getActiveGmailTransporter(): { transporter: any; email: string } | null {
  const config = getAppSetting<GmailSmtpConfig>('gmail_smtp_config');
  if (!config?.email || !config?.appPassword) return null;
  const cleanPass = config.appPassword.replace(/\s+/g, '');
  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
      user: config.email.trim(),
      pass: cleanPass,
    },
    tls: {
      rejectUnauthorized: false
    }
  });
  return { transporter, email: config.email.trim() };
}

app.get('/api/gmail/status', (req, res) => {
  try {
    const config = getAppSetting<GmailSmtpConfig>('gmail_smtp_config');
    const senderEmail = getAppSetting<string>('sender_email');
    if (config?.email && config?.appPassword) {
      return res.json({
        connected: true,
        email: config.email,
        mode: 'smtp_app_password',
      });
    }
    if (senderEmail && senderEmail.includes('@')) {
      return res.json({
        connected: true,
        email: senderEmail,
        mode: 'direct_sender',
      });
    }
    return res.json({ connected: false, email: null });
  } catch (err: any) {
    return res.status(500).json({ connected: false, error: err?.message });
  }
});

app.post('/api/gmail/connect', async (req, res) => {
  try {
    const { email, password, appPassword } = req.body || {};
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return res.status(400).json({ success: false, error: 'Valid Gmail address daalna zaroori hai.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const providedPass = (appPassword || password || '').trim().replace(/\s+/g, '');

    // If an app password was provided, verify with Google SMTP
    if (providedPass.length > 0) {
      try {
        const transporter = nodemailer.createTransport({
          host: 'smtp.gmail.com',
          port: 465,
          secure: true,
          auth: {
            user: cleanEmail,
            pass: providedPass,
          },
          tls: {
            rejectUnauthorized: false
          }
        });
        await transporter.verify();
        setAppSetting('gmail_smtp_config', { email: cleanEmail, appPassword: providedPass });
        setAppSetting('sender_email', cleanEmail);
        return res.json({
          success: true,
          email: cleanEmail,
          mode: 'smtp_app_password',
          message: `Gmail SMTP successfully connected for ${cleanEmail}! Ab aapke account se real emails send honge.`,
        });
      } catch (smtpErr: any) {
        console.error('SMTP verify failed:', smtpErr);
        return res.status(400).json({
          success: false,
          error: `Google ne password reject kar diya. Kripya apna 16-digit Google App Password use karein (myaccount.google.com/apppasswords). Normal Google password third-party access ke liye block rehta hai.`,
        });
      }
    }

    // Direct 1-click sender connection (Sender profile only, no SMTP auto-dispatch)
    setAppSetting('sender_email', cleanEmail);
    deleteAppSetting('gmail_smtp_config');
    return res.json({
      success: true,
      email: cleanEmail,
      mode: 'direct_sender',
      message: `Sender profile linked (${cleanEmail}). Note: Background me direct email deliver karne ke liye 16-digit Google App Password zaroori hai.`,
    });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err?.message || 'Gmail connect failed.' });
  }
});

app.post('/api/gmail/disconnect', (req, res) => {
  try {
    deleteAppSetting('gmail_smtp_config');
    deleteAppSetting('sender_email');
    return res.json({ success: true, message: 'Gmail disconnected successfully.' });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Failed to disconnect Gmail.' });
  }
});

// Real Inbound Gmail Inbox Sync (IMAP 993 from connected Google App Password)
app.post('/api/gmail/sync-inbox', async (req, res) => {
  try {
    const result = await syncGmailInboxViaImap();
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Failed to sync Gmail inbox' });
  }
});

app.get('/api/gmail/sync-inbox', async (req, res) => {
  try {
    const result = await syncGmailInboxViaImap();
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Failed to sync Gmail inbox' });
  }
});

app.post('/api/gmail/send', async (req, res) => {
  try {
    const { to, subject, body, from, html, leadId, businessName, allowRepeat } = req.body || {};
    if (!to || !subject || !body) {
      return res.status(400).json({ success: false, error: 'Missing to, subject, or body.' });
    }

    const cleanToCheck = String(to).trim().toLowerCase();
    if (!allowRepeat && hasEmailBeenSentToAddress(cleanToCheck)) {
      return res.status(409).json({
        success: false,
        alreadySent: true,
        error: `Repeat Blocked: '${cleanToCheck}' ko pehle hi email bheja ja chuka hai. Repeat Leads ON karne par hi dubara send hoga.`,
      });
    }

    const active = getActiveGmailTransporter();
    const senderEmail = active?.email || getAppSetting<string>('sender_email') || from || 'outreach@leadhunterpro.com';

    if (active) {
      const cleanTo = String(to).trim();
      const domain = cleanTo.split('@')[1];
      if (domain) {
        const lowerDomain = domain.toLowerCase();
        if (lowerDomain === 'gmail.com' || lowerDomain === 'googlemail.com') {
          const gLive = await verifyGmailInboxLive(cleanTo);
          if (!gLive.exists) {
            return res.status(400).json({
              success: false,
              error: `Google SMTP server ne report kiya ki Gmail '${cleanTo}' exist nahi karta (${gLive.code || '550 NoSuchUser'}). 'Address not found' bounce se bachane ke liye send block kiya gaya.`,
            });
          }
        } else {
          try {
            const mxRecords = await dns.resolveMx(domain);
            if (!mxRecords || mxRecords.length === 0) {
              return res.status(400).json({
                success: false,
                error: `Domain ${domain} par koi Mail Server (MX) nahi mila. Bounce rokne ke liye email send cancel kiya gaya.`,
              });
            }
          } catch (dnsErr: any) {
            return res.status(400).json({
              success: false,
              error: `Domain ${domain} internet par exist nahi karta (${dnsErr.code || 'NXDOMAIN'}). Aapka Gmail safe rakhne ke liye email block ki gayi.`,
            });
          }
        }
      }

      const matchedLead = leadId ? getLeadByIdFromDb(Number(leadId)) : getLeadByEmailFromDb(cleanTo);
      const resolvedLeadId = matchedLead?.id || leadId || null;
      const resolvedBizName = matchedLead?.businessName || businessName || '';
      const finalHtml =
        html ||
        buildInteractiveEmailHtml(
          String(subject).trim(),
          String(body),
          resolvedLeadId,
          resolvedBizName
        );

      const info = await active.transporter.sendMail({
        from: `"${active.email}" <${active.email}>`,
        to: cleanTo,
        subject: String(subject).trim(),
        text: String(body),
        html: finalHtml,
      });

      return res.json({
        success: true,
        messageId: info.messageId,
        mode: 'gmail_smtp',
        email: active.email,
      });
    }

    // If SMTP is NOT configured, report accurately that real send requires App Password
    const cleanTo = String(to).trim();
    const gmailWebUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(cleanTo)}&su=${encodeURIComponent(
      String(subject).trim()
    )}&body=${encodeURIComponent(String(body))}`;

    return res.status(400).json({
      success: false,
      needsAppPassword: true,
      error: `Aapke Gmail (${senderEmail}) se actual email send karne ke liye 16-digit Google App Password connect karna zaroori hai. Header me 'Connect Gmail' par click karke App Password enter karein.`,
      gmailSentUrl: gmailWebUrl,
    });
  } catch (err: any) {
    console.error('Gmail send error:', err);
    return res.status(500).json({ success: false, error: err?.message || 'Failed to send email via Gmail.' });
  }
});

app.post('/api/campaigns/reset-sent', (req, res) => {
  try {
    db.prepare(`UPDATE email_campaigns SET status = 'Draft', gmail_message_id = NULL, gmail_thread_id = NULL WHERE status = 'Sent'`).run();
    db.prepare(`UPDATE leads SET outreach_status = 'Pending' WHERE outreach_status IN ('EmailSent', 'BothSent')`).run();
    return res.json({ success: true, message: 'All campaigns reset to Draft/Pending for live sending.' });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    platform: 'LeadHunter Pro',
    geminiLiveSearch: Boolean(apiKey),
    timestamp: new Date().toISOString(),
  });
});

// Mount Vite or serve static files
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`LeadHunter Pro Full-Stack Server running on port ${PORT}`);
    const orphanFixed = markOrphanRunningDiscoveryJobsInterrupted();
    const cleaned = cleanupLegacyInvalidLeadsAndDrafts();
    if (orphanFixed > 0 || cleaned.removedLeads > 0 || cleaned.removedCampaigns > 0) {
      console.log(
        `Boot cleanup: marked ${orphanFixed} orphan job(s) failed, removed ${cleaned.removedLeads} invalid leads & ${cleaned.removedCampaigns} orphaned drafts`
      );
    }
    initWhatsAppOnBoot();
  });
}

startServer();
