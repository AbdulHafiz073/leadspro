import React, { useState } from 'react';
import {
  MessageSquare,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Copy,
  Zap,
  Send,
  Smartphone,
  Sliders,
  Check,
  RotateCcw,
  Sparkles,
  Info,
} from 'lucide-react';
import { Lead } from '../types';
import { Modal } from './ModalAndToast';
import { getMaxedLogicPitch, MAXEDLOGIC_SENDER } from '../utils/maxedLogicPitches';
import { normalizeClientPhoneDigits } from '../services/whatsappConnectService';
import {
  SERVICE_MODES,
  PRODUCT_CATEGORIES,
  CATEGORY_SUBTYPES,
  FINAL_CONFIRM_OPTIONS,
  type ProductCategoryId,
} from '../utils/chatbotFlowOptions';

interface WhatsAppInteractiveModalProps {
  isOpen: boolean;
  onClose: () => void;
  lead: Lead | null;
  onMarkReplied?: (lead: Lead) => void;
  onShowToast: (title: string, message: string, type: 'success' | 'error' | 'info') => void;
}

export const WhatsAppInteractiveModal: React.FC<WhatsAppInteractiveModalProps> = ({
  isOpen,
  onClose,
  lead,
  onMarkReplied,
  onShowToast,
}) => {
  const [activeTab, setActiveTab] = useState<'preview' | 'apiConfig'>('preview');
  const [simStep, setSimStep] = useState<'mode' | 'category' | 'subtype' | 'confirm' | 'done'>('mode');
  const [simMode, setSimMode] = useState<string>('');
  const [simCategoryId, setSimCategoryId] = useState<ProductCategoryId>('cat_website');
  const [simCategoryLabel, setSimCategoryLabel] = useState<string>('');
  const [simSubType, setSimSubType] = useState<string>('');
  const [simulatedReply, setSimulatedReply] = useState<'YES' | 'NO' | null>(null);
  const [isSendingViaApi, setIsSendingViaApi] = useState(false);
  const [copied, setCopied] = useState(false);

  // Meta Cloud API settings saved in localStorage
  const [metaToken, setMetaToken] = useState(() => {
    try {
      return localStorage.getItem('maxedlogic_meta_wa_token') || '';
    } catch (e) {
      return '';
    }
  });

  const [phoneNumberId, setPhoneNumberId] = useState(() => {
    try {
      return localStorage.getItem('maxedlogic_meta_wa_phone_id') || '';
    } catch (e) {
      return '';
    }
  });

  const [targetPhoneInput, setTargetPhoneInput] = useState<string>(() => {
    return lead?.whatsAppNumber || lead?.phoneNumber || '';
  });

  React.useEffect(() => {
    if (lead) {
      setTargetPhoneInput(lead.whatsAppNumber || lead.phoneNumber || '');
      setSimStep('mode');
      setSimMode('');
      setSimCategoryLabel('');
      setSimSubType('');
      setSimulatedReply(null);
    }
  }, [lead]);

  if (!lead) return null;

  const pitch = getMaxedLogicPitch(lead);
  const rawPhone = targetPhoneInput || lead.whatsAppNumber || lead.ownerPhone || lead.locationPhone || lead.phoneNumber || '';
  const cleanPhone = normalizeClientPhoneDigits(rawPhone, lead.countryName || lead.countryCode);

  const handleSaveApiConfig = () => {
    try {
      localStorage.setItem('maxedlogic_meta_wa_token', metaToken.trim());
      localStorage.setItem('maxedlogic_meta_wa_phone_id', phoneNumberId.trim());
      onShowToast('Settings Saved', 'Meta WhatsApp Cloud API credentials saved successfully.', 'success');
      setActiveTab('preview');
    } catch (e) {
      onShowToast('Error', 'Failed to save settings.', 'error');
    }
  };

  const resetSimulation = () => {
    setSimStep('mode');
    setSimMode('');
    setSimCategoryLabel('');
    setSimSubType('');
    setSimulatedReply(null);
  };

  const handleSimulateFinalDecision = async (option: 'YES' | 'NO') => {
    setSimulatedReply(option);
    setSimStep('done');

    try {
      await fetch('/api/client-chat/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId: lead.id,
          businessName: lead.businessName,
          senderPhone: cleanPhone || undefined,
          serviceMode: simMode || 'New Create',
          selectedCategory: simCategoryLabel || 'Website',
          selectedSubType: simSubType || 'Business / Corporate Website',
          finalDecision: option,
          selection: `${simMode} → ${simCategoryLabel} → ${simSubType} → ${option}`,
          messageText: `Interactive Bot Preview Choice (${option})`,
        }),
      });
    } catch {
      // non-blocking
    }

    if (option === 'YES') {
      onShowToast(
        'Saved to Admin Panel!',
        `${lead.businessName}: ${simMode} → ${simCategoryLabel} → ${simSubType} → YES`,
        'success'
      );
      if (onMarkReplied) {
        onMarkReplied(lead);
      }
    } else {
      onShowToast(
        'Saved NO Response to Admin Panel',
        `${lead.businessName}: ${simMode} → ${simCategoryLabel} → ${simSubType} → NO`,
        'info'
      );
    }
  };

  const handleSendViaMetaApi = async () => {
    if (!cleanPhone) {
      onShowToast('Phone Missing', 'Recipient phone number is missing.', 'error');
      return;
    }

    setIsSendingViaApi(true);
    const clientChatUrl =
      typeof window !== 'undefined'
        ? `${window.location.origin}/?clientChat=1&leadId=${lead.id}&biz=${encodeURIComponent(lead.businessName)}`
        : '';
    try {
      const res = await fetch('/api/whatsapp/send-interactive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: cleanPhone,
          leadId: lead.id,
          businessName: lead.businessName,
          pitchType: pitch.pitchType,
          clientChatUrl,
          metaToken: metaToken.trim() || undefined,
          phoneNumberId: phoneNumberId.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (data.success) {
        if (data.channel === 'Meta WhatsApp Business Cloud API') {
          onShowToast(
            'Interactive WhatsApp Sent!',
            `Native YES/NO buttons dispatched to +${cleanPhone} via Meta WhatsApp Cloud API!`,
            'success'
          );
        } else {
          // Fallback wa.me opened
          window.open(data.waUrl, '_blank', 'noopener,noreferrer');
          onShowToast(
            'WhatsApp Opened',
            `Opened WhatsApp with YES/NO Quick-Reply prompt for +${cleanPhone}!`,
            'success'
          );
        }
      } else {
        onShowToast('Dispatch Error', data.error || 'Failed to dispatch interactive message.', 'error');
      }
    } catch (err: any) {
      onShowToast('Error', err.message || 'WhatsApp dispatch failure.', 'error');
    } finally {
      setIsSendingViaApi(false);
    }
  };

  const handleDirectWhatsAppWeb = () => {
    if (!cleanPhone) {
      onShowToast('Phone Missing', 'Recipient phone number is missing.', 'error');
      return;
    }
    const targetUrl = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(pitch.whatsAppText)}`;
    window.open(targetUrl, '_blank', 'noopener,noreferrer');
    onShowToast(
      'WhatsApp खुला (+91 97597 25212)',
      `आपके नंबर 9759725212 से ${lead.businessName} (+${cleanPhone}) को मैसेज भेजने के लिए WhatsApp खुल गया है! सेंड दबाएं।`,
      'success'
    );
  };

  const handleCopyText = () => {
    navigator.clipboard.writeText(pitch.whatsAppText);
    setCopied(true);
    onShowToast('Copied', 'WhatsApp message copied to clipboard!', 'success');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="💬 WhatsApp Interactive Bot (प्रेषक: +91 97597 25212)"
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', flexWrap: 'wrap', gap: '0.5rem' }}>
          <button className="btn btn-outline" onClick={onClose}>
            Close
          </button>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              className="btn btn-outline"
              onClick={handleCopyText}
              style={{ fontSize: '0.8rem' }}
            >
              <Copy size={13} />
              <span>{copied ? 'Copied!' : 'Copy Text'}</span>
            </button>
            <button
              className="btn btn-primary"
              style={{ background: '#10b981', borderColor: '#10b981', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
              onClick={handleDirectWhatsAppWeb}
              title="सीधे आपके नंबर 9759725212 से WhatsApp खोलें"
            >
              <MessageSquare size={15} />
              <span>🚀 9759725212 से तुरंत WhatsApp भेजें</span>
            </button>
            <button
              className="btn btn-outline"
              style={{ borderColor: '#0284c7', color: '#0284c7', fontWeight: 700 }}
              disabled={isSendingViaApi}
              onClick={handleSendViaMetaApi}
            >
              <Zap size={14} />
              <span>{isSendingViaApi ? 'Sending...' : '⚡ Meta Cloud API'}</span>
            </button>
          </div>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {/* Top Sender Bar: Locked to +91 97597 25212 */}
        <div
          style={{
            background: '#f0fdf4',
            border: '1px solid #86efac',
            borderRadius: '8px',
            padding: '0.65rem 0.85rem',
            fontSize: '0.84rem',
            color: '#166534',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.5rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Smartphone size={18} color="#16a34a" />
            <span><strong>प्रेषक WhatsApp नंबर (Sender):</strong> +91 97597 25212 (Abdul Hafiz | MaxedLogic)</span>
          </div>
          <span style={{ fontSize: '0.72rem', background: '#dcfce7', color: '#15803d', padding: '0.15rem 0.5rem', borderRadius: 999, fontWeight: 800 }}>
            ✓ Verified Sender: 9759725212
          </span>
        </div>
        {/* Navigation Tabs */}
        <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
          <button
            type="button"
            className="btn"
            style={{
              padding: '0.35rem 0.75rem',
              fontSize: '0.82rem',
              background: activeTab === 'preview' ? 'var(--primary)' : 'transparent',
              color: activeTab === 'preview' ? '#fff' : 'var(--text-color)',
              fontWeight: 700,
            }}
            onClick={() => setActiveTab('preview')}
          >
            <Smartphone size={14} />
            <span>WhatsApp Interactive Screen (Live Preview)</span>
          </button>
          <button
            type="button"
            className="btn"
            style={{
              padding: '0.35rem 0.75rem',
              fontSize: '0.82rem',
              background: activeTab === 'apiConfig' ? 'var(--primary)' : 'transparent',
              color: activeTab === 'apiConfig' ? '#fff' : 'var(--text-color)',
              fontWeight: 700,
            }}
            onClick={() => setActiveTab('apiConfig')}
          >
            <Sliders size={14} />
            <span>Meta WhatsApp Cloud API Settings</span>
          </button>
        </div>

        {activeTab === 'preview' ? (
          <div>
            {/* Info notice answering user's direct question */}
            <div
              style={{
                background: '#ecfdf5',
                border: '1px solid #a7f3d0',
                borderRadius: '8px',
                padding: '0.65rem 0.85rem',
                fontSize: '0.82rem',
                color: '#065f46',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.5rem',
                marginBottom: '1rem',
              }}
            >
              <CheckCircle2 size={18} color="#059669" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>
                <strong>हाँ! WhatsApp पर बिल्कुल इसी तरह [YES] और [NO] के क्लिक करने वाले बटन्स भेजे जा सकते हैं:</strong>
                <div style={{ fontSize: '0.78rem', marginTop: '0.2rem', color: '#047857' }}>
                  • <strong>Meta WhatsApp Business Cloud API:</strong> नीचे दिए गए ठीक वैसे ही असली इंटरैक्टिव बटन्स क्लाइंट के फोन पर आते हैं।<br />
                  • <strong>1-Click WhatsApp Direct:</strong> 1-क्लिक में फॉर्मैटेड क्विक-रिप्लाई संदेश जाता है जिससे क्लाइंट सिर्फ 1 शब्द में रिप्लाई कर सकता है।
                </div>
              </div>
            </div>

            {/* Target details & Number Editor */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '0.5rem',
                marginBottom: '0.75rem',
                padding: '0.5rem 0.75rem',
                background: 'rgba(0,0,0,0.02)',
                borderRadius: '8px',
                border: '1px solid var(--border-color)',
                fontSize: '0.8rem',
              }}
            >
              <div>
                <strong>Client:</strong> {lead.businessName} ({lead.city || 'India'})
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: 600 }}>WhatsApp No:</span>
                <input
                  type="text"
                  className="input"
                  value={targetPhoneInput}
                  onChange={(e) => setTargetPhoneInput(e.target.value)}
                  style={{ padding: '0.2rem 0.5rem', fontSize: '0.8rem', width: '145px', fontWeight: 700 }}
                  placeholder="+91 XXXXX XXXXX"
                />
                <button
                  type="button"
                  className="btn btn-outline"
                  style={{
                    fontSize: '0.72rem',
                    padding: '0.2rem 0.5rem',
                    borderColor: '#10b981',
                    color: '#047857',
                    fontWeight: 700,
                    background: '#ecfdf5',
                  }}
                  onClick={() => {
                    setTargetPhoneInput('+91 97597 25212');
                    onShowToast('Test Number Set', '9759725212 सेट हो गया! अब आप सीधे अपने खुद के नंबर पर टेस्ट भेज सकते हैं।', 'info');
                  }}
                  title="अपने खुद के 9759725212 नंबर पर टेस्ट भेजें"
                >
                  🧪 Test on 9759725212
                </button>
              </div>
            </div>

            {/* Realistic WhatsApp Dark Mode UI Simulation Matching User Screenshot */}
            <div
              style={{
                background: '#0b141a',
                borderRadius: '12px',
                overflow: 'hidden',
                border: '1px solid #222d34',
                boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                maxWidth: '460px',
                margin: '0 auto',
              }}
            >
              {/* WhatsApp App Top Bar */}
              <div
                style={{
                  background: '#202c33',
                  padding: '0.65rem 1rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.65rem',
                  borderBottom: '1px solid #2a3942',
                }}
              >
                <div
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: '50%',
                    background: '#00a884',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    fontWeight: 800,
                    fontSize: '0.85rem',
                  }}
                >
                  M
                </div>
                <div>
                  <div style={{ color: '#e9edef', fontWeight: 700, fontSize: '0.85rem' }}>
                    MaxedLogic (Abdul Hafiz)
                  </div>
                  <div style={{ color: '#8696a0', fontSize: '0.7rem' }}>
                    Official WhatsApp Business • +91 {MAXEDLOGIC_SENDER.senderPhoneRaw}
                  </div>
                </div>
              </div>

              {/* Chat Canvas with Doodle texture look */}
              <div
                style={{
                  padding: '1rem',
                  background: '#0b141a',
                  backgroundImage: 'radial-gradient(rgba(255,255,255,0.04) 1px, transparent 0)',
                  backgroundSize: '16px 16px',
                  minHeight: '260px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem',
                }}
              >
                {/* Outgoing Message Bubble (Green) */}
                <div
                  style={{
                    alignSelf: 'flex-start',
                    maxWidth: '92%',
                    background: '#202c33',
                    color: '#e9edef',
                    borderRadius: '8px 8px 8px 2px',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.4)',
                    overflow: 'hidden',
                  }}
                >
                  {/* Top Mention Bar matching image */}
                  <div
                    style={{
                      background: 'rgba(0, 168, 132, 0.15)',
                      borderLeft: '4px solid #00a884',
                      padding: '0.4rem 0.65rem',
                      fontSize: '0.78rem',
                      color: '#00a884',
                      fontWeight: 700,
                    }}
                  >
                    Hi 👋 {cleanPhone || '919759725212'}
                  </div>

                  {/* Body Text */}
                  <div style={{ padding: '0.65rem 0.75rem', fontSize: '0.82rem', lineHeight: 1.5 }}>
                    <div style={{ color: '#8696a0', fontSize: '0.72rem', marginBottom: '0.35rem' }}>
                      {simStep === 'mode' && 'Step 1 of 4 • Update or New Create'}
                      {simStep === 'category' && `Step 2 of 4 • Mode: ${simMode}`}
                      {simStep === 'subtype' && `Step 3 of 4 • ${simMode} → ${simCategoryLabel}`}
                      {simStep === 'confirm' && 'Step 4 of 4 • Final YES / NO'}
                      {simStep === 'done' && 'Completed • Saved to Admin Panel'}
                    </div>
                    <div style={{ fontWeight: 600, marginBottom: '0.35rem' }}>
                      {simStep === 'mode' &&
                        `Namaste ${lead.businessName}! Main Abdul Hafiz (MaxedLogic • +91 97597 25212) se. Please Select one of the Options below to start. 😊`}
                      {simStep === 'category' &&
                        `You chose "${simMode}". Ab choose karein aapko Website, Mobile App, Game ya Custom Software kya chahiye:`}
                      {simStep === 'subtype' &&
                        `${simMode} → ${simCategoryLabel}: Kripya apna exact ${simCategoryLabel} type select karein:`}
                      {simStep === 'confirm' &&
                        `Chosen: ${simMode} → ${simCategoryLabel} → ${simSubType}. Kya hum aapki yeh details Admin Panel me save karein?`}
                      {simStep === 'done' &&
                        `Saved: ${simMode} → ${simCategoryLabel} → ${simSubType} → Final Decision: ${simulatedReply}`}
                    </div>
                    <div style={{ textAlign: 'right', fontSize: '0.65rem', color: '#8696a0', marginTop: '0.25rem' }}>
                      {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ✓✓
                    </div>
                  </div>

                  {/* Interactive Stacked Options for Current Step */}
                  <div
                    style={{
                      borderTop: '1px solid rgba(255,255,255,0.08)',
                      display: 'flex',
                      flexDirection: 'column',
                    }}
                  >
                    {simStep === 'mode' &&
                      SERVICE_MODES.map((m, idx) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => {
                            setSimMode(m.label);
                            setSimStep('category');
                          }}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            borderBottom: idx === 0 ? '1px solid rgba(255,255,255,0.08)' : 'none',
                            padding: '0.65rem 1rem',
                            color: idx === 0 ? '#c4cfd4' : '#00a884',
                            fontWeight: 700,
                            fontSize: '0.85rem',
                            cursor: 'pointer',
                          }}
                        >
                          {m.label}
                        </button>
                      ))}

                    {simStep === 'category' &&
                      PRODUCT_CATEGORIES.map((cat, idx) => (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => {
                            setSimCategoryId(cat.id);
                            setSimCategoryLabel(cat.label);
                            setSimStep('subtype');
                          }}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            borderBottom:
                              idx < PRODUCT_CATEGORIES.length - 1
                                ? '1px solid rgba(255,255,255,0.08)'
                                : 'none',
                            padding: '0.6rem 1rem',
                            color: '#00a884',
                            fontWeight: 700,
                            fontSize: '0.84rem',
                            cursor: 'pointer',
                          }}
                        >
                          {cat.label}
                        </button>
                      ))}

                    {simStep === 'subtype' &&
                      (CATEGORY_SUBTYPES[simCategoryId] || []).map((sub, idx, arr) => (
                        <button
                          key={sub.id}
                          type="button"
                          onClick={() => {
                            setSimSubType(sub.label);
                            setSimStep('confirm');
                          }}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            borderBottom:
                              idx < arr.length - 1 ? '1px solid rgba(255,255,255,0.08)' : 'none',
                            padding: '0.58rem 1rem',
                            color: '#00a884',
                            fontWeight: 600,
                            fontSize: '0.82rem',
                            cursor: 'pointer',
                          }}
                        >
                          {sub.label}
                        </button>
                      ))}

                    {simStep === 'confirm' &&
                      FINAL_CONFIRM_OPTIONS.map((f, idx) => (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => handleSimulateFinalDecision(f.decision)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            borderBottom: idx === 0 ? '1px solid rgba(255,255,255,0.08)' : 'none',
                            padding: '0.65rem 1rem',
                            color: f.decision === 'YES' ? '#00a884' : '#f87171',
                            fontWeight: 800,
                            fontSize: '0.85rem',
                            cursor: 'pointer',
                          }}
                        >
                          {f.label}
                        </button>
                      ))}
                  </div>
                </div>

                {/* Interactive Bot Preview Bubble */}
                {simulatedReply && (
                  <div
                    style={{
                      alignSelf: 'flex-end',
                      maxWidth: '85%',
                      background: simulatedReply === 'YES' ? '#005c4b' : '#374151',
                      color: '#e9edef',
                      padding: '0.55rem 0.75rem',
                      borderRadius: '8px 8px 2px 8px',
                      fontSize: '0.82rem',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.3)',
                    }}
                  >
                    <div style={{ fontWeight: 800 }}>
                      {simulatedReply === 'YES' ? 'Preview: YES — Confirmed' : 'Preview: NO — Not Now'}
                    </div>
                    <div style={{ fontSize: '0.73rem', color: '#d1fae5', marginTop: '0.2rem' }}>
                      {simMode} → {simCategoryLabel} → {simSubType}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Quick Actions Bar */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem', marginTop: '1rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-outline"
                style={{ fontSize: '0.78rem' }}
                onClick={resetSimulation}
              >
                <RotateCcw size={13} />
                <span>Reset 4-Step Preview</span>
              </button>
              <a
                href={`/?clientChat=1&leadId=${lead.id}&biz=${encodeURIComponent(lead.businessName)}`}
                target="_blank"
                rel="noreferrer"
                className="btn btn-outline"
                style={{ fontSize: '0.78rem', borderColor: '#00a884', color: '#00a884', fontWeight: 700 }}
              >
                <ExternalLink size={13} />
                <span>Open Live Client Bot Link</span>
              </a>
              <button
                type="button"
                className="btn btn-primary"
                style={{ background: '#10b981', borderColor: '#10b981', fontSize: '0.8rem' }}
                onClick={handleDirectWhatsAppWeb}
              >
                <MessageSquare size={14} />
                <span>Launch WhatsApp on Web / Mobile</span>
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div
              style={{
                background: '#eff6ff',
                border: '1px solid #bfdbfe',
                borderRadius: '8px',
                padding: '0.75rem 1rem',
                fontSize: '0.82rem',
                color: '#1e40af',
                lineHeight: 1.5,
              }}
            >
              <div style={{ fontWeight: 800, marginBottom: '0.25rem' }}>
                ⚡ Official Meta WhatsApp Cloud API (+91 97597 25212 Webhook Setup):
              </div>
              <div>
                Meta Graph API के ज़रिए असली क्लिक करने वाले 3 Option बटन्स सीधे क्लाइंट के WhatsApp पर डिलीवर होते हैं।
                जब आप Meta Business Suite में <strong>9759725212</strong> नंबर जोड़ें, तो नीचे दिया Webhook URL और Verify Token सेट करें ताकि क्लाइंट के बटन क्लिक सीधे Admin Panel में आएं:
              </div>
              <div style={{ marginTop: '0.45rem', fontSize: '0.76rem', fontFamily: 'monospace', background: '#dbeafe', padding: '0.45rem 0.6rem', borderRadius: '6px', wordBreak: 'break-all' }}>
                <strong>Callback URL:</strong> {typeof window !== 'undefined' ? `${window.location.origin}/api/whatsapp/webhook` : '/api/whatsapp/webhook'}<br />
                <strong>Verify Token:</strong> maxedlogic_9759725212
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.35rem' }}>
                Meta WhatsApp Phone Number ID:
              </label>
              <input
                type="text"
                className="input"
                placeholder="e.g. 104859602482910"
                value={phoneNumberId}
                onChange={(e) => setPhoneNumberId(e.target.value)}
                style={{ fontSize: '0.85rem' }}
              />
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                Found in Meta Business Suite &gt; WhatsApp &gt; API Setup
              </span>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.35rem' }}>
                Meta Permanent Access Token (Bearer Token):
              </label>
              <input
                type="password"
                className="input"
                placeholder="EAAGm..."
                value={metaToken}
                onChange={(e) => setMetaToken(e.target.value)}
                style={{ fontSize: '0.85rem' }}
              />
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                System User Token with `whatsapp_business_messaging` permission
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSaveApiConfig}
                style={{ background: '#2563eb', borderColor: '#2563eb' }}
              >
                <Check size={14} />
                <span>Save Meta Credentials</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};
