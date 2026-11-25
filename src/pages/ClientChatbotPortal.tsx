import React, { useState, useEffect, useRef } from 'react';
import { Send, CheckCheck, ExternalLink, RotateCcw, PhoneCall } from 'lucide-react';
import {
  SERVICE_MODES,
  PRODUCT_CATEGORIES,
  CATEGORY_SUBTYPES,
  FINAL_CONFIRM_OPTIONS,
  type ProductCategoryId,
} from '../utils/chatbotFlowOptions';

interface ClientOption {
  id: string;
  label: string;
  sublabel?: string;
  highlight?: boolean;
  tone?: 'neutral' | 'emerald' | 'danger';
  action: 'SELECT_MODE' | 'SELECT_CATEGORY' | 'SELECT_SUBTYPE' | 'FINAL_DECISION' | 'RESET';
  payload?: string;
  categoryId?: ProductCategoryId;
  decision?: 'YES' | 'NO';
}

interface ClientBubble {
  id: string;
  sender: 'bot' | 'client';
  text: string;
  createdAt: string;
  options?: ClientOption[];
  waHref?: string;
}

interface ClientMeta {
  id?: number;
  businessName: string;
  city?: string;
  countryName?: string;
  category?: string;
  hasWebsite?: boolean;
}

const WHATSAPP_DOODLE_BG = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180' viewBox='0 0 180 180'%3E%3Cg fill='none' stroke='%23ffffff' stroke-opacity='0.045' stroke-width='1.3'%3E%3Ccircle cx='28' cy='28' r='11'/%3E%3Cpath d='M78 18 l14 8 l-6 15 z'/%3E%3Crect x='128' y='20' width='22' height='16' rx='4'/%3E%3Cpath d='M22 86 q12 -14 24 0 t24 0'/%3E%3Ccircle cx='106' cy='84' r='9'/%3E%3Cpath d='M145 72 c6 -8 18 -8 22 2 c4 10 -11 20 -11 20 s-17 -10 -11 -22z'/%3E%3Crect x='22' y='132' width='20' height='26' rx='4'/%3E%3Cpath d='M84 134 l12 -12 l12 12 l-12 12 z'/%3E%3Cpath d='M138 144 a14 14 0 1 0 22 -10'/%3E%3C/g%3E%3C/svg%3E")`;

const SENDER_WA_NUMBER = '919759725212';
const SENDER_WA_DISPLAY = '+91 97597 25212';

function formatTime(iso?: string): string {
  try {
    const d = iso ? new Date(iso) : new Date();
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase();
  } catch {
    return 'now';
  }
}

function renderFormattedText(text: string): React.ReactNode {
  return text.split('\n').map((line, lIdx, arr) => {
    const parts = line.split(/(\*\*[^*]+\*\*)/g);
    return (
      <React.Fragment key={lIdx}>
        {parts.map((part, pIdx) => {
          if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
            return (
              <strong key={pIdx} style={{ fontWeight: 700, color: '#ffffff' }}>
                {part.slice(2, -2)}
              </strong>
            );
          }
          return <React.Fragment key={pIdx}>{part}</React.Fragment>;
        })}
        {lIdx < arr.length - 1 && <br />}
      </React.Fragment>
    );
  });
}

export const ClientChatbotPortal: React.FC = () => {
  const params = new URLSearchParams(window.location.search);
  const leadIdParam = params.get('leadId');
  const bizParam = params.get('biz');
  const actionParam = (params.get('action') || params.get('choice') || '').toUpperCase();

  const [clientMeta, setClientMeta] = useState<ClientMeta>({
    id: leadIdParam ? Number(leadIdParam) : undefined,
    businessName: bizParam || '',
  });

  const [isOptOut, setIsOptOut] = useState(actionParam === 'OPTOUT' || actionParam === 'NOT_INTERESTED');

  // 5-step selection state:
  // Step 1: Mode (Update vs New Create)
  // Step 2: Category (Website / App / Software / Game)
  // Step 3: SubType
  // Step 4: Client Mobile / WhatsApp Number (Client types number!)
  // Step 5: Final Decision (YES / NO)
  const [serviceMode, setServiceMode] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedSubType, setSelectedSubType] = useState<string>('');
  const [clientPhoneNumber, setClientPhoneNumber] = useState<string>('');
  const [isWaitingForPhone, setIsWaitingForPhone] = useState(false);
  const [phoneInputValue, setPhoneInputValue] = useState('');
  const [finalDecision, setFinalDecision] = useState<'YES' | 'NO' | ''>('');
  const [savedReplyId, setSavedReplyId] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);

  const [inputText, setInputText] = useState('');
  const [messages, setMessages] = useState<ClientBubble[]>([]);
  const scrollEndRef = useRef<HTMLDivElement | null>(null);

  const buildStep1Bubble = (meta: ClientMeta): ClientBubble => {
    const isInterestedLead = actionParam === 'INTERESTED';
    let welcomeText = '';
    if (isInterestedLead) {
      welcomeText = meta.businessName
        ? `Namaste **${meta.businessName}**! 🎉\nAapne **I Am Interested** choose kiya hai. MaxedLogic ki taraf se aapko 24 ghante me **100% FREE Interactive Prototype & Quote** milega (₹0 Advance).\n\nKripya batayein aapko apne business ke liye kya karwana hai:`
        : `Namaste! 🎉\nAapne **I Am Interested** choose kiya hai. MaxedLogic ki taraf se aapko 24 ghante me **100% FREE Interactive Prototype & Quote** milega (₹0 Advance).\n\nKripya batayein aapko apne business ke liye kya karwana hai:`;
    } else {
      welcomeText = meta.businessName
        ? `Namaste **${meta.businessName}**!\nPlease Select one of the **Options** below to start. 😊`
        : 'Please Select one of the **Options** below to start. 😊';
    }

    return {
      id: `init_${Date.now()}`,
      sender: 'bot',
      text: welcomeText,
      createdAt: new Date().toISOString(),
      options: SERVICE_MODES.map((m, idx) => ({
        id: m.id,
        label: m.label,
        sublabel: m.description,
        tone: idx === 0 ? 'neutral' : 'emerald',
        action: 'SELECT_MODE',
        payload: m.label,
      })),
    };
  };

  useEffect(() => {
    let active = true;
    async function loadClient() {
      if (leadIdParam) {
        try {
          const res = await fetch(`/api/client-chat/lead/${encodeURIComponent(leadIdParam)}`);
          const data = await res.json();
          if (active && data?.success && data.client) {
            setClientMeta(data.client);
            setMessages([buildStep1Bubble(data.client)]);
            return;
          }
        } catch {
          // fallback to URL param metadata
        }
      }
      if (active) {
        setMessages([buildStep1Bubble(clientMeta)]);
      }
    }
    loadClient();
    return () => {
      active = false;
    };
  }, [leadIdParam]);

  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isWaitingForPhone]);

  const persistFinalSelectionToAdmin = async (payload: {
    replyId?: string;
    mode: string;
    category: string;
    subType: string;
    decision: 'YES' | 'NO';
    messageText: string;
    senderPhone?: string;
  }) => {
    setIsSaving(true);
    try {
      const res = await fetch('/api/client-chat/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          replyId: payload.replyId || undefined,
          leadId: clientMeta.id,
          businessName: clientMeta.businessName || undefined,
          senderPhone: payload.senderPhone,
          serviceMode: payload.mode,
          selectedCategory: payload.category,
          selectedSubType: payload.subType,
          finalDecision: payload.decision,
          selection: `${payload.mode} → ${payload.category} → ${payload.subType} → ${payload.decision}`,
          messageText: payload.messageText,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (data?.replyId) {
        setSavedReplyId(String(data.replyId));
      }
    } catch {
      // non-blocking
    } finally {
      setIsSaving(false);
    }
  };

  const buildWhatsAppDirectHref = (choiceText: string) => {
    const biz = clientMeta.businessName ? ` (${clientMeta.businessName})` : '';
    const msg = `Namaste Abdul Hafiz! Main${biz} ne select kiya hai:\n${choiceText}`;
    return `https://wa.me/${SENDER_WA_NUMBER}?text=${encodeURIComponent(msg)}`;
  };

  const resetConversation = () => {
    setServiceMode('');
    setSelectedCategory('');
    setSelectedSubType('');
    setClientPhoneNumber('');
    setIsWaitingForPhone(false);
    setPhoneInputValue('');
    setFinalDecision('');
    setSavedReplyId('');
    setIsOptOut(false);
    setMessages([buildStep1Bubble(clientMeta)]);
  };

  const handlePhoneSubmit = (phoneOverride?: string) => {
    const raw = (phoneOverride || phoneInputValue || inputText).trim();
    if (!raw) return;
    const cleanDigits = raw.replace(/[^0-9+]/g, '');
    if (cleanDigits.length < 5) return;

    setClientPhoneNumber(cleanDigits);
    setIsWaitingForPhone(false);
    setPhoneInputValue('');
    setInputText('');

    const now = new Date().toISOString();

    setMessages((prev) => [
      ...prev,
      {
        id: `cli_phone_${Date.now()}`,
        sender: 'client',
        text: `📱 WhatsApp Number: ${cleanDigits}`,
        createdAt: now,
      },
      {
        id: `bot_confirm_${Date.now()}`,
        sender: 'bot',
        text:
          `📋 **Aapki Details Check Karein:**\n` +
          `• Business: **${clientMeta.businessName || 'Your Business'}**\n` +
          `• Requirement: **${serviceMode} → ${selectedCategory} → ${selectedSubType}**\n` +
          `• Contact Number: **${cleanDigits}**\n\n` +
          `👉 **Kya aap final confirm karte hain? Choose YES or NO:**`,
        createdAt: new Date().toISOString(),
        options: FINAL_CONFIRM_OPTIONS.map((f) => ({
          id: f.id,
          label: f.label,
          tone: f.decision === 'YES' ? 'emerald' : 'danger',
          action: 'FINAL_DECISION',
          decision: f.decision,
          payload: f.decision,
        })),
      },
    ]);
  };

  const handleClientOptionClick = async (opt: ClientOption) => {
    const now = new Date().toISOString();

    if (opt.action === 'RESET') {
      resetConversation();
      return;
    }

    setMessages((prev) => [
      ...prev,
      { id: `cli_${Date.now()}`, sender: 'client', text: opt.label, createdAt: now },
    ]);

    // Step 1 -> Step 2 (Category: Website / Mobile App / Game / Custom Software)
    if (opt.action === 'SELECT_MODE') {
      const mode = opt.payload || opt.label;
      setServiceMode(mode);
      setSelectedCategory('');
      setSelectedSubType('');
      setFinalDecision('');
      setIsWaitingForPhone(false);

      setMessages((prev) => [
        ...prev,
        {
          id: `bot_cat_${Date.now()}`,
          sender: 'bot',
          text: `Great! You selected **${mode}**.\nAb choose karein aapko kis cheez ki requirement hai:`,
          createdAt: new Date().toISOString(),
          options: PRODUCT_CATEGORIES.map((c, idx) => ({
            id: c.id,
            label: c.label,
            sublabel: c.description,
            tone: idx === 0 ? 'neutral' : 'emerald',
            action: 'SELECT_CATEGORY',
            payload: c.label,
            categoryId: c.id,
          })),
        },
      ]);
      return;
    }

    // Step 2 -> Step 3 (Sub-Types tailored to Website / Mobile App / Game / Custom Software)
    if (opt.action === 'SELECT_CATEGORY' && opt.categoryId) {
      const catLabel = opt.payload || opt.label;
      setSelectedCategory(catLabel);
      setSelectedSubType('');
      setFinalDecision('');
      setIsWaitingForPhone(false);

      const subtypes = CATEGORY_SUBTYPES[opt.categoryId] || [];
      setMessages((prev) => [
        ...prev,
        {
          id: `bot_sub_${Date.now()}`,
          sender: 'bot',
          text: `**${serviceMode || 'Requirement'} → ${catLabel}**\nKripya apna exact **${catLabel}** type choose karein:`,
          createdAt: new Date().toISOString(),
          options: [
            ...subtypes.map((s, idx) => ({
              id: s.id,
              label: s.label,
              sublabel: s.description,
              tone: (idx === 0 ? 'neutral' : 'emerald') as 'neutral' | 'emerald',
              action: 'SELECT_SUBTYPE' as const,
              payload: s.label,
            })),
            {
              id: 'sub_reset',
              label: 'Change Category / Start Over',
              tone: 'neutral' as const,
              action: 'RESET' as const,
            },
          ],
        },
      ]);
      return;
    }

    // Step 3 -> Step 4 (Ask Client for Mobile / WhatsApp Number)
    if (opt.action === 'SELECT_SUBTYPE') {
      const subLabel = opt.payload || opt.label;
      setSelectedSubType(subLabel);
      setFinalDecision('');
      setIsWaitingForPhone(true);

      setMessages((prev) => [
        ...prev,
        {
          id: `bot_phone_${Date.now()}`,
          sender: 'bot',
          text:
            `**${serviceMode || 'Requirement'} → ${selectedCategory} → ${subLabel}**\n\n` +
            `📱 Kripya apna **Mobile / WhatsApp Number** yahan enter karein:\n` +
            `Abdul Hafiz (Founder, MaxedLogic) aapko isi number par aapka **100% FREE 24-Hour Prototype & Exact Quote** direct WhatsApp karenge. 😊`,
          createdAt: new Date().toISOString(),
        },
      ]);
      return;
    }

    // Step 5 -> Save ALL choices into Admin Panel SQLite upon YES or NO
    if (opt.action === 'FINAL_DECISION' && opt.decision) {
      const decision = opt.decision;
      setFinalDecision(decision);
      const phoneToPersist = clientPhoneNumber || undefined;
      const summaryString = `Mode: ${serviceMode} | Category: ${selectedCategory} | Type: ${selectedSubType} | Phone: ${phoneToPersist || 'Not provided'} | Final Decision: ${decision}`;

      await persistFinalSelectionToAdmin({
        mode: serviceMode || 'New Create',
        category: selectedCategory || 'Website',
        subType: selectedSubType || 'Business / Corporate Website',
        decision,
        senderPhone: phoneToPersist,
        messageText: `Client completed 5-step interactive selection (${summaryString})`,
      });

      setMessages((prev) => [
        ...prev,
        {
          id: `bot_done_${Date.now()}`,
          sender: 'bot',
          text:
            decision === 'YES'
              ? `Dhanyawad! ✅ Aapka number **${phoneToPersist || ''}** aur saari details humare **Admin Panel** me successfully save ho gayi hain:\n\n` +
                `• Business: **${clientMeta.businessName || 'Your Business'}**\n` +
                `• Requirement: **${serviceMode} → ${selectedCategory} → ${selectedSubType}**\n` +
                `• Mobile / WhatsApp: **${phoneToPersist || 'Saved'}**\n` +
                `• Decision: **YES**\n\n` +
                `Abdul Hafiz (**${SENDER_WA_DISPLAY}**) jald hi aapse WhatsApp par sampark karenge aur 24 ghante me Free Demo Preview share karenge! 🎉`
              : `Dhanyawad! Aapka **NO** decision save kar liya gaya hai (**${serviceMode} → ${selectedCategory} → ${selectedSubType}**).\nAgar future me requirement ho to aap dobara start kar sakte hain.`,
          createdAt: new Date().toISOString(),
          waHref: decision === 'YES' ? buildWhatsAppDirectHref(summaryString) : undefined,
          options: [
            {
              id: 'c_restart',
              label: 'Select Another Option / Start Over',
              tone: 'neutral',
              action: 'RESET',
            },
          ],
        },
      ]);
    }
  };

  const handleSendText = async (e: React.FormEvent) => {
    e.preventDefault();
    const txt = inputText.trim();
    if (!txt) return;

    if (isWaitingForPhone || /(?:\+?\d[\d\s\-()]{7,18}\d)/.test(txt)) {
      handlePhoneSubmit(txt);
      return;
    }

    setInputText('');

    setMessages((prev) => [
      ...prev,
      { id: `cli_${Date.now()}`, sender: 'client', text: txt, createdAt: new Date().toISOString() },
    ]);

    const phoneMatch = txt.match(/(?:\+?\d[\d\s\-()]{7,18}\d)/);
    const extractedPhone = phoneMatch ? phoneMatch[0].trim() : clientPhoneNumber || undefined;

    await persistFinalSelectionToAdmin({
      replyId: savedReplyId || undefined,
      mode: serviceMode || 'New Create',
      category: selectedCategory || 'Website',
      subType: selectedSubType || 'Client Message',
      decision: finalDecision || 'YES',
      messageText: txt,
      senderPhone: extractedPhone,
    });

    setMessages((prev) => [
      ...prev,
      {
        id: `bot_${Date.now()}`,
        sender: 'bot',
        text: extractedPhone
          ? `Dhanyawad! Aapka number **${extractedPhone}** aur saari chosen details save ho gayi hain. Abdul Hafiz (**${SENDER_WA_DISPLAY}**) jald hi aapse sampark karenge.`
          : `Dhanyawad! Aapka message save ho gaya hai. Turant baat karne ke liye neeche WhatsApp par click karein:`,
        createdAt: new Date().toISOString(),
        waHref: buildWhatsAppDirectHref(
          `Mode: ${serviceMode || 'Inquiry'} | Category: ${selectedCategory || '-'} | Type: ${selectedSubType || '-'} | Message: ${txt}`
        ),
        options: [
          {
            id: 'c_again',
            label: 'Select Another Option',
            tone: 'neutral',
            action: 'RESET',
          },
        ],
      },
    ]);
  };

  const lastBotIdx = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].sender === 'bot' && messages[i].options && messages[i].options!.length > 0) {
        return i;
      }
    }
    return -1;
  })();

  return (
    <div
      style={{
        minHeight: '100dvh',
        backgroundColor: '#091014',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '0.75rem',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '460px',
          height: 'min(780px, calc(100dvh - 1.5rem))',
          backgroundColor: '#0b141a',
          borderRadius: '14px',
          border: '1px solid #222d34',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.55)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Top WhatsApp-Style Header */}
        <div
          style={{
            backgroundColor: '#202c33',
            padding: '0.8rem 1rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid #2a3942',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem' }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: '50%',
                backgroundColor: '#00a884',
                color: '#0b141a',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
                fontSize: '0.95rem',
              }}
            >
              M
            </div>
            <div>
              <div style={{ color: '#e9edef', fontWeight: 700, fontSize: '0.95rem' }}>
                Abdul Hafiz · MaxedLogic
              </div>
              <div style={{ color: '#8696a0', fontSize: '0.73rem', fontVariantNumeric: 'tabular-nums' }}>
                WhatsApp Business · {SENDER_WA_DISPLAY}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={resetConversation}
            title="Start Over"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#aebac1',
              cursor: 'pointer',
              padding: '0.35rem',
            }}
          >
            <RotateCcw size={16} />
          </button>
        </div>

        {/* Step Progress Strip */}
        <div
          style={{
            backgroundColor: '#111b21',
            borderBottom: '1px solid #222d34',
            padding: '0.45rem 0.9rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.72rem',
            color: '#8696a0',
          }}
        >
          <span>
            {isOptOut
              ? 'Unsubscribed / Opted Out'
              : finalDecision
              ? `Confirmed: ${finalDecision}`
              : isWaitingForPhone
              ? 'Step 4 of 5 · Enter WhatsApp Number'
              : selectedSubType
              ? 'Step 5 of 5 · Confirm YES / NO'
              : selectedCategory
              ? `Step 3 of 5 · Choose ${selectedCategory} Type`
              : serviceMode
              ? 'Step 2 of 5 · Website / App / Game / Software'
              : 'Step 1 of 5 · Update or New Create'}
          </span>
          <span style={{ color: '#00a884', fontWeight: 600 }}>
            {isSaving ? 'Saving...' : finalDecision ? 'Saved to Admin' : isOptOut ? 'Preference Saved' : 'Interactive Bot'}
          </span>
        </div>

        {/* Chat Wallpaper Canvas */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '1.05rem 0.9rem',
            backgroundColor: '#0b141a',
            backgroundImage: WHATSAPP_DOODLE_BG,
            display: 'flex',
            flexDirection: 'column',
            gap: '0.85rem',
          }}
        >
          {isOptOut ? (
            <div style={{ padding: '2rem 1rem', textAlign: 'center', color: '#e2e8f0', margin: 'auto 0' }}>
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: '50%',
                  backgroundColor: 'rgba(239, 68, 68, 0.15)',
                  color: '#ef4444',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 1.25rem auto',
                }}
              >
                <span style={{ fontSize: '1.75rem' }}>❌</span>
              </div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '0.6rem', color: '#f87171' }}>
                Preference Recorded: Not Interested
              </h2>
              <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: '1.5rem', lineHeight: '1.6' }}>
                Humne <strong>{clientMeta.businessName || 'Aapke Business'}</strong> ko unsubscribe kar diya hai aur humare system se aage koi email nahi bheja jayega.
              </p>
              <div style={{ borderTop: '1px solid #2a3942', paddingTop: '1.25rem' }}>
                <p style={{ color: '#64748b', fontSize: '0.8rem', marginBottom: '0.75rem' }}>
                  Agar aap galti se click kar baithe the aur Free Demo dekhna chahte hain:
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setIsOptOut(false);
                    resetConversation();
                  }}
                  style={{
                    backgroundColor: '#00a884',
                    color: '#0b141a',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '0.6rem 1.2rem',
                    fontWeight: 800,
                    fontSize: '0.88rem',
                    cursor: 'pointer',
                  }}
                >
                  Start Interactive Proposal 🚀
                </button>
              </div>
            </div>
          ) : (
            <>
              {messages.map((msg, msgIdx) => {
                if (msg.sender === 'bot') {
                  const isInteractiveActive = msgIdx === lastBotIdx && !isWaitingForPhone;
                  return (
                    <div
                      key={msg.id}
                      style={{
                        alignSelf: 'flex-start',
                        width: '100%',
                        maxWidth: '380px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px',
                      }}
                    >
                      <div
                        style={{
                          position: 'relative',
                          backgroundColor: '#202c33',
                          color: '#e9edef',
                          borderRadius: '0 10px 10px 10px',
                          padding: '0.7rem 0.9rem 0.5rem 0.9rem',
                          fontSize: '0.93rem',
                          lineHeight: 1.45,
                          boxShadow: '0 1px 2px rgba(0, 0, 0, 0.35)',
                          marginLeft: '6px',
                        }}
                      >
                        <span
                          aria-hidden="true"
                          style={{
                            position: 'absolute',
                            top: 0,
                            left: '-7px',
                            width: 0,
                            height: 0,
                            borderTop: '10px solid #202c33',
                            borderLeft: '8px solid transparent',
                          }}
                        />
                        <div>{renderFormattedText(msg.text)}</div>

                        {msg.waHref && (
                          <div style={{ marginTop: '0.6rem' }}>
                            <a
                              href={msg.waHref}
                              target="_blank"
                              rel="noreferrer"
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.4rem',
                                backgroundColor: '#00a884',
                                color: '#0b141a',
                                padding: '0.48rem 0.85rem',
                                borderRadius: '7px',
                                fontWeight: 700,
                                fontSize: '0.82rem',
                                textDecoration: 'none',
                              }}
                            >
                              <PhoneCall size={14} />
                              <span>Chat on WhatsApp ({SENDER_WA_DISPLAY})</span>
                              <ExternalLink size={12} />
                            </a>
                          </div>
                        )}

                        <div
                          style={{
                            textAlign: 'right',
                            fontSize: '0.68rem',
                            color: '#8696a0',
                            marginTop: '0.25rem',
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {formatTime(msg.createdAt)}
                        </div>
                      </div>

                      {msg.options && msg.options.length > 0 && (
                        <div
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '4px',
                            marginLeft: '6px',
                            opacity: isInteractiveActive ? 1 : 0.45,
                          }}
                        >
                          {msg.options.map((opt) => {
                            const textColor =
                              opt.tone === 'danger'
                                ? '#f87171'
                                : opt.tone === 'neutral'
                                ? '#c4cfd4'
                                : '#00a884';
                            return (
                              <button
                                key={opt.id}
                                type="button"
                                disabled={!isInteractiveActive}
                                onClick={() => handleClientOptionClick(opt)}
                                style={{
                                  width: '100%',
                                  backgroundColor: '#202c33',
                                  color: textColor,
                                  border: 'none',
                                  borderRadius: '8px',
                                  padding: '0.68rem 1rem',
                                  fontSize: '0.92rem',
                                  fontWeight: 600,
                                  textAlign: 'center',
                                  cursor: isInteractiveActive ? 'pointer' : 'default',
                                  boxShadow: '0 1px 2px rgba(0, 0, 0, 0.3)',
                                }}
                                onMouseEnter={(e) => {
                                  if (isInteractiveActive) {
                                    e.currentTarget.style.backgroundColor = '#2a3942';
                                  }
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.backgroundColor = '#202c33';
                                }}
                              >
                                <div>{opt.label}</div>
                                {opt.sublabel && (
                                  <div
                                    style={{
                                      fontSize: '0.71rem',
                                      fontWeight: 400,
                                      color: '#8696a0',
                                      marginTop: '2px',
                                    }}
                                  >
                                    {opt.sublabel}
                                  </div>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                }

                return (
                  <div
                    key={msg.id}
                    style={{
                      alignSelf: 'flex-end',
                      maxWidth: '300px',
                      position: 'relative',
                      backgroundColor: '#005c4b',
                      color: '#e9edef',
                      borderRadius: '10px 0 10px 10px',
                      padding: '0.58rem 0.85rem 0.45rem 0.85rem',
                      fontSize: '0.92rem',
                      lineHeight: 1.4,
                      marginRight: '6px',
                      boxShadow: '0 1px 2px rgba(0, 0, 0, 0.3)',
                    }}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        position: 'absolute',
                        top: 0,
                        right: '-7px',
                        width: 0,
                        height: 0,
                        borderTop: '10px solid #005c4b',
                        borderRight: '8px solid transparent',
                      }}
                    />
                    <div>{renderFormattedText(msg.text)}</div>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'flex-end',
                        alignItems: 'center',
                        gap: '0.25rem',
                        marginTop: '0.2rem',
                        fontSize: '0.66rem',
                        color: '#a7f3d0',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      <span>{formatTime(msg.createdAt)}</span>
                      <CheckCheck size={13} color="#53bdeb" />
                    </div>
                  </div>
                );
              })}

              {/* Dedicated Step 4: Phone Number Input Card */}
              {isWaitingForPhone && (
                <div
                  style={{
                    backgroundColor: '#1f2c34',
                    border: '1.5px solid #00a884',
                    borderRadius: '12px',
                    padding: '0.85rem 1rem',
                    margin: '0.3rem 0.3rem 0.5rem 0.3rem',
                    boxShadow: '0 4px 16px rgba(0, 168, 132, 0.25)',
                  }}
                >
                  <div
                    style={{
                      color: '#00a884',
                      fontWeight: 700,
                      fontSize: '0.85rem',
                      marginBottom: '0.55rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                    }}
                  >
                    <span>📱 Apna Mobile / WhatsApp Number likhein:</span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <div
                      style={{
                        backgroundColor: '#2a3942',
                        color: '#e9edef',
                        borderRadius: '8px',
                        padding: '0.55rem 0.75rem',
                        fontSize: '0.88rem',
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                      }}
                    >
                      🇮🇳 +91
                    </div>
                    <input
                      type="tel"
                      value={phoneInputValue}
                      onChange={(e) => setPhoneInputValue(e.target.value)}
                      placeholder="Enter 10-digit number"
                      style={{
                        flex: 1,
                        backgroundColor: '#2a3942',
                        border: '1px solid #3b4a54',
                        borderRadius: '8px',
                        padding: '0.55rem 0.75rem',
                        color: '#ffffff',
                        fontSize: '0.92rem',
                        outline: 'none',
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handlePhoneSubmit();
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => handlePhoneSubmit()}
                      disabled={!phoneInputValue.trim()}
                      style={{
                        backgroundColor: '#00a884',
                        color: '#0b141a',
                        border: 'none',
                        borderRadius: '8px',
                        padding: '0.55rem 1.1rem',
                        fontWeight: 800,
                        cursor: phoneInputValue.trim() ? 'pointer' : 'not-allowed',
                        opacity: phoneInputValue.trim() ? 1 : 0.6,
                      }}
                    >
                      Submit ➡️
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          <div ref={scrollEndRef} />
        </div>

        {/* Bottom Client Message / Number Composer */}
        {!isOptOut && (
          <form
            onSubmit={handleSendText}
            style={{
              backgroundColor: '#202c33',
              borderTop: '1px solid #2a3942',
              padding: '0.65rem 0.75rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={
                isWaitingForPhone
                  ? 'Type your WhatsApp / Mobile number here...'
                  : finalDecision === 'YES'
                  ? 'Type additional notes or questions...'
                  : 'Type your message or phone number...'
              }
              style={{
                flex: 1,
                backgroundColor: '#2a3942',
                color: '#e9edef',
                border: 'none',
                borderRadius: '8px',
                padding: '0.6rem 0.85rem',
                fontSize: '0.88rem',
                outline: 'none',
              }}
            />
            <button
              type="submit"
              disabled={!inputText.trim()}
              aria-label="Send reply"
              style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                backgroundColor: inputText.trim() ? '#00a884' : '#2a3942',
                color: inputText.trim() ? '#0b141a' : '#8696a0',
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: inputText.trim() ? 'pointer' : 'not-allowed',
                flexShrink: 0,
              }}
            >
              <Send size={17} />
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
