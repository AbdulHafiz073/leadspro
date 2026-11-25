import React, { useState, useMemo } from 'react';
import {
  Sparkles,
  Send,
  MessageSquare,
  Mail,
  AlertTriangle,
  CheckCircle2,
  Users,
  Search,
  Download,
  ExternalLink,
  MapPin,
  Phone,
  RotateCcw,
  Check,
  X,
  Edit3,
  Clock,
  ThumbsUp,
  DollarSign,
  Calendar,
  AlertCircle,
  Eye,
  ArrowRight,
  Filter,
  ShieldCheck,
  Copy
} from 'lucide-react';
import { useLeads } from '../context/LeadContext';
import { Lead, LeadOutreachStatus, OutreachChannel } from '../types';
import { Modal } from '../components/ModalAndToast';
import { getMaxedLogicPitch, getMaxedLogicFollowUpPitch, MAXEDLOGIC_SENDER } from '../utils/maxedLogicPitches';
import { GoogleConnectButton } from '../components/GoogleConnectButton';
import { sendEmailViaGmailApi, fetchInboundGmailReplies, analyzeReplyContent } from '../services/gmailApiService';
import { getAccessToken, googleSignIn } from '../services/googleWorkspaceAuth';
import { GmailReplyRecord } from '../types';
import { isRealDeliverableEmail } from '../utils/deliverability';
import { WhatsAppQueueModal } from '../components/WhatsAppQueueModal';
import { WhatsAppConnectButton } from '../components/WhatsAppConnectButton';
import { WhatsAppBulkSendModal } from '../components/WhatsAppBulkSendModal';
import { hasAvailableWhatsAppNumber } from '../services/whatsappConnectService';
import { resolveEmailProfileDp, isLeadDpActive } from '../utils/profileDpService';

export type PipelineTab = 'scanned' | 'pitched' | 'whatsapp' | 'gmail' | 'both' | 'errors' | 'replies' | 'gmailReplies';

interface AdminPipelinePageProps {
  initialTab?: PipelineTab;
  onNavigateToScanner?: () => void;
  onNavigateToLeads?: () => void;
  onOpenLeadDetail?: (lead: Lead) => void;
  onShowToast: (title: string, message: string, type: 'success' | 'error' | 'info') => void;
}

export const AdminPipelinePage: React.FC<AdminPipelinePageProps> = ({
  initialTab,
  onNavigateToScanner,
  onNavigateToLeads,
  onOpenLeadDetail,
  onShowToast,
}) => {
  const {
    leads,
    countries,
    markLeadPitched,
    markLeadError,
    markLeadReply,
    resetLeadStatus,
    updateLead,
    gmailReplies,
    addGmailReply,
    deleteGmailReply,
    exportLeadsCSV,
    exportLeadsJSON,
    resetToVerifiedRealLeads,
    refreshLeadsFromDb,
  } = useLeads();

  // Active Tab
  const [activeTab, setActiveTab] = useState<PipelineTab>(initialTab || 'scanned');

  React.useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCountry, setSelectedCountry] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');

  // Modals state
  const [statusModalLead, setStatusModalLead] = useState<Lead | null>(null);
  const [editStatusTarget, setEditStatusTarget] = useState<LeadOutreachStatus>('WhatsAppSent');
  const [modalCustomNote, setModalCustomNote] = useState('');
  const [modalReplyType, setModalReplyType] = useState<'Interested' | 'DemoScheduled' | 'NotInterested' | 'DealWon' | 'General'>('Interested');

  // Quick Pitch Modal state
  const [pitchModalLead, setPitchModalLead] = useState<Lead | null>(null);
  const [pitchModalChannel, setPitchModalChannel] = useState<'WhatsApp' | 'Email'>('WhatsApp');
  const [customPitchText, setCustomPitchText] = useState('');
  const [customSubjectText, setCustomSubjectText] = useState('');
  const [customRecipientEmail, setCustomRecipientEmail] = useState('');
  const [customRecipientPhone, setCustomRecipientPhone] = useState('');

  // Edit contact modal state
  const [editContactLead, setEditContactLead] = useState<Lead | null>(null);
  const [editPhone, setEditPhone] = useState('');
  const [editWhatsApp, setEditWhatsApp] = useState('');
  const [editEmail, setEditEmail] = useState('');

  // View Sent Pitch Modal
  const [viewPitchModalLead, setViewPitchModalLead] = useState<Lead | null>(null);

  // Gmail Reply states
  const [replyIntentFilter, setReplyIntentFilter] = useState<'all' | 'interested' | 'notInterested' | 'gmailInbox' | 'chatbot'>('all');
  const [isAddReplyModalOpen, setIsAddReplyModalOpen] = useState(false);
  const [newReplyBizName, setNewReplyBizName] = useState('');
  const [newReplyEmail, setNewReplyEmail] = useState('');
  const [newReplyPhone, setNewReplyPhone] = useState('');
  const [newReplySubject, setNewReplySubject] = useState('Re: Proposal & Demo');
  const [newReplyMessage, setNewReplyMessage] = useState('');
  const [newReplyWantsCreate, setNewReplyWantsCreate] = useState(false);
  const [newReplyWantsUpdate, setNewReplyWantsUpdate] = useState(false);
  const [newReplyType, setNewReplyType] = useState<
    | 'YES (Interested)'
    | 'Website Create Approved'
    | 'Website Update Requested'
    | 'Contact Number Shared'
    | 'Demo Scheduled'
    | 'Deal Won'
    | 'NO (Not Interested)'
    | 'Question'
  >('YES (Interested)');
  const [viewingReplyRecord, setViewingReplyRecord] = useState<GmailReplyRecord | null>(null);
  const [isWhatsAppQueueOpen, setIsWhatsAppQueueOpen] = useState(false);
  const [isWhatsAppBulkOpen, setIsWhatsAppBulkOpen] = useState(false);

  const handleSaveNewGmailReply = () => {
    if (!newReplyEmail.trim() || !newReplyEmail.includes('@')) {
      onShowToast('Email Required', 'Please enter a valid client email address.', 'error');
      return;
    }
    if (!newReplyMessage.trim()) {
      onShowToast('Message Required', 'Please enter the client reply text/content.', 'error');
      return;
    }

    const parsed = analyzeReplyContent(newReplySubject, newReplyMessage);
    const wantsCreate = newReplyWantsCreate || newReplyType === 'Website Create Approved' || parsed.wantsWebsiteCreate;
    const wantsUpdate = newReplyWantsUpdate || newReplyType === 'Website Update Requested' || parsed.wantsWebsiteUpdate;
    const extractedPhone = newReplyPhone.trim() || parsed.extractedPhone || null;

    const intentCategory: GmailReplyRecord['intentCategory'] =
      newReplyType.includes('NO')
        ? 'NotInterested'
        : wantsCreate
        ? 'ApprovedWebsiteCreate'
        : wantsUpdate
        ? 'RequestedWebsiteUpdate'
        : extractedPhone
        ? 'SentContactNumber'
        : 'Interested';

    const snippet = newReplyMessage.length > 90 ? newReplyMessage.slice(0, 87) + '...' : newReplyMessage;
    addGmailReply({
      businessName: newReplyBizName.trim() || 'Direct Client Response',
      clientEmail: newReplyEmail.trim().toLowerCase(),
      clientPhone: extractedPhone || undefined,
      extractedPhone,
      subject: newReplySubject.trim() || 'Re: Website Proposal',
      replySnippet: snippet,
      fullMessage: newReplyMessage.trim(),
      replyType: newReplyType,
      intentCategory,
      wantsWebsiteCreate: wantsCreate,
      wantsWebsiteUpdate: wantsUpdate,
      threadUrl: `https://mail.google.com/mail/u/0/#search/from%3A${encodeURIComponent(newReplyEmail.trim().toLowerCase())}`,
      notes: `Recorded on ${new Date().toLocaleDateString()} by Admin`,
    });

    onShowToast(
      'Gmail Reply Added!',
      `${newReplyEmail} ka reply Admin Panel mein save ho gaya hai.`,
      'success'
    );

    setIsAddReplyModalOpen(false);
    setNewReplyBizName('');
    setNewReplyEmail('');
    setNewReplyPhone('');
    setNewReplyMessage('');
    setNewReplyWantsCreate(false);
    setNewReplyWantsUpdate(false);
  };

  // Extract unique categories
  const categories = useMemo(() => {
    const set = new Set<string>();
    leads.forEach((l) => {
      if (l.category) set.add(l.category);
    });
    return Array.from(set).sort();
  }, [leads]);

  // Derived datasets for the requested tabs
  // 1. Scanned Clients Table
  const scannedClients = useMemo(() => {
    return leads.filter((l) => l.isScanned || l.source === 'Google AI Scanner');
  }, [leads]);

  // 2. Total Pitched Leads
  const totalPitchedLeads = useMemo(() => {
    return leads.filter(
      (l) =>
        l.outreachStatus === 'WhatsAppSent' ||
        l.outreachStatus === 'EmailSent' ||
        l.outreachStatus === 'BothSent' ||
        l.outreachStatus === 'Replied' ||
        !!l.lastPitchedAt
    );
  }, [leads]);

  // 3. WhatsApp Pitched Leads
  const whatsAppPitchedLeads = useMemo(() => {
    return leads.filter(
      (l) =>
        l.outreachStatus === 'WhatsAppSent' ||
        l.outreachStatus === 'BothSent' ||
        l.pitchApp === 'WhatsApp' ||
        (l.pitchChannel === 'WhatsApp' && l.outreachStatus !== 'PhoneError')
    );
  }, [leads]);

  // 4. Gmail / Email Pitched Leads
  const gmailPitchedLeads = useMemo(() => {
    return leads.filter(
      (l) =>
        l.outreachStatus === 'EmailSent' ||
        l.outreachStatus === 'BothSent' ||
        l.pitchApp === 'Gmail' ||
        (l.pitchChannel === 'Email' && l.outreachStatus !== 'EmailError')
    );
  }, [leads]);

  // 5. Both WhatsApp + Gmail Pitched Leads
  const bothPitchedLeads = useMemo(() => {
    return leads.filter(
      (l) =>
        l.outreachStatus === 'BothSent' ||
        l.pitchApp === 'Both' ||
        (l.pitchChannel === 'Both' && l.outreachStatus !== 'PhoneError' && l.outreachStatus !== 'EmailError')
    );
  }, [leads]);

  // 6. Delivery & Contact Errors (Phone or Gmail)
  const errorLeads = useMemo(() => {
    return leads.filter((l) => l.outreachStatus === 'PhoneError' || l.outreachStatus === 'EmailError');
  }, [leads]);

  // 7. Replies Received
  const replyLeads = useMemo(() => {
    return leads.filter((l) => l.outreachStatus === 'Replied' || l.replyReceived);
  }, [leads]);

  // Active list based on activeTab
  const currentTabRawList = useMemo(() => {
    switch (activeTab) {
      case 'scanned':
        return scannedClients;
      case 'pitched':
        return totalPitchedLeads;
      case 'whatsapp':
        return whatsAppPitchedLeads;
      case 'gmail':
        return gmailPitchedLeads;
      case 'both':
        return bothPitchedLeads;
      case 'errors':
        return errorLeads;
      case 'replies':
        return replyLeads;
      default:
        return scannedClients;
    }
  }, [activeTab, scannedClients, totalPitchedLeads, whatsAppPitchedLeads, gmailPitchedLeads, bothPitchedLeads, errorLeads, replyLeads]);

  // Filter current list with search query & dropdowns
  const filteredList = useMemo(() => {
    return currentTabRawList.filter((lead) => {
      // Country Filter
      if (selectedCountry !== 'all') {
        const cMatch =
          lead.countryName?.toLowerCase() === selectedCountry.toLowerCase() ||
          lead.countryCode?.toLowerCase() === selectedCountry.toLowerCase();
        if (!cMatch) return false;
      }

      // Category Filter
      if (selectedCategory !== 'all') {
        if (lead.category.toLowerCase() !== selectedCategory.toLowerCase()) return false;
      }

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = lead.businessName?.toLowerCase().includes(q);
        const matchContact = lead.contactPerson?.toLowerCase().includes(q);
        const matchCity = lead.city?.toLowerCase().includes(q);
        const matchPhone = lead.phoneNumber?.toLowerCase().includes(q);
        const matchEmail = lead.email?.toLowerCase().includes(q);
        const matchCategory = lead.category?.toLowerCase().includes(q);
        const matchNote = lead.replyNotes?.toLowerCase().includes(q);
        const matchError = lead.errorMessage?.toLowerCase().includes(q);
        return matchName || matchContact || matchCity || matchPhone || matchEmail || matchCategory || matchNote || matchError;
      }

      return true;
    });
  }, [currentTabRawList, searchQuery, selectedCountry, selectedCategory]);

  const filteredGmailReplies = useMemo(() => {
    return gmailReplies.filter((r) => {
      if (replyIntentFilter === 'interested') {
        const isYes =
          r.replyType.includes('YES') ||
          r.intentCategory === 'Interested' ||
          r.wantsWebsiteCreate ||
          r.wantsWebsiteUpdate ||
          r.finalDecision === 'YES' ||
          r.replyType === 'Website Create Approved' ||
          r.replyType === 'Website Update Requested' ||
          r.replyType === 'Demo Scheduled' ||
          r.replyType === 'Deal Won';
        if (!isYes) return false;
      }
      if (replyIntentFilter === 'notInterested') {
        const isNo =
          r.replyType.includes('NO') ||
          r.intentCategory === 'NotInterested' ||
          r.finalDecision === 'NO';
        if (!isNo) return false;
      }
      if (replyIntentFilter === 'gmailInbox') {
        const isGmail =
          r.channelSource === 'Direct Gmail Inbox' ||
          r.id.startsWith('imap_') ||
          (r.notes && r.notes.includes('IMAP')) ||
          (!r.serviceMode && !r.channelSource?.includes('Chatbot') && !r.channelSource?.includes('WhatsApp'));
        if (!isGmail) return false;
      }
      if (replyIntentFilter === 'chatbot') {
        const isBot =
          Boolean(r.serviceMode) ||
          Boolean(r.channelSource?.includes('Chatbot')) ||
          Boolean(r.channelSource?.includes('WhatsApp'));
        if (!isBot) return false;
      }
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        r.businessName.toLowerCase().includes(q) ||
        r.clientEmail.toLowerCase().includes(q) ||
        (r.clientPhone && r.clientPhone.toLowerCase().includes(q)) ||
        (r.extractedPhone && r.extractedPhone.toLowerCase().includes(q)) ||
        (r.location && r.location.toLowerCase().includes(q)) ||
        (r.serviceMode && r.serviceMode.toLowerCase().includes(q)) ||
        (r.selectedCategory && r.selectedCategory.toLowerCase().includes(q)) ||
        (r.selectedSubType && r.selectedSubType.toLowerCase().includes(q)) ||
        (r.finalDecision && r.finalDecision.toLowerCase().includes(q)) ||
        r.replySnippet.toLowerCase().includes(q) ||
        r.fullMessage.toLowerCase().includes(q) ||
        r.replyType.toLowerCase().includes(q)
      );
    });
  }, [gmailReplies, replyIntentFilter, searchQuery]);

  // Reply Breakdown Intelligence Metrics (Replied / Interested / Not Interested / Direct Gmail Inbox / Chatbot)
  const replyStats = useMemo(() => {
    const interestedCount = gmailReplies.filter(
      (r) =>
        r.replyType.includes('YES') ||
        r.intentCategory === 'Interested' ||
        r.wantsWebsiteCreate ||
        r.wantsWebsiteUpdate ||
        r.finalDecision === 'YES' ||
        r.replyType === 'Website Create Approved' ||
        r.replyType === 'Website Update Requested' ||
        r.replyType === 'Demo Scheduled' ||
        r.replyType === 'Deal Won'
    ).length;
    const notInterestedCount = gmailReplies.filter(
      (r) =>
        r.replyType.includes('NO') ||
        r.intentCategory === 'NotInterested' ||
        r.finalDecision === 'NO'
    ).length;
    const directGmailCount = gmailReplies.filter(
      (r) =>
        r.channelSource === 'Direct Gmail Inbox' ||
        r.id.startsWith('imap_') ||
        (r.notes && r.notes.includes('IMAP')) ||
        (!r.serviceMode && !r.channelSource?.includes('Chatbot') && !r.channelSource?.includes('WhatsApp'))
    ).length;
    const chatbotCount = gmailReplies.filter(
      (r) =>
        Boolean(r.serviceMode) ||
        Boolean(r.channelSource?.includes('Chatbot')) ||
        Boolean(r.channelSource?.includes('WhatsApp'))
    ).length;
    return {
      totalReplied: gmailReplies.length,
      interestedCount,
      notInterestedCount,
      directGmailCount,
      chatbotCount,
    };
  }, [gmailReplies]);

  // Open Direct Pitch Modal
  const handleOpenPitchModal = (lead: Lead, channel: 'WhatsApp' | 'Email') => {
    // 🛡️ 0 Bounce Protection: If lead has no verified email, auto-route to WhatsApp
    const hasValidEmail = Boolean(lead.email && isRealDeliverableEmail(lead.email));
    const effectiveChannel = (!hasValidEmail && channel === 'Email') ? 'WhatsApp' : channel;

    if (!hasValidEmail && channel === 'Email') {
      onShowToast(
        '0 Bounce Auto-Switch 🛡️',
        'इस बिज़नेस का Google Maps पर केवल फ़ोन व WhatsApp उपलब्ध है। "Address not found" एरर से बचने के लिए सीधे WhatsApp चुना गया है।',
        'info'
      );
    }

    setPitchModalLead(lead);
    setPitchModalChannel(effectiveChannel);

    const defaultEmail = hasValidEmail ? (lead.email || '') : '';
    setCustomRecipientEmail(defaultEmail);
    setCustomRecipientPhone(lead.whatsAppNumber || lead.phoneNumber || '');

    const pitch = getMaxedLogicPitch({ ...lead, email: defaultEmail });
    if (effectiveChannel === 'WhatsApp') {
      setCustomPitchText(pitch.whatsAppText);
    } else {
      setCustomSubjectText(pitch.emailSubject);
      setCustomPitchText(pitch.emailBody);
    }
  };

  // Open Follow-up Pitch Modal
  const handleOpenFollowUpModal = (lead: Lead, channel: 'WhatsApp' | 'Email' = 'Email') => {
    const hasValidEmail = Boolean(lead.email && isRealDeliverableEmail(lead.email));
    const effectiveChannel = (!hasValidEmail && channel === 'Email') ? 'WhatsApp' : channel;

    if (!hasValidEmail && channel === 'Email') {
      onShowToast(
        'WhatsApp Follow-up Selected',
        'इस बिज़नेस का कोई ईमेल उपलब्ध नहीं है — फ़ॉलो-अप WhatsApp के ज़रिए भेजा जाएगा।',
        'info'
      );
    }

    setPitchModalLead(lead);
    setPitchModalChannel(effectiveChannel);
    setCustomRecipientEmail(hasValidEmail ? (lead.email || '') : '');
    setCustomRecipientPhone(lead.whatsAppNumber || lead.phoneNumber || '');

    const pitch = getMaxedLogicFollowUpPitch(lead);
    if (effectiveChannel === 'WhatsApp') {
      setCustomPitchText(pitch.whatsAppText);
    } else {
      setCustomSubjectText(pitch.emailSubject);
      setCustomPitchText(pitch.emailBody);
    }
  };

  const [isSyncingInbox, setIsSyncingInbox] = useState(false);

  const handleSyncGmailInbox = async () => {
    setIsSyncingInbox(true);
    try {
      // 1. Always sync latest SQLite database leads, chatbot selections, and interactive email button replies first
      await refreshLeadsFromDb();

      // 2. Fetch any direct inbound messages from Gmail API safely
      const res = await fetchInboundGmailReplies();
      if (res.needsAuth) {
        onShowToast('Google Login Required', 'जीमेल इनबॉक्स सिंक करने के लिए कृपया Google Login से कनेक्ट करें।', 'info');
      } else if (res.success) {
        if (res.replies && res.replies.length > 0) {
          applyIncomingReplies(res.replies);
        } else {
          onShowToast('Inbox Sync Complete', 'इनबॉक्स चेक किया गया। डेटाबेस व जीमेल पूरी तरह सिंक हैं।', 'success');
        }
      } else {
        onShowToast('Inbox Check', res.error || 'इनबॉक्स सिंक पूरा हुआ।', 'info');
      }
    } catch (err: any) {
      onShowToast('Inbox Sync', err?.message || 'सिंक पूरा हुआ।', 'info');
    } finally {
      setIsSyncingInbox(false);
    }
  };

  const applyIncomingReplies = (inboundReplies: import('../services/gmailApiService').InboundGmailReply[]) => {
    let addedCount = 0;
    for (const reply of inboundReplies) {
      const replySender = reply.senderEmail.toLowerCase().trim();
      const alreadyExists = gmailReplies.some(
        (gr) =>
          (gr.id === reply.id) ||
          (gr.clientEmail.toLowerCase().trim() === replySender && gr.subject === reply.subject)
      );
      if (!alreadyExists) {
        const matchedLead = leads.find((l) => (l.email || '').toLowerCase().trim() === replySender);
        const fullLoc = matchedLead
          ? [matchedLead.address, matchedLead.city, matchedLead.state, matchedLead.countryName]
              .filter(Boolean)
              .join(', ')
          : '';
        addGmailReply({
          id: reply.id,
          leadId: matchedLead?.id,
          businessName: matchedLead?.businessName || reply.senderName || reply.senderEmail.split('@')[0],
          clientEmail: reply.senderEmail,
          clientPhone:
            reply.extractedPhone ||
            matchedLead?.ownerPhone ||
            matchedLead?.phoneNumber ||
            matchedLead?.whatsAppNumber ||
            undefined,
          extractedPhone: reply.extractedPhone,
          location: fullLoc || undefined,
          address: matchedLead?.address || undefined,
          city: matchedLead?.city || undefined,
          countryName: matchedLead?.countryName || undefined,
          googleMapsUrl: matchedLead?.googleMapsUrl || undefined,
          receivedAt: reply.receivedAt,
          subject: reply.subject,
          replySnippet: reply.snippet,
          fullMessage: reply.fullBody || reply.snippet,
          replyType: reply.replyType,
          intentCategory: reply.intentCategory,
          wantsWebsiteCreate: reply.wantsWebsiteCreate,
          wantsWebsiteUpdate: reply.wantsWebsiteUpdate,
          notes: `Live synced via Gmail API (Thread: ${reply.threadId})`,
          threadUrl: reply.threadUrl,
        });
        addedCount++;
      }
    }
    if (addedCount > 0) {
      onShowToast(
        'Gmail Inbox Synced!',
        `${addedCount} new client replies synced (Website Create / Update / Contact Number auto-detected).`,
        'success'
      );
    } else {
      onShowToast('Inbox Check', 'Sabhi Gmail replies pehle se Admin Panel mein synced hain.', 'info');
    }
  };

  // Execute Pitch from Modal
  const handleExecutePitchModal = () => {
    if (!pitchModalLead) return;

    if (pitchModalChannel === 'WhatsApp') {
      const phone = customRecipientPhone.trim() || pitchModalLead.whatsAppNumber || pitchModalLead.phoneNumber;
      if (!phone) {
        onShowToast('Phone Error', 'No phone/WhatsApp number available for this business.', 'error');
        markLeadError(pitchModalLead.id, 'InvalidPhone', 'No phone/WhatsApp number registered on file.');
        setPitchModalLead(null);
        return;
      }

      // Save phone if user edited
      if (customRecipientPhone.trim() && customRecipientPhone.trim() !== (pitchModalLead.whatsAppNumber || pitchModalLead.phoneNumber)) {
        updateLead(pitchModalLead.id, { whatsAppNumber: customRecipientPhone.trim(), phoneNumber: customRecipientPhone.trim() });
      }

      // Format phone digits with 91 if 10 digits
      let cleanDigits = phone.replace(/[^0-9]/g, '');
      if (cleanDigits.length === 10) cleanDigits = '91' + cleanDigits;
      const waUrl = `https://wa.me/${cleanDigits}?text=${encodeURIComponent(customPitchText)}`;
      window.open(waUrl, '_blank', 'noopener,noreferrer');

      markLeadPitched(pitchModalLead.id, 'WhatsApp', { message: customPitchText });
      onShowToast(
        'WhatsApp Opened',
        `Opened WhatsApp chat for ${pitchModalLead.businessName}. Hit "Send" in WhatsApp to dispatch from ${MAXEDLOGIC_SENDER.senderPhoneFormatted}!`,
        'success'
      );
    } else {
      const email = customRecipientEmail.trim() || pitchModalLead.email;
      if (!email) {
        onShowToast(
          'Email Address Needed',
          'कृपया इस बिज़नेस के लिए ईमेल लिखें या ऊपर "Switch to WhatsApp" बटन दबाएँ।',
          'info'
        );
        return;
      }

      // Save email to lead
      if (email !== pitchModalLead.email) {
        updateLead(pitchModalLead.id, { email });
      }

      // Open Gmail Web Compose in browser signed in as aabdulhafiz073@gmail.com
      const gmailWebUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(email)}&su=${encodeURIComponent(customSubjectText)}&body=${encodeURIComponent(customPitchText)}`;
      window.open(gmailWebUrl, '_blank', 'noopener,noreferrer');

      markLeadPitched(pitchModalLead.id, 'Email', { subject: customSubjectText, message: customPitchText });
      onShowToast(
        'Gmail Compose Opened',
        `Opened Gmail for ${pitchModalLead.businessName} (${email}). Hit "Send" in Gmail to dispatch from ${MAXEDLOGIC_SENDER.senderEmail}!`,
        'success'
      );
    }

    setPitchModalLead(null);
  };

  const [isSendingGmailApi, setIsSendingGmailApi] = useState(false);

  const handleExecuteGmailApiDirect = async () => {
    if (!pitchModalLead) return;
    const email = customRecipientEmail.trim() || pitchModalLead.email;
    if (!email || !isRealDeliverableEmail(email)) {
      onShowToast(
        '0 Bounce सुरक्षा 🛡️',
        'इस बिज़नेस का Google Maps पर कोई मान्य ईमेल उपलब्ध नहीं है। "Address not found" (550) बाउंस से बचने के लिए अमान्य पते पर नहीं भेजा जा सकता — इसे सीधे WhatsApp पर भेजें।',
        'info'
      );
      setPitchModalChannel('WhatsApp');
      return;
    }

    if (email !== pitchModalLead.email) {
      updateLead(pitchModalLead.id, { email });
    }

    let token = await getAccessToken();
    if (!token) {
      onShowToast('Connecting Gmail...', 'Authorizing Google account to dispatch pitch...', 'info');
      try {
        const res = await googleSignIn();
        if (res?.accessToken) {
          token = res.accessToken;
        }
      } catch (err: any) {
        // Fallback gracefully to Gmail Web tab!
        onShowToast('Using Gmail Web Tab', 'Google pop-up was closed. Opening Gmail Web compose directly...', 'info');
        handleExecutePitchModal();
        return;
      }
    }

    if (!token) {
      onShowToast('Using Gmail Web Tab', 'Opening Gmail Compose window directly (no login needed)...', 'info');
      handleExecutePitchModal();
      return;
    }

    setIsSendingGmailApi(true);
    try {
      const res = await sendEmailViaGmailApi(
        email,
        MAXEDLOGIC_SENDER.senderEmail,
        customSubjectText,
        customPitchText
      );

      if (res.success) {
        markLeadPitched(pitchModalLead.id, 'Email', {
          subject: customSubjectText,
          message: customPitchText,
        });
        onShowToast(
          'Email Sent via Gmail API!',
          `Dispatched to ${email} from ${MAXEDLOGIC_SENDER.senderEmail}! Visible in your Gmail Sent folder.`,
          'success'
        );
        setPitchModalLead(null);
      } else {
        markLeadError(pitchModalLead.id, 'EmailBounced', res.error || 'Gmail API send failed');
        onShowToast('Gmail API Error', `${res.error || 'Failed to send'}. Opening Gmail Web draft (mark sent only after clicking Send)...`, 'error');
        const gmailWebUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(email)}&su=${encodeURIComponent(customSubjectText)}&body=${encodeURIComponent(customPitchText)}`;
        window.open(gmailWebUrl, '_blank', 'noopener,noreferrer');
      }
    } catch (err: any) {
      onShowToast('Gmail Send Error', err?.message || 'Could not send via background API.', 'error');
    } finally {
      setIsSendingGmailApi(false);
    }
  };

  // Open Status Edit Modal
  const handleOpenStatusModal = (lead: Lead) => {
    setStatusModalLead(lead);
    setEditStatusTarget(lead.outreachStatus || 'Pending');
    setModalCustomNote(lead.replyNotes || lead.errorMessage || '');
    setModalReplyType(lead.replyType || 'Interested');
  };

  // Save Status Modal
  const handleSaveStatusModal = () => {
    if (!statusModalLead) return;

    switch (editStatusTarget) {
      case 'WhatsAppSent':
        markLeadPitched(statusModalLead.id, 'WhatsApp', { message: modalCustomNote });
        onShowToast('Status Updated', `${statusModalLead.businessName} marked as Pitched via WhatsApp.`, 'success');
        break;
      case 'EmailSent':
        markLeadPitched(statusModalLead.id, 'Email', { message: modalCustomNote });
        onShowToast('Status Updated', `${statusModalLead.businessName} marked as Pitched via Gmail.`, 'success');
        break;
      case 'BothSent':
        markLeadPitched(statusModalLead.id, 'Both', { message: modalCustomNote });
        onShowToast('Status Updated', `${statusModalLead.businessName} marked as Pitched on Both channels.`, 'success');
        break;
      case 'PhoneError':
        markLeadError(statusModalLead.id, 'InvalidPhone', modalCustomNote || 'Invalid/unreachable phone number');
        onShowToast('Error Logged', `Phone error logged for ${statusModalLead.businessName}.`, 'error');
        break;
      case 'EmailError':
        markLeadError(statusModalLead.id, 'EmailBounced', modalCustomNote || 'Mailbox unavailable / Email bounce');
        onShowToast('Error Logged', `Email error logged for ${statusModalLead.businessName}.`, 'error');
        break;
      case 'Replied':
        markLeadReply(statusModalLead.id, modalReplyType, modalCustomNote || 'Client responded positively to pitch');
        onShowToast('Reply Recorded', `Client reply recorded for ${statusModalLead.businessName}!`, 'success');
        break;
      case 'Pending':
        resetLeadStatus(statusModalLead.id);
        onShowToast('Status Reset', `Reset pipeline status to Pending for ${statusModalLead.businessName}.`, 'info');
        break;
    }

    setStatusModalLead(null);
  };

  // Edit contact info modal
  const handleOpenEditContact = (lead: Lead) => {
    setEditContactLead(lead);
    setEditPhone(lead.phoneNumber || '');
    setEditWhatsApp(lead.whatsAppNumber || '');
    setEditEmail(lead.email || '');
  };

  const handleSaveEditContact = () => {
    if (!editContactLead) return;
    updateLead(editContactLead.id, {
      phoneNumber: editPhone.trim() || null,
      whatsAppNumber: editWhatsApp.trim() || null,
      email: editEmail.trim() || null,
      outreachStatus: 'Pending', // reset so user can retry pitch immediately
      errorMessage: null,
      errorType: undefined,
    });
    onShowToast('Contact Updated', `Updated contact details for ${editContactLead.businessName}. Ready for retry!`, 'success');
    setEditContactLead(null);
  };

  // Count of pending leads in scanned tab
  const pendingScannedCount = useMemo(() => {
    return scannedClients.filter((l) => !l.outreachStatus || l.outreachStatus === 'Pending').length;
  }, [scannedClients]);

  const handleBatchDispatchPending = async () => {
    const toDispatch = scannedClients.filter(
      (l) => (!l.outreachStatus || l.outreachStatus === 'Pending') && l.email && isRealDeliverableEmail(l.email)
    );
    if (toDispatch.length === 0) {
      onShowToast('No Verified Pending Emails', 'Pending scanned leads with deliverable business emails were not found.', 'info');
      return;
    }

    let token = await getAccessToken();
    if (!token) {
      try {
        const res = await googleSignIn();
        token = res?.accessToken || null;
      } catch (err: any) {
        onShowToast('Gmail OAuth Required', err?.message || 'Please connect Gmail first.', 'error');
        return;
      }
    }
    if (!token) return;

    const confirmed = window.confirm(
      `Send real Gmail emails to ${toDispatch.length} pending scanned business(es) via your connected Gmail account?`
    );
    if (!confirmed) return;

    let sent = 0;
    let failed = 0;
    for (const l of toDispatch) {
      const pitch = getMaxedLogicPitch(l);
      const res = await sendEmailViaGmailApi(
        l.email!.trim(),
        MAXEDLOGIC_SENDER.senderEmail,
        pitch.emailSubject,
        pitch.emailBody
      );
      if (res.success) {
        sent += 1;
        markLeadPitched(l.id, 'Email', {
          subject: pitch.emailSubject,
          message: pitch.emailBody,
          app: 'Gmail API',
          recipient: l.email!.trim(),
        });
      } else {
        failed += 1;
        markLeadError(l.id, 'EmailBounced', res.error || 'Gmail batch dispatch failed');
        if (res.needsAuth) break;
      }
      await new Promise((r) => setTimeout(r, 200));
    }

    onShowToast(
      sent > 0 ? 'Real Batch Gmail Sent' : 'Batch Gmail Failed',
      `Sent: ${sent} • Failed: ${failed} via Gmail OAuth API.`,
      sent > 0 && failed === 0 ? 'success' : failed > 0 && sent === 0 ? 'error' : 'info'
    );
  };

  // Helper for Status Badge
  const renderStatusBadge = (lead: Lead) => {
    const status = lead.outreachStatus || 'Pending';
    switch (status) {
      case 'WhatsAppSent':
        return (
          <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontWeight: 700 }}>
            <MessageSquare size={12} /> WhatsApp Pitched
          </span>
        );
      case 'EmailSent':
        return (
          <span className="badge badge-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontWeight: 700 }}>
            <Mail size={12} /> Gmail Pitched
          </span>
        );
      case 'BothSent':
        return (
          <span className="badge" style={{ backgroundColor: '#8b5cf6', color: '#fff', display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontWeight: 700 }}>
            <Sparkles size={12} /> WhatsApp + Gmail
          </span>
        );
      case 'PhoneError':
        return (
          <span className="badge badge-danger" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontWeight: 700 }}>
            <AlertTriangle size={12} /> Phone/WA Error
          </span>
        );
      case 'EmailError':
        return (
          <span className="badge badge-danger" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontWeight: 700 }}>
            <AlertCircle size={12} /> Gmail Error
          </span>
        );
      case 'Replied':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
            <span className="badge badge-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontWeight: 700, width: 'fit-content' }}>
              <CheckCircle2 size={12} /> Replied ({lead.replyType || 'Interested'})
            </span>
            {lead.approvedWebsiteCreate && (
              <span className="badge" style={{ background: '#dcfce7', color: '#166534', fontSize: '0.67rem', fontWeight: 700, width: 'fit-content' }}>
                Website Create Approved
              </span>
            )}
            {lead.requestedWebsiteUpdate && (
              <span className="badge" style={{ background: '#dbeafe', color: '#1d4ed8', fontSize: '0.67rem', fontWeight: 700, width: 'fit-content' }}>
                Website Update Requested
              </span>
            )}
            {lead.replyExtractedPhone && (
              <span className="badge" style={{ background: '#fef3c7', color: '#92400e', fontSize: '0.67rem', fontWeight: 700, width: 'fit-content' }}>
                Email Phone: {lead.replyExtractedPhone}
              </span>
            )}
          </div>
        );
      default:
        return (
          <span className="badge" style={{ backgroundColor: 'var(--bg-muted)', color: 'var(--text-muted)', border: '1px solid var(--border-color)', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
            <Clock size={12} /> New Scanned
          </span>
        );
    }
  };

  return (
    <div className="page-content">
      {/* Top Header */}
      <div className="page-header" style={{ marginBottom: '1.25rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
            <h2 className="page-title" style={{ margin: 0 }}>
              Admin Panel: Scanner & Pitch Pipeline
            </h2>
            <span className="badge badge-primary" style={{ fontWeight: 700, fontSize: '0.75rem' }}>
              ADMIN CONTROL HUB
            </span>
          </div>
          <p className="page-subtitle" style={{ marginTop: '0.35rem' }}>
            स्कैनर से आए क्लाइंट्स, व्हाट्सएप व जीमेल पर हुई पिचों, नंबर/जीमेल एरर्स और रिप्लाई की रीयल-टाइम मॉनिटरिंग
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {onNavigateToScanner && (
            <button className="btn btn-primary" onClick={onNavigateToScanner} style={{ background: '#10b981', borderColor: '#10b981' }}>
              <Sparkles size={16} />
              <span>Launch Google Scanner</span>
            </button>
          )}
          <button className="btn btn-outline" onClick={() => exportLeadsCSV(filteredList)} title="Export active table to CSV">
            <Download size={15} />
            <span>CSV Export</span>
          </button>
          <button className="btn btn-outline" onClick={() => exportLeadsJSON(filteredList)} title="Export active table to JSON">
            <Download size={15} />
            <span>JSON</span>
          </button>
        </div>
      </div>

      {/* Admin Credentials & Official Sender Information Banner */}
      <div
        style={{
          background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.08) 0%, rgba(16, 185, 129, 0.08) 100%)',
          border: '1.5px solid #6366f1',
          borderRadius: 'var(--radius-lg)',
          padding: '1.15rem 1.35rem',
          marginBottom: '1.5rem',
          boxShadow: '0 4px 14px rgba(99, 102, 241, 0.12)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1.25rem' }}>
          {/* Left: Admin Access */}
          <div style={{ flex: '1 1 min(100%, 300px)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontWeight: 800, color: '#6366f1', fontSize: '0.95rem' }}>
              <ShieldCheck size={18} />
              <span>Admin Panel Login ID & Shortcut Key (एडमिन पैनल जानकारी)</span>
            </div>
            <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.82rem' }}>
              <div>
                <strong style={{ color: 'var(--text-muted)' }}>Admin Profile Email:</strong>{' '}
                <code style={{ background: 'var(--bg-surface)', padding: '2px 7px', borderRadius: '4px', fontWeight: 700, border: '1px solid var(--border-color)', color: '#6366f1' }}>
                  aabdulhafiz073@gmail.com
                </code>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.2rem' }}>
                <strong style={{ color: 'var(--text-muted)' }}>Admin Panel Open Shortcut:</strong>{' '}
                <kbd style={{ background: '#1e293b', color: '#f8fafc', padding: '3px 8px', borderRadius: '4px', fontWeight: 800, fontSize: '0.75rem' }}>
                  Alt + A
                </kbd>{' '}
                या{' '}
                <kbd style={{ background: '#1e293b', color: '#f8fafc', padding: '3px 8px', borderRadius: '4px', fontWeight: 800, fontSize: '0.75rem' }}>
                  Ctrl + Shift + A
                </kbd>
              </div>
            </div>
          </div>

          {/* Right: Sender Config */}
          <div style={{ flex: '1 1 min(100%, 300px)', borderLeft: '2px solid rgba(99, 102, 241, 0.2)', paddingLeft: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontWeight: 800, color: '#10b981', fontSize: '0.95rem' }}>
              <Send size={16} />
              <span>MaxedLogic Official Sender (संदेश भेजने वाली आईडी व नंबर)</span>
            </div>
            <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.82rem' }}>
              <div>
                <strong style={{ color: 'var(--text-muted)' }}>Company Name:</strong>{' '}
                <strong style={{ color: 'var(--text-main)' }}>MaxedLogic</strong> (<a href="https://maxedlogic.com" target="_blank" rel="noreferrer" style={{ color: '#6366f1', textDecoration: 'none', fontWeight: 700 }}>maxedlogic.com</a>)
              </div>
              <div>
                <strong style={{ color: 'var(--text-muted)' }}>Sender WhatsApp Number:</strong>{' '}
                <strong style={{ color: '#10b981' }}>+91 97597 25212 (9759725212)</strong>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
                <div>
                  <strong style={{ color: 'var(--text-muted)' }}>Sender Gmail:</strong>{' '}
                  <strong style={{ color: '#2563eb' }}>aabdulhafiz073@gmail.com</strong>
                </div>
                <GoogleConnectButton compact />
                <WhatsAppConnectButton compact />
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={handleSyncGmailInbox}
                  disabled={isSyncingInbox}
                  style={{
                    background: '#06b6d4',
                    color: '#fff',
                    fontWeight: 700,
                    padding: '0.28rem 0.65rem',
                    borderRadius: '6px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    fontSize: '0.75rem',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                  title="Google Workspace Gmail API से इनबॉक्स में नए रिप्लाई चेक करें"
                >
                  <RotateCcw size={12} className={isSyncingInbox ? 'animate-spin' : ''} />
                  <span>{isSyncingInbox ? 'सिंक हो रहा है...' : '🔄 Sync Inbox Live'}</span>
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => {
                    resetToVerifiedRealLeads();
                    onShowToast(
                      '100% Real Active Inboxes Loaded! 🛡️',
                      'सभी पुराने कैश्ड रिकॉर्ड साफ करके 100% वेरिफाइड व एक्टिव ईमेल लोड कर दिए गए हैं (Address not found एरर 0%)।',
                      'success'
                    );
                  }}
                  style={{
                    background: '#10b981',
                    color: '#fff',
                    fontWeight: 700,
                    padding: '0.28rem 0.65rem',
                    borderRadius: '6px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    fontSize: '0.75rem',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                  title="Purge old cache and load 100% active, MX-verified real corporate inboxes"
                >
                  <CheckCircle2 size={12} />
                  <span>⚡ 100% रियल ईमेल रीलोड</span>
                </button>
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                ✓ <strong>नियम:</strong> जिन्हें नई वेबसाइट चाहिए उन्हें 'New Website Creation' और जिनकी पुरानी है उन्हें 'Website Update/Redesign' का मैसेज भेजा जाता है।
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 6 MAIN SWITCHER BUTTONS / METRIC CARDS */}
      <div className="admin-metric-grid">
        {/* Button 1: Scanned Clients Table */}
        <button
          onClick={() => setActiveTab('scanned')}
          className="stat-card"
          style={{
            textAlign: 'left',
            cursor: 'pointer',
            padding: '1.1rem',
            borderRadius: 'var(--radius-lg)',
            transition: 'all 0.2s ease',
            border: activeTab === 'scanned' ? '2px solid #6366f1' : '1px solid var(--border-color)',
            background: activeTab === 'scanned' ? 'rgba(99, 102, 241, 0.08)' : 'var(--bg-surface)',
            boxShadow: activeTab === 'scanned' ? '0 4px 14px rgba(99, 102, 241, 0.25)' : 'var(--shadow-sm)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              1. Scanner Clients
            </span>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: '8px',
                background: '#6366f1',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Sparkles size={16} />
            </div>
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-main)', lineHeight: 1 }}>
            {scannedClients.length}
          </div>
          <p style={{ margin: '0.4rem 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            स्कैनर से आए सारे क्लाइंट्स की टेबल
          </p>
          {activeTab === 'scanned' && (
            <div style={{ marginTop: '0.5rem', fontSize: '0.7rem', fontWeight: 700, color: '#6366f1', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <Check size={12} /> Active Table Viewing
            </div>
          )}
        </button>

        {/* Button 2: Total Pitched Leads */}
        <button
          onClick={() => setActiveTab('pitched')}
          className="stat-card"
          style={{
            textAlign: 'left',
            cursor: 'pointer',
            padding: '1.1rem',
            borderRadius: 'var(--radius-lg)',
            transition: 'all 0.2s ease',
            border: activeTab === 'pitched' ? '2px solid #8b5cf6' : '1px solid var(--border-color)',
            background: activeTab === 'pitched' ? 'rgba(139, 92, 246, 0.08)' : 'var(--bg-surface)',
            boxShadow: activeTab === 'pitched' ? '0 4px 14px rgba(139, 92, 246, 0.25)' : 'var(--shadow-sm)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#8b5cf6', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              2. Total Pitched
            </span>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: '8px',
                background: '#8b5cf6',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Send size={16} />
            </div>
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-main)', lineHeight: 1 }}>
            {totalPitchedLeads.length}
          </div>
          <p style={{ margin: '0.4rem 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            कुल कितने क्लाइंट्स को पिच किया
          </p>
          {activeTab === 'pitched' && (
            <div style={{ marginTop: '0.5rem', fontSize: '0.7rem', fontWeight: 700, color: '#8b5cf6', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <Check size={12} /> Active Table Viewing
            </div>
          )}
        </button>

        {/* Button 3: WhatsApp Pitched Leads */}
        <button
          onClick={() => setActiveTab('whatsapp')}
          className="stat-card"
          style={{
            textAlign: 'left',
            cursor: 'pointer',
            padding: '1.1rem',
            borderRadius: 'var(--radius-lg)',
            transition: 'all 0.2s ease',
            border: activeTab === 'whatsapp' ? '2px solid #10b981' : '1px solid var(--border-color)',
            background: activeTab === 'whatsapp' ? 'rgba(16, 185, 129, 0.08)' : 'var(--bg-surface)',
            boxShadow: activeTab === 'whatsapp' ? '0 4px 14px rgba(16, 185, 129, 0.25)' : 'var(--shadow-sm)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              3. WhatsApp Pitched
            </span>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: '8px',
                background: '#10b981',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <MessageSquare size={16} />
            </div>
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#10b981', lineHeight: 1 }}>
            {whatsAppPitchedLeads.length}
          </div>
          <p style={{ margin: '0.4rem 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            व्हाट्सएप पर भेजी गई पिच लीड्स
          </p>
          {activeTab === 'whatsapp' && (
            <div style={{ marginTop: '0.5rem', fontSize: '0.7rem', fontWeight: 700, color: '#10b981', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <Check size={12} /> Active Table Viewing
            </div>
          )}
        </button>

        {/* Button 4: Gmail / Email Pitched Leads */}
        <button
          onClick={() => setActiveTab('gmail')}
          className="stat-card"
          style={{
            textAlign: 'left',
            cursor: 'pointer',
            padding: '1.1rem',
            borderRadius: 'var(--radius-lg)',
            transition: 'all 0.2s ease',
            border: activeTab === 'gmail' ? '2px solid #2563eb' : '1px solid var(--border-color)',
            background: activeTab === 'gmail' ? 'rgba(37, 99, 235, 0.08)' : 'var(--bg-surface)',
            boxShadow: activeTab === 'gmail' ? '0 4px 14px rgba(37, 99, 235, 0.25)' : 'var(--shadow-sm)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              4. Gmail Pitched
            </span>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: '8px',
                background: '#2563eb',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Mail size={16} />
            </div>
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#2563eb', lineHeight: 1 }}>
            {gmailPitchedLeads.length}
          </div>
          <p style={{ margin: '0.4rem 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            जीमेल / ईमेल पर भेजी गई पिच
          </p>
          {activeTab === 'gmail' && (
            <div style={{ marginTop: '0.5rem', fontSize: '0.7rem', fontWeight: 700, color: '#2563eb', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <Check size={12} /> Active Table Viewing
            </div>
          )}
        </button>

        {/* Button 5: Both Sent (WhatsApp + Gmail) */}
        <button
          onClick={() => setActiveTab('both')}
          className="stat-card"
          style={{
            textAlign: 'left',
            cursor: 'pointer',
            padding: '1.1rem',
            borderRadius: 'var(--radius-lg)',
            transition: 'all 0.2s ease',
            border: activeTab === 'both' ? '2px solid #8b5cf6' : '1px solid var(--border-color)',
            background: activeTab === 'both' ? 'rgba(139, 92, 246, 0.08)' : 'var(--bg-surface)',
            boxShadow: activeTab === 'both' ? '0 4px 14px rgba(139, 92, 246, 0.25)' : 'var(--shadow-sm)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#8b5cf6', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              5. Both Sent
            </span>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: '8px',
                background: '#8b5cf6',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Sparkles size={16} />
            </div>
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#8b5cf6', lineHeight: 1 }}>
            {bothPitchedLeads.length}
          </div>
          <p style={{ margin: '0.4rem 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            व्हाट्सएप + जीमेल दोनों पर भेजा
          </p>
          {activeTab === 'both' && (
            <div style={{ marginTop: '0.5rem', fontSize: '0.7rem', fontWeight: 700, color: '#8b5cf6', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <Check size={12} /> Active Table Viewing
            </div>
          )}
        </button>

        {/* Button 6: Errors (Number / Gmail) */}
        <button
          onClick={() => setActiveTab('errors')}
          className="stat-card"
          style={{
            textAlign: 'left',
            cursor: 'pointer',
            padding: '1.1rem',
            borderRadius: 'var(--radius-lg)',
            transition: 'all 0.2s ease',
            border: activeTab === 'errors' ? '2px solid #ef4444' : '1px solid var(--border-color)',
            background: activeTab === 'errors' ? 'rgba(239, 68, 68, 0.08)' : 'var(--bg-surface)',
            boxShadow: activeTab === 'errors' ? '0 4px 14px rgba(239, 68, 68, 0.25)' : 'var(--shadow-sm)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              6. Delivery Errors
            </span>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: '8px',
                background: '#ef4444',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <AlertTriangle size={16} />
            </div>
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#ef4444', lineHeight: 1 }}>
            {errorLeads.length}
          </div>
          <p style={{ margin: '0.4rem 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            नंबर या जीमेल पर एरर आया
          </p>
          {activeTab === 'errors' && (
            <div style={{ marginTop: '0.5rem', fontSize: '0.7rem', fontWeight: 700, color: '#ef4444', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <Check size={12} /> Active Table Viewing
            </div>
          )}
        </button>

        {/* Button 6: Replies Received */}
        <button
          onClick={() => setActiveTab('replies')}
          className="stat-card"
          style={{
            textAlign: 'left',
            cursor: 'pointer',
            padding: '1.1rem',
            borderRadius: 'var(--radius-lg)',
            transition: 'all 0.2s ease',
            border: activeTab === 'replies' ? '2px solid #f59e0b' : '1px solid var(--border-color)',
            background: activeTab === 'replies' ? 'rgba(245, 158, 11, 0.08)' : 'var(--bg-surface)',
            boxShadow: activeTab === 'replies' ? '0 4px 14px rgba(245, 158, 11, 0.25)' : 'var(--shadow-sm)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              7. Replies Received
            </span>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: '8px',
                background: '#f59e0b',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <CheckCircle2 size={16} />
            </div>
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#f59e0b', lineHeight: 1 }}>
            {replyLeads.length}
          </div>
          <p style={{ margin: '0.4rem 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            क्लाइंट्स के रिप्लाई व जवाब आए
          </p>
          {activeTab === 'replies' && (
            <div style={{ marginTop: '0.5rem', fontSize: '0.7rem', fontWeight: 700, color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <Check size={12} /> Active Table Viewing
            </div>
          )}
        </button>

        {/* Button 8: Gmail Reply (जीमेल रिप्लाई) */}
        <button
          onClick={() => setActiveTab('gmailReplies')}
          className="stat-card"
          style={{
            textAlign: 'left',
            cursor: 'pointer',
            padding: '1.1rem',
            borderRadius: 'var(--radius-lg)',
            transition: 'all 0.2s ease',
            border: activeTab === 'gmailReplies' ? '2px solid #06b6d4' : '1px solid var(--border-color)',
            background: activeTab === 'gmailReplies' ? 'rgba(6, 182, 212, 0.08)' : 'var(--bg-surface)',
            boxShadow: activeTab === 'gmailReplies' ? '0 4px 14px rgba(6, 182, 212, 0.25)' : 'var(--shadow-sm)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#06b6d4', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              8. Gmail Reply (जीमेल रिप्लाई)
            </span>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: '8px',
                background: '#06b6d4',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Mail size={16} />
            </div>
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#06b6d4', lineHeight: 1 }}>
            {gmailReplies.length}
          </div>
          <p style={{ margin: '0.4rem 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            क्लाइंट्स के आए ईमेल रिप्लाई व इनबॉक्स
          </p>
          {activeTab === 'gmailReplies' && (
            <div style={{ marginTop: '0.5rem', fontSize: '0.7rem', fontWeight: 700, color: '#06b6d4', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <Check size={12} /> Active Table Viewing
            </div>
          )}
        </button>
      </div>

      {/* CLIENT REPLY & SERVICE APPROVAL TRACKER (WHO REPLIED / APPROVED WEBSITE CREATE / REQUESTED UPDATE / SENT PHONE) */}
      <div
        className="card"
        style={{
          marginBottom: '1.1rem',
          padding: '0.95rem 1.25rem',
          borderLeft: '4px solid #06b6d4',
          background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.06) 0%, rgba(16, 185, 129, 0.04) 100%)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.75rem' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-main)' }}>
              Client Reply & Requirement Breakdown (Kisne Reply / Approve / Update / Phone Bheja)
            </h3>
            <p style={{ margin: '0.15rem 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Click any card below to filter and inspect exact clients, full locations, messages, and contact numbers sent on email.
            </p>
          </div>
          <button
            className="btn btn-sm btn-outline"
            onClick={handleSyncGmailInbox}
            disabled={isSyncingInbox}
            style={{ borderColor: '#06b6d4', color: '#0891b2', fontWeight: 700 }}
          >
            <RotateCcw size={13} className={isSyncingInbox ? 'animate-spin' : ''} />
            <span>{isSyncingInbox ? 'Syncing Inbox...' : 'Sync Gmail Inbox Now'}</span>
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
          <button
            onClick={() => {
              setActiveTab('gmailReplies');
              setReplyIntentFilter('all');
            }}
            className="card"
            style={{
              textAlign: 'left',
              cursor: 'pointer',
              padding: '0.75rem 0.9rem',
              border: activeTab === 'gmailReplies' && replyIntentFilter === 'all' ? '2px solid #06b6d4' : '1px solid var(--border-color)',
              background: 'var(--bg-surface)',
            }}
          >
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#0891b2', textTransform: 'uppercase' }}>
              1. Total Clients Replied
            </div>
            <div style={{ fontSize: '1.45rem', fontWeight: 800, color: 'var(--text-main)' }}>{replyStats.totalReplied}</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Kisne reply diya (All Gmail & Pipeline)</div>
          </button>

          <button
            onClick={() => {
              setActiveTab('gmailReplies');
              setReplyIntentFilter('interested');
            }}
            className="card"
            style={{
              textAlign: 'left',
              cursor: 'pointer',
              padding: '0.75rem 0.9rem',
              border: activeTab === 'gmailReplies' && replyIntentFilter === 'interested' ? '2px solid #10b981' : '1px solid var(--border-color)',
              background: 'var(--bg-surface)',
            }}
          >
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#059669', textTransform: 'uppercase' }}>
              2. 🟢 Interested / हाँ (Demo/Quote)
            </div>
            <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#059669' }}>{replyStats.interestedCount}</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Kaam karwana chahte hain / Demo maanga</div>
          </button>

          <button
            onClick={() => {
              setActiveTab('gmailReplies');
              setReplyIntentFilter('notInterested');
            }}
            className="card"
            style={{
              textAlign: 'left',
              cursor: 'pointer',
              padding: '0.75rem 0.9rem',
              border: activeTab === 'gmailReplies' && replyIntentFilter === 'notInterested' ? '2px solid #ef4444' : '1px solid var(--border-color)',
              background: 'var(--bg-surface)',
            }}
          >
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#dc2626', textTransform: 'uppercase' }}>
              3. 🔴 Not Interested / मना किया
            </div>
            <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#dc2626' }}>{replyStats.notInterestedCount}</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Abhi zaroorat nahi / Unsubscribe</div>
          </button>

          <button
            onClick={() => {
              setActiveTab('gmailReplies');
              setReplyIntentFilter('gmailInbox');
            }}
            className="card"
            style={{
              textAlign: 'left',
              cursor: 'pointer',
              padding: '0.75rem 0.9rem',
              border: activeTab === 'gmailReplies' && replyIntentFilter === 'gmailInbox' ? '2px solid #0284c7' : '1px solid var(--border-color)',
              background: 'var(--bg-surface)',
            }}
          >
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#0284c7', textTransform: 'uppercase' }}>
              4. 📧 Direct Gmail Inbox E-mails
            </div>
            <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#0284c7' }}>{replyStats.directGmailCount}</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Gmail inbox me aaye direct emails</div>
          </button>
        </div>
      </div>

      {/* FILTER & SEARCH BAR */}
      <div
        className="card"
        style={{
          marginBottom: '1rem',
          padding: '0.85rem 1.25rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.75rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, minWidth: '260px' }}>
          <div style={{ position: 'relative', width: '100%', maxWidth: '380px' }}>
            <Search
              size={16}
              style={{
                position: 'absolute',
                left: '10px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted)',
              }}
            />
            <input
              type="text"
              className="form-input"
              style={{ paddingLeft: '2.2rem', width: '100%' }}
              placeholder="Search business, city, phone, email, notes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <select
            className="form-select"
            value={selectedCountry}
            onChange={(e) => setSelectedCountry(e.target.value)}
            style={{ width: 'auto', minWidth: '130px' }}
          >
            <option value="all">🌍 All Countries</option>
            {countries.map((c) => (
              <option key={c.id} value={c.name}>
                {c.flag} {c.name}
              </option>
            ))}
          </select>

          <select
            className="form-select"
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            style={{ width: 'auto', minWidth: '130px' }}
          >
            <option value="all">📂 All Categories</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.825rem', color: 'var(--text-muted)', fontWeight: 600 }}>
            Showing <strong>{filteredList.length}</strong> records
          </span>
          <div className="btn-group" style={{ display: 'flex', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
            <button
              onClick={() => setViewMode('table')}
              className={`btn btn-sm ${viewMode === 'table' ? 'btn-primary' : 'btn-ghost'}`}
              style={{ borderRadius: 0, padding: '0.35rem 0.65rem' }}
            >
              Table View
            </button>
            <button
              onClick={() => setViewMode('cards')}
              className={`btn btn-sm ${viewMode === 'cards' ? 'btn-primary' : 'btn-ghost'}`}
              style={{ borderRadius: 0, padding: '0.35rem 0.65rem' }}
            >
              Mobile Cards
            </button>
          </div>
        </div>
      </div>

      {/* TABLE TITLE & ACTIONS BANNER */}
      <div
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-color)',
          borderBottom: 'none',
          borderTopLeftRadius: 'var(--radius-lg)',
          borderTopRightRadius: 'var(--radius-lg)',
          padding: '0.85rem 1.25rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.5rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              background:
                activeTab === 'scanned'
                  ? '#6366f1'
                  : activeTab === 'pitched'
                  ? '#8b5cf6'
                  : activeTab === 'whatsapp'
                  ? '#10b981'
                  : activeTab === 'gmail'
                  ? '#2563eb'
                  : activeTab === 'errors'
                  ? '#ef4444'
                  : '#f59e0b',
            }}
          />
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800 }}>
            {activeTab === 'scanned' && '1. Scanner Clients Table (गूगल से आए सारे बिज़नेस)'}
            {activeTab === 'pitched' && '2. Total Pitched Report (सभी भेजे गए मैसेज)'}
            {activeTab === 'whatsapp' && '3. WhatsApp Dispatched Report (व्हाट्सएप रिपोर्ट)'}
            {activeTab === 'gmail' && '4. Gmail API Dispatched Report (जीमेल रिपोर्ट)'}
            {activeTab === 'both' && '5. Both Channels Report (व्हाट्सएप + जीमेल दोनों पर)'}
            {activeTab === 'errors' && '6. Delivery Errors Report (एरर रिपोर्ट)'}
            {activeTab === 'replies' && '7. Client Replies Received Table (क्लाइंट्स के रिप्लाई व जवाब)'}
            {activeTab === 'gmailReplies' && '8. Gmail Replies Inbox (क्लाइंट्स के आए ईमेल रिप्लाई ट्रैकर)'}
          </h3>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          {activeTab === 'gmailReplies' && (
            <>
              <button
                className="btn btn-sm btn-outline"
                onClick={() => {
                  refreshLeadsFromDb();
                  onShowToast('Refreshed', 'Loaded latest client chatbot & Gmail replies.', 'info');
                }}
                style={{ borderColor: '#10b981', color: '#059669', fontWeight: 700 }}
                title="Load latest WhatsApp Bot (9759725212) & Client Link selections"
              >
                <RotateCcw size={13} />
                <span>Refresh Bot Replies</span>
              </button>
              <button
                className="btn btn-sm btn-primary"
                onClick={() => setIsAddReplyModalOpen(true)}
                style={{ background: '#06b6d4', borderColor: '#06b6d4', fontWeight: 700 }}
              >
                <Mail size={13} />
                <span>+ नया जीमेल रिप्लाई जोड़ें</span>
              </button>
              <button
                className="btn btn-sm btn-outline"
                onClick={handleSyncGmailInbox}
                disabled={isSyncingInbox}
                style={{ borderColor: '#06b6d4', color: '#06b6d4', fontWeight: 700 }}
                title="Google Workspace Gmail API se live inbound replies fetch karein"
              >
                <RotateCcw size={13} className={isSyncingInbox ? 'animate-spin' : ''} />
                <span>{isSyncingInbox ? '🔄 सिंक हो रहा है...' : '🔄 Sync Inbox Live'}</span>
              </button>
            </>
          )}

          <button
            className="btn btn-sm btn-outline"
            onClick={() => exportLeadsCSV(filteredList)}
            style={{ fontWeight: 700, borderColor: '#6366f1', color: '#6366f1' }}
            title="Download Complete Dispatch Report as CSV"
          >
            <Download size={13} />
            <span>📥 Download Report CSV ({filteredList.length})</span>
          </button>

          <button
            className="btn btn-sm btn-primary"
            onClick={() => setIsWhatsAppBulkOpen(true)}
            style={{ background: '#16a34a', borderColor: '#16a34a', fontWeight: 700 }}
            title="1-Click Send Interactive 4-Step Chatbot to all available phone numbers via connected WhatsApp"
          >
            <Send size={13} />
            <span>🚀 1-Click Send WhatsApp All ({filteredList.filter(l => hasAvailableWhatsAppNumber(l)).length})</span>
          </button>

          <button
            className="btn btn-sm btn-outline"
            onClick={() => setIsWhatsAppQueueOpen(true)}
            style={{ fontWeight: 700, borderColor: '#10b981', color: '#059669', background: '#ecfdf5' }}
            title="Open Sequential Auto WhatsApp Queue for leads"
          >
            <MessageSquare size={13} />
            <span>💬 Auto WhatsApp Queue ({filteredList.filter(l => Boolean(l.phoneNumber || l.whatsAppNumber)).length})</span>
          </button>

          {activeTab === 'scanned' && pendingScannedCount > 0 && (
            <button
              className="btn btn-sm btn-primary"
              onClick={handleBatchDispatchPending}
              style={{ background: '#10b981', borderColor: '#10b981', fontWeight: 700 }}
              title="Dispatch MaxedLogic Pitches to All Pending Scanned Clients"
            >
              <Send size={13} />
              <span>🚀 1-Click Dispatch Pitches ({pendingScannedCount} Pending)</span>
            </button>
          )}
        </div>
      </div>

      {/* ACTIVE TABLE / CARDS CONTENT */}
      {activeTab === 'gmailReplies' ? (
        /* DEDICATED GMAIL REPLIES TABLE */
        <div
          className="table-container"
          style={{
            borderTopLeftRadius: 0,
            borderTopRightRadius: 0,
            marginBottom: '1.5rem',
            overflowX: 'auto',
          }}
        >
          <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', padding: '0.65rem 1rem', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-muted)' }}>
            {[
              { key: 'all', label: `📋 All Feed (${replyStats.totalReplied})` },
              { key: 'interested', label: `🟢 Interested / इच्छुक (${replyStats.interestedCount})` },
              { key: 'notInterested', label: `🔴 Not Interested / मना किया (${replyStats.notInterestedCount})` },
              { key: 'gmailInbox', label: `📧 Direct Gmail Inbox (${replyStats.directGmailCount})` },
              { key: 'chatbot', label: `🤖 Chatbot & WhatsApp (${replyStats.chatbotCount})` },
            ].map((pill) => (
              <button
                key={pill.key}
                className={`btn btn-sm ${replyIntentFilter === pill.key ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setReplyIntentFilter(pill.key as any)}
                style={{
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  ...(replyIntentFilter === pill.key
                    ? pill.key === 'interested'
                      ? { background: '#10b981', borderColor: '#10b981', color: '#fff' }
                      : pill.key === 'notInterested'
                      ? { background: '#ef4444', borderColor: '#ef4444', color: '#fff' }
                      : pill.key === 'gmailInbox'
                      ? { background: '#0284c7', borderColor: '#0284c7', color: '#fff' }
                      : pill.key === 'chatbot'
                      ? { background: '#8b5cf6', borderColor: '#8b5cf6', color: '#fff' }
                      : {}
                    : {}),
                }}
              >
                {pill.label}
              </button>
            ))}
          </div>

          <table className="data-table" style={{ width: '100%', minWidth: '1120px' }}>
            <thead>
              <tr>
                <th style={{ minWidth: '190px' }}>Client / Business Name</th>
                <th style={{ minWidth: '190px' }}>Location & Maps</th>
                <th style={{ minWidth: '200px' }}>Client Gmail & Phone Shared on Email</th>
                <th style={{ minWidth: '185px' }}>Approval / Request Type</th>
                <th style={{ minWidth: '260px' }}>Client Reply Message</th>
                <th style={{ minWidth: '125px' }}>Received At</th>
                <th style={{ textAlign: 'right', minWidth: '165px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredGmailReplies.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '3.5rem 1rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.6rem', color: 'var(--text-muted)' }}>
                      <Mail size={36} style={{ color: '#06b6d4' }} />
                      <p style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-main)', margin: 0 }}>
                        No replies match this filter yet
                      </p>
                      <p style={{ fontSize: '0.85rem', margin: 0 }}>
                        Click <strong>Sync Gmail Inbox Now</strong> to fetch live client replies or log a reply manually.
                      </p>
                      <button
                        className="btn btn-sm btn-primary"
                        onClick={() => setIsAddReplyModalOpen(true)}
                        style={{ marginTop: '0.5rem', background: '#06b6d4', borderColor: '#06b6d4' }}
                      >
                        + Add Gmail Reply Manually
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredGmailReplies.map((r) => {
                  const isYes = r.replyType.includes('YES') || r.wantsWebsiteCreate;
                  const isDemo = r.replyType.includes('Demo');
                  const isWon = r.replyType.includes('Won');
                  const isNo = r.replyType.includes('NO');
                  const badgeBg = isYes ? '#10b981' : r.wantsWebsiteUpdate ? '#2563eb' : isDemo ? '#2563eb' : isWon ? '#8b5cf6' : isNo ? '#ef4444' : '#f59e0b';
                  const matchedLead = leads.find(
                    (l) => l.id === r.leadId || (l.email || '').toLowerCase().trim() === r.clientEmail.toLowerCase().trim()
                  );
                  const fullLocationText =
                    r.location ||
                    (matchedLead
                      ? [matchedLead.address, matchedLead.city, matchedLead.state, matchedLead.countryName]
                          .filter(Boolean)
                          .join(', ')
                      : '');
                  const mapsUrl =
                    r.googleMapsUrl ||
                    matchedLead?.googleMapsUrl ||
                    (fullLocationText
                      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${r.businessName} ${fullLocationText}`)}`
                      : '');
                  const bestPhone = r.extractedPhone || r.clientPhone || matchedLead?.ownerPhone || matchedLead?.phoneNumber;

                  return (
                    <tr key={r.id}>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontWeight: 800, color: 'var(--text-main)', fontSize: '0.9rem' }}>
                            {r.businessName}
                          </span>
                          <span style={{ fontSize: '0.73rem', color: 'var(--text-muted)' }}>
                            Subject: {r.subject}
                          </span>
                        </div>
                      </td>

                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', fontSize: '0.78rem' }}>
                          {fullLocationText ? (
                            <span>{fullLocationText}</span>
                          ) : (
                            <span style={{ color: 'var(--text-muted)' }}>Location matched via Gmail</span>
                          )}
                          {mapsUrl && (
                            <a
                              href={mapsUrl}
                              target="_blank"
                              rel="noreferrer"
                              style={{ color: '#dc2626', fontWeight: 700, fontSize: '0.71rem', display: 'inline-flex', alignItems: 'center', gap: '0.2rem', textDecoration: 'none' }}
                            >
                              <MapPin size={11} /> Google Maps
                            </a>
                          )}
                        </div>
                      </td>

                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                          <a
                            href={`mailto:${r.clientEmail}`}
                            style={{ color: '#2563eb', fontWeight: 700, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.82rem' }}
                          >
                            <Mail size={13} />
                            {r.clientEmail}
                          </a>
                          {r.extractedPhone && (
                            <span
                              className="badge"
                              style={{
                                background: '#fef3c7',
                                color: '#92400e',
                                border: '1px solid #fcd34d',
                                fontSize: '0.72rem',
                                fontWeight: 800,
                                width: 'fit-content',
                              }}
                            >
                              Sent on Email: {r.extractedPhone}
                            </span>
                          )}
                          {!r.extractedPhone && bestPhone && (
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.74rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                              <Phone size={11} /> {bestPhone}
                            </span>
                          )}
                        </div>
                      </td>

                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                          <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', alignItems: 'center' }}>
                            <span
                              className="badge"
                              style={{
                                background: badgeBg,
                                color: '#fff',
                                fontWeight: 800,
                                fontSize: '0.72rem',
                                padding: '3px 8px',
                                width: 'fit-content',
                              }}
                            >
                              {r.replyType}
                            </span>
                            <span
                              className="badge"
                              style={{
                                background:
                                  r.id.startsWith('imap_') || r.channelSource === 'Direct Gmail Inbox'
                                    ? '#0284c7'
                                    : r.serviceMode || r.channelSource?.includes('Chatbot')
                                    ? '#8b5cf6'
                                    : '#10b981',
                                color: '#fff',
                                fontSize: '0.68rem',
                                fontWeight: 700,
                                padding: '2px 6px',
                              }}
                            >
                              {r.id.startsWith('imap_') || r.channelSource === 'Direct Gmail Inbox'
                                ? '📧 Direct Gmail'
                                : r.serviceMode || r.channelSource?.includes('Chatbot')
                                ? '🤖 Chatbot'
                                : '✅ Email Option'}
                            </span>
                          </div>
                          {(r.serviceMode || r.selectedCategory || r.selectedSubType || r.finalDecision) ? (
                            <div
                              style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '0.18rem',
                                fontSize: '0.72rem',
                                background: 'rgba(16, 185, 129, 0.08)',
                                border: '1px solid rgba(16, 185, 129, 0.25)',
                                borderRadius: '6px',
                                padding: '0.35rem 0.5rem',
                              }}
                            >
                              {r.serviceMode && (
                                <div>
                                  <strong>Mode:</strong> {r.serviceMode}
                                </div>
                              )}
                              {r.selectedCategory && (
                                <div>
                                  <strong>Category:</strong> {r.selectedCategory}
                                </div>
                              )}
                              {r.selectedSubType && (
                                <div>
                                  <strong>Type:</strong> {r.selectedSubType}
                                </div>
                              )}
                              {r.finalDecision && (
                                <div>
                                  <strong>Final:</strong>{' '}
                                  <span style={{ fontWeight: 800, color: r.finalDecision === 'YES' ? '#059669' : '#dc2626' }}>
                                    {r.finalDecision}
                                  </span>
                                </div>
                              )}
                              {r.channelSource && (
                                <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)' }}>
                                  Via: {r.channelSource}
                                </div>
                              )}
                            </div>
                          ) : (
                            <>
                              {r.wantsWebsiteCreate && (
                                <span className="badge" style={{ background: '#dcfce7', color: '#166534', fontSize: '0.68rem', fontWeight: 700, width: 'fit-content' }}>
                                  Approved Website Create
                                </span>
                              )}
                              {r.wantsWebsiteUpdate && (
                                <span className="badge" style={{ background: '#dbeafe', color: '#1e40af', fontSize: '0.68rem', fontWeight: 700, width: 'fit-content' }}>
                                  Requested Website Update
                                </span>
                              )}
                            </>
                          )}
                        </div>
                      </td>

                      <td>
                        <div
                          onClick={() => setViewingReplyRecord(r)}
                          style={{
                            cursor: 'pointer',
                            fontSize: '0.8rem',
                            color: 'var(--text-main)',
                            lineHeight: 1.4,
                            background: 'rgba(6, 182, 212, 0.05)',
                            padding: '0.5rem 0.7rem',
                            borderRadius: 'var(--radius-sm)',
                            border: '1px solid rgba(6, 182, 212, 0.3)',
                          }}
                          title="Click to inspect Sent Proposal vs Client Reply"
                        >
                          <div style={{ color: 'var(--text-main)', fontStyle: 'italic' }}>
                            "{r.replySnippet}"
                          </div>
                          <div style={{ color: '#0891b2', fontWeight: 700, fontSize: '0.7rem', marginTop: '0.25rem' }}>
                            Inspect Thread &rarr;
                          </div>
                        </div>
                      </td>

                      <td>
                        <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-main)' }}>
                          {new Date(r.receivedAt).toLocaleDateString()}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                          {new Date(r.receivedAt).toLocaleTimeString()}
                        </div>
                      </td>

                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.35rem' }}>
                          <a
                            href={r.threadUrl || `https://mail.google.com/mail/u/0/#search/from%3A${encodeURIComponent(r.clientEmail)}`}
                            target="_blank"
                            rel="noreferrer"
                            className="btn btn-sm btn-outline"
                            style={{ borderColor: '#2563eb', color: '#2563eb', padding: '0.3rem 0.55rem', fontSize: '0.74rem', textDecoration: 'none' }}
                          >
                            <Mail size={12} /> Gmail
                          </a>

                          {bestPhone && (
                            <a
                              href={`https://api.whatsapp.com/send?phone=${bestPhone.replace(/\D/g, '').length === 10 ? '91' + bestPhone.replace(/\D/g, '') : bestPhone.replace(/\D/g, '')}&text=${encodeURIComponent(`Hello ${r.businessName}, thank you for your email reply to MaxedLogic!`)}`}
                              target="_blank"
                              rel="noreferrer"
                              className="btn btn-sm btn-outline"
                              style={{ borderColor: '#10b981', color: '#10b981', padding: '0.3rem 0.55rem', fontSize: '0.74rem', textDecoration: 'none' }}
                            >
                              <MessageSquare size={12} /> WA
                            </a>
                          )}

                          <button
                            onClick={() => {
                              deleteGmailReply(r.id);
                              onShowToast('Reply Deleted', 'Gmail reply removed from Admin Panel.', 'info');
                            }}
                            className="btn btn-sm btn-ghost"
                            style={{ color: '#ef4444', padding: '0.3rem 0.45rem' }}
                            title="Delete this reply record"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      ) : viewMode === 'table' ? (
        <div
          className="table-container"
          style={{
            borderTopLeftRadius: 0,
            borderTopRightRadius: 0,
            marginBottom: '1.5rem',
            overflowX: 'auto',
          }}
        >
          <table className="data-table" style={{ width: '100%', minWidth: '980px' }}>
            <thead>
              <tr>
                <th style={{ minWidth: '190px' }}>Client / Business Name</th>
                <th style={{ minWidth: '160px', background: 'rgba(99, 102, 241, 0.05)' }}>
                  App Used (किस ऐप पर गया)
                </th>
                <th style={{ minWidth: '180px' }}>Recipient Contact (नंबर / ईमेल)</th>
                <th style={{ minWidth: '160px' }}>Dispatch Time & Pitch</th>
                <th>Category & Need</th>
                <th>Location & Maps</th>
                <th>Status</th>
                <th style={{ textAlign: 'right', minWidth: '160px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredList.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ textAlign: 'center', padding: '3rem 1rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)' }}>
                      <AlertCircle size={32} />
                      <p style={{ fontWeight: 600, fontSize: '0.95rem' }}>No clients found in this category.</p>
                      <p style={{ fontSize: '0.8rem' }}>
                        {activeTab === 'scanned' && 'Launch Google Scanner to discover live businesses from anywhere in the world!'}
                        {activeTab === 'pitched' && 'Select leads from scanner or directory to launch cold outreach.'}
                        {activeTab === 'whatsapp' && 'Send cold WhatsApp pitches to clients to populate this view.'}
                        {activeTab === 'gmail' && 'Send cold Gmail pitches to populate this view.'}
                        {activeTab === 'errors' && 'Great news! No delivery or number errors recorded.'}
                        {activeTab === 'replies' && 'No replies recorded yet. Once clients reply, they will appear here!'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredList.map((lead, idx) => {
                  const googleMapsUrl =
                    lead.googleMapsUrl ||
                    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                      lead.businessName + ' ' + (lead.address || '') + ' ' + lead.city
                    )}`;
                  const cleanPhone = lead.phoneNumber ? lead.phoneNumber.replace(/[^0-9]/g, '') : '';
                  const waNumber = lead.whatsAppNumber || lead.phoneNumber;

                  return (
                    <tr key={`pipeline-lead-${lead.id}-${idx}`}>
                      {/* Business Name */}
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontWeight: 700, color: 'var(--text-main)', fontSize: '0.9rem' }}>
                            {lead.businessName}
                          </span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            Contact: {lead.contactPerson || 'Proprietor'}
                          </span>
                          {lead.websiteUrl ? (
                            <a
                              href={lead.websiteUrl}
                              target="_blank"
                              rel="noreferrer"
                              style={{ fontSize: '0.7rem', color: 'var(--primary)', display: 'inline-flex', alignItems: 'center', gap: '0.2rem', marginTop: '0.15rem' }}
                            >
                              <ExternalLink size={10} /> Visit Website
                            </a>
                          ) : (
                            <span style={{ fontSize: '0.7rem', color: '#ef4444', fontWeight: 600 }}>
                              No Website Found
                            </span>
                          )}
                        </div>
                      </td>

                      {/* App Used (किस ऐप पर गया) */}
                      <td style={{ background: 'rgba(99, 102, 241, 0.03)' }}>
                        {lead.pitchApp === 'Both' || lead.outreachStatus === 'BothSent' ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                            <span
                              className="badge"
                              style={{
                                background: '#8b5cf6',
                                color: '#fff',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.3rem',
                                fontWeight: 800,
                                fontSize: '0.72rem',
                                width: 'fit-content',
                              }}
                            >
                              <Sparkles size={11} /> Both (WhatsApp + Gmail)
                            </span>
                            <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                              WA: +91 {MAXEDLOGIC_SENDER.senderPhoneRaw} | Gmail: {MAXEDLOGIC_SENDER.senderEmail}
                            </span>
                          </div>
                        ) : lead.pitchApp === 'WhatsApp' || lead.outreachStatus === 'WhatsAppSent' ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                            <span
                              className="badge badge-success"
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.3rem',
                                fontWeight: 800,
                                fontSize: '0.72rem',
                                width: 'fit-content',
                              }}
                            >
                              <MessageSquare size={11} /> WhatsApp
                            </span>
                            <span style={{ fontSize: '0.68rem', color: '#059669' }}>
                              From: +91 {MAXEDLOGIC_SENDER.senderPhoneRaw}
                            </span>
                          </div>
                        ) : lead.pitchApp === 'Gmail' || lead.outreachStatus === 'EmailSent' ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                            <span
                              className="badge badge-primary"
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.3rem',
                                fontWeight: 800,
                                fontSize: '0.72rem',
                                width: 'fit-content',
                              }}
                            >
                              <Mail size={11} /> Gmail API
                            </span>
                            <span style={{ fontSize: '0.68rem', color: '#2563eb' }}>
                              From: {MAXEDLOGIC_SENDER.senderEmail}
                            </span>
                          </div>
                        ) : lead.outreachStatus === 'PhoneError' || lead.outreachStatus === 'EmailError' ? (
                          <span
                            className="badge badge-danger"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.3rem',
                              fontWeight: 800,
                              fontSize: '0.72rem',
                            }}
                          >
                            <AlertTriangle size={11} /> Delivery Error
                          </span>
                        ) : (
                          <span
                            className="badge"
                            style={{
                              background: 'var(--bg-muted)',
                              color: 'var(--text-muted)',
                              fontSize: '0.72rem',
                              border: '1px solid var(--border-color)',
                            }}
                          >
                            ⚪ Pending (Not Sent)
                          </span>
                        )}
                      </td>

                      {/* Recipient Contact (नंबर / ईमेल) */}
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem' }}>
                          {waNumber ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                              <MessageSquare size={12} color="#10b981" />
                              <a
                                href={`https://wa.me/${cleanPhone.length === 10 ? '91' + cleanPhone : cleanPhone}`}
                                target="_blank"
                                rel="noreferrer"
                                style={{ color: '#10b981', fontWeight: 600, textDecoration: 'none' }}
                                title="Open WhatsApp Chat"
                              >
                                {waNumber}
                              </a>
                            </div>
                          ) : (
                            <span style={{ color: '#ef4444', fontSize: '0.72rem' }}>No phone on Maps</span>
                          )}

                          {lead.email ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                              <Mail size={12} color="#2563eb" />
                              <a
                                href={`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(lead.email)}`}
                                target="_blank"
                                rel="noreferrer"
                                style={{ color: '#2563eb', wordBreak: 'break-all', textDecoration: 'none' }}
                                title="Open in Gmail"
                              >
                                {lead.email}
                              </a>
                              <span style={{ fontSize: '0.62rem', padding: '1px 4px', borderRadius: 4, background: '#fef3c7', color: '#92400e', fontWeight: 700, width: 'fit-content' }}>
                                👑 Direct Decision Maker (0% Care)
                              </span>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                              <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>No email</span>
                              <button
                                className="btn btn-sm btn-ghost"
                                style={{ padding: '0.1rem 0.3rem', fontSize: '0.67rem', color: '#2563eb' }}
                                onClick={() => handleOpenPitchModal(lead, 'Email')}
                              >
                                + Add
                              </button>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Dispatch Time & Pitch */}
                      <td>
                        {lead.lastPitchedAt ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-main)' }}>
                              {new Date(lead.lastPitchedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })},{' '}
                              {new Date(lead.lastPitchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            <button
                              onClick={() => setViewPitchModalLead(lead)}
                              className="btn btn-sm btn-ghost"
                              style={{
                                fontSize: '0.69rem',
                                padding: '0.15rem 0.4rem',
                                width: 'fit-content',
                                color: 'var(--primary)',
                                border: '1px solid var(--border-color)',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.25rem',
                              }}
                            >
                              <Eye size={11} /> View Proposal
                            </button>
                          </div>
                        ) : (
                          <span style={{ fontSize: '0.73rem', color: 'var(--text-muted)' }}>Not dispatched yet</span>
                        )}
                      </td>

                      {/* Category & Need */}
                      <td>
                        <span className="badge badge-primary" style={{ fontSize: '0.75rem', marginBottom: '0.2rem' }}>
                          {lead.category}
                        </span>
                        <div>
                          <span
                            className="badge"
                            style={{
                              backgroundColor: lead.hasWebsite ? 'rgba(245, 158, 11, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                              color: lead.hasWebsite ? '#d97706' : '#ef4444',
                              border: lead.hasWebsite ? '1px solid #fde68a' : '1px solid #fecaca',
                              fontSize: '0.7rem',
                              fontWeight: 700,
                            }}
                          >
                            {lead.hasWebsite ? 'Website Redesign' : 'New Website Needed'}
                          </span>
                        </div>
                      </td>

                      {/* Location & Maps */}
                      <td style={{ maxWidth: '230px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.18rem' }}>
                          {lead.address && (
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                              {lead.address}
                            </span>
                          )}
                          <span style={{ fontSize: '0.78rem', fontWeight: 600 }}>
                            {[lead.city, lead.state, lead.postalCode, lead.countryName || 'Global'].filter(Boolean).join(', ')}
                          </span>
                          <a
                            href={googleMapsUrl}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              fontSize: '0.7rem',
                              color: '#dc2626',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.25rem',
                              fontWeight: 600,
                              textDecoration: 'none',
                            }}
                          >
                            <MapPin size={11} /> Google Maps
                          </a>
                        </div>
                      </td>

                      {/* Current Status */}
                      <td>{renderStatusBadge(lead)}</td>

                      {/* Quick Actions */}
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.35rem', flexWrap: 'wrap' }}>
                          <button
                            className="btn btn-sm"
                            style={{ background: '#10b981', color: '#fff', padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                            onClick={() => handleOpenPitchModal(lead, 'WhatsApp')}
                            title="Pitch this client on WhatsApp"
                          >
                            <MessageSquare size={12} /> WA Pitch
                          </button>

                          <button
                            className="btn btn-sm"
                            style={{ background: '#2563eb', color: '#fff', padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                            onClick={() => handleOpenPitchModal(lead, 'Email')}
                            title="Pitch this client via Gmail"
                          >
                            <Mail size={12} /> Gmail
                          </button>

                          <button
                            className="btn btn-sm btn-outline"
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                            onClick={() => handleOpenStatusModal(lead)}
                            title="Change status, log reply, or report error"
                          >
                            <Edit3 size={12} /> Status
                          </button>

                          {(lead.outreachStatus === 'WhatsAppSent' || lead.outreachStatus === 'EmailSent' || lead.outreachStatus === 'BothSent') && !lead.replyReceived && (
                            <button
                              className="btn btn-sm"
                              style={{ background: '#f59e0b', color: '#fff', padding: '0.25rem 0.5rem', fontSize: '0.75rem', fontWeight: 700 }}
                              onClick={() => handleOpenFollowUpModal(lead, lead.email ? 'Email' : 'WhatsApp')}
                              title="Send a polite follow-up reminder to this client"
                            >
                              <Clock size={12} /> Follow-up
                            </button>
                          )}

                          {onOpenLeadDetail && (
                            <button
                              className="btn btn-sm btn-ghost"
                              style={{ padding: '0.25rem 0.4rem' }}
                              onClick={() => onOpenLeadDetail(lead)}
                              title="View full lead diagnosis"
                            >
                              <Eye size={13} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      ) : (
        /* MOBILE CARDS VIEW (Clean responsive stacking for phones) */
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
          {filteredList.map((lead, idx) => {
            const googleMapsUrl =
              lead.googleMapsUrl ||
              `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                lead.businessName + ' ' + (lead.address || '') + ' ' + lead.city
              )}`;
            const cleanPhone = lead.phoneNumber ? lead.phoneNumber.replace(/[^0-9]/g, '') : '';
            const waNumber = lead.whatsAppNumber || lead.phoneNumber;

            return (
              <div
                key={`pipeline-card-${lead.id}-${idx}`}
                className="card"
                style={{
                  padding: '1.1rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem',
                  borderRadius: 'var(--radius-lg)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                    {lead.email && (
                      <div style={{ position: 'relative', width: 34, height: 34, flexShrink: 0 }}>
                        <img
                          src={lead.profileDpUrl || resolveEmailProfileDp(lead.email, lead.contactPerson, lead.category).dpUrl || ''}
                          alt="DP"
                          style={{ width: 34, height: 34, borderRadius: '50%', objectFit: 'cover', border: '2px solid #10b981' }}
                        />
                        <div
                          style={{
                            position: 'absolute',
                            bottom: -1,
                            right: -1,
                            width: 9,
                            height: 9,
                            borderRadius: '50%',
                            background: '#10b981',
                            border: '1px solid #fff',
                          }}
                          title="Google Profile DP Active"
                        />
                      </div>
                    )}
                    <div>
                      <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800 }}>{lead.businessName}</h4>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {lead.contactPerson || 'Proprietor'} • {lead.category}
                      </span>
                    </div>
                  </div>
                  {renderStatusBadge(lead)}
                </div>

                <div style={{ fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.35rem', color: 'var(--text-muted)' }}>
                    <MapPin size={13} color="#dc2626" style={{ flexShrink: 0, marginTop: '2px' }} />
                    <span>
                      {[lead.address, lead.city, lead.state, lead.countryName || 'Global'].filter(Boolean).join(', ')}
                    </span>
                    <a href={googleMapsUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--primary)', marginLeft: 'auto', fontWeight: 600, flexShrink: 0 }}>
                      Maps ➜
                    </a>
                  </div>

                  {waNumber && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <Phone size={13} color="#10b981" />
                      <span>{waNumber}</span>
                    </div>
                  )}

                  {lead.email && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', wordBreak: 'break-all' }}>
                        <Mail size={13} color="#2563eb" />
                        <span>{lead.email}</span>
                      </div>
                      <span style={{ fontSize: '0.65rem', background: '#dcfce7', color: '#15803d', padding: '1px 5px', borderRadius: 4, fontWeight: 700 }}>
                        ✓ DP Found
                      </span>
                    </div>
                  )}
                </div>

                {activeTab === 'errors' && lead.errorMessage && (
                  <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: '0.5rem', borderRadius: 'var(--radius-sm)', fontSize: '0.75rem', color: '#dc2626' }}>
                    <strong>Error:</strong> {lead.errorMessage}
                  </div>
                )}

                {activeTab === 'replies' && (lead.chatbotSummary || lead.replyNotes) && (
                  <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', padding: '0.5rem', borderRadius: 'var(--radius-sm)', fontSize: '0.75rem', color: '#065f46', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                    {lead.chatbotSummary && (
                      <div style={{ fontWeight: 700 }}>
                        {lead.chatbotSummary.serviceMode} → {lead.chatbotSummary.selectedCategory} → {lead.chatbotSummary.selectedSubType} ({lead.chatbotSummary.finalDecision})
                      </div>
                    )}
                    {lead.replyNotes && (
                      <div>
                        <strong>Client Reply:</strong> {lead.replyNotes}
                      </div>
                    )}
                  </div>
                )}

                <div style={{ display: 'flex', gap: '0.4rem', marginTop: 'auto', paddingTop: '0.5rem', borderTop: '1px solid var(--border-color)', flexWrap: 'wrap' }}>
                  <button
                    className="btn btn-sm"
                    style={{ flex: 1, background: '#10b981', color: '#fff', fontSize: '0.75rem', justifyContent: 'center' }}
                    onClick={() => handleOpenPitchModal(lead, 'WhatsApp')}
                  >
                    <MessageSquare size={12} /> WhatsApp
                  </button>
                  <button
                    className="btn btn-sm"
                    style={{ flex: 1, background: '#2563eb', color: '#fff', fontSize: '0.75rem', justifyContent: 'center' }}
                    onClick={() => handleOpenPitchModal(lead, 'Email')}
                  >
                    <Mail size={12} /> Gmail
                  </button>
                  <button
                    className="btn btn-sm btn-outline"
                    style={{ fontSize: '0.75rem' }}
                    onClick={() => handleOpenStatusModal(lead)}
                  >
                    <Edit3 size={12} /> Status
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* QUICK PITCH MODAL (WhatsApp or Gmail) */}
      <Modal
        isOpen={!!pitchModalLead}
        onClose={() => setPitchModalLead(null)}
        title={pitchModalChannel === 'WhatsApp' ? 'Send Instant WhatsApp Pitch' : 'Send Instant Gmail Pitch'}
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button className="btn btn-outline" onClick={() => setPitchModalLead(null)}>
              Cancel
            </button>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {pitchModalChannel === 'WhatsApp' ? (
                <button
                  className="btn btn-primary"
                  style={{ background: '#10b981', borderColor: 'transparent', fontWeight: 700 }}
                  onClick={handleExecutePitchModal}
                >
                  <MessageSquare size={15} /> Launch WhatsApp Web Chat
                </button>
              ) : (
                <>
                  {(!customRecipientEmail.trim() || !isRealDeliverableEmail(customRecipientEmail.trim())) ? (
                    <button
                      className="btn btn-primary"
                      style={{ background: '#10b981', borderColor: 'transparent', fontWeight: 700 }}
                      onClick={() => {
                        setPitchModalChannel('WhatsApp');
                        if (pitchModalLead) {
                          const pitch = getMaxedLogicPitch(pitchModalLead);
                          setCustomPitchText(pitch.whatsAppText);
                        }
                      }}
                    >
                      <MessageSquare size={15} /> Switch to WhatsApp Chat (0 Bounce)
                    </button>
                  ) : (
                    <>
                      <button
                        className="btn btn-outline"
                        style={{ borderColor: '#2563eb', color: '#2563eb' }}
                        onClick={handleExecutePitchModal}
                      >
                        <Mail size={15} /> Launch Gmail Web
                      </button>
                      <button
                        className="btn btn-primary"
                        style={{ background: '#2563eb', borderColor: '#2563eb', fontWeight: 700 }}
                        disabled={isSendingGmailApi}
                        onClick={handleExecuteGmailApiDirect}
                      >
                        {isSendingGmailApi ? (
                          <span>Sending via Gmail API...</span>
                        ) : (
                          <>
                            <Send size={15} /> Dispatch via Gmail API
                          </>
                        )}
                      </button>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        }
      >
        {pitchModalLead && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            {/* MaxedLogic Sender Identity Banner */}
            <div
              style={{
                background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.08) 0%, rgba(16, 185, 129, 0.08) 100%)',
                border: '1px solid rgba(99, 102, 241, 0.25)',
                padding: '0.75rem 0.9rem',
                borderRadius: 'var(--radius-md)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '0.5rem',
              }}
            >
              <div>
                <span style={{ fontSize: '0.685rem', fontWeight: 800, color: '#6366f1', textTransform: 'uppercase' }}>
                  Sender (संदेश भेजने वाली कंपनी)
                </span>
                <div style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-main)' }}>
                  MaxedLogic (maxedlogic.com)
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  प्रतिनिधि: {MAXEDLOGIC_SENDER.senderName}
                </div>
              </div>
              <div style={{ fontSize: '0.75rem', textAlign: 'right' }}>
                <div>
                  व्हाट्सएप: <strong>{MAXEDLOGIC_SENDER.senderPhoneFormatted}</strong>
                </div>
                <div>
                  जीमेल: <strong>{MAXEDLOGIC_SENDER.senderEmail}</strong>
                </div>
              </div>
            </div>

            <div style={{ background: 'var(--bg-muted)', padding: '0.75rem', borderRadius: 'var(--radius-md)', fontSize: '0.825rem' }}>
              <div>
                <strong>Client:</strong> {pitchModalLead.businessName} ({pitchModalLead.category})
              </div>
              <div>
                <strong>Recipient:</strong> {pitchModalLead.contactPerson || 'Proprietor'}
              </div>
              <div>
                <strong>Location:</strong>{' '}
                {[pitchModalLead.address, pitchModalLead.city, pitchModalLead.state, pitchModalLead.countryName || 'Global']
                  .filter(Boolean)
                  .join(', ')}
              </div>
            </div>

            {pitchModalChannel === 'Email' ? (
              <div className="form-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                  <label className="form-label" style={{ margin: 0, fontWeight: 700 }}>
                    Recipient Business Email (प्राप्तकर्ता का ईमेल) *
                  </label>
                  {!pitchModalLead.email && (
                    <span style={{ fontSize: '0.72rem', color: '#f59e0b', fontWeight: 700 }}>
                      ⚠️ Google Maps लिस्टिंग पर ईमेल नहीं था
                    </span>
                  )}
                </div>
                <input
                  type="email"
                  className="form-input"
                  placeholder="e.g. verified.contact@business.com"
                  value={customRecipientEmail}
                  onChange={(e) => setCustomRecipientEmail(e.target.value)}
                  style={{
                    borderColor: !customRecipientEmail ? '#f59e0b' : undefined,
                    background: !customRecipientEmail ? 'rgba(245, 158, 11, 0.04)' : undefined,
                  }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.4rem', flexWrap: 'wrap', gap: '0.4rem' }}>
                  <span style={{ fontSize: '0.73rem', color: 'var(--text-muted)' }}>
                    ईमेल पता नहीं है? सीधे WhatsApp पर भेजें:
                  </span>
                  <button
                    type="button"
                    className="btn btn-sm"
                    style={{
                      background: 'rgba(16, 185, 129, 0.1)',
                      color: '#10b981',
                      borderColor: '#10b981',
                      padding: '0.2rem 0.6rem',
                      fontSize: '0.73rem',
                      fontWeight: 700,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.3rem',
                    }}
                    onClick={() => {
                      setPitchModalChannel('WhatsApp');
                      const pitch = getMaxedLogicPitch(pitchModalLead);
                      setCustomPitchText(pitch.whatsAppText);
                    }}
                  >
                    <MessageSquare size={13} />
                    <span>Switch to WhatsApp (+91 {pitchModalLead.whatsAppNumber || pitchModalLead.phoneNumber || 'Phone'})</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="form-group">
                <label className="form-label" style={{ fontWeight: 700 }}>
                  Recipient WhatsApp / Phone Number *
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. 9876543210"
                  value={customRecipientPhone}
                  onChange={(e) => setCustomRecipientPhone(e.target.value)}
                />
              </div>
            )}

            {pitchModalChannel === 'Email' && (
              <div className="form-group">
                <label className="form-label">Subject Line</label>
                <input
                  type="text"
                  className="form-input"
                  value={customSubjectText}
                  onChange={(e) => setCustomSubjectText(e.target.value)}
                />
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Personalized Pitch Message</label>
              <textarea
                className="form-textarea"
                rows={7}
                value={customPitchText}
                onChange={(e) => setCustomPitchText(e.target.value)}
              />
            </div>
            <div
              style={{
                background: 'rgba(245, 158, 11, 0.08)',
                border: '1px solid #f59e0b',
                padding: '0.65rem 0.85rem',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.76rem',
                color: '#b45309',
                lineHeight: 1.4,
              }}
            >
              💡 <strong>डिस्पैच गाइड (Delivery Guide):</strong> बटन दबाते ही आपका{' '}
              <strong>{pitchModalChannel === 'WhatsApp' ? 'WhatsApp (+91 9759725212)' : 'Gmail Web (aabdulhafiz073@gmail.com)'}</strong> नए
              टैब में यह मैसेज भरकर खुलेगा। आपको बस वहाँ <strong>'Send'</strong> बटन दबाना है, जिससे यह आपके असली Gmail <strong>Sent</strong> बॉक्स या
              WhatsApp चैट में तुरंत रिकॉर्ड हो जाएगा।
            </div>
          </div>
        )}
      </Modal>

      {/* UPDATE STATUS / LOG REPLY / REPORT ERROR MODAL */}
      <Modal
        isOpen={!!statusModalLead}
        onClose={() => setStatusModalLead(null)}
        title="Update Pipeline Status & Customer Response"
        footer={
          <>
            <button className="btn btn-outline" onClick={() => setStatusModalLead(null)}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={handleSaveStatusModal}>
              Save Status
            </button>
          </>
        }
      >
        {statusModalLead && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ fontSize: '0.85rem' }}>
              Update status for <strong>{statusModalLead.businessName}</strong> ({statusModalLead.city})
            </div>

            <div className="form-group">
              <label className="form-label">Select Outreach Status</label>
              <select
                className="form-select"
                value={editStatusTarget}
                onChange={(e) => setEditStatusTarget(e.target.value as LeadOutreachStatus)}
              >
                <option value="Pending">🟡 New Scanned / Pending Pitch</option>
                <option value="WhatsAppSent">🟢 WhatsApp Pitched (व्हाट्सएप भेजा गया)</option>
                <option value="EmailSent">🔵 Gmail Pitched (जीमेल भेजा गया)</option>
                <option value="BothSent">🟣 Both Channels Pitched (दोनों पर भेजा गया)</option>
                <option value="PhoneError">🔴 Phone / WhatsApp Error (नंबर गलत / नहीं लगा)</option>
                <option value="EmailError">🔴 Gmail Error (जीमेल बाउंस / गलत आईडी)</option>
                <option value="Replied">🎯 Client Replied (क्लाइंट का जवाब आया)</option>
              </select>
            </div>

            {editStatusTarget === 'Replied' && (
              <div className="form-group">
                <label className="form-label">Client Reply Type</label>
                <select
                  className="form-select"
                  value={modalReplyType}
                  onChange={(e) => setModalReplyType(e.target.value as any)}
                >
                  <option value="Interested">🟢 Interested (इच्छुक - Demo/Pricing माँगी)</option>
                  <option value="DemoScheduled">📅 Demo Meeting Scheduled (मीटिंग तय)</option>
                  <option value="DealWon">💎 Deal Won / Closed (सौदा पक्का)</option>
                  <option value="NotInterested">⚪ Not Interested (रुचि नहीं)</option>
                </select>
              </div>
            )}

            <div className="form-group">
              <label className="form-label">
                {editStatusTarget === 'Replied'
                  ? 'Client Message / Reply Notes'
                  : editStatusTarget.includes('Error')
                  ? 'Error Reason'
                  : 'Pitch / Activity Notes'}
              </label>
              <textarea
                className="form-textarea"
                rows={3}
                placeholder={
                  editStatusTarget === 'Replied'
                    ? 'Enter client feedback, callback time, or pricing discussed...'
                    : editStatusTarget.includes('Error')
                    ? 'Describe why delivery failed (e.g. number switched off, invalid domain)...'
                    : 'Add any optional notes about this outreach...'
                }
                value={modalCustomNote}
                onChange={(e) => setModalCustomNote(e.target.value)}
              />
            </div>
          </div>
        )}
      </Modal>

      {/* EDIT CONTACT MODAL (FOR FIXING ERRORS) */}
      <Modal
        isOpen={!!editContactLead}
        onClose={() => setEditContactLead(null)}
        title="Fix Contact Details & Retry Pitch"
        footer={
          <>
            <button className="btn btn-outline" onClick={() => setEditContactLead(null)}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={handleSaveEditContact}>
              Update & Clear Error
            </button>
          </>
        }
      >
        {editContactLead && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <p style={{ fontSize: '0.85rem', margin: 0 }}>
              Correct the contact information for <strong>{editContactLead.businessName}</strong> to retry pitching.
            </p>

            <div className="form-group">
              <label className="form-label">Phone Number</label>
              <input
                type="text"
                className="form-input"
                placeholder="+91 98765 43210"
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">WhatsApp Number</label>
              <input
                type="text"
                className="form-input"
                placeholder="+91 98765 43210"
                value={editWhatsApp}
                onChange={(e) => setEditWhatsApp(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Gmail / Email Address</label>
              <input
                type="email"
                className="form-input"
                placeholder="contact@business.com"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
              />
            </div>
          </div>
        )}
      </Modal>

      {/* VIEW SENT PROPOSAL / PITCH REPORT MODAL */}
      <Modal
        isOpen={!!viewPitchModalLead}
        onClose={() => setViewPitchModalLead(null)}
        title="Dispatched Pitch & Delivery Report"
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
            <button className="btn btn-outline" onClick={() => setViewPitchModalLead(null)}>
              Close (बंद करें)
            </button>
            {viewPitchModalLead && (
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    const l = viewPitchModalLead;
                    setViewPitchModalLead(null);
                    handleOpenPitchModal(l, 'WhatsApp');
                  }}
                  style={{ background: '#10b981', borderColor: '#10b981' }}
                >
                  <MessageSquare size={13} />
                  <span>Resend WhatsApp</span>
                </button>
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    const l = viewPitchModalLead;
                    setViewPitchModalLead(null);
                    handleOpenPitchModal(l, 'Email');
                  }}
                  style={{ background: '#2563eb', borderColor: '#2563eb' }}
                >
                  <Mail size={13} />
                  <span>Resend Gmail</span>
                </button>
              </div>
            )}
          </div>
        }
      >
        {viewPitchModalLead && (() => {
          const l = viewPitchModalLead;
          const defaultPitch = getMaxedLogicPitch(l);
          const subject = l.pitchSubject || defaultPitch.emailSubject;
          const message = l.pitchMessage || defaultPitch.whatsAppText;
          const appName = l.pitchApp || (l.outreachStatus === 'WhatsAppSent' ? 'WhatsApp' : l.outreachStatus === 'EmailSent' ? 'Gmail' : l.outreachStatus === 'BothSent' ? 'Both' : 'Pending');

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', fontSize: '0.85rem' }}>
              <div style={{ background: 'var(--bg-muted)', padding: '0.85rem', borderRadius: 'var(--radius-md)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.65rem' }}>
                <div>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Business Name:</span>
                  <div style={{ fontWeight: 800, fontSize: '0.95rem' }}>{l.businessName}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{l.category} • {l.city}</div>
                </div>

                <div>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>App / Platform Dispatched:</span>
                  <div>
                    {appName === 'Both' ? (
                      <span className="badge" style={{ background: '#8b5cf6', color: '#fff', fontWeight: 800 }}>
                        <Sparkles size={11} /> WhatsApp + Gmail API
                      </span>
                    ) : appName === 'WhatsApp' ? (
                      <span className="badge badge-success" style={{ fontWeight: 800 }}>
                        <MessageSquare size={11} /> WhatsApp (+91 {MAXEDLOGIC_SENDER.senderPhoneRaw})
                      </span>
                    ) : appName === 'Gmail' ? (
                      <span className="badge badge-primary" style={{ fontWeight: 800 }}>
                        <Mail size={11} /> Gmail API ({MAXEDLOGIC_SENDER.senderEmail})
                      </span>
                    ) : (
                      <span className="badge">⚪ Pending</span>
                    )}
                  </div>
                </div>

                <div>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Recipient Contact:</span>
                  <div style={{ fontWeight: 700 }}>
                    {l.pitchRecipient || l.phoneNumber || l.email || 'Phone/Email from Maps'}
                  </div>
                </div>

                <div>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Dispatched Timestamp:</span>
                  <div style={{ fontWeight: 700 }}>
                    {l.lastPitchedAt ? new Date(l.lastPitchedAt).toLocaleString() : 'Recent'}
                  </div>
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.3rem', display: 'block' }}>
                  Proposal Subject Line:
                </label>
                <div style={{ padding: '0.5rem 0.75rem', background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', fontWeight: 600 }}>
                  {subject}
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
                  <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                    Message Body Sent to Client:
                  </label>
                  <button
                    className="btn btn-sm btn-ghost"
                    style={{ fontSize: '0.72rem', padding: '0.1rem 0.4rem' }}
                    onClick={() => {
                      navigator.clipboard.writeText(message);
                      onShowToast('Copied', 'Pitch message copied to clipboard!', 'success');
                    }}
                  >
                    <Copy size={11} /> Copy Message
                  </button>
                </div>
                <div style={{ whiteSpace: 'pre-wrap', padding: '0.85rem', background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', fontSize: '0.82rem', maxHeight: '240px', overflowY: 'auto', lineHeight: 1.5 }}>
                  {message}
                </div>
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* MODAL 1: ADD NEW GMAIL REPLY (नया जीमेल रिप्लाई दर्ज करें) */}
      <Modal
        isOpen={isAddReplyModalOpen}
        onClose={() => setIsAddReplyModalOpen(false)}
        title="नया जीमेल रिप्लाई दर्ज करें (Log Inbound Gmail Response)"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
            <button
              className="btn btn-ghost"
              onClick={() => setIsAddReplyModalOpen(false)}
            >
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={handleSaveNewGmailReply}
              style={{ background: '#06b6d4', borderColor: '#06b6d4', fontWeight: 800 }}
            >
              <Check size={14} />
              <span>Save Reply to Admin Panel</span>
            </button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', fontSize: '0.85rem' }}>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: 0 }}>
            यदि किसी क्लाइंट ने आपकी Gmail ID (<strong>aabdulhafiz073@gmail.com</strong>) पर जवाब भेजा है, तो उसका विवरण यहाँ दर्ज करें ताकि वह Admin Panel की टेबल में हमेशा के लिए सुरक्षित रहे:
          </p>

          <div>
            <label style={{ display: 'block', fontWeight: 700, fontSize: '0.8rem', marginBottom: '0.25rem' }}>
              Business / Client Name (बिज़नेस या क्लाइंट का नाम):
            </label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. Clove Dental Clinic / Dr. Ruchika"
              value={newReplyBizName}
              onChange={(e) => setNewReplyBizName(e.target.value)}
              style={{ width: '100%' }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label style={{ display: 'block', fontWeight: 700, fontSize: '0.8rem', marginBottom: '0.25rem' }}>
                Client Gmail Address (क्लाइंट का ईमेल) <span style={{ color: '#ef4444' }}>*</span>:
              </label>
              <input
                type="email"
                className="form-input"
                placeholder="client@gmail.com"
                value={newReplyEmail}
                onChange={(e) => setNewReplyEmail(e.target.value)}
                style={{ width: '100%' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontWeight: 700, fontSize: '0.8rem', marginBottom: '0.25rem' }}>
                Client Phone / WhatsApp (फ़ोन नंबर):
              </label>
              <input
                type="text"
                className="form-input"
                placeholder="+91 98110 XXXXX"
                value={newReplyPhone}
                onChange={(e) => setNewReplyPhone(e.target.value)}
                style={{ width: '100%' }}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontWeight: 700, fontSize: '0.8rem', marginBottom: '0.25rem' }}>
              Email Subject Line (ईमेल विषय):
            </label>
            <input
              type="text"
              className="form-input"
              placeholder="Re: Website Proposal & Video Mockup"
              value={newReplySubject}
              onChange={(e) => setNewReplySubject(e.target.value)}
              style={{ width: '100%' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontWeight: 700, fontSize: '0.8rem', marginBottom: '0.25rem' }}>
              Reply Intent / Classification (क्लाइंट का इरादा):
            </label>
            <select
              className="form-select"
              value={newReplyType}
              onChange={(e) => setNewReplyType(e.target.value as any)}
              style={{ width: '100%', fontWeight: 700 }}
            >
              <option value="Website Create Approved">Approved Website Create (वेबसाइट बनवाने की मंजूरी)</option>
              <option value="Website Update Requested">Website Update Requested (वेबसाइट अपडेट करने को बोला)</option>
              <option value="Contact Number Shared">Contact Number Shared on Email (ईमेल पर नंबर भेजा)</option>
              <option value="YES (Interested)">YES (Interested) — काम कराना चाहते हैं</option>
              <option value="Demo Scheduled">Demo Scheduled — मीटिंग तय</option>
              <option value="Deal Won">Deal Won — डील फाइनल</option>
              <option value="Question">Question — रेट या प्रश्न पूछा</option>
              <option value="NO (Not Interested)">NO (Not Interested) — अभी आवश्यकता नहीं</option>
            </select>
          </div>

          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', background: 'var(--bg-muted)', padding: '0.55rem 0.75rem', borderRadius: '6px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={newReplyWantsCreate}
                onChange={(e) => setNewReplyWantsCreate(e.target.checked)}
              />
              <span>Approved Website Create</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={newReplyWantsUpdate}
                onChange={(e) => setNewReplyWantsUpdate(e.target.checked)}
              />
              <span>Requested Website Update</span>
            </label>
          </div>

          <div>
            <label style={{ display: 'block', fontWeight: 700, fontSize: '0.8rem', marginBottom: '0.25rem' }}>
              Client Reply Message (क्लाइंट ने क्या मैसेज भेजा) <span style={{ color: '#ef4444' }}>*</span>:
            </label>
            <textarea
              className="form-input"
              rows={4}
              placeholder="Paste or write the client's reply message here..."
              value={newReplyMessage}
              onChange={(e) => {
                const txt = e.target.value;
                setNewReplyMessage(txt);
                const parsed = analyzeReplyContent(newReplySubject, txt);
                if (parsed.extractedPhone && !newReplyPhone.trim()) {
                  setNewReplyPhone(parsed.extractedPhone);
                }
                if (parsed.wantsWebsiteCreate) setNewReplyWantsCreate(true);
                if (parsed.wantsWebsiteUpdate) setNewReplyWantsUpdate(true);
              }}
              style={{ width: '100%', fontFamily: 'inherit', resize: 'vertical' }}
            />
          </div>
        </div>
      </Modal>
      {/* MODAL 2: VIEW FULL GMAIL CONVERSATION THREAD (SENT PITCH & CLIENT REPLY) */}
      <Modal
        isOpen={Boolean(viewingReplyRecord)}
        onClose={() => setViewingReplyRecord(null)}
        title="💬 ईमेल बातचीत थ्रेड (Sent Proposal vs Client Reply)"
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
              {viewingReplyRecord?.clientPhone && (
                <a
                  href={`https://api.whatsapp.com/send?phone=${viewingReplyRecord.clientPhone.replace(/\D/g, '').length === 10 ? '91' + viewingReplyRecord.clientPhone.replace(/\D/g, '') : viewingReplyRecord.clientPhone.replace(/\D/g, '')}&text=${encodeURIComponent(`नमस्ते जी! MaxedLogic (https://maxedlogic.com) से आपका ईमेल रिप्लाई मिला। हम आपकी वेबसाइट पर चर्चा के लिए कब बात कर सकते हैं?`)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-sm"
                  style={{ background: '#10b981', color: '#fff', textDecoration: 'none', fontWeight: 700 }}
                >
                  <MessageSquare size={13} />
                  <span>WhatsApp पर चैट करें</span>
                </a>
              )}
              {viewingReplyRecord?.threadUrl && (
                <a
                  href={viewingReplyRecord.threadUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-sm btn-outline"
                  style={{ borderColor: '#2563eb', color: '#2563eb', textDecoration: 'none', fontWeight: 700 }}
                >
                  <Mail size={13} />
                  <span>Open in Gmail Web</span>
                </a>
              )}
            </div>
            <button
              className="btn btn-ghost"
              onClick={() => setViewingReplyRecord(null)}
            >
              Close
            </button>
          </div>
        }
      >
        {viewingReplyRecord && (() => {
          const matchedLead = leads.find((l) =>
            (l.email && l.email.toLowerCase().trim() === viewingReplyRecord.clientEmail.toLowerCase().trim()) ||
            l.businessName.toLowerCase().trim() === viewingReplyRecord.businessName.toLowerCase().trim()
          );
          const sentPitch = matchedLead
            ? getMaxedLogicPitch(matchedLead)
            : getMaxedLogicPitch({
                id: 9999,
                businessName: viewingReplyRecord.businessName,
                address: '',
                city: '',
                state: '',
                countryName: '',
                countryCode: '',
                countryId: 1,
                phoneNumber: viewingReplyRecord.clientPhone || '',
                whatsAppNumber: viewingReplyRecord.clientPhone || '',
                websiteUrl: null,
                hasWebsite: false,
                rating: 4.8,
                reviewCount: 100,
                websiteStatus: 'NoWebsite',
                detectedNeed: 'NEEDS_NEW_WEBSITE',
                source: 'Google Places',
                leadScore: 95,
                createdAt: '',
                updatedAt: '',
                category: 'General Business',
              } as any);

          const isYes = viewingReplyRecord.replyType.includes('YES');
          const isDemo = viewingReplyRecord.replyType.includes('Demo');
          const isWon = viewingReplyRecord.replyType.includes('Won');
          const isNo = viewingReplyRecord.replyType.includes('NO');
          const badgeBg = isYes ? '#10b981' : isDemo ? '#2563eb' : isWon ? '#8b5cf6' : isNo ? '#ef4444' : '#f59e0b';

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', fontSize: '0.85rem' }}>
              {/* Header Overview Card */}
              <div
                style={{
                  background: 'var(--bg-muted)',
                  padding: '0.85rem 1rem',
                  borderRadius: 'var(--radius-md)',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: '0.65rem',
                  border: '1px solid var(--border-color)',
                }}
              >
                <div>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Business Name:</span>
                  <div style={{ fontWeight: 800, fontSize: '0.95rem' }}>{viewingReplyRecord.businessName}</div>
                </div>

                <div>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Client Email:</span>
                  <div style={{ fontWeight: 700, color: '#2563eb' }}>{viewingReplyRecord.clientEmail}</div>
                </div>

                <div>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Client Location:</span>
                  <div style={{ fontWeight: 600 }}>
                    {viewingReplyRecord.location ||
                      (matchedLead
                        ? [matchedLead.address, matchedLead.city, matchedLead.countryName].filter(Boolean).join(', ')
                        : 'Matched via Email')}
                  </div>
                </div>

                {viewingReplyRecord.extractedPhone && (
                  <div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Phone Shared on Email:</span>
                    <div style={{ fontWeight: 800, color: '#d97706' }}>{viewingReplyRecord.extractedPhone}</div>
                  </div>
                )}

                {viewingReplyRecord.clientPhone && (
                  <div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Phone / WhatsApp:</span>
                    <div style={{ fontWeight: 700, color: '#10b981' }}>{viewingReplyRecord.clientPhone}</div>
                  </div>
                )}

                <div>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Received Timestamp:</span>
                  <div style={{ fontWeight: 700 }}>
                    {new Date(viewingReplyRecord.receivedAt).toLocaleString()}
                  </div>
                </div>

                <div>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Client Response & Approval:</span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginTop: '0.15rem' }}>
                    <span
                      className="badge"
                      style={{
                        background: badgeBg,
                        color: '#fff',
                        fontWeight: 800,
                        fontSize: '0.75rem',
                        padding: '3px 8px',
                      }}
                    >
                      {viewingReplyRecord.replyType}
                    </span>
                    {viewingReplyRecord.wantsWebsiteCreate && (
                      <span className="badge" style={{ background: '#dcfce7', color: '#166534', fontWeight: 700, fontSize: '0.7rem' }}>
                        Website Create Approved
                      </span>
                    )}
                    {viewingReplyRecord.wantsWebsiteUpdate && (
                      <span className="badge" style={{ background: '#dbeafe', color: '#1e40af', fontWeight: 700, fontSize: '0.7rem' }}>
                        Website Update Requested
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {(viewingReplyRecord.serviceMode || viewingReplyRecord.selectedCategory || viewingReplyRecord.selectedSubType || viewingReplyRecord.finalDecision) && (
                <div
                  style={{
                    background: 'rgba(16, 185, 129, 0.08)',
                    border: '1px solid #6ee7b7',
                    borderRadius: 'var(--radius-md)',
                    padding: '0.8rem 1rem',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                    gap: '0.65rem',
                  }}
                >
                  <div>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>1. Service Mode</span>
                    <div style={{ fontWeight: 800 }}>{viewingReplyRecord.serviceMode || '-'}</div>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>2. Category</span>
                    <div style={{ fontWeight: 800 }}>{viewingReplyRecord.selectedCategory || '-'}</div>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>3. Selected Sub-Type</span>
                    <div style={{ fontWeight: 800 }}>{viewingReplyRecord.selectedSubType || '-'}</div>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>4. Final YES / NO</span>
                    <div style={{ fontWeight: 800, color: viewingReplyRecord.finalDecision === 'YES' ? '#059669' : '#dc2626' }}>
                      {viewingReplyRecord.finalDecision || '-'}
                    </div>
                  </div>
                </div>
              )}

              {/* 📤 STEP 1: हमने क्या प्रपोजल भेजा था (Sent by MaxedLogic) */}
              <div
                style={{
                  background: 'rgba(37, 99, 235, 0.04)',
                  border: '1px solid #bfdbfe',
                  borderRadius: 'var(--radius-md)',
                  padding: '0.9rem',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem', flexWrap: 'wrap', gap: '0.3rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 800, color: '#1d4ed8' }}>
                    <Send size={14} />
                    <span>📤 1. हमने क्या प्रपोजल भेजा था (Sent from aabdulhafiz073@gmail.com)</span>
                  </div>
                  <span style={{ fontSize: '0.7rem', color: '#2563eb', fontWeight: 700 }}>Sender: Abdul Hafiz | MaxedLogic</span>
                </div>

                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
                  <strong>Subject:</strong> {sentPitch.emailSubject}
                </div>

                <div
                  style={{
                    whiteSpace: 'pre-wrap',
                    padding: '0.75rem',
                    background: 'var(--bg-surface)',
                    border: '1px solid #e0e7ff',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '0.8rem',
                    maxHeight: '170px',
                    overflowY: 'auto',
                    lineHeight: 1.5,
                    color: 'var(--text-main)',
                  }}
                >
                  {sentPitch.emailBody}
                </div>
              </div>

              {/* 📥 STEP 2: क्लाइंट का क्या जवाब आया (Client's Reply) */}
              <div
                style={{
                  background: 'rgba(16, 185, 129, 0.06)',
                  border: '1px solid #86efac',
                  borderRadius: 'var(--radius-md)',
                  padding: '0.9rem',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem', flexWrap: 'wrap', gap: '0.3rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 800, color: '#047857' }}>
                    <Mail size={14} />
                    <span>📥 2. क्लाइंट का क्या जवाब आया (Client Incoming Reply)</span>
                  </div>
                  <button
                    className="btn btn-sm btn-ghost"
                    style={{ fontSize: '0.72rem', padding: '0.1rem 0.4rem' }}
                    onClick={() => {
                      navigator.clipboard.writeText(viewingReplyRecord.fullMessage);
                      onShowToast('Copied', 'Client reply copied to clipboard!', 'success');
                    }}
                  >
                    <Copy size={11} /> Copy Reply
                  </button>
                </div>

                <div
                  style={{
                    whiteSpace: 'pre-wrap',
                    padding: '0.85rem',
                    background: '#fff',
                    border: '1px solid #86efac',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '0.88rem',
                    fontWeight: 500,
                    maxHeight: '220px',
                    overflowY: 'auto',
                    lineHeight: 1.55,
                    color: '#064e3b',
                    boxShadow: '0 1px 3px rgba(16,185,129,0.1)',
                  }}
                >
                  {viewingReplyRecord.fullMessage}
                </div>
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* ⚡ WHATSAPP SEQUENTIAL AUTO-QUEUE MODAL */}
      <WhatsAppQueueModal
        isOpen={isWhatsAppQueueOpen}
        onClose={() => setIsWhatsAppQueueOpen(false)}
        leads={filteredList}
        onMarkPitched={(leadId, message) => {
          markLeadPitched(leadId, 'WhatsApp', { message });
        }}
        onShowToast={onShowToast}
      />

      {/* 🚀 1-CLICK WHATSAPP BULK CHATBOT MODAL */}
      <WhatsAppBulkSendModal
        isOpen={isWhatsAppBulkOpen}
        onClose={() => setIsWhatsAppBulkOpen(false)}
        leads={filteredList}
        scopeLabel="Admin Panel Leads"
        onShowToast={onShowToast}
        onCompleted={() => {
          void refreshLeadsFromDb();
        }}
      />
    </div>
  );
};
