import React, { useState } from 'react';
import {
  Send,
  Zap,
  MessageSquare,
  Mail,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  ShieldCheck,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import { Lead } from '../types';
import { Modal } from './ModalAndToast';
import { getMaxedLogicPitch, MAXEDLOGIC_SENDER } from '../utils/maxedLogicPitches';
import { sendEmailViaGmailApi } from '../services/gmailApiService';
import { getAccessToken, googleSignIn } from '../services/googleWorkspaceAuth';
import { useLeads } from '../context/LeadContext';
import { isRealDeliverableEmail } from '../utils/deliverability';
import { isLeadDpActive } from '../utils/profileDpService';

interface MassBlastModalProps {
  isOpen: boolean;
  onClose: () => void;
  leads: Lead[];
  onComplete?: () => void;
  onNavigateToAdmin?: () => void;
  onShowToast: (title: string, message: string, type: 'success' | 'error' | 'info') => void;
}

export type MassDispatchStrategy = 'smart_dual' | 'all_gmail' | 'all_whatsapp';

interface DispatchLogItem {
  id: number;
  businessName: string;
  channel: 'Email' | 'WhatsApp';
  app: string;
  recipient: string;
  status: 'Sent' | 'Failed' | 'Queued';
  time: string;
  note?: string;
}

export const MassBlastModal: React.FC<MassBlastModalProps> = ({
  isOpen,
  onClose,
  leads,
  onComplete,
  onNavigateToAdmin,
  onShowToast,
}) => {
  const { markLeadPitched, updateLead, importScannedLeads } = useLeads();

  const [strategy, setStrategy] = useState<MassDispatchStrategy>('smart_dual');
  const [onlyWithProfileDp, setOnlyWithProfileDp] = useState<boolean>(true);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [currentProcessingLead, setCurrentProcessingLead] = useState<string>('');
  const [dispatchLogs, setDispatchLogs] = useState<DispatchLogItem[]>([]);
  const [isFinished, setIsFinished] = useState<boolean>(false);

  // Stats calculation
  const totalLeads = leads.length;
  const leadsWithEmail = leads.filter((l) => Boolean(l.email?.trim() && isRealDeliverableEmail(l.email) && (!onlyWithProfileDp || isLeadDpActive(l))));
  const leadsWithPhone = leads.filter((l) => Boolean(l.phoneNumber || l.whatsAppNumber));

  const handleStartMassBlast = async () => {
    if (leads.length === 0) {
      onShowToast('No Leads Found', 'There are no leads available to dispatch.', 'info');
      return;
    }

    // If strategy involves Gmail, verify OAuth connection first
    let gmailToken: string | null = null;
    if (strategy === 'smart_dual' || strategy === 'all_gmail') {
      gmailToken = await getAccessToken();
      if (!gmailToken) {
        onShowToast('Authorizing Gmail...', 'Connecting your Google account for real Gmail sending...', 'info');
        try {
          const res = await googleSignIn();
          if (res?.accessToken) {
            gmailToken = res.accessToken;
          }
        } catch (err: any) {
          onShowToast('Gmail OAuth Required', err?.message || 'Google Login required to send emails via Gmail API.', 'error');
          if (strategy === 'all_gmail') return;
        }
      }
      if (!gmailToken && strategy === 'all_gmail') {
        onShowToast('Gmail Not Connected', 'Please connect Gmail via Google Login before running a Gmail batch blast.', 'error');
        return;
      }
    }

    setIsProcessing(true);
    setProgressPercent(0);
    setDispatchLogs([]);
    setIsFinished(false);

    // Ensure all leads are persisted
    importScannedLeads(leads);

    const newLogs: DispatchLogItem[] = [];
    let realSentCount = 0;
    let realFailCount = 0;

    for (let i = 0; i < leads.length; i++) {
      const lead = leads[i];
      setCurrentProcessingLead(`${lead.businessName} (${i + 1} of ${totalLeads})`);
      const pct = Math.round(((i + 1) / totalLeads) * 100);
      setProgressPercent(pct);

      const pitch = getMaxedLogicPitch(lead);
      const currentTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

      const targetEmail = (lead.email || '').trim();
      const hasValidDp = !onlyWithProfileDp || isLeadDpActive(lead);
      const hasValidEmail = Boolean(targetEmail && isRealDeliverableEmail(targetEmail) && hasValidDp);
      const hasPhone = Boolean(lead.phoneNumber || lead.whatsAppNumber);
      const phoneRecipient = lead.whatsAppNumber || lead.phoneNumber || '';

      if (strategy === 'all_whatsapp') {
        if (!hasPhone) {
          realFailCount += 1;
          newLogs.push({
            id: lead.id,
            businessName: lead.businessName,
            channel: 'WhatsApp',
            app: 'WhatsApp',
            recipient: 'No Phone',
            status: 'Failed',
            time: currentTime,
            note: 'Skipped: no verified phone number available.',
          });
        } else {
          markLeadPitched(lead.id, 'WhatsApp', {
            message: pitch.whatsAppText,
            app: 'WhatsApp App',
            recipient: phoneRecipient,
          });
          realSentCount += 1;
          newLogs.push({
            id: lead.id,
            businessName: lead.businessName,
            channel: 'WhatsApp',
            app: 'WhatsApp App',
            recipient: phoneRecipient,
            status: 'Sent',
            time: currentTime,
            note: `Prepared WhatsApp outreach from +91 ${MAXEDLOGIC_SENDER.senderPhoneRaw}`,
          });
        }
      } else if (strategy === 'all_gmail' || (strategy === 'smart_dual' && hasValidEmail)) {
        if (!hasValidEmail) {
          realFailCount += 1;
          newLogs.push({
            id: lead.id,
            businessName: lead.businessName,
            channel: 'Email',
            app: 'Gmail API',
            recipient: targetEmail || 'No Verified Email',
            status: 'Failed',
            time: currentTime,
            note: 'Skipped: missing deliverable business email or blocked customer-care inbox.',
          });
        } else if (!gmailToken) {
          realFailCount += 1;
          newLogs.push({
            id: lead.id,
            businessName: lead.businessName,
            channel: 'Email',
            app: 'Gmail API',
            recipient: targetEmail,
            status: 'Failed',
            time: currentTime,
            note: 'Gmail OAuth token missing — click Connect Gmail and retry.',
          });
        } else {
          const apiRes = await sendEmailViaGmailApi(
            targetEmail,
            MAXEDLOGIC_SENDER.senderEmail,
            pitch.emailSubject,
            pitch.emailBody
          );

          if (apiRes.success) {
            realSentCount += 1;
            const channelMode = strategy === 'smart_dual' && hasPhone ? 'Both' : 'Email';
            markLeadPitched(lead.id, channelMode, {
              subject: pitch.emailSubject,
              message: channelMode === 'Both' ? pitch.whatsAppText : pitch.emailBody,
              app: channelMode === 'Both' ? 'Both' : 'Gmail API',
              recipient: channelMode === 'Both' ? `Gmail: ${targetEmail} | WA: ${phoneRecipient}` : targetEmail,
            });
            newLogs.push({
              id: lead.id,
              businessName: lead.businessName,
              channel: 'Email',
              app: 'Gmail API',
              recipient: targetEmail,
              status: 'Sent',
              time: currentTime,
              note: `Real email sent (ID: ${apiRes.messageId || 'OK'})`,
            });
          } else {
            realFailCount += 1;
            if (apiRes.needsAuth) gmailToken = null;
            newLogs.push({
              id: lead.id,
              businessName: lead.businessName,
              channel: 'Email',
              app: 'Gmail API',
              recipient: targetEmail,
              status: 'Failed',
              time: currentTime,
              note: apiRes.error || 'Gmail delivery failed.',
            });
          }
        }
      } else {
        // smart_dual fallback to WhatsApp when no valid email
        if (hasPhone) {
          markLeadPitched(lead.id, 'WhatsApp', {
            message: pitch.whatsAppText,
            app: 'WhatsApp App',
            recipient: phoneRecipient,
          });
          realSentCount += 1;
          newLogs.push({
            id: lead.id,
            businessName: lead.businessName,
            channel: 'WhatsApp',
            app: 'WhatsApp App',
            recipient: phoneRecipient,
            status: 'Sent',
            time: currentTime,
            note: `Prepared WhatsApp outreach from +91 ${MAXEDLOGIC_SENDER.senderPhoneRaw}`,
          });
        } else {
          realFailCount += 1;
          newLogs.push({
            id: lead.id,
            businessName: lead.businessName,
            channel: 'Email',
            app: 'None',
            recipient: 'No Contact',
            status: 'Failed',
            time: currentTime,
            note: 'No valid email or phone contact available.',
          });
        }
      }

      setDispatchLogs([...newLogs]);
      await new Promise((resolve) => setTimeout(resolve, 150));
    }

    setIsProcessing(false);
    setIsFinished(true);

    if (realSentCount > 0 && realFailCount === 0) {
      onShowToast('Mass Dispatch Complete!', `Successfully sent ${realSentCount} real outreach message(s).`, 'success');
    } else if (realSentCount > 0 && realFailCount > 0) {
      onShowToast('Partial Dispatch', `Sent ${realSentCount}, Failed/Skipped ${realFailCount}. Review logs below.`, 'info');
    } else {
      onShowToast('Dispatch Failed', `0 messages sent (${realFailCount} failed). Ensure Gmail OAuth is connected.`, 'error');
    }

    if (onComplete) onComplete();
  };

  const handleResetAndClose = () => {
    setIsProcessing(false);
    setIsFinished(false);
    setProgressPercent(0);
    setDispatchLogs([]);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={isProcessing ? () => {} : handleResetAndClose}
      title="🚀 1-Click Mass Blast (एक साथ सबको भेजो)"
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            className="btn btn-outline"
            disabled={isProcessing}
            onClick={handleResetAndClose}
          >
            {isFinished ? 'Close' : 'Cancel'}
          </button>

          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {isFinished && onNavigateToAdmin && (
              <button
                className="btn btn-outline"
                style={{ borderColor: '#6366f1', color: '#6366f1', fontWeight: 700 }}
                onClick={() => {
                  handleResetAndClose();
                  onNavigateToAdmin();
                }}
              >
                <ShieldCheck size={15} />
                <span>📊 View Dispatch Report in Admin Panel</span>
              </button>
            )}

            {!isFinished && (
              <button
                className="btn btn-primary"
                style={{
                  background: 'linear-gradient(135deg, #10b981 0%, #2563eb 100%)',
                  borderColor: 'transparent',
                  fontWeight: 800,
                  fontSize: '0.9rem',
                  padding: '0.65rem 1.4rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  boxShadow: '0 4px 14px rgba(16, 185, 129, 0.3)',
                }}
                disabled={isProcessing}
                onClick={handleStartMassBlast}
              >
                {isProcessing ? (
                  <>
                    <RefreshCw size={16} className="spin" />
                    <span>Blasting... ({progressPercent}%)</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={16} />
                    <span>🚀 Start Mass Blast to All {totalLeads} Clients Now</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {/* Header Alert */}
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(37, 99, 235, 0.1) 100%)',
            border: '1.5px solid #10b981',
            borderRadius: 'var(--radius-md)',
            padding: '0.9rem 1.15rem',
          }}
        >
          <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#065f46', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <Zap size={17} color="#10b981" />
            <span>एक क्लिक में सारे खोजे गए {totalLeads} क्लाइंट्स को प्रपोजल भेजें</span>
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-main)', marginTop: '0.35rem', lineHeight: 1.5 }}>
            अब आपको एक-एक करके 20 या 30 बार क्लिक करने की ज़रूरत नहीं है! यह सिस्टम आपके <strong>{MAXEDLOGIC_SENDER.companyName}</strong> की तरफ से
            सभी क्लाइंट्स के लिए अलग-अलग कस्टमाइज्ड प्रपोजल अपने आप तैयार करके एक साथ भेजता है, और पूरी रिपोर्ट <strong>Admin Panel</strong> में दर्ज करता है।
          </div>
        </div>

        {/* Sender and Target Breakdown Bar */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '0.75rem',
          }}
        >
          <div
            style={{
              padding: '0.75rem',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-md)',
            }}
          >
            <div style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              कुल क्लाइंट्स (Total Targets)
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-main)', marginTop: '0.2rem' }}>
              {totalLeads} बिज़नेस
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              🔵 {leadsWithEmail.length} ईमेल वाले • 🟢 {leadsWithPhone.length} फोन/व्हाट्सएप वाले
            </div>
          </div>

          <div
            style={{
              padding: '0.75rem',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-md)',
            }}
          >
            <div style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              अधिकृत प्रेषक (Official Sender)
            </div>
            <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-main)', marginTop: '0.25rem' }}>
              {MAXEDLOGIC_SENDER.senderName} ({MAXEDLOGIC_SENDER.companyName})
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              ✉️ {MAXEDLOGIC_SENDER.senderEmail} <br />
              📞 +91 {MAXEDLOGIC_SENDER.senderPhoneRaw}
            </div>
          </div>
        </div>

        {/* Strategy Selection (When not processing and not finished) */}
        {!isProcessing && !isFinished && (
          <div>
            <label className="field-label" style={{ fontWeight: 800, fontSize: '0.85rem', marginBottom: '0.4rem' }}>
              संदेश भेजने का तरीका चुनें (Select Mass Blast Channel):
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.5rem' }}>
              {/* Option 1: Smart Dual Channel */}
              <label
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.75rem',
                  padding: '0.8rem 1rem',
                  borderRadius: 'var(--radius-md)',
                  border: strategy === 'smart_dual' ? '2px solid #10b981' : '1px solid var(--border-color)',
                  background: strategy === 'smart_dual' ? 'rgba(16, 185, 129, 0.08)' : 'var(--bg-surface)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <input
                  type="radio"
                  name="massStrategy"
                  checked={strategy === 'smart_dual'}
                  onChange={() => setStrategy('smart_dual')}
                  style={{ marginTop: '0.2rem', accentColor: '#10b981' }}
                />
                <div>
                  <div style={{ fontWeight: 800, fontSize: '0.88rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span>⚡ Smart Dual Blast (सबको भेजो: ईमेल को Gmail + फोन को WhatsApp)</span>
                    <span style={{ background: '#10b981', color: '#fff', fontSize: '0.65rem', padding: '1px 6px', borderRadius: '4px', fontWeight: 800 }}>
                      RECOMMENDED
                    </span>
                  </div>
                  <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                    जिन बिज़नेस का ईमेल है, उन्हें <strong>Gmail API</strong> से भेजा जाएगा। जिनके पास सिर्फ फोन नंबर है, उनके लिए <strong>WhatsApp</strong> पिच तैयार होगी। कोई भी ग्राहक नहीं छूटेगा!
                  </div>
                </div>
              </label>

              {/* Option 2: 100% Gmail API */}
              <label
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.75rem',
                  padding: '0.8rem 1rem',
                  borderRadius: 'var(--radius-md)',
                  border: strategy === 'all_gmail' ? '2px solid #2563eb' : '1px solid var(--border-color)',
                  background: strategy === 'all_gmail' ? 'rgba(37, 99, 235, 0.08)' : 'var(--bg-surface)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <input
                  type="radio"
                  name="massStrategy"
                  checked={strategy === 'all_gmail'}
                  onChange={() => setStrategy('all_gmail')}
                  style={{ marginTop: '0.2rem', accentColor: '#2563eb' }}
                />
                <div>
                  <div style={{ fontWeight: 800, fontSize: '0.88rem', color: 'var(--text-main)' }}>
                    🔵 100% Automated Gmail API Blast (बैकग्राउंड में जीमेल से भेजो)
                  </div>
                  <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                    केवल वेरिफाइड उपलब्ध जीमेल ({leadsWithEmail.length} लीड्स) पर ही सीधे आपके जीमेल (<strong>{MAXEDLOGIC_SENDER.senderEmail}</strong>) से ईमेल भेजा जाएगा। बिना ईमेल वाले क्लाइंट्स पर कोई ईमेल नहीं भेजा जाएगा ताकि "Address Not Found" एरर न आए।
                  </div>
                </div>
              </label>

              {/* Option 3: All WhatsApp */}
              <label
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.75rem',
                  padding: '0.8rem 1rem',
                  borderRadius: 'var(--radius-md)',
                  border: strategy === 'all_whatsapp' ? '2px solid #059669' : '1px solid var(--border-color)',
                  background: strategy === 'all_whatsapp' ? 'rgba(5, 150, 105, 0.08)' : 'var(--bg-surface)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <input
                  type="radio"
                  name="massStrategy"
                  checked={strategy === 'all_whatsapp'}
                  onChange={() => setStrategy('all_whatsapp')}
                  style={{ marginTop: '0.2rem', accentColor: '#059669' }}
                />
                <div>
                  <div style={{ fontWeight: 800, fontSize: '0.88rem', color: 'var(--text-main)' }}>
                    🟢 Mass WhatsApp Blast (+91 {MAXEDLOGIC_SENDER.senderPhoneRaw} से व्हाट्सएप)
                  </div>
                  <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                    सभी क्लाइंट्स के लिए व्हाट्सएप कस्टमाइज्ड मैसेज तैयार कर एडमिन पैनल में रिकॉर्ड कर दिए जाएँगे।
                  </div>
                </div>
              </label>
            </div>

            {/* DP Only Safety Checkbox */}
            <div style={{ marginTop: '0.75rem', padding: '0.65rem 0.85rem', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              <input
                type="checkbox"
                id="onlyDpCheckbox"
                checked={onlyWithProfileDp}
                onChange={(e) => setOnlyWithProfileDp(e.target.checked)}
                style={{ width: 17, height: 17, accentColor: '#10b981', cursor: 'pointer' }}
              />
              <label htmlFor="onlyDpCheckbox" style={{ cursor: 'pointer', fontSize: '0.78rem', color: '#166534', margin: 0 }}>
                <strong>👤 केवल वास्तविक Gmail Profile DP व डायरेक्ट ओनर/फाउंडर/डॉक्टर इनबॉक्स पर भेजें</strong>
                <div style={{ fontSize: '0.72rem', color: '#15803d', marginTop: '1px' }}>
                  🛡️ 0% Customer Care Policy: care@, support@, query@ इत्यादि ऑटोमैटिकली ब्लॉक हैं। केवल असली Google Profile DP वाले डायरेक्ट ओनर, डॉक्टर व फाउंडर इनबॉक्स पर ही ईमेल जाएगी।
                </div>
              </label>
            </div>
          </div>
        )}

        {/* Progress Bar (Visible when processing or finished) */}
        {(isProcessing || isFinished) && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem', fontSize: '0.82rem' }}>
              <span style={{ fontWeight: 700, color: 'var(--text-main)' }}>
                {isFinished ? '🎉 डिस्पैच पूरा हुआ (All Messages Dispatched)!' : `प्रगति: ${currentProcessingLead}`}
              </span>
              <span style={{ fontWeight: 800, color: '#10b981' }}>{progressPercent}%</span>
            </div>
            <div style={{ width: '100%', height: 10, background: 'var(--bg-muted)', borderRadius: 999, overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  width: `${progressPercent}%`,
                  background: 'linear-gradient(90deg, #10b981 0%, #2563eb 100%)',
                  transition: 'width 0.15s ease',
                }}
              />
            </div>
          </div>
        )}

        {/* Live Dispatch Stream Logs */}
        {dispatchLogs.length > 0 && (
          <div>
            <div style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-muted)', marginBottom: '0.35rem', display: 'flex', justifyContent: 'space-between' }}>
              <span>Live Delivery Log ({dispatchLogs.length} of {totalLeads} processed):</span>
              <span style={{ color: '#10b981' }}>
                Sent: {dispatchLogs.filter((l) => l.status === 'Sent').length} • Failed: {dispatchLogs.filter((l) => l.status === 'Failed').length}
              </span>
            </div>
            <div
              style={{
                maxHeight: 200,
                overflowY: 'auto',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-sm)',
                padding: '0.5rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.35rem',
                fontSize: '0.76rem',
                fontFamily: 'monospace',
              }}
            >
              {dispatchLogs.slice().reverse().map((log, idx) => {
                const isFail = log.status === 'Failed';
                return (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.15rem',
                      padding: '0.3rem 0.45rem',
                      borderRadius: '4px',
                      background: isFail
                        ? 'rgba(239, 68, 68, 0.08)'
                        : log.channel === 'Email'
                        ? 'rgba(37, 99, 235, 0.05)'
                        : 'rgba(16, 185, 129, 0.05)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span style={{ color: isFail ? '#ef4444' : '#10b981', fontWeight: 800 }}>
                          {isFail ? '✗' : '✓'}
                        </span>
                        <span
                          style={{
                            padding: '1px 5px',
                            borderRadius: '3px',
                            fontSize: '0.65rem',
                            fontWeight: 800,
                            background: isFail ? '#ef4444' : log.channel === 'Email' ? '#2563eb' : '#10b981',
                            color: '#fff',
                          }}
                        >
                          {log.app}
                        </span>
                        <strong style={{ color: 'var(--text-main)' }}>{log.businessName}</strong>
                        <span style={{ color: 'var(--text-muted)' }}>➔ {log.recipient}</span>
                      </div>
                      <span style={{ color: 'var(--text-subtle)', fontSize: '0.7rem' }}>{log.time}</span>
                    </div>
                    {isFail && log.note && (
                      <div style={{ color: '#ef4444', fontSize: '0.7rem', paddingLeft: '1.1rem' }}>
                        {log.note}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};
