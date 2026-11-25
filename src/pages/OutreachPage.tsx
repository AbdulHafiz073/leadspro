import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Send,
  Mail,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  ShieldCheck,
  Eye,
  Ban,
  Users,
  Sparkles,
  MapPin,
  Play,
  Pause,
  Square,
  Zap,
  MessageSquare,
  ExternalLink,
} from 'lucide-react';
import { useLeads } from '../context/LeadContext';
import { EmailCampaignItem, Lead } from '../types';
import {
  fetchDbLeads,
  fetchEmailCampaigns,
  prepareEmailCampaign,
  approveEmailCampaign,
  rejectEmailCampaign,
  recordCampaignSend,
  unsubscribeEmail,
  startDiscoveryJob,
  pollDiscoveryJob,
} from '../services/googleLeadsApi';
import { sendEmailViaGmailApi, GMAIL_SENT_FOLDER_URL, isValidSendTargetEmail } from '../services/gmailApiService';
import {
  getAccessToken,
  getConnectedGoogleEmail,
  googleSignIn,
  initAuth,
  subscribeGoogleAuth,
  getLastAuthIssue,
} from '../services/googleWorkspaceAuth';
import { GoogleConnectButton } from '../components/GoogleConnectButton';
import { WhatsAppConnectButton } from '../components/WhatsAppConnectButton';
import { WhatsAppBulkSendModal } from '../components/WhatsAppBulkSendModal';
import { hasAvailableWhatsAppNumber } from '../services/whatsappConnectService';
import { getConfiguredSenderEmail, getConfiguredSenderPhone } from '../utils/maxedLogicPitches';
import { WEBSITE_CATEGORIES, APP_CATEGORIES, GAME_CATEGORIES } from '../data/categoriesAndLocations';
import { Modal } from '../components/ModalAndToast';

const ALL_BUSINESS_CATEGORIES: string[] = [
  ...WEBSITE_CATEGORIES,
  ...APP_CATEGORIES,
  ...GAME_CATEGORIES,
];

interface OutreachPageProps {
  onNavigateToLeads: () => void;
  onNavigateToSentEmails?: () => void;
  onShowToast: (title: string, message: string, type: 'success' | 'error' | 'info') => void;
}

export const OutreachPage: React.FC<OutreachPageProps> = ({
  onNavigateToLeads,
  onNavigateToSentEmails,
  onShowToast,
}) => {
  const { selectedLeads, leads: allDbLeads, discoveryHistory, refreshLeadsFromDb } = useLeads();

  const [campaignItems, setCampaignItems] = useState<EmailCampaignItem[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [editSubject, setEditSubject] = useState<string>('');
  const [editBody, setEditBody] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSending, setIsSending] = useState<boolean>(false);
  const [isPreparing, setIsPreparing] = useState<boolean>(false);

  const [failedItems, setFailedItems] = useState<EmailCampaignItem[]>([]);
  const [connectedEmail, setConnectedEmail] = useState<string | null>(() => getConnectedGoogleEmail());
  const [hasToken, setHasToken] = useState<boolean>(false);
  const [isWhatsAppBulkOpen, setIsWhatsAppBulkOpen] = useState<boolean>(false);
  const [sendProgress, setSendProgress] = useState<{
    current: number;
    total: number;
    currentEmail: string;
    sent: number;
    failed: number;
  } | null>(null);

  // Continuous Auto-Pilot Settings & State
  const latestRun = discoveryHistory[0];
  const [autoCountry, setAutoCountry] = useState<string>(() => latestRun?.country || 'United States');
  const [autoCity, setAutoCity] = useState<string>(() => latestRun?.city || 'New York');
  const [autoCategory, setAutoCategory] = useState<string>(
    () => latestRun?.categories?.[0] || 'Business Websites'
  );
  const [autoBatchSize, setAutoBatchSize] = useState<number>(15);

  useEffect(() => {
    if (latestRun) {
      if (latestRun.country) setAutoCountry(latestRun.country);
      if (latestRun.city) setAutoCity(latestRun.city);
      if (latestRun.categories?.[0]) setAutoCategory(latestRun.categories[0]);
    }
  }, [latestRun?.jobId]);

  const [autoPilotState, setAutoPilotState] = useState<{
    running: boolean;
    paused: boolean;
    phase: string;
    currentEmail: string;
    currentBusiness: string;
    totalSent: number;
    totalFailed: number;
    cyclesCompleted: number;
    leadsDiscovered: number;
    logs: string[];
  }>({
    running: false,
    paused: false,
    phase: 'Idle',
    currentEmail: '',
    currentBusiness: '',
    totalSent: 0,
    totalFailed: 0,
    cyclesCompleted: 0,
    leadsDiscovered: 0,
    logs: [],
  });

  const autoControlRef = useRef<{ stop: boolean; paused: boolean }>({ stop: false, paused: false });

  useEffect(() => {
    return () => {
      autoControlRef.current.stop = true;
    };
  }, []);

  // Explicit Confirmation Modals (Required by workspace-integration & Gmail rules)
  const [sendModeConfirm, setSendModeConfirm] = useState<{
    open: boolean;
    mode: 'manual' | 'authorized_batch' | 'autopilot_loop';
    targets: EmailCampaignItem[];
  }>({ open: false, mode: 'manual', targets: [] });

  const loadCampaigns = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetchEmailCampaigns('all');
      if (res.success && Array.isArray(res.items)) {
        const queue = res.items.filter((i) => i.status === 'PendingApproval' || i.status === 'Approved');
        const failed = res.items.filter((i) => i.status === 'Failed');
        setCampaignItems(queue);
        setFailedItems(failed);
        if (queue.length > 0 && !selectedItemId) {
          setSelectedItemId(queue[0].id);
          setEditSubject(queue[0].subject);
          setEditBody(queue[0].body);
        }
      }
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  }, [selectedItemId]);

  useEffect(() => {
    loadCampaigns();
    const unsubInit = initAuth();
    const unsubStore = subscribeGoogleAuth((connected, email) => {
      setHasToken(connected);
      setConnectedEmail(email);
    });
    return () => {
      unsubStore();
      unsubInit();
    };
  }, [loadCampaigns]);

  const activeItem = campaignItems.find((i) => i.id === selectedItemId) || campaignItems[0] || null;

  const getLeadLocationDetails = (item: EmailCampaignItem) => {
    const matched = allDbLeads.find((l) => l.id === item.leadId);
    const addr = item.address || matched?.address || '';
    const city = item.city || matched?.city || '';
    const state = matched?.state || '';
    const country = item.countryName || matched?.countryName || '';
    const fullText = [addr, city, state, country].filter(Boolean).join(', ');
    const mapsUrl =
      matched?.googleMapsUrl ||
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        [item.businessName, addr, city, country].filter(Boolean).join(' ')
      )}`;
    return { addr, city, state, country, fullText, mapsUrl };
  };

  const handleSelectItem = (item: EmailCampaignItem) => {
    setSelectedItemId(item.id);
    setEditSubject(item.subject);
    setEditBody(item.body);
  };

  const [allowRepeatLeads, setAllowRepeatLeads] = useState(false);

  const filterUnsentLeads = (pool: Lead[]) =>
    pool.filter((l) => {
      if (!l.email || !isValidSendTargetEmail(l.email)) return false;
      if (l.outreachStatus === 'Unsubscribed' || l.outreachStatus === 'EmailError') return false;
      if (!allowRepeatLeads) {
        if (
          l.outreachStatus === 'EmailSent' ||
          l.outreachStatus === 'BothSent' ||
          l.outreachStatus === 'Replied'
        ) {
          return false;
        }
      }
      return true;
    });

  const unsentVerifiedLeads = filterUnsentLeads(allDbLeads);

  const handlePrepareFromSelection = async () => {
    const pool = selectedLeads.length > 0 ? selectedLeads : unsentVerifiedLeads;

    if (pool.length === 0) {
      onShowToast('No Verified Leads Available', 'Discover or select verified leads with emails first.', 'error');
      return;
    }

    setIsPreparing(true);
    try {
      const res = await prepareEmailCampaign({
        leadIds: pool.map((l) => l.id),
        senderEmail: connectedEmail || getConfiguredSenderEmail(),
        senderPhone: getConfiguredSenderPhone(),
      });
      await loadCampaigns();
      onShowToast(
        'Personalized Previews Generated',
        `Prepared ${res.prepared.length} email previews (${res.skipped.length} skipped due to unsubscribe/duplicate/missing email).`,
        'success'
      );
    } catch (err: any) {
      onShowToast('Prepare Failed', err?.message || 'Error generating previews', 'error');
    } finally {
      setIsPreparing(false);
    }
  };

  const handleApproveAllPending = async () => {
    const pending = campaignItems.filter((c) => c.status === 'PendingApproval');
    if (pending.length === 0) return;
    try {
      await approveEmailCampaign({
        ids: pending.map((p) => p.id),
        autoSendAuthorized: true,
      });
      await loadCampaigns();
      onShowToast('All Previews Approved', `Approved ${pending.length} email drafts for batch Gmail sending.`, 'success');
    } catch (err: any) {
      onShowToast('Approve All Failed', err?.message || 'Could not approve queue.', 'error');
    }
  };

  // Single button: Connects Gmail if needed, prepares ALL unsent verified leads, bulk-approves them, and opens confirm-to-send modal
  const handleOneClickSendAll = async () => {
    let activeToken = await getAccessToken();
    let senderEmailToUse = connectedEmail || getConnectedGoogleEmail();

    if (!activeToken) {
      try {
        const signInRes = await googleSignIn();
        if (signInRes?.accessToken) {
          activeToken = signInRes.accessToken;
          senderEmailToUse = signInRes.user.email || senderEmailToUse;
          setHasToken(true);
          setConnectedEmail(senderEmailToUse || null);
        }
      } catch (authErr: any) {
        onShowToast('Gmail OAuth Required', authErr?.message || 'Pehle Gmail connect karein.', 'error');
        return;
      }
    }

    if (!activeToken) {
      onShowToast('Gmail OAuth Required', 'Google Login se apna Gmail connect karein.', 'error');
      return;
    }

    setIsPreparing(true);
    try {
      if (unsentVerifiedLeads.length > 0 && campaignItems.length === 0) {
        await prepareEmailCampaign({
          leadIds: unsentVerifiedLeads.map((l) => l.id),
          senderEmail: senderEmailToUse || getConfiguredSenderEmail(),
          senderPhone: getConfiguredSenderPhone(),
        });
      }

      const fresh = await fetchEmailCampaigns('all');
      const activeQueue = (fresh.items || []).filter(
        (i) => i.status === 'PendingApproval' || i.status === 'Approved'
      );

      const needApproveIds = activeQueue
        .filter((i) => i.status === 'PendingApproval')
        .map((i) => i.id);

      if (needApproveIds.length > 0) {
        await approveEmailCampaign({
          ids: needApproveIds,
          autoSendAuthorized: true,
        });
      }

      const afterApprove = await fetchEmailCampaigns('all');
      const readyTargets = (afterApprove.items || []).filter((i) => i.status === 'Approved');
      setCampaignItems(
        (afterApprove.items || []).filter((i) => i.status === 'PendingApproval' || i.status === 'Approved')
      );
      setFailedItems((afterApprove.items || []).filter((i) => i.status === 'Failed'));

      if (readyTargets.length === 0) {
        onShowToast('No Unsent Verified Emails', 'All valid leads have already been emailed, unsubscribed, or skipped.', 'info');
        return;
      }

      setSendModeConfirm({
        open: true,
        mode: 'authorized_batch',
        targets: readyTargets,
      });
    } catch (err: any) {
      onShowToast('Batch Prepare Error', err?.message || 'Could not prepare batch emails.', 'error');
    } finally {
      setIsPreparing(false);
    }
  };

  // Start Continuous Auto-Pilot Button Handler (asks Gmail login + opens explicit confirmation dialog)
  const handleRequestAutoPilot = async () => {
    let activeToken = await getAccessToken();
    let senderEmailToUse = connectedEmail || getConnectedGoogleEmail();

    if (!activeToken) {
      try {
        const signInRes = await googleSignIn();
        if (signInRes?.accessToken) {
          activeToken = signInRes.accessToken;
          senderEmailToUse = signInRes.user.email || senderEmailToUse;
          setHasToken(true);
          setConnectedEmail(senderEmailToUse || null);
        }
      } catch (authErr: any) {
        onShowToast('Gmail OAuth Required', authErr?.message || 'Auto-Pilot chalane ke liye Gmail connect karein.', 'error');
        return;
      }
    }

    if (!activeToken) {
      onShowToast('Gmail OAuth Required', 'Google Login se Gmail connect karein.', 'error');
      return;
    }

    setSendModeConfirm({
      open: true,
      mode: 'autopilot_loop',
      targets: campaignItems.filter((c) => c.status === 'Approved' || c.status === 'PendingApproval'),
    });
  };

  const appendAutoLog = (msg: string) => {
    const stamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setAutoPilotState((prev) => ({
      ...prev,
      logs: [`[${stamp}] ${msg}`, ...prev.logs].slice(0, 12),
    }));
  };

  const waitWhilePaused = async () => {
    while (autoControlRef.current.paused && !autoControlRef.current.stop) {
      await new Promise((r) => setTimeout(r, 400));
    }
  };

  const executeContinuousAutoPilot = async () => {
    autoControlRef.current = { stop: false, paused: false };
    setIsSending(true);
    setAutoPilotState({
      running: true,
      paused: false,
      phase: 'Preparing Unsent Leads Queue...',
      currentEmail: '',
      currentBusiness: '',
      totalSent: 0,
      totalFailed: 0,
      cyclesCompleted: 0,
      leadsDiscovered: 0,
      logs: [`[${new Date().toLocaleTimeString()}] Auto-Pilot started (${autoCategory} in ${autoCity}, ${autoCountry})`],
    });

    let totalSent = 0;
    let totalFailed = 0;
    let cyclesCompleted = 0;
    let leadsDiscovered = 0;

    try {
      while (!autoControlRef.current.stop) {
        await waitWhilePaused();
        if (autoControlRef.current.stop) break;

        // Check Gmail OAuth token
        const token = await getAccessToken();
        if (!token) {
          appendAutoLog('Gmail OAuth token expired — pausing Auto-Pilot. Reconnect Gmail to continue.');
          onShowToast('Gmail Reconnect Needed', 'Session expired. Connect Gmail and restart Auto-Pilot.', 'error');
          break;
        }
        const fromEmail = getConnectedGoogleEmail() || connectedEmail || getConfiguredSenderEmail();

        // 1) Fetch latest DB leads & campaigns, prepare + approve any unsent leads
        const dbLeadsRes = await fetchDbLeads();
        const latestDbLeads = dbLeadsRes.success ? dbLeadsRes.leads : [];
        const unsent = filterUnsentLeads(latestDbLeads);
        if (unsent.length > 0) {
          setAutoPilotState((p) => ({ ...p, phase: `Preparing ${unsent.length} unsent leads...` }));
          await prepareEmailCampaign({
            leadIds: unsent.map((l) => l.id),
            senderEmail: fromEmail,
            senderPhone: getConfiguredSenderPhone(),
          });
        }

        const campsRes = await fetchEmailCampaigns('all');
        const allItems = campsRes.items || [];
        const pendingIds = allItems.filter((i) => i.status === 'PendingApproval').map((i) => i.id);
        if (pendingIds.length > 0) {
          await approveEmailCampaign({ ids: pendingIds, autoSendAuthorized: true });
        }

        const refreshedCamps = await fetchEmailCampaigns('all');
        const readyTargets = (refreshedCamps.items || []).filter((i) => i.status === 'Approved');
        setCampaignItems(
          (refreshedCamps.items || []).filter((i) => i.status === 'PendingApproval' || i.status === 'Approved')
        );

        // 2) If there are Approved emails ready, send them sequentially 1-by-1
        if (readyTargets.length > 0) {
          for (let idx = 0; idx < readyTargets.length; idx++) {
            await waitWhilePaused();
            if (autoControlRef.current.stop) break;

            const target = readyTargets[idx];
            setAutoPilotState((p) => ({
              ...p,
              phase: `Sending 1-by-1 (${idx + 1}/${readyTargets.length})`,
              currentEmail: target.recipientEmail,
              currentBusiness: target.businessName,
            }));

            const sendRes = await sendEmailViaGmailApi(
              target.recipientEmail,
              fromEmail,
              target.subject,
              target.body,
              {
                skipLocalStorageDupCheck: true,
                leadId: target.leadId,
                businessName: target.businessName,
              }
            );

            if (sendRes.needsAuth || (sendRes as any).needsAppPassword || !sendRes.success) {
              appendAutoLog(`Stopped at ${target.recipientEmail}: ${sendRes.error || 'Google App Password zaroori hai'}`);
              onShowToast(
                'Google App Password Required',
                sendRes.error || 'Real emails send karne ke liye header me "Connect Gmail" par click karke 16-digit Google App Password enter karein.',
                'error'
              );
              autoControlRef.current.stop = true;
              break;
            }

            await recordCampaignSend({
              id: target.id,
              success: sendRes.success,
              gmailMessageId: sendRes.messageId || null,
              gmailThreadId: sendRes.threadId || null,
              errorMessage: sendRes.error || null,
              subject: target.subject,
              body: target.body,
            });

            if (sendRes.success) {
              totalSent += 1;
              appendAutoLog(`✅ Sent Gmail to ${target.businessName} (${target.recipientEmail})`);
            } else {
              totalFailed += 1;
              appendAutoLog(`⚠️ Skipped/Failed ${target.recipientEmail}: ${sendRes.error || 'Delivery error'}`);
            }

            setAutoPilotState((p) => ({
              ...p,
              totalSent,
              totalFailed,
            }));

            await loadCampaigns();
            await refreshLeadsFromDb();

            if (!autoControlRef.current.stop && idx < readyTargets.length - 1) {
              await new Promise((r) => setTimeout(r, 900));
            }
          }
          continue; // loop back to verify queue is now empty or more unsent leads exist
        }

        // 3) Queue is completely empty! Automatically trigger a fresh non-repeating Lead Discovery cycle!
        if (autoControlRef.current.stop) break;
        const nextCycle = cyclesCompleted + 1;
        setAutoPilotState((p) => ({
          ...p,
          phase: `Discovering New Unique Leads (Cycle #${nextCycle}) in ${autoCity}...`,
          currentBusiness: `${autoCategory} • ${autoCity}, ${autoCountry}`,
          currentEmail: 'Searching public registries + verifying MX...',
        }));
        appendAutoLog(`🔍 Queue empty! Fetching ${autoBatchSize} new leads in ${autoCity}, ${autoCountry}...`);

        const startRes = await startDiscoveryJob({
          discoveryMode: 'high_intent_buyers',
          categories: [autoCategory],
          country: autoCountry,
          city: autoCity,
          emailFilterMode: 'prefer_gmail',
          requireContactReady: true,
          limit: autoBatchSize,
        });

        if (!startRes.success || !startRes.jobId) {
          appendAutoLog(`❌ Discovery failed to start: ${startRes.error || 'Unknown error'}`);
          break;
        }

        let jobFinished = false;
        let newlyFoundCount = 0;
        let discoveryErr: string | null = null;
        const pollStarted = Date.now();
        let pollErrors = 0;

        while (!jobFinished && !autoControlRef.current.stop && Date.now() - pollStarted < 290000) {
          await waitWhilePaused();
          if (autoControlRef.current.stop) break;
          await new Promise((r) => setTimeout(r, 1500));
          try {
            const pollRes = await pollDiscoveryJob(startRes.jobId);
            pollErrors = 0;
            const job = pollRes.job;
            if (job) {
              setAutoPilotState((p) => ({
                ...p,
                phase: `Discovery Cycle #${nextCycle}: ${job.stage} (${job.verifiedCount}/${job.requestedCount})`,
              }));
              if (job.status !== 'running') {
                jobFinished = true;
                newlyFoundCount = job.verifiedCount || job.leads.length || 0;
                discoveryErr = job.error || null;
              }
            }
          } catch {
            pollErrors += 1;
            if (pollErrors >= 5) break;
          }
        }

        await refreshLeadsFromDb();
        cyclesCompleted = nextCycle;
        leadsDiscovered += newlyFoundCount;
        setAutoPilotState((p) => ({
          ...p,
          cyclesCompleted,
          leadsDiscovered,
        }));

        if (autoControlRef.current.stop) break;

        if (newlyFoundCount === 0) {
          appendAutoLog(
            discoveryErr
              ? `⏹️ Stopped: ${discoveryErr}`
              : `🏁 All unique leads for ${autoCategory} in ${autoCity} have been discovered & sent!`
          );
          onShowToast(
            'Auto-Pilot Completed',
            `Sent ${totalSent} emails across ${cyclesCompleted} cycle(s). No more unseen leads in ${autoCity}.`,
            'info'
          );
          break;
        }

        appendAutoLog(`✨ Discovered ${newlyFoundCount} fresh verified leads! Preparing next Gmail batch...`);
      }
    } catch (err: any) {
      appendAutoLog(`❌ Auto-Pilot error: ${err?.message || 'Unexpected failure'}`);
      onShowToast('Auto-Pilot Stopped', err?.message || 'Unexpected error', 'error');
    } finally {
      await loadCampaigns();
      await refreshLeadsFromDb();
      setIsSending(false);
      setAutoPilotState((p) => ({
        ...p,
        running: false,
        paused: false,
        phase: autoControlRef.current.stop ? 'Stopped by User' : 'Completed',
      }));
    }
  };

  const handleRetryFailedCampaigns = async () => {
    if (failedItems.length === 0) return;
    setIsPreparing(true);
    try {
      await approveEmailCampaign({
        ids: failedItems.map((f) => f.id),
        autoSendAuthorized: true,
      });
      await loadCampaigns();
      onShowToast('Failed Drafts Re-Queued', `${failedItems.length} failed draft(s) moved back to Approved queue for sending.`, 'success');
    } catch (err: any) {
      onShowToast('Retry Queue Failed', err?.message || 'Could not re-queue failed drafts.', 'error');
    } finally {
      setIsPreparing(false);
    }
  };

  const handleApproveItem = async (item: EmailCampaignItem) => {
    try {
      const res = await approveEmailCampaign({
        id: item.id,
        subject: item.id === activeItem?.id ? editSubject : item.subject,
        body: item.id === activeItem?.id ? editBody : item.body,
        autoSendAuthorized: false,
      });
      if (res.item) {
        setCampaignItems((prev) => prev.map((c) => (c.id === item.id ? res.item! : c)));
        onShowToast('Email Approved', `Approved email preview for ${item.businessName}. Ready to send.`, 'success');
      }
    } catch (err: any) {
      onShowToast('Approve Failed', err?.message || 'Could not approve item.', 'error');
    }
  };

  const handleRejectItem = async (item: EmailCampaignItem) => {
    try {
      await rejectEmailCampaign(item.id);
      setCampaignItems((prev) => prev.filter((c) => c.id !== item.id));
      onShowToast('Email Rejected', `Rejected draft for ${item.businessName}.`, 'info');
    } catch (err: any) {
      onShowToast('Reject Failed', err?.message || 'Error rejecting item.', 'error');
    }
  };

  const handleUnsubscribeItem = async (item: EmailCampaignItem) => {
    try {
      await unsubscribeEmail(item.recipientEmail, 'Opted out before send');
      setCampaignItems((prev) => prev.filter((c) => c.id !== item.id));
      await refreshLeadsFromDb();
      onShowToast('Unsubscribed', `${item.recipientEmail} added to permanent opt-out list.`, 'info');
    } catch (err: any) {
      onShowToast('Error', err?.message || 'Unsubscribe failed', 'error');
    }
  };

  const applyPitchPreset = (preset: 'free_demo' | 'speed_audit' | 'whatsapp_engine') => {
    if (!activeItem) return;
    const lead = allDbLeads.find((l) => l.id === activeItem.leadId);
    const biz = activeItem.businessName;
    const contact = lead?.contactPerson && lead?.contactPerson !== 'Management Team' ? lead.contactPerson : 'Sir/Ma\'am';
    const site = activeItem.websiteUrl || 'your website';
    const senderName = 'Abdul Hafiz';
    const senderPhone = '+91 97597 25212';

    if (preset === 'free_demo') {
      setEditSubject(`Quick question regarding ${biz} website`);
      setEditBody(`Hello ${contact},

Maine ${biz} ke liye ek modern, ultra-fast website prototype (demo) design kiya hai jisme direct 1-click WhatsApp booking aur online enquiry system enabled hai.

Maine socha pehle aapko free me demo dikhaun — agar aapko pasand aaye tabhi hum baat karenge, varna aapka koi kharcha nahi.

✅ ₹0 Advance (Pehle live prototype dekhein)
✅ 100% Mobile Responsive & 1-Second Load Speed
✅ Direct WhatsApp Lead Integration

Kya main aapko 2-minute ka live demo link WhatsApp ya email par share karun?

Warm regards,
${senderName} | Full Stack Web & Mobile App Developer
📞 WhatsApp / Call: ${senderPhone}`);
      onShowToast('Template Applied', '24h Free Demo template loaded!', 'info');
    } else if (preset === 'speed_audit') {
      setEditSubject(`Found 2 issues on ${biz} mobile website`);
      setEditBody(`Hello ${contact},

Maine aapki website (${site}) mobile par check ki. Mobile par open hone me 4.8 second lag rahe hain aur contact form mobile screen par theek se submit nahi ho raha.

Is wajah se roz Google se aane wale 60%+ customers bina enquiry kare wapas chale jaate hain.

Maine iska exact fix aur fast loading architecture ready kiya hai. Kya main aapke saath ek quick review ya screen recording share karun?

Warm regards,
${senderName} | Web Architecture Specialist
📞 WhatsApp / Call: ${senderPhone}`);
      onShowToast('Template Applied', 'Mobile Speed Audit template loaded!', 'info');
    } else if (preset === 'whatsapp_engine') {
      setEditSubject(`Increase inquiries on ${biz} website by 3x`);
      setEditBody(`Hello ${contact},

Aapke business (${biz}) ke zyadatar local customers direct WhatsApp par baat karna pasand karte hain. 

Aapki current site par direct WhatsApp floating button aur instant catalog enquiry missing hai, jisse competitors aapse aage nikal rahe hain.

Humne similar businesses ke liye WhatsApp lead engine integrate kiya hai jisse unki daily client inquiries 300% tak badh gayi hain.

Kya aapko iska 1-minute live demo dekhna hai?

Warm regards,
${senderName} | Digital Growth Developer
📞 WhatsApp / Call: ${senderPhone}`);
      onShowToast('Template Applied', 'WhatsApp Lead Engine template loaded!', 'info');
    }
  };

  const handleOpenNextInGmail = async (targets: EmailCampaignItem[]) => {
    if (targets.length === 0) {
      onShowToast('No Approved Drafts', 'Pehle drafts approve karein.', 'info');
      return;
    }
    const target = targets[0];
    const subj = target.id === activeItem?.id ? editSubject : target.subject;
    const body = target.id === activeItem?.id ? editBody : target.body;
    const url = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(target.recipientEmail)}&su=${encodeURIComponent(subj)}&body=${encodeURIComponent(body)}`;
    window.open(url, '_blank');
    await recordCampaignSend({
      id: target.id,
      success: true,
      subject: subj,
      body,
    });
    onShowToast('Dispatched in Gmail', `Draft opened in Gmail for ${target.businessName}! Status updated to Sent.`, 'success');
    await loadCampaigns();
    await refreshLeadsFromDb();
  };

  const handleDirectSendNow = async (targetItem: EmailCampaignItem) => {
    setIsSending(true);
    const fromEmail = getConnectedGoogleEmail() || connectedEmail || getConfiguredSenderEmail();
    const subj = targetItem.id === activeItem?.id ? editSubject : targetItem.subject;
    const body = targetItem.id === activeItem?.id ? editBody : targetItem.body;

    try {
      const sendRes = await sendEmailViaGmailApi(targetItem.recipientEmail, fromEmail, subj, body, {
        skipLocalStorageDupCheck: true,
        leadId: targetItem.leadId,
        businessName: targetItem.businessName,
      });

      if (sendRes.success) {
        await recordCampaignSend({
          id: targetItem.id,
          success: true,
          gmailMessageId: sendRes.messageId || null,
          subject: subj,
          body,
        });
        onShowToast('Email Sent Successfully! 🚀', `Email delivered to ${targetItem.businessName} (${targetItem.recipientEmail}) from your Gmail!`, 'success');
      } else {
        onShowToast('Delivery Notice', sendRes.error || 'Failed to send', 'error');
      }
    } catch (err: any) {
      onShowToast('Error', err?.message || 'Failed to send', 'error');
    } finally {
      setIsSending(false);
      await loadCampaigns();
      await refreshLeadsFromDb();
    }
  };

  const executeBatchDirect = async (targets: EmailCampaignItem[]) => {
    if (!targets || targets.length === 0) return;
    setIsSending(true);
    setSendProgress({
      current: 0,
      total: targets.length,
      currentEmail: targets[0]?.recipientEmail || '',
      sent: 0,
      failed: 0,
    });

    let sentCount = 0;
    let failCount = 0;
    const fromEmail = getConnectedGoogleEmail() || connectedEmail || getConfiguredSenderEmail();

    for (let i = 0; i < targets.length; i++) {
      const target = targets[i];
      setSendProgress({
        current: i + 1,
        total: targets.length,
        currentEmail: target.recipientEmail,
        sent: sentCount,
        failed: failCount,
      });

      const subj = target.id === activeItem?.id ? editSubject : target.subject;
      const body = target.id === activeItem?.id ? editBody : target.body;

      const sendRes = await sendEmailViaGmailApi(target.recipientEmail, fromEmail, subj, body, {
        skipLocalStorageDupCheck: true,
        leadId: target.leadId,
        businessName: target.businessName,
      });

      await recordCampaignSend({
        id: target.id,
        success: sendRes.success,
        gmailMessageId: sendRes.messageId || null,
        gmailThreadId: sendRes.threadId || null,
        errorMessage: sendRes.error || null,
        subject: subj,
        body,
      });

      if (sendRes.success) {
        sentCount += 1;
      } else {
        failCount += 1;
      }

      if (i < targets.length - 1) {
        await new Promise((r) => setTimeout(r, 350));
      }
    }

    await loadCampaigns();
    await refreshLeadsFromDb();
    setSendProgress(null);
    setIsSending(false);
    onShowToast('Batch Complete! 🚀', `Finished sending ${sentCount} emails directly via your Gmail!`, 'success');
  };

  const executeConfirmedSend = async () => {
    const { mode, targets } = sendModeConfirm;
    setSendModeConfirm({ open: false, mode: 'manual', targets: [] });

    const liveToken = (await getAccessToken()) || 'direct_sender';

    if (mode === 'autopilot_loop') {
      await executeContinuousAutoPilot();
      return;
    }

    setIsSending(true);
    setSendProgress({
      current: 0,
      total: targets.length,
      currentEmail: targets[0]?.recipientEmail || '',
      sent: 0,
      failed: 0,
    });

    let sentCount = 0;
    let failCount = 0;
    let abortedDueToAuth = false;
    let lastError = '';
    const fromEmail = getConnectedGoogleEmail() || connectedEmail || getConfiguredSenderEmail();

    for (let i = 0; i < targets.length; i++) {
      const target = targets[i];
      setSendProgress({
        current: i + 1,
        total: targets.length,
        currentEmail: target.recipientEmail,
        sent: sentCount,
        failed: failCount,
      });

      const subj = target.id === activeItem?.id ? editSubject : target.subject;
      const body = target.id === activeItem?.id ? editBody : target.body;

      const sendRes = await sendEmailViaGmailApi(target.recipientEmail, fromEmail, subj, body, {
        skipLocalStorageDupCheck: true,
        leadId: target.leadId,
        businessName: target.businessName,
      });

      if ((sendRes as any).needsAppPassword && sendRes.gmailSentUrl) {
        // Zero-setup Fallback: Open in Gmail Web Compose and record send!
        if (typeof window !== 'undefined') {
          window.open(sendRes.gmailSentUrl, '_blank');
        }
        await recordCampaignSend({
          id: target.id,
          success: true,
          subject: subj,
          body,
        });
        sentCount += 1;
        onShowToast('Opened in Gmail', `Compose tab opened for ${target.businessName}! Press Send in Gmail to deliver.`, 'info');
        if (targets.length > 1) {
          onShowToast('Batch Send Notice', `Remaining ${targets.length - 1} drafts can be opened 1-by-1 or configure 16-digit App Password for 100% background automation.`, 'info');
          break;
        }
        continue;
      }

      if (sendRes.needsAuth || !sendRes.success) {
        abortedDueToAuth = Boolean(sendRes.needsAuth);
        lastError = sendRes.error || 'Delivery failed';
        onShowToast(sendRes.needsAuth ? 'Google App Password Required' : 'Delivery Error', lastError, 'error');
        break;
      }

      await recordCampaignSend({
        id: target.id,
        success: sendRes.success,
        gmailMessageId: sendRes.messageId || null,
        gmailThreadId: sendRes.threadId || null,
        errorMessage: sendRes.error || null,
        subject: subj,
        body,
      });

      if (sendRes.success) {
        sentCount += 1;
      } else {
        failCount += 1;
        if (sendRes.error) lastError = sendRes.error;
      }

      if (i < targets.length - 1) {
        await new Promise((r) => setTimeout(r, 250));
      }
    }

    await loadCampaigns();
    await refreshLeadsFromDb();
    setSendProgress(null);
    setIsSending(false);

    if (abortedDueToAuth) {
      onShowToast(
        'Gmail Session Reconnect Needed',
        `${lastError} (${sentCount} sent; remaining targets stayed Approved so you can resume cleanly).`,
        'error'
      );
    } else if (sentCount > 0 && failCount === 0) {
      onShowToast('Gmail Dispatch Succeeded', `Sent ${sentCount} approved email(s) via Gmail OAuth.`, 'success');
    } else if (sentCount > 0 && failCount > 0) {
      onShowToast('Partial Dispatch', `Sent ${sentCount}, Failed ${failCount}. Last error: ${lastError || 'Check Sent Emails'}`, 'info');
    } else {
      onShowToast('Gmail Send Failed', lastError || `Failed to send ${failCount} email(s). Check Sent Emails for exact reason.`, 'error');
    }
  };

  const approvedItems = campaignItems.filter((c) => c.status === 'Approved');
  const activeLocation = activeItem ? getLeadLocationDetails(activeItem) : null;
  const activeLead = activeItem ? allDbLeads.find((l) => l.id === activeItem.leadId) : null;

  return (
    <div className="page-content">
      {/* Header */}
      <div className="page-header">
        <div>
          <h2 className="page-title">Gmail Campaigns — Auto-Pilot, Preview & Outreach</h2>
          <p className="page-subtitle">
            Review personalized emails, send 1-by-1 via real Gmail OAuth 2.0, or enable continuous Auto-Pilot to auto-discover new leads after every batch finishes.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <GoogleConnectButton
            onStatusChange={(connected, email) => {
              setHasToken(connected);
              setConnectedEmail(email || null);
            }}
            onError={(msg) => onShowToast('Gmail Login Error', msg, 'error')}
          />
          <WhatsAppConnectButton />
          <button
            className="btn btn-primary"
            onClick={() => setIsWhatsAppBulkOpen(true)}
            disabled={allDbLeads.filter((l) => l.outreachStatus !== 'Unsubscribed' && hasAvailableWhatsAppNumber(l)).length === 0}
            style={{ background: '#16a34a', borderColor: '#16a34a', fontWeight: 700 }}
            title="1-Click Send Interactive 4-Step Chatbot to all available WhatsApp numbers"
          >
            <MessageSquare size={15} />
            <span>
              1-Click Send WhatsApp All ({(selectedLeads.length > 0 ? selectedLeads : allDbLeads).filter((l) => l.outreachStatus !== 'Unsubscribed' && hasAvailableWhatsAppNumber(l)).length})
            </span>
          </button>
          <button
            className={`btn ${allowRepeatLeads ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => {
              const next = !allowRepeatLeads;
              setAllowRepeatLeads(next);
              onShowToast(
                next ? 'Repeat Leads ON 🔁' : 'Repeat Leads OFF 🛡️',
                next
                  ? 'Ab aap pehle bheje hue leads ko dubara email bhej sakte hain.'
                  : 'Strict Anti-Repeat ON: Jinko ek baar email ja chuka hai unhe dubara nahi jayega.',
                'info'
              );
            }}
            style={
              allowRepeatLeads
                ? { background: '#f59e0b', borderColor: '#f59e0b', color: '#fff', fontWeight: 700 }
                : { borderColor: '#64748b', color: '#475569', fontWeight: 700 }
            }
            title="Toggle whether already-emailed leads can be repeated"
          >
            <RefreshCw size={15} />
            <span>{allowRepeatLeads ? 'Repeat Leads: ON' : 'Repeat Leads: OFF'}</span>
          </button>
          <button className="btn btn-outline" onClick={onNavigateToLeads}>
            <Users size={15} /> Select Leads ({selectedLeads.length})
          </button>
          <button className="btn btn-outline" onClick={handlePrepareFromSelection} disabled={isPreparing || isSending}>
            <Sparkles size={15} />
            <span>{isPreparing ? 'Preparing...' : `Prepare Previews (${selectedLeads.length > 0 ? selectedLeads.length : unsentVerifiedLeads.length})`}</span>
          </button>
          <button
            className="btn btn-primary"
            onClick={handleOneClickSendAll}
            disabled={isPreparing || isSending || (unsentVerifiedLeads.length === 0 && campaignItems.length === 0)}
            style={{ background: '#10b981', borderColor: '#10b981', fontWeight: 700 }}
          >
            {isPreparing || isSending ? <RefreshCw size={15} className="animate-spin" /> : <Send size={15} />}
            <span>
              Send All Verified Leads Now ({Math.max(unsentVerifiedLeads.length, campaignItems.length)})
            </span>
          </button>
          {onNavigateToSentEmails && (
            <button className="btn btn-outline" onClick={onNavigateToSentEmails}>
              View Sent & Failed Logs
            </button>
          )}
        </div>
      </div>

      {/* CONTINUOUS AUTO-PILOT CONTROL CARD (1-by-1 Send -> Auto New Lead Discovery -> Repeat) */}
      <div
        className="card"
        style={{
          borderLeft: '4px solid #6366f1',
          background: autoPilotState.running
            ? 'linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(16, 185, 129, 0.08) 100%)'
            : 'linear-gradient(135deg, rgba(99, 102, 241, 0.05) 0%, rgba(16, 185, 129, 0.03) 100%)',
          padding: '1rem 1.25rem',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.85rem' }}>
          <div style={{ flex: '1 1 320px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 800, fontSize: '0.95rem', color: '#4f46e5' }}>
              <Zap size={17} />
              <span>Continuous Auto-Pilot: 1-by-1 Gmail + Auto New Lead Refill</span>
            </div>
            <p style={{ margin: '0.25rem 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Ek-ek karke sabhi leads ko Gmail bhejega; jab saari leads khatam ho jayengi to automatically new leads discover karke dubara send karega.
            </p>
          </div>

          {/* Discovery Refill Target Config */}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              type="text"
              className="input-field"
              value={autoCountry}
              disabled={autoPilotState.running}
              onChange={(e) => setAutoCountry(e.target.value)}
              placeholder="Country"
              style={{ width: '130px', fontSize: '0.78rem', padding: '0.35rem 0.6rem' }}
              title="Country for automatic new lead refill"
            />
            <input
              type="text"
              className="input-field"
              value={autoCity}
              disabled={autoPilotState.running}
              onChange={(e) => setAutoCity(e.target.value)}
              placeholder="City"
              style={{ width: '125px', fontSize: '0.78rem', padding: '0.35rem 0.6rem' }}
              title="City for automatic new lead refill"
            />
            <select
              className="input-field"
              value={autoCategory}
              disabled={autoPilotState.running}
              onChange={(e) => setAutoCategory(e.target.value)}
              style={{ width: '175px', fontSize: '0.78rem', padding: '0.35rem 0.5rem' }}
            >
              {ALL_BUSINESS_CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <select
              className="input-field"
              value={autoBatchSize}
              disabled={autoPilotState.running}
              onChange={(e) => setAutoBatchSize(Number(e.target.value))}
              style={{ width: '110px', fontSize: '0.78rem', padding: '0.35rem 0.5rem' }}
              title="New leads to fetch per auto-refill cycle"
            >
              <option value={10}>10 / cycle</option>
              <option value={15}>15 / cycle</option>
              <option value={25}>25 / cycle</option>
              <option value={50}>50 / cycle</option>
            </select>

            {!autoPilotState.running ? (
              <button
                className="btn btn-primary btn-sm"
                onClick={handleRequestAutoPilot}
                disabled={isPreparing || isSending}
                style={{ background: '#6366f1', borderColor: '#6366f1', fontWeight: 700, padding: '0.45rem 0.9rem' }}
              >
                <Play size={14} />
                <span>Start Auto-Pilot Loop</span>
              </button>
            ) : (
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <button
                  className="btn btn-outline btn-sm"
                  onClick={() => {
                    const nextPaused = !autoControlRef.current.paused;
                    autoControlRef.current.paused = nextPaused;
                    setAutoPilotState((p) => ({
                      ...p,
                      paused: nextPaused,
                      phase: nextPaused ? 'Paused by User' : 'Resuming Auto-Pilot...',
                    }));
                  }}
                >
                  {autoPilotState.paused ? <Play size={14} /> : <Pause size={14} />}
                  <span>{autoPilotState.paused ? 'Resume' : 'Pause'}</span>
                </button>
                <button
                  className="btn btn-sm"
                  style={{ background: '#ef4444', color: '#fff', borderColor: '#ef4444', fontWeight: 700 }}
                  onClick={() => {
                    autoControlRef.current.stop = true;
                    autoControlRef.current.paused = false;
                    appendAutoLog('Stopping Auto-Pilot safely after current step...');
                  }}
                >
                  <Square size={13} />
                  <span>Stop</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {(autoPilotState.running || autoPilotState.logs.length > 0) && (
          <div style={{ marginTop: '0.85rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-color)', display: 'grid', gridTemplateColumns: 'minmax(240px, 1fr) minmax(280px, 1.5fr)', gap: '0.85rem' }}>
            <div style={{ fontSize: '0.78rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              <div style={{ fontWeight: 700, color: autoPilotState.running ? '#4f46e5' : 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                {autoPilotState.running && !autoPilotState.paused && <RefreshCw size={13} className="animate-spin" />}
                <span>Status: {autoPilotState.phase}</span>
              </div>
              {autoPilotState.currentBusiness && (
                <div style={{ color: 'var(--text-muted)' }}>
                  Active Target: <strong>{autoPilotState.currentBusiness}</strong> ({autoPilotState.currentEmail})
                </div>
              )}
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '0.2rem' }}>
                <span className="badge badge-secondary">Sent: {autoPilotState.totalSent}</span>
                <span className="badge badge-danger">Failed: {autoPilotState.totalFailed}</span>
                <span className="badge badge-primary">Refill Cycles: {autoPilotState.cyclesCompleted}</span>
                <span className="badge badge-warning">New Leads Found: {autoPilotState.leadsDiscovered}</span>
              </div>
            </div>

            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0.5rem 0.75rem', maxHeight: '95px', overflowY: 'auto', fontSize: '0.72rem', fontFamily: 'monospace' }}>
              {autoPilotState.logs.map((entry, idx) => (
                <div key={idx} style={{ padding: '0.1rem 0', color: idx === 0 ? 'var(--text-main)' : 'var(--text-muted)' }}>
                  {entry}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Gmail Auth Status Banner */}
      {!hasToken && (
        <div
          className="card"
          style={{
            borderLeft: `4px solid ${getLastAuthIssue() ? '#ef4444' : '#f59e0b'}`,
            background: getLastAuthIssue() ? 'rgba(239, 68, 68, 0.08)' : 'rgba(245, 158, 11, 0.08)',
            padding: '0.9rem 1.25rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.75rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', fontSize: '0.85rem', flex: '1 1 320px' }}>
            <AlertTriangle size={18} color={getLastAuthIssue() ? '#dc2626' : '#d97706'} />
            <span>
              {getLastAuthIssue() ? (
                <>
                  <strong style={{ color: '#dc2626' }}>Gmail Permission Reconnect Required:</strong>{' '}
                  {getLastAuthIssue()}
                </>
              ) : (
                <>
                  <strong>Gmail OAuth 2.0 Not Connected:</strong> Emails can be previewed and approved now, and will transmit through your real Gmail account once connected above (popup me Gmail Send + Read checkboxes tick karein).
                </>
              )}
            </span>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={async () => {
                try {
                  const res = await googleSignIn(true);
                  if (res?.accessToken) {
                    setHasToken(true);
                    setConnectedEmail(res.user.email || null);
                    onShowToast('Gmail Connected & Verified', 'Gmail Send & Inbox permissions active ho gayi hain. Ab aap resume kar sakte hain!', 'success');
                  }
                } catch (err: any) {
                  onShowToast('Gmail Permission Incomplete', err?.message || 'Could not authorize Gmail permissions.', 'error');
                }
              }}
            >
              Reconnect & Grant Gmail Permissions
            </button>
            <a href={GMAIL_SENT_FOLDER_URL} target="_blank" rel="noreferrer" className="btn btn-outline btn-sm">
              Open Gmail Sent Folder
            </a>
          </div>
        </div>
      )}

      {/* Live Batch Progress Bar */}
      {sendProgress && (
        <div className="card" style={{ borderLeft: '4px solid #10b981', padding: '1rem 1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.45rem', fontSize: '0.86rem' }}>
            <span style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <RefreshCw size={15} className="animate-spin" color="#10b981" />
              Sending Batch Gmail ({sendProgress.current} / {sendProgress.total}): {sendProgress.currentEmail}
            </span>
            <span style={{ fontWeight: 700, color: '#10b981' }}>
              Sent: {sendProgress.sent} • Failed: {sendProgress.failed}
            </span>
          </div>
          <div style={{ width: '100%', height: '8px', background: 'var(--bg-muted)', borderRadius: '99px', overflow: 'hidden' }}>
            <div
              style={{
                width: `${Math.round((sendProgress.current / Math.max(sendProgress.total, 1)) * 100)}%`,
                height: '100%',
                background: '#10b981',
                transition: 'width 0.25s ease',
              }}
            />
          </div>
        </div>
      )}

      {/* Batch Send Bar */}
      <div
        className="card"
        style={{
          padding: '0.9rem 1.25rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.75rem',
        }}
      >
        <div style={{ fontSize: '0.85rem' }}>
          <strong>Queue:</strong> {campaignItems.length} total drafts •{' '}
          <strong style={{ color: '#f59e0b' }}>{campaignItems.filter((c) => c.status === 'PendingApproval').length} Pending Approval</strong> •{' '}
          <strong style={{ color: '#10b981' }}>{approvedItems.length} Approved & Ready</strong>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {failedItems.length > 0 && (
            <button
              className="btn btn-outline btn-sm"
              onClick={handleRetryFailedCampaigns}
              disabled={isSending || isPreparing}
              style={{ borderColor: '#ef4444', color: '#ef4444' }}
            >
              <RefreshCw size={14} />
              <span>Retry Failed ({failedItems.length})</span>
            </button>
          )}
          {campaignItems.some((c) => c.status === 'PendingApproval') && (
            <button
              className="btn btn-outline btn-sm"
              onClick={handleApproveAllPending}
              disabled={isSending || isPreparing}
            >
              <CheckCircle2 size={14} color="#10b981" />
              <span>Approve All Pending ({campaignItems.filter((c) => c.status === 'PendingApproval').length})</span>
            </button>
          )}
          <button
            className="btn btn-primary btn-sm"
            style={{ background: '#10b981', borderColor: '#10b981', color: '#fff', fontWeight: 800, padding: '0.45rem 1rem' }}
            disabled={campaignItems.length === 0 || isSending}
            onClick={() => {
              const targets = approvedItems.length > 0 ? approvedItems : campaignItems.slice(0, 50);
              executeBatchDirect(targets);
            }}
          >
            {isSending ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
            <span>Auto-Send Gmail Batch ({approvedItems.length > 0 ? approvedItems.length : Math.min(50, campaignItems.length)})</span>
          </button>
        </div>
      </div>

      {/* Main Split Workspace: Queue List + Interactive Email Preview/Editor */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(290px, 360px) 1fr', gap: '1.25rem', alignItems: 'start' }}>
        {/* Left Queue */}
        <div className="card" style={{ maxHeight: '720px', overflowY: 'auto' }}>
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 className="card-title" style={{ margin: 0 }}>Approval Queue ({campaignItems.length})</h3>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {isLoading ? (
              <div style={{ padding: '1.5rem', textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Loading email queue...
              </div>
            ) : campaignItems.length === 0 ? (
              <div style={{ padding: '1.75rem', textAlign: 'center', fontSize: '0.84rem', color: 'var(--text-muted)' }}>
                No pending campaign previews. Click <strong>Prepare Previews</strong> or <strong>Start Auto-Pilot Loop</strong> above to begin!
              </div>
            ) : (
              campaignItems.map((item) => {
                const isSelected = activeItem?.id === item.id;
                const loc = getLeadLocationDetails(item);
                const matchedLead = allDbLeads.find((l) => l.id === item.leadId);
                const needLabel =
                  matchedLead?.buyerNeedType ||
                  (!matchedLead?.hasWebsite || matchedLead?.websiteStatus === 'NoWebsite'
                    ? 'New Create'
                    : matchedLead?.buyingIntentLevel === 'HIGH INTENT' && Boolean(matchedLead?.requirementPostingUrl)
                    ? 'Buy'
                    : 'Update');
                const originLabel = matchedLead?.sourcePlatform || matchedLead?.source || 'Google Discovery';
                return (
                  <div
                    key={item.id}
                    onClick={() => handleSelectItem(item)}
                    style={{
                      padding: '0.85rem 1rem',
                      borderBottom: '1px solid var(--border-color)',
                      cursor: 'pointer',
                      background: isSelected ? 'rgba(37, 99, 235, 0.08)' : 'transparent',
                      borderLeft: isSelected ? '3px solid var(--primary)' : '3px solid transparent',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.4rem' }}>
                      <strong style={{ fontSize: '0.84rem' }}>{item.businessName}</strong>
                      <span className={`badge ${item.status === 'Approved' ? 'badge-secondary' : 'badge-warning'}`} style={{ fontSize: '0.66rem' }}>
                        {item.status === 'Approved' ? 'Approved' : 'Preview'}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.74rem', color: 'var(--primary)', marginTop: '0.15rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>{item.recipientEmail}</span>
                      {(() => {
                        const rawP = matchedLead?.ownerPhone || matchedLead?.locationPhone || matchedLead?.phoneNumber || '';
                        const cleanP = rawP.replace(/[^0-9]/g, '');
                        const isLandline = (matchedLead as any)?.phoneType?.includes('Landline') || (matchedLead as any)?.phoneType?.includes('Toll-Free') ||
                          cleanP.startsWith('011') || cleanP.startsWith('022') || cleanP.startsWith('080') || cleanP.startsWith('1800');
                        if (!rawP) return null;
                        return (
                          <span style={{ fontSize: '0.65rem', color: isLandline ? '#64748b' : '#059669', fontWeight: 700 }}>
                            {isLandline ? '📞 Landline' : '🟢 WhatsApp'}
                          </span>
                        );
                      })()}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.15rem', display: 'flex', gap: '0.35rem', flexWrap: 'wrap', alignItems: 'center' }}>
                      <span>{item.category}</span>
                      <span className="badge badge-primary" style={{ fontSize: '0.6rem' }}>{needLabel}</span>
                      <span style={{ color: '#2563eb', fontWeight: 600 }}>• {originLabel}</span>
                    </div>
                    <div style={{ fontSize: '0.71rem', color: 'var(--text-muted)', marginTop: '0.15rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <MapPin size={11} color="#dc2626" style={{ flexShrink: 0 }} />
                      <span>{loc.fullText || `${item.city}, ${item.countryName}`}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Preview & Approval Panel */}
        <div className="card">
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Eye size={18} color="var(--primary)" />
              <h3 className="card-title" style={{ margin: 0 }}>
                Email Preview & Approval {activeItem ? `— ${activeItem.businessName}` : ''}
              </h3>
            </div>
            {activeItem && (
              <span className="badge badge-primary">{activeItem.emailVerificationStatus}</span>
            )}
          </div>

          {!activeItem ? (
            <div className="card-body" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
              Select an item from the Approval Queue or prepare verified leads to preview personalized emails before sending.
            </div>
          ) : (
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {(() => {
                const activeLead = allDbLeads.find((l) => l.id === activeItem.leadId);
                const activeOrigin = activeLead?.sourcePlatform || activeLead?.source || 'Google Discovery';
                const activeOriginUrl =
                  activeLead?.requirementPostingUrl ||
                  activeLead?.directSourceUrl ||
                  activeLead?.googleMapsUrl ||
                  activeLead?.websiteUrl ||
                  '';
                const activeNeed =
                  activeLead?.buyerNeedType ||
                  (!activeLead?.hasWebsite || activeLead?.websiteStatus === 'NoWebsite'
                    ? 'New Create'
                    : activeLead?.buyingIntentLevel === 'HIGH INTENT' && Boolean(activeLead?.requirementPostingUrl)
                    ? 'Buy'
                    : 'Update');
                return (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.65rem', background: 'var(--bg-muted)', padding: '0.75rem 1rem', borderRadius: '8px', fontSize: '0.8rem' }}>
                    <div><strong>To:</strong> {activeItem.recipientEmail}</div>
                    <div><strong>Category:</strong> {activeItem.category}</div>
                    <div>
                      <strong>Location:</strong> {activeLocation?.fullText || `${activeItem.city}, ${activeItem.countryName}`}{' '}
                      {activeLocation?.mapsUrl && (
                        <a href={activeLocation.mapsUrl} target="_blank" rel="noreferrer" style={{ color: '#dc2626', fontWeight: 700, textDecoration: 'none' }}>
                          (Maps)
                        </a>
                      )}
                    </div>
                    <div><strong>Opportunity:</strong> {activeItem.serviceRequired}</div>
                    <div>
                      <strong>Found On:</strong>{' '}
                      <span style={{ color: '#2563eb', fontWeight: 700 }}>{activeOrigin}</span>
                      {activeOriginUrl && (
                        <>
                          {' '}
                          <a href={activeOriginUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--primary)', fontWeight: 600 }}>
                            (Proof Link)
                          </a>
                        </>
                      )}
                    </div>
                    <div>
                      <strong>Buyer Need:</strong>{' '}
                      <span className="badge badge-primary" style={{ fontSize: '0.68rem', fontWeight: 700 }}>
                        {activeNeed}
                      </span>
                    </div>
                  </div>
                );
              })()}

              {/* Outreach Channel & High-Converting Pitch Presets */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', background: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.25)', borderRadius: '8px', padding: '0.85rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div style={{ fontSize: '0.82rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#059669' }}>
                    <Sparkles size={15} />
                    <span>Tested High-Converting Pitch Angles:</span>
                  </div>
                  {activeLead && (() => {
                    const rawP = activeLead.ownerPhone || activeLead.locationPhone || activeLead.phoneNumber || '';
                    const cleanDigits = rawP.replace(/[^0-9]/g, '');
                    const isLandline = (activeLead as any).phoneType?.includes('Landline') || (activeLead as any).phoneType?.includes('Toll-Free') ||
                      cleanDigits.startsWith('011') || cleanDigits.startsWith('022') || cleanDigits.startsWith('080') || cleanDigits.startsWith('1800');
                    const waNumber = cleanDigits.startsWith('91') && cleanDigits.length === 12
                      ? cleanDigits
                      : cleanDigits.length === 10
                      ? `91${cleanDigits}`
                      : cleanDigits;
                    const greeting = activeLead.contactPerson && activeLead.contactPerson !== 'Management Team' ? activeLead.contactPerson : activeLead.businessName;
                    const waPitch = `Hello ${greeting}, maine ${activeLead.businessName} ke liye ek modern website & WhatsApp booking demo ready kiya hai. Kya main aapko free preview share karun?`;

                    if (isLandline || !cleanDigits) {
                      return (
                        <span className="badge badge-muted" style={{ fontSize: '0.75rem', padding: '0.35rem 0.6rem' }}>
                          📞 {rawP || 'No Phone'} (Call Only - Landline)
                        </span>
                      );
                    }

                    return (
                      <a
                        href={`https://wa.me/${waNumber}?text=${encodeURIComponent(waPitch)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn-sm"
                        style={{ background: '#25D366', color: '#fff', fontWeight: 700, borderColor: '#25D366', display: 'inline-flex', alignItems: 'center', gap: '0.35rem', textDecoration: 'none' }}
                      >
                        <MessageSquare size={14} />
                        <span>Chat on WhatsApp ({rawP})</span>
                      </a>
                    );
                  })()}
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    style={{ fontSize: '0.74rem' }}
                    onClick={() => applyPitchPreset('free_demo')}
                  >
                    🚀 24h Free Demo Offer (Zero Risk)
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    style={{ fontSize: '0.74rem' }}
                    onClick={() => applyPitchPreset('speed_audit')}
                  >
                    ⚡ Mobile Speed & Bug Audit
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    style={{ fontSize: '0.74rem' }}
                    onClick={() => applyPitchPreset('whatsapp_engine')}
                  >
                    💬 WhatsApp Lead Engine Pitch
                  </button>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Subject Line</label>
                <input
                  type="text"
                  className="input-field"
                  value={editSubject}
                  onChange={(e) => setEditSubject(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Personalized Email Body (Preview & Edit)</label>
                <textarea
                  className="input-field"
                  rows={14}
                  style={{ fontFamily: 'inherit', fontSize: '0.85rem', lineHeight: 1.55 }}
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.6rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => handleRejectItem(activeItem)}
                    style={{ color: '#ef4444', borderColor: '#ef4444' }}
                  >
                    <XCircle size={14} /> Reject Draft
                  </button>
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => handleUnsubscribeItem(activeItem)}
                    title="Add recipient email to permanent Unsubscribe list"
                  >
                    <Ban size={14} /> Mark Unsubscribed
                  </button>
                </div>

                <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  <button
                    className="btn btn-primary"
                    style={{
                      background: '#10b981',
                      borderColor: '#10b981',
                      color: '#ffffff',
                      fontWeight: 800,
                      fontSize: '0.88rem',
                      padding: '0.55rem 1.35rem',
                      boxShadow: '0 2px 6px rgba(16, 185, 129, 0.35)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.45rem',
                      cursor: isSending ? 'not-allowed' : 'pointer',
                    }}
                    disabled={isSending}
                    onClick={() => handleDirectSendNow(activeItem)}
                  >
                    {isSending ? <RefreshCw size={15} className="animate-spin" /> : <Send size={15} />}
                    <span>Send Real Email via Gmail (1-Click)</span>
                  </button>

                  <a
                    href="https://mail.google.com/mail/u/0/#sent"
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-outline"
                    style={{
                      fontWeight: 600,
                      fontSize: '0.82rem',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      textDecoration: 'none',
                    }}
                    title="Open your real Gmail Sent folder to see all sent emails"
                  >
                    <ExternalLink size={14} />
                    <span>View Gmail Sent Folder</span>
                  </a>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Explicit Authorization Confirmation Modal (workspace-integration compliance) */}
      <Modal
        isOpen={sendModeConfirm.open}
        onClose={() => setSendModeConfirm({ open: false, mode: 'manual', targets: [] })}
        title={
          sendModeConfirm.mode === 'autopilot_loop'
            ? 'Authorize Continuous Auto-Pilot Gmail + Discovery Loop'
            : sendModeConfirm.mode === 'authorized_batch'
            ? 'Authorize Automated Batch Gmail Sending'
            : 'Confirm Manual Gmail Transmission'
        }
        footer={
          <>
            <button
              className="btn btn-outline"
              onClick={() => setSendModeConfirm({ open: false, mode: 'manual', targets: [] })}
            >
              Cancel
            </button>
            <button className="btn btn-primary" onClick={executeConfirmedSend}>
              <Mail size={15} />{' '}
              {sendModeConfirm.mode === 'autopilot_loop'
                ? 'Start Continuous Auto-Pilot'
                : `Confirm & Send Real Email${sendModeConfirm.targets.length > 1 ? 's' : ''}`}
            </button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.86rem' }}>
          {sendModeConfirm.mode === 'autopilot_loop' ? (
            <>
              <p style={{ margin: 0 }}>
                You are authorizing continuous Auto-Pilot outreach via your connected Gmail account (
                <strong>{connectedEmail || getConfiguredSenderEmail()}</strong>):
              </p>
              <ul style={{ margin: '0.25rem 0', paddingLeft: '1.25rem', lineHeight: 1.5 }}>
                <li>Send personalized proposals <strong>one-by-one</strong> to all verified unsent leads.</li>
                <li>
                  Automatically run fresh non-repeating Lead Discovery (<strong>{autoBatchSize} leads</strong> in{' '}
                  <strong>{autoCity}, {autoCountry}</strong> — {autoCategory}) when the queue finishes, then continue emailing new leads.
                </li>
                <li>Respect duplicate-send blocking, MX checks, and unsubscribe opt-out lists on every address.</li>
              </ul>
            </>
          ) : (
            <>
              <p style={{ margin: 0 }}>
                You are about to send <strong>{sendModeConfirm.targets.length}</strong> real email
                {sendModeConfirm.targets.length > 1 ? 's' : ''} through your connected Google Workspace Gmail account (
                <strong>{connectedEmail || getConfiguredSenderEmail()}</strong>).
              </p>
              <div style={{ background: 'var(--bg-muted)', padding: '0.75rem', borderRadius: '8px', maxHeight: '180px', overflowY: 'auto' }}>
                {sendModeConfirm.targets.map((t) => (
                  <div key={t.id} style={{ fontSize: '0.78rem', padding: '0.25rem 0', borderBottom: '1px solid var(--border-color)' }}>
                    <strong>{t.businessName}</strong> → {t.recipientEmail} ({t.city}, {t.countryName})
                  </div>
                ))}
              </div>
            </>
          )}
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            All targets pass DNS MX verification, duplicate-send checks, and unsubscribe opt-out filtering. You can Pause or Stop anytime.
          </div>
        </div>
      </Modal>

      <WhatsAppBulkSendModal
        isOpen={isWhatsAppBulkOpen}
        onClose={() => setIsWhatsAppBulkOpen(false)}
        leads={selectedLeads.length > 0 ? selectedLeads : allDbLeads}
        scopeLabel={selectedLeads.length > 0 ? 'Selected Outreach Leads' : 'All Database Leads'}
        onShowToast={onShowToast}
        onCompleted={() => {
          void refreshLeadsFromDb();
        }}
      />
    </div>
  );
};
