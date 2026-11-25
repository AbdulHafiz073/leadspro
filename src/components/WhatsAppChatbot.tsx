import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Send,
  RotateCcw,
  MessageSquare,
  Mail,
  MapPin,
  Sparkles,
  ExternalLink,
  CheckCheck,
  X,
  Maximize2,
  Minimize2,
  UserCheck,
  Loader2,
  AlertCircle,
  CheckCircle2,
  ShieldAlert,
} from 'lucide-react';
import { Lead } from '../types';
import { useLeads } from '../context/LeadContext';
import { getMaxedLogicPitch, MAXEDLOGIC_SENDER } from '../utils/maxedLogicPitches';
import { sendEmailViaGmailApi } from '../services/gmailApiService';
import {
  getAccessToken,
  getConnectedGoogleEmail,
  googleSignIn,
} from '../services/googleWorkspaceAuth';
import { isRealDeliverableEmail } from '../utils/deliverability';

export interface ChatOptionButton {
  id: string;
  label: string;
  highlight?: boolean;
  action: string;
  payload?: string;
}

export interface ChatBubbleMessage {
  id: string;
  sender: 'bot' | 'user';
  text: string;
  createdAt: string;
  options?: ChatOptionButton[];
  draftedMessage?: string | null;
  draftSubject?: string | null;
  channel?: string | null;
  waUrl?: string | null;
}

interface WhatsAppChatbotProps {
  selectedLead?: Lead | null;
  onSelectLead?: (lead: Lead) => void;
  onOpenLeadDetail?: (lead: Lead) => void;
  onShowToast: (title: string, message: string, type: 'success' | 'error' | 'info') => void;
  mode?: 'embedded' | 'floating';
  onCloseFloating?: () => void;
  onExpandToFullPage?: () => void;
}

function formatChatTime(iso?: string): string {
  try {
    const d = iso ? new Date(iso) : new Date();
    return d
      .toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })
      .toLowerCase();
  } catch {
    return 'now';
  }
}

function formatWhatsAppDigits(raw?: string | null): string {
  let clean = String(raw || '').replace(/[^0-9]/g, '');
  if (clean.length === 10 && /^[6-9]/.test(clean)) {
    clean = '91' + clean;
  } else if (clean.length === 11 && clean.startsWith('0') && /^[6-9]/.test(clean.slice(1))) {
    clean = '91' + clean.slice(1);
  }
  return clean;
}

function buildWaLink(phone: string, text: string): string {
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

// Render **bold** markers safely inside chat bubbles
function renderRichBubbleText(text: string): React.ReactNode {
  const lines = text.split('\n');
  return lines.map((line, lineIdx) => {
    const parts = line.split(/(\*\*[^*]+\*\*)/g);
    return (
      <React.Fragment key={lineIdx}>
        {parts.map((part, partIdx) => {
          if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
            return (
              <strong key={partIdx} style={{ fontWeight: 700, color: '#ffffff' }}>
                {part.slice(2, -2)}
              </strong>
            );
          }
          return <React.Fragment key={partIdx}>{part}</React.Fragment>;
        })}
        {lineIdx < lines.length - 1 && <br />}
      </React.Fragment>
    );
  });
}

// Subtle WhatsApp dark doodle SVG pattern encoded as data URI for authentic dark background
const WHATSAPP_DOODLE_BG = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180' viewBox='0 0 180 180'%3E%3Cg fill='none' stroke='%23ffffff' stroke-opacity='0.045' stroke-width='1.3'%3E%3Ccircle cx='28' cy='28' r='11'/%3E%3Cpath d='M78 18 l14 8 l-6 15 z'/%3E%3Crect x='128' y='20' width='22' height='16' rx='4'/%3E%3Cpath d='M22 86 q12 -14 24 0 t24 0'/%3E%3Ccircle cx='106' cy='84' r='9'/%3E%3Cpath d='M145 72 c6 -8 18 -8 22 2 c4 10 -11 20 -11 20 s-17 -10 -11 -22z'/%3E%3Crect x='22' y='132' width='20' height='26' rx='4'/%3E%3Cpath d='M84 134 l12 -12 l12 12 l-12 12 z'/%3E%3Cpath d='M138 144 a14 14 0 1 0 22 -10'/%3E%3C/g%3E%3C/svg%3E")`;

const INITIAL_OPTIONS: ChatOptionButton[] = [
  { id: 'opt_pick_lead', label: 'Select Client Lead', highlight: false, action: 'PICK_LEAD' },
  { id: 'opt_wa_chat', label: 'Send WhatsApp Chat', highlight: true, action: 'START_WHATSAPP' },
  { id: 'opt_gmail_chat', label: 'Send Gmail Proposal', highlight: true, action: 'START_GMAIL' },
  { id: 'opt_ai_draft', label: 'Draft Custom Proposal (AI)', highlight: true, action: 'AI_PROMPT_MENU' },
];

export const WhatsAppChatbot: React.FC<WhatsAppChatbotProps> = ({
  selectedLead: externalLead,
  onSelectLead,
  onOpenLeadDetail,
  onShowToast,
  mode = 'embedded',
  onCloseFloating,
  onExpandToFullPage,
}) => {
  const { leads, updateLead } = useLeads();
  const [internalLeadId, setInternalLeadId] = useState<number | null>(externalLead?.id ?? null);
  const [messages, setMessages] = useState<ChatBubbleMessage[]>([]);
  const [composerText, setComposerText] = useState('');
  const [composerMode, setComposerMode] = useState<'ai' | 'direct'>('ai');
  const [isBotTyping, setIsBotTyping] = useState(false);
  const [isSendingDispatch, setIsSendingDispatch] = useState(false);
  const [pendingGmailConfirm, setPendingGmailConfirm] = useState<{
    lead: Lead;
    subject: string;
    body: string;
  } | null>(null);

  const scrollEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (externalLead?.id) {
      setInternalLeadId(externalLead.id);
    }
  }, [externalLead?.id]);

  const activeLead: Lead | null = useMemo(() => {
    if (externalLead) return externalLead;
    if (internalLeadId) {
      return leads.find((l) => l.id === internalLeadId) || null;
    }
    return leads[0] || null;
  }, [externalLead, internalLeadId, leads]);

  const sessionKey = activeLead ? `lead_${activeLead.id}` : 'global';

  const buildGreetingMessage = (lead: Lead | null): ChatBubbleMessage => ({
    id: `greet_${sessionKey}_${Date.now()}`,
    sender: 'bot',
    text: lead
      ? `Please Select one of the **Options** below to start. 😊\nActive Client: **${lead.businessName}** (${lead.city || lead.countryName || 'Verified'})`
      : 'Please Select one of the **Options** below to start. 😊',
    createdAt: new Date().toISOString(),
    options: INITIAL_OPTIONS,
  });

  // Load persisted messages for active session
  useEffect(() => {
    let cancelled = false;
    async function loadHistory() {
      try {
        const res = await fetch(`/api/chatbot/messages?sessionKey=${encodeURIComponent(sessionKey)}`);
        const data = await res.json();
        if (cancelled) return;
        if (data?.success && Array.isArray(data.messages) && data.messages.length > 0) {
          setMessages(data.messages);
        } else {
          setMessages([buildGreetingMessage(activeLead)]);
        }
      } catch {
        if (!cancelled) {
          setMessages([buildGreetingMessage(activeLead)]);
        }
      }
    }
    loadHistory();
    return () => {
      cancelled = true;
    };
  }, [sessionKey]);

  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isBotTyping]);

  const persistMessage = async (msg: ChatBubbleMessage) => {
    setMessages((prev) => [...prev, msg]);
    try {
      await fetch('/api/chatbot/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...msg,
          sessionKey,
          leadId: activeLead?.id ?? null,
        }),
      });
    } catch {
      // ignore transient persistence issue
    }
  };

  const handleResetChat = async () => {
    try {
      await fetch(`/api/chatbot/messages?sessionKey=${encodeURIComponent(sessionKey)}`, {
        method: 'DELETE',
      });
    } catch {
      // ignore
    }
    setMessages([buildGreetingMessage(activeLead)]);
  };

  const buildProposalText = (lead: Lead, variant: 'update' | 'new_create' | 'dual'): { subject: string; body: string; waText: string } => {
    const pitch = getMaxedLogicPitch(lead);
    const loc = [lead.address, lead.city, lead.countryName].filter(Boolean).join(', ');
    if (variant === 'update') {
      const subject = `Website Update & Redesign Proposal for ${lead.businessName} (${lead.city})`;
      const body = `Hello ${lead.contactPerson && lead.contactPerson !== 'Management Team' ? lead.contactPerson : `${lead.businessName} Team`},\n\nI am ${MAXEDLOGIC_SENDER.senderName} from ${MAXEDLOGIC_SENDER.companyName} (${MAXEDLOGIC_SENDER.companyWebsite}). We reviewed ${lead.websiteUrl || lead.businessName} at ${loc}.\n\nWe can update & modernize your existing website with faster speed, mobile responsiveness, SSL security, and direct WhatsApp/inquiry conversion—or build a companion Android/iOS App.\n\nReply "UPDATE" or share your WhatsApp number for a free 2-minute live demo.\n\nBest regards,\n${MAXEDLOGIC_SENDER.senderName}\nPhone/WhatsApp: ${MAXEDLOGIC_SENDER.senderPhoneFormatted}`;
      const waText = `नमस्ते ${lead.businessName}! मैं Abdul Hafiz (MaxedLogic - maxedlogic.com) से। हमने आपकी वेबसाइट (${lead.websiteUrl || lead.city}) देखी। क्या आप अपनी Website Update / Redesign या New Mobile App बनवाना चाहते हैं? कृपया रिप्लाई करें: YES / UPDATE`;
      return { subject, body, waText };
    }
    if (variant === 'new_create') {
      const subject = `Brand-New Website / App / Game Proposal for ${lead.businessName} (${lead.city})`;
      const body = `Hello ${lead.contactPerson && lead.contactPerson !== 'Management Team' ? lead.contactPerson : `${lead.businessName} Team`},\n\nI am ${MAXEDLOGIC_SENDER.senderName} from ${MAXEDLOGIC_SENDER.companyName} (${MAXEDLOGIC_SENDER.companyWebsite}). We help ${lead.category} owners in ${lead.city}, ${lead.countryName} launch brand-new custom Websites, Android/iOS Mobile Apps, and Interactive Games.\n\nReply "NEW CREATE" or share your WhatsApp number for a free 2-minute demo concept tailored to ${lead.businessName}.\n\nBest regards,\n${MAXEDLOGIC_SENDER.senderName}\nPhone/WhatsApp: ${MAXEDLOGIC_SENDER.senderPhoneFormatted}`;
      const waText = `नमस्ते ${lead.businessName}! मैं Abdul Hafiz (MaxedLogic - maxedlogic.com) से। क्या आपको अपने बिज़नेस के लिए Brand-New Website, Mobile App या Custom Game बनवाना है? फ्री डेमो देखने के लिए YES लिखकर रिप्लाई करें।`;
      return { subject, body, waText };
    }
    return {
      subject: pitch.emailSubject,
      body: pitch.emailBody,
      waText: pitch.whatsAppText,
    };
  };

  const dispatchWhatsAppMetaOrLink = async (lead: Lead, customText: string) => {
    const rawPhone = lead.whatsAppNumber || lead.phoneNumber || lead.ownerPhone || lead.locationPhone;
    const digits = formatWhatsAppDigits(rawPhone);
    if (!digits) {
      await persistMessage({
        id: `bot_${Date.now()}`,
        sender: 'bot',
        text: `**${lead.businessName}** ke paas valid phone/WhatsApp number saved nahi hai. Pehle doosra client select karein ya Gmail proposal send karein.`,
        createdAt: new Date().toISOString(),
        options: [
          { id: 'opt_gmail_alt', label: 'Send Gmail Instead', highlight: true, action: 'START_GMAIL' },
          { id: 'opt_pick_other', label: 'Select Another Client', highlight: false, action: 'PICK_LEAD' },
        ],
      });
      return;
    }

    const metaToken = localStorage.getItem('maxedlogic_meta_wa_token') || '';
    const phoneNumberId = localStorage.getItem('maxedlogic_meta_wa_phone_id') || '';
    const clientChatUrl =
      typeof window !== 'undefined'
        ? `${window.location.origin}/?clientChat=1&leadId=${lead.id}&biz=${encodeURIComponent(lead.businessName)}`
        : '';

    setIsSendingDispatch(true);
    try {
      const res = await fetch('/api/whatsapp/send-interactive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: digits,
          businessName: lead.businessName,
          pitchType: lead.hasWebsite ? 'UPDATE_WEBSITE' : 'CREATE_WEBSITE',
          customText,
          clientChatUrl,
          metaToken: metaToken.trim() || undefined,
          phoneNumberId: phoneNumberId.trim() || undefined,
        }),
      });
      const data = await res.json();

      if (data.success && data.channel === 'Meta WhatsApp Business Cloud API') {
        updateLead(lead.id, {
          outreachStatus: lead.outreachStatus === 'EmailSent' ? 'BothSent' : 'WhatsAppSent',
          pitchChannel: 'WhatsApp',
          lastPitchedAt: new Date().toISOString(),
          pitchMessage: customText,
        });
        onShowToast('WhatsApp Sent via Meta API', `Message dispatched to +${digits}`, 'success');
        await persistMessage({
          id: `bot_${Date.now()}`,
          sender: 'bot',
          text: `WhatsApp Interactive message **${lead.businessName}** (+${digits}) ko Meta Cloud API se send ho gaya!`,
          createdAt: new Date().toISOString(),
          channel: 'WhatsApp API',
          options: [
            { id: 'opt_next_client', label: 'Select Next Client', highlight: true, action: 'PICK_LEAD' },
            { id: 'opt_home', label: 'Back to Start Options', highlight: false, action: 'MAIN_MENU' },
          ],
        });
      } else {
        const waUrl = data.waUrl || buildWaLink(digits, customText);
        await persistMessage({
          id: `bot_${Date.now()}`,
          sender: 'bot',
          text: `**${lead.businessName}** (+${digits}) ke liye WhatsApp chat ready hai! Neeche click karke turant send karein:`,
          createdAt: new Date().toISOString(),
          draftedMessage: customText,
          waUrl,
          options: [
            { id: 'opt_mark_wa', label: 'Mark as WhatsApp Sent', highlight: true, action: 'MARK_WA_SENT', payload: String(lead.id) },
            { id: 'opt_also_gmail', label: 'Also Send via Gmail', highlight: true, action: 'START_GMAIL' },
            { id: 'opt_home', label: 'Main Options', highlight: false, action: 'MAIN_MENU' },
          ],
        });
      }
    } catch (err: any) {
      onShowToast('WhatsApp Error', err?.message || 'Could not prepare WhatsApp chat.', 'error');
    } finally {
      setIsSendingDispatch(false);
    }
  };

  const executeConfirmedGmailSend = async () => {
    if (!pendingGmailConfirm) return;
    const { lead, subject, body } = pendingGmailConfirm;
    if (!lead.email || !isRealDeliverableEmail(lead.email)) {
      onShowToast('Invalid Email', 'Client has no verified deliverable email.', 'error');
      setPendingGmailConfirm(null);
      return;
    }

    setIsSendingDispatch(true);
    try {
      let token = await getAccessToken();
      if (!token) {
        const signInRes = await googleSignIn(true);
        token = signInRes?.accessToken || null;
      }
      if (!token) {
        onShowToast('Gmail Sign-In Cancelled', 'Please connect Gmail first.', 'info');
        return;
      }

      const senderEmail = getConnectedGoogleEmail() || MAXEDLOGIC_SENDER.senderEmail;
      const res = await sendEmailViaGmailApi(lead.email.trim(), senderEmail, subject, body, {
        skipLocalStorageDupCheck: false,
      });

      if (res.success) {
        updateLead(lead.id, {
          outreachStatus: lead.outreachStatus === 'WhatsAppSent' ? 'BothSent' : 'EmailSent',
          pitchChannel: 'Email',
          lastPitchedAt: new Date().toISOString(),
          pitchSubject: subject,
          pitchMessage: body,
          pitchApp: 'Gmail',
          pitchRecipient: lead.email.trim(),
        });
        setPendingGmailConfirm(null);
        onShowToast('Gmail Sent!', `Email delivered to ${lead.email}`, 'success');
        await persistMessage({
          id: `bot_${Date.now()}`,
          sender: 'bot',
          text: `Gmail proposal **${lead.businessName}** (${lead.email}) ko successfully send ho gaya! ✓✓`,
          createdAt: new Date().toISOString(),
          channel: 'Gmail API',
          options: [
            { id: 'opt_next_lead', label: 'Select Next Client', highlight: true, action: 'PICK_LEAD' },
            { id: 'opt_main', label: 'Back to Start Options', highlight: false, action: 'MAIN_MENU' },
          ],
        });
      } else {
        onShowToast('Gmail Send Failed', res.error || 'Could not send Gmail.', 'error');
      }
    } catch (err: any) {
      onShowToast('Gmail Error', err?.message || 'Could not send Gmail.', 'error');
    } finally {
      setIsSendingDispatch(false);
    }
  };

  const askGeminiChatbot = async (userPrompt: string) => {
    setIsBotTyping(true);
    try {
      const res = await fetch('/api/chatbot/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userPrompt,
          leadId: activeLead?.id,
          history: messages.slice(-6).map((m) => ({ sender: m.sender, text: m.text })),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        await persistMessage({
          id: `bot_err_${Date.now()}`,
          sender: 'bot',
          text: data?.error || 'AI Assistant temporarily unavailable. Aap neeche diye options se direct WhatsApp ya Gmail chat send kar sakte hain.',
          createdAt: new Date().toISOString(),
          options: INITIAL_OPTIONS,
        });
        return;
      }

      const opts: ChatOptionButton[] = [];
      if (data.draftedMessage) {
        opts.push({
          id: `opt_send_draft_wa_${Date.now()}`,
          label: 'Send This on WhatsApp',
          highlight: true,
          action: 'SEND_DRAFT_WA',
          payload: data.draftedMessage,
        });
        opts.push({
          id: `opt_send_draft_gmail_${Date.now()}`,
          label: 'Send This via Gmail',
          highlight: true,
          action: 'SEND_DRAFT_GMAIL',
          payload: JSON.stringify({
            subject: data.draftSubject || (activeLead ? `Proposal for ${activeLead.businessName}` : 'Web & App Proposal'),
            body: data.draftedMessage,
          }),
        });
      }

      if (Array.isArray(data.suggestedOptions)) {
        data.suggestedOptions.slice(0, 2).forEach((lbl: string, idx: number) => {
          opts.push({
            id: `opt_ai_${Date.now()}_${idx}`,
            label: lbl,
            highlight: idx === 0 && !data.draftedMessage,
            action: 'AI_FREE_TEXT',
            payload: lbl,
          });
        });
      }

      if (opts.length === 0) {
        opts.push(...INITIAL_OPTIONS.slice(0, 3));
      }

      await persistMessage({
        id: `bot_ai_${Date.now()}`,
        sender: 'bot',
        text: data.draftedMessage
          ? `${data.replyText}\n\n**Ready-to-Send Chat Draft:**\n${data.draftedMessage}`
          : data.replyText,
        createdAt: new Date().toISOString(),
        draftedMessage: data.draftedMessage || null,
        draftSubject: data.draftSubject || null,
        options: opts,
      });
    } catch (err: any) {
      await persistMessage({
        id: `bot_net_${Date.now()}`,
        sender: 'bot',
        text: `Network error: ${err?.message || 'Unable to reach chatbot server.'}`,
        createdAt: new Date().toISOString(),
        options: INITIAL_OPTIONS,
      });
    } finally {
      setIsBotTyping(false);
    }
  };

  const handleOptionClick = async (opt: ChatOptionButton) => {
    if (isBotTyping || isSendingDispatch) return;

    // Echo user's clicked option as outgoing green WhatsApp bubble
    await persistMessage({
      id: `usr_${Date.now()}`,
      sender: 'user',
      text: opt.label,
      createdAt: new Date().toISOString(),
    });

    switch (opt.action) {
      case 'MAIN_MENU': {
        await persistMessage(buildGreetingMessage(activeLead));
        break;
      }

      case 'PICK_LEAD': {
        const candidates = leads
          .filter((l) => Boolean(l.email || l.whatsAppNumber || l.phoneNumber))
          .slice(0, 5);
        if (candidates.length === 0) {
          await persistMessage({
            id: `bot_${Date.now()}`,
            sender: 'bot',
            text: 'Abhi koi verified client lead saved nahi hai. Pehle **Lead Discovery** se leads scan karein.',
            createdAt: new Date().toISOString(),
            options: INITIAL_OPTIONS,
          });
          break;
        }
        await persistMessage({
          id: `bot_${Date.now()}`,
          sender: 'bot',
          text: 'Please Select a **Client Lead** below to start chatting or sending proposals:',
          createdAt: new Date().toISOString(),
          options: candidates.map((l, idx) => ({
            id: `pick_${l.id}`,
            label: `${l.businessName} (${l.city || l.countryName})${l.email && /@gmail\.com$/i.test(l.email) ? ' • Gmail' : ''}`,
            highlight: idx > 0,
            action: 'SET_LEAD',
            payload: String(l.id),
          })),
        });
        break;
      }

      case 'SET_LEAD': {
        const lid = Number(opt.payload);
        const found = leads.find((l) => l.id === lid);
        if (found) {
          setInternalLeadId(found.id);
          if (onSelectLead) onSelectLead(found);
          await persistMessage({
            id: `bot_${Date.now()}`,
            sender: 'bot',
            text: `Selected Client: **${found.businessName}**\nLocation: ${[found.address, found.city, found.countryName].filter(Boolean).join(', ')}\nEmail: ${found.email || 'N/A'} | Phone: ${found.whatsAppNumber || found.phoneNumber || 'N/A'}`,
            createdAt: new Date().toISOString(),
            options: [
              { id: 'opt_sw', label: 'Send WhatsApp Chat', highlight: true, action: 'START_WHATSAPP' },
              { id: 'opt_sg', label: 'Send Gmail Proposal', highlight: true, action: 'START_GMAIL' },
              { id: 'opt_sai', label: 'AI Custom Pitch Draft', highlight: false, action: 'AI_PROMPT_MENU' },
            ],
          });
        }
        break;
      }

      case 'START_WHATSAPP': {
        if (!activeLead) {
          await persistMessage({
            id: `bot_${Date.now()}`,
            sender: 'bot',
            text: 'Pehle koi **Client Lead** select karein taaki sahi business ko WhatsApp chat bhej sakein.',
            createdAt: new Date().toISOString(),
            options: [{ id: 'opt_p', label: 'Select Client Lead', highlight: true, action: 'PICK_LEAD' }],
          });
          break;
        }
        await persistMessage({
          id: `bot_${Date.now()}`,
          sender: 'bot',
          text: `**${activeLead.businessName}** ke liye kis type ka WhatsApp chat message send karna hai?`,
          createdAt: new Date().toISOString(),
          options: [
            { id: 'wa_upd', label: 'Website Update Proposal', highlight: true, action: 'PREPARE_WA', payload: 'update' },
            { id: 'wa_new', label: 'New Website / App / Game', highlight: true, action: 'PREPARE_WA', payload: 'new_create' },
            { id: 'wa_dual', label: 'Both Update + New Option', highlight: false, action: 'PREPARE_WA', payload: 'dual' },
          ],
        });
        break;
      }

      case 'PREPARE_WA': {
        if (!activeLead) break;
        const variant = (opt.payload as 'update' | 'new_create' | 'dual') || 'dual';
        const { waText } = buildProposalText(activeLead, variant);
        await dispatchWhatsAppMetaOrLink(activeLead, waText);
        break;
      }

      case 'MARK_WA_SENT': {
        const lid = Number(opt.payload || activeLead?.id);
        const found = leads.find((l) => l.id === lid);
        if (found) {
          updateLead(found.id, {
            outreachStatus: found.outreachStatus === 'EmailSent' ? 'BothSent' : 'WhatsAppSent',
            pitchChannel: 'WhatsApp',
            lastPitchedAt: new Date().toISOString(),
          });
          onShowToast('Marked WhatsApp Sent', `${found.businessName} status updated.`, 'success');
          await persistMessage({
            id: `bot_${Date.now()}`,
            sender: 'bot',
            text: `**${found.businessName}** ko WhatsApp Sent mark kar diya gaya hai.`,
            createdAt: new Date().toISOString(),
            options: INITIAL_OPTIONS,
          });
        }
        break;
      }

      case 'START_GMAIL': {
        if (!activeLead) {
          await persistMessage({
            id: `bot_${Date.now()}`,
            sender: 'bot',
            text: 'Pehle koi **Client Lead** select karein.',
            createdAt: new Date().toISOString(),
            options: [{ id: 'opt_p', label: 'Select Client Lead', highlight: true, action: 'PICK_LEAD' }],
          });
          break;
        }
        if (!activeLead.email || !isRealDeliverableEmail(activeLead.email)) {
          await persistMessage({
            id: `bot_${Date.now()}`,
            sender: 'bot',
            text: `**${activeLead.businessName}** ke paas deliverable email address nahi hai. WhatsApp try karein ya doosra client select karein.`,
            createdAt: new Date().toISOString(),
            options: [
              { id: 'opt_wa_alt', label: 'Send WhatsApp Instead', highlight: true, action: 'START_WHATSAPP' },
              { id: 'opt_pick_alt', label: 'Select Another Client', highlight: false, action: 'PICK_LEAD' },
            ],
          });
          break;
        }
        await persistMessage({
          id: `bot_${Date.now()}`,
          sender: 'bot',
          text: `**${activeLead.businessName}** (${activeLead.email}) ko Gmail par kaunsa proposal bhejna hai?`,
          createdAt: new Date().toISOString(),
          options: [
            { id: 'gm_upd', label: 'Website Update & Redesign', highlight: true, action: 'CONFIRM_GMAIL', payload: 'update' },
            { id: 'gm_new', label: 'New Website / App / Game', highlight: true, action: 'CONFIRM_GMAIL', payload: 'new_create' },
            { id: 'gm_dual', label: 'Dual Proposal (Update + New)', highlight: false, action: 'CONFIRM_GMAIL', payload: 'dual' },
          ],
        });
        break;
      }

      case 'CONFIRM_GMAIL': {
        if (!activeLead) break;
        const variant = (opt.payload as 'update' | 'new_create' | 'dual') || 'dual';
        const { subject, body } = buildProposalText(activeLead, variant);
        setPendingGmailConfirm({ lead: activeLead, subject, body });
        break;
      }

      case 'SEND_DRAFT_WA': {
        if (!activeLead || !opt.payload) break;
        await dispatchWhatsAppMetaOrLink(activeLead, opt.payload);
        break;
      }

      case 'SEND_DRAFT_GMAIL': {
        if (!activeLead || !opt.payload) break;
        try {
          const parsed = JSON.parse(opt.payload);
          setPendingGmailConfirm({
            lead: activeLead,
            subject: parsed.subject || `Proposal for ${activeLead.businessName}`,
            body: parsed.body || '',
          });
        } catch {
          // ignore
        }
        break;
      }

      case 'AI_PROMPT_MENU': {
        await persistMessage({
          id: `bot_${Date.now()}`,
          sender: 'bot',
          text: activeLead
            ? `Neeche koi option chunein ya seedha chat type karein — main **${activeLead.businessName}** ke liye custom chat/proposal likh dunga:`
            : 'Neeche koi option chunein ya seedha chat box me likhein:',
          createdAt: new Date().toISOString(),
          options: [
            {
              id: 'ai_hi',
              label: 'Hindi WhatsApp Pitch Banao',
              highlight: true,
              action: 'AI_FREE_TEXT',
              payload: 'Write a short persuasive WhatsApp chat message in Hinglish/Hindi offering Website Update or Brand-New Website/App/Game build with a free 2-minute demo.',
            },
            {
              id: 'ai_en',
              label: 'English Founder Gmail Draft',
              highlight: true,
              action: 'AI_FREE_TEXT',
              payload: 'Write a concise direct email pitch to the business owner proposing Website Update & New Mobile App/Game creation.',
            },
            {
              id: 'ai_main',
              label: 'Back to Start Options',
              highlight: false,
              action: 'MAIN_MENU',
            },
          ],
        });
        break;
      }

      case 'AI_FREE_TEXT': {
        await askGeminiChatbot(opt.payload || opt.label);
        break;
      }

      default:
        await persistMessage(buildGreetingMessage(activeLead));
    }
  };

  const handleSendComposer = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = composerText.trim();
    if (!text || isBotTyping || isSendingDispatch) return;

    setComposerText('');
    await persistMessage({
      id: `usr_${Date.now()}`,
      sender: 'user',
      text,
      createdAt: new Date().toISOString(),
    });

    if (composerMode === 'direct') {
      if (!activeLead) {
        await persistMessage({
          id: `bot_${Date.now()}`,
          sender: 'bot',
          text: 'Direct message send karne ke liye pehle koi Client Lead select karein:',
          createdAt: new Date().toISOString(),
          options: [{ id: 'opt_pick_d', label: 'Select Client Lead', highlight: true, action: 'PICK_LEAD' }],
        });
        return;
      }
      const digits = formatWhatsAppDigits(activeLead.whatsAppNumber || activeLead.phoneNumber || activeLead.ownerPhone);
      const waUrl = digits ? buildWaLink(digits, text) : null;
      await persistMessage({
        id: `bot_${Date.now()}`,
        sender: 'bot',
        text: `Aapka message **${activeLead.businessName}** ke liye ready hai. Send karne ka channel chunein:`,
        createdAt: new Date().toISOString(),
        draftedMessage: text,
        waUrl,
        options: [
          ...(digits
            ? [
                {
                  id: 'direct_wa_send',
                  label: 'Dispatch on WhatsApp',
                  highlight: true,
                  action: 'SEND_DRAFT_WA',
                  payload: text,
                },
              ]
            : []),
          ...(activeLead.email && isRealDeliverableEmail(activeLead.email)
            ? [
                {
                  id: 'direct_gm_send',
                  label: 'Send via Connected Gmail',
                  highlight: true,
                  action: 'SEND_DRAFT_GMAIL',
                  payload: JSON.stringify({
                    subject: `Message from Abdul Hafiz — ${activeLead.businessName}`,
                    body: text,
                  }),
                },
              ]
            : []),
          { id: 'direct_main', label: 'Back to Start Options', highlight: false, action: 'MAIN_MENU' },
        ],
      });
    } else {
      await askGeminiChatbot(text);
    }
  };

  const isGmailLead = Boolean(activeLead?.email && /@(gmail|googlemail)\.com$/i.test(activeLead.email));
  const activePhone = activeLead?.whatsAppNumber || activeLead?.phoneNumber || activeLead?.ownerPhone || '';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: mode === 'floating' ? '560px' : '100%',
        minHeight: mode === 'floating' ? '520px' : '620px',
        backgroundColor: '#0b141a',
        borderRadius: mode === 'floating' ? '14px' : '12px',
        overflow: 'hidden',
        border: '1px solid #222d34',
        boxShadow: '0 12px 32px rgba(0, 0, 0, 0.4)',
        position: 'relative',
      }}
    >
      {/* WhatsApp Dark Top Header */}
      <div
        style={{
          backgroundColor: '#202c33',
          padding: '0.7rem 0.95rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.65rem',
          borderBottom: '1px solid #2a3942',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', minWidth: 0 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: '#00a884',
              color: '#0b141a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: '0.9rem',
              flexShrink: 0,
            }}
          >
            LH
          </div>
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                color: '#e9edef',
                fontWeight: 700,
                fontSize: '0.9rem',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {activeLead ? `${activeLead.businessName}` : 'LeadHunter Chatbot'}
            </div>
            <div
              style={{
                color: '#8696a0',
                fontSize: '0.72rem',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
              }}
            >
              {activeLead ? (
                <>
                  <span>{activeLead.email || activePhone || activeLead.city}</span>
                  {isGmailLead && (
                    <span style={{ color: '#00a884', fontWeight: 700 }}>· Personal Gmail</span>
                  )}
                </>
              ) : (
                <span>Select a client or option below to send chat</span>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexShrink: 0 }}>
          {activeLead && (
            <a
              href={`/?clientChat=1&leadId=${activeLead.id}&biz=${encodeURIComponent(activeLead.businessName)}`}
              target="_blank"
              rel="noreferrer"
              title="Open the exact interactive chatbot view that the client sees"
              style={{
                background: 'rgba(0, 168, 132, 0.16)',
                color: '#00a884',
                padding: '0.32rem 0.55rem',
                borderRadius: '6px',
                fontSize: '0.72rem',
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem',
                textDecoration: 'none',
                whiteSpace: 'nowrap',
              }}
            >
              <ExternalLink size={12} />
              <span>Client Bot View</span>
            </a>
          )}
          {activeLead?.googleMapsUrl && (
            <a
              href={activeLead.googleMapsUrl}
              target="_blank"
              rel="noreferrer"
              title="Open client location on Google Maps"
              style={{
                color: '#00a884',
                padding: '0.35rem',
                borderRadius: '6px',
                display: 'inline-flex',
                alignItems: 'center',
                background: 'rgba(0, 168, 132, 0.12)',
              }}
            >
              <MapPin size={15} />
            </a>
          )}
          {activeLead && onOpenLeadDetail && (
            <button
              type="button"
              onClick={() => onOpenLeadDetail(activeLead)}
              title="Inspect full client details"
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: 'none',
                color: '#d1d7db',
                padding: '0.35rem 0.55rem',
                borderRadius: '6px',
                fontSize: '0.72rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Details
            </button>
          )}
          <button
            type="button"
            onClick={handleResetChat}
            title="Reset chat options"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#aebac1',
              padding: '0.35rem',
              borderRadius: '6px',
              cursor: 'pointer',
              display: 'inline-flex',
            }}
          >
            <RotateCcw size={15} />
          </button>
          {mode === 'floating' && onExpandToFullPage && (
            <button
              type="button"
              onClick={onExpandToFullPage}
              title="Open full Chatbot workspace"
              style={{
                background: 'transparent',
                border: 'none',
                color: '#aebac1',
                padding: '0.35rem',
                borderRadius: '6px',
                cursor: 'pointer',
                display: 'inline-flex',
              }}
            >
              <Maximize2 size={15} />
            </button>
          )}
          {mode === 'floating' && onCloseFloating && (
            <button
              type="button"
              onClick={onCloseFloating}
              title="Close chat"
              style={{
                background: 'transparent',
                border: 'none',
                color: '#aebac1',
                padding: '0.35rem',
                borderRadius: '6px',
                cursor: 'pointer',
                display: 'inline-flex',
              }}
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Chat Messages Canvas (Authentic Dark WhatsApp Wallpaper) */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '1rem 0.9rem',
          backgroundColor: '#0b141a',
          backgroundImage: WHATSAPP_DOODLE_BG,
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
        }}
      >
        {messages.map((msg) => {
          const isBot = msg.sender === 'bot';
          if (isBot) {
            return (
              <div
                key={msg.id}
                style={{
                  alignSelf: 'flex-start',
                  width: '100%',
                  maxWidth: mode === 'floating' ? '310px' : '400px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                }}
              >
                {/* Incoming Bot Message Bubble matching screenshot */}
                <div
                  style={{
                    position: 'relative',
                    backgroundColor: '#202c33',
                    color: '#e9edef',
                    borderRadius: '0 10px 10px 10px',
                    padding: '0.65rem 0.85rem 0.5rem 0.85rem',
                    fontSize: '0.92rem',
                    lineHeight: 1.45,
                    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.35)',
                    marginLeft: '6px',
                  }}
                >
                  {/* Top-left WhatsApp speech bubble tail */}
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
                  <div style={{ wordBreak: 'break-word' }}>{renderRichBubbleText(msg.text)}</div>

                  {msg.waUrl && (
                    <div style={{ marginTop: '0.55rem' }}>
                      <a
                        href={msg.waUrl}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.4rem',
                          background: '#00a884',
                          color: '#0b141a',
                          fontWeight: 700,
                          fontSize: '0.8rem',
                          padding: '0.45rem 0.75rem',
                          borderRadius: '6px',
                          textDecoration: 'none',
                        }}
                      >
                        <ExternalLink size={14} />
                        <span>Open &amp; Send in WhatsApp</span>
                      </a>
                    </div>
                  )}

                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'flex-end',
                      alignItems: 'center',
                      gap: '0.3rem',
                      marginTop: '0.2rem',
                      fontSize: '0.68rem',
                      color: '#8696a0',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {msg.channel && <span>{msg.channel} ·</span>}
                    <span>{formatChatTime(msg.createdAt)}</span>
                  </div>
                </div>

                {/* Stacked Full-Width Option Buttons directly under bot bubble (matching screenshot!) */}
                {msg.options && msg.options.length > 0 && (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                      marginLeft: '6px',
                    }}
                  >
                    {msg.options.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        disabled={isBotTyping || isSendingDispatch}
                        onClick={() => handleOptionClick(opt)}
                        style={{
                          width: '100%',
                          backgroundColor: '#202c33',
                          color: opt.highlight === false ? '#c4cfd4' : '#00a884',
                          border: 'none',
                          borderRadius: '8px',
                          padding: '0.68rem 1rem',
                          fontSize: '0.9rem',
                          fontWeight: 600,
                          textAlign: 'center',
                          cursor: isBotTyping || isSendingDispatch ? 'wait' : 'pointer',
                          boxShadow: '0 1px 2px rgba(0, 0, 0, 0.3)',
                          transition: 'background-color 0.15s ease, transform 0.1s ease',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = '#2a3942';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = '#202c33';
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          }

          // Outgoing User Bubble (WhatsApp Emerald Green)
          return (
            <div
              key={msg.id}
              style={{
                alignSelf: 'flex-end',
                maxWidth: mode === 'floating' ? '270px' : '360px',
                position: 'relative',
                backgroundColor: '#005c4b',
                color: '#e9edef',
                borderRadius: '10px 0 10px 10px',
                padding: '0.55rem 0.8rem 0.45rem 0.8rem',
                fontSize: '0.9rem',
                lineHeight: 1.4,
                boxShadow: '0 1px 2px rgba(0, 0, 0, 0.3)',
                marginRight: '6px',
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
              <div style={{ wordBreak: 'break-word' }}>{renderRichBubbleText(msg.text)}</div>
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
                <span>{formatChatTime(msg.createdAt)}</span>
                <CheckCheck size={13} color="#53bdeb" />
              </div>
            </div>
          );
        })}

        {isBotTyping && (
          <div
            style={{
              alignSelf: 'flex-start',
              marginLeft: '6px',
              backgroundColor: '#202c33',
              color: '#8696a0',
              borderRadius: '10px',
              padding: '0.5rem 0.85rem',
              fontSize: '0.8rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.45rem',
            }}
          >
            <Loader2 size={14} className="animate-spin" color="#00a884" />
            <span>Writing reply...</span>
          </div>
        )}
        <div ref={scrollEndRef} />
      </div>

      {/* Explicit Confirmation Panel for Sending Gmail (Mandatory Workspace Guard) */}
      {pendingGmailConfirm && (
        <div
          style={{
            backgroundColor: '#182229',
            borderTop: '1px solid #00a884',
            padding: '0.85rem 1rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.55rem',
            color: '#e9edef',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#00a884', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <Mail size={14} /> Confirm Gmail Send to {pendingGmailConfirm.lead.email}
            </span>
            <button
              type="button"
              onClick={() => setPendingGmailConfirm(null)}
              style={{ background: 'none', border: 'none', color: '#8696a0', cursor: 'pointer' }}
            >
              <X size={15} />
            </button>
          </div>
          <div style={{ fontSize: '0.75rem', color: '#aebac1' }}>
            <strong>Subject:</strong> {pendingGmailConfirm.subject}
          </div>
          <div
            style={{
              fontSize: '0.74rem',
              color: '#d1d7db',
              background: '#0b141a',
              padding: '0.5rem',
              borderRadius: '6px',
              maxHeight: '80px',
              overflowY: 'auto',
              whiteSpace: 'pre-wrap',
            }}
          >
            {pendingGmailConfirm.body}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
            <button
              type="button"
              onClick={() => setPendingGmailConfirm(null)}
              style={{
                background: '#2a3942',
                color: '#e9edef',
                border: 'none',
                borderRadius: '6px',
                padding: '0.4rem 0.75rem',
                fontSize: '0.78rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isSendingDispatch}
              onClick={executeConfirmedGmailSend}
              style={{
                background: '#00a884',
                color: '#0b141a',
                border: 'none',
                borderRadius: '6px',
                padding: '0.4rem 0.85rem',
                fontSize: '0.78rem',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
              }}
            >
              {isSendingDispatch ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
              <span>Confirm &amp; Send Gmail</span>
            </button>
          </div>
        </div>
      )}

      {/* Bottom Composer Mode + Input Bar */}
      <div
        style={{
          backgroundColor: '#202c33',
          borderTop: '1px solid #2a3942',
          padding: '0.5rem 0.75rem 0.65rem 0.75rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.45rem',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
          <div style={{ display: 'inline-flex', background: '#111b21', borderRadius: '6px', padding: '2px' }}>
            <button
              type="button"
              onClick={() => setComposerMode('ai')}
              style={{
                border: 'none',
                borderRadius: '5px',
                padding: '0.2rem 0.55rem',
                fontSize: '0.7rem',
                fontWeight: 700,
                cursor: 'pointer',
                background: composerMode === 'ai' ? '#00a884' : 'transparent',
                color: composerMode === 'ai' ? '#0b141a' : '#8696a0',
                whiteSpace: 'nowrap',
              }}
            >
              AI Chatbot Assistant
            </button>
            <button
              type="button"
              onClick={() => setComposerMode('direct')}
              style={{
                border: 'none',
                borderRadius: '5px',
                padding: '0.2rem 0.55rem',
                fontSize: '0.7rem',
                fontWeight: 700,
                cursor: 'pointer',
                background: composerMode === 'direct' ? '#00a884' : 'transparent',
                color: composerMode === 'direct' ? '#0b141a' : '#8696a0',
                whiteSpace: 'nowrap',
              }}
            >
              Send Direct Client Chat
            </button>
          </div>
          {activeLead && (
            <span style={{ fontSize: '0.68rem', color: '#8696a0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              To: {activeLead.businessName}
            </span>
          )}
        </div>

        <form onSubmit={handleSendComposer} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <input
            type="text"
            value={composerText}
            onChange={(e) => setComposerText(e.target.value)}
            placeholder={
              composerMode === 'direct'
                ? 'Type exact message to send to client...'
                : 'Type message or ask AI (e.g. Hindi me proposal likho)...'
            }
            style={{
              flex: 1,
              backgroundColor: '#2a3942',
              color: '#e9edef',
              border: '1px solid transparent',
              borderRadius: '8px',
              padding: '0.55rem 0.8rem',
              fontSize: '0.85rem',
              outline: 'none',
            }}
          />
          <button
            type="submit"
            disabled={!composerText.trim() || isBotTyping || isSendingDispatch}
            aria-label="Send chat message"
            style={{
              width: 38,
              height: 38,
              borderRadius: '50%',
              backgroundColor: composerText.trim() ? '#00a884' : '#2a3942',
              color: composerText.trim() ? '#0b141a' : '#8696a0',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: composerText.trim() ? 'pointer' : 'not-allowed',
              flexShrink: 0,
              transition: 'background-color 0.15s ease',
            }}
          >
            <Send size={16} />
          </button>
        </form>
      </div>
    </div>
  );
};
