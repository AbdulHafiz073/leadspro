import React, { useState, useEffect, useRef } from 'react';
import {
  MessageSquare,
  Send,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  X,
  Play,
  Pause,
  Clock,
  Sparkles,
  MapPin,
  ExternalLink,
  Phone,
  Copy,
  Check
} from 'lucide-react';
import { Lead } from '../types';
import { getMaxedLogicPitch, MAXEDLOGIC_SENDER } from '../utils/maxedLogicPitches';

interface WhatsAppQueueModalProps {
  isOpen: boolean;
  onClose: () => void;
  leads: Lead[];
  onMarkPitched: (leadId: number, message: string) => void;
  onShowToast: (title: string, message: string, type: 'success' | 'error' | 'info') => void;
}

export const WhatsAppQueueModal: React.FC<WhatsAppQueueModalProps> = ({
  isOpen,
  onClose,
  leads,
  onMarkPitched,
  onShowToast,
}) => {
  // Filter leads that actually have a phone/whatsapp number
  const validLeads = leads.filter((l) => Boolean(l.whatsAppNumber || l.phoneNumber));
  const [currentIndex, setCurrentIndex] = useState(0);
  const [sentIndices, setSentIndices] = useState<Set<number>>(new Set());
  const [isCopied, setIsCopied] = useState(false);
  const [autoAdvance, setAutoAdvance] = useState(true);

  if (!isOpen || validLeads.length === 0) return null;

  const currentLead = validLeads[currentIndex] || validLeads[0];
  const pitch = getMaxedLogicPitch(currentLead);
  const rawPhone = currentLead.whatsAppNumber || currentLead.phoneNumber || '';
  let cleanPhone = rawPhone.replace(/[^0-9]/g, '');
  if (cleanPhone.length === 10 && /^[6-9]/.test(cleanPhone)) {
    cleanPhone = '91' + cleanPhone;
  } else if (cleanPhone.length === 11 && cleanPhone.startsWith('0')) {
    cleanPhone = '91' + cleanPhone.slice(1);
  }

  const [useWebWhatsApp, setUseWebWhatsApp] = useState<boolean>(() => {
    return localStorage.getItem('leadhunter_wa_mode') === 'web';
  });

  const toggleWaMode = (mode: 'web' | 'api') => {
    setUseWebWhatsApp(mode === 'web');
    localStorage.setItem('leadhunter_wa_mode', mode);
  };

  const waUrl = cleanPhone
    ? useWebWhatsApp
      ? `https://web.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(pitch.whatsAppText)}`
      : `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(pitch.whatsAppText)}`
    : '';

  const progressPercent = Math.round(((sentIndices.size) / validLeads.length) * 100);

  const handleOpenAndSend = () => {
    if (!cleanPhone) {
      onShowToast('Phone Error', 'इस बिज़नेस का फ़ोन नंबर उपलब्ध नहीं है।', 'error');
      return;
    }

    // Open WhatsApp in new tab
    window.open(waUrl, '_blank', 'noopener,noreferrer');

    // Mark as pitched
    onMarkPitched(currentLead.id, pitch.whatsAppText);
    setSentIndices((prev) => new Set(prev).add(currentIndex));

    onShowToast(
      'WhatsApp Opened! 💬',
      `${currentLead.businessName} के लिए व्हाट्सएप चैट खुल गई है। चैट में "Send" दबाएँ!`,
      'success'
    );

    // Auto advance
    if (autoAdvance && currentIndex < validLeads.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    }
  };

  const handleNext = () => {
    if (currentIndex < validLeads.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
    }
  };

  const handleCopyMessage = () => {
    navigator.clipboard.writeText(pitch.whatsAppText);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
    onShowToast('कॉपी हुआ', 'व्हाट्सएप प्रपोजल मैसेज कॉपी कर लिया गया है।', 'info');
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 99999,
        padding: '1rem',
      }}
    >
      <div
        style={{
          background: 'var(--card-bg, #ffffff)',
          border: '1px solid var(--border-color, #e5e7eb)',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '780px',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '1.25rem 1.5rem',
            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: '50%',
                background: 'rgba(255,255,255,0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <MessageSquare size={20} color="#fff" />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>
                ⚡ MaxedLogic Auto WhatsApp Queue (व्हाट्सएप ऑटो-क्यू)
              </h3>
              <p style={{ margin: 0, fontSize: '0.8rem', opacity: 0.9 }}>
                लीड {currentIndex + 1} / {validLeads.length} • {sentIndices.size} भेजे गए
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#fff',
              cursor: 'pointer',
              padding: '0.4rem',
              borderRadius: '6px',
            }}
          >
            <X size={22} />
          </button>
        </div>

        {/* Progress Bar */}
        <div style={{ width: '100%', height: '5px', background: '#e5e7eb' }}>
          <div
            style={{
              width: `${progressPercent}%`,
              height: '100%',
              background: '#10b981',
              transition: 'width 0.3s ease',
            }}
          />
        </div>

        {/* Body */}
        <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Current Lead Info Card */}
          <div
            style={{
              padding: '1rem',
              background: 'var(--bg-muted, #f9fafb)',
              border: '1px solid var(--border-color, #e5e7eb)',
              borderRadius: '12px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '0.75rem',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-main, #111827)' }}>
                  {currentLead.businessName}
                </h4>
                {sentIndices.has(currentIndex) && (
                  <span className="badge badge-success" style={{ fontSize: '0.7rem' }}>
                    <CheckCircle2 size={11} /> Sent
                  </span>
                )}
              </div>
              <div style={{ fontSize: '0.825rem', color: 'var(--text-muted, #6b7280)', marginTop: '0.25rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <span>📍 {currentLead.city}, {currentLead.countryName || 'India'}</span>
                <span>🏷️ {currentLead.category}</span>
                <span>⭐ {currentLead.rating || 4.8}★</span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div
                style={{
                  background: '#dcfce7',
                  color: '#166534',
                  padding: '0.4rem 0.75rem',
                  borderRadius: '8px',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                }}
              >
                <Phone size={14} />
                <span>+{cleanPhone}</span>
              </div>
            </div>
          </div>

          {/* WhatsApp Text Preview Bubble */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
              <label style={{ fontSize: '0.825rem', fontWeight: 700, color: 'var(--text-main, #374151)' }}>
                💬 तैयार किया गया प्रपोजल मैसेज (Personalized Message):
              </label>
              <button
                type="button"
                onClick={handleCopyMessage}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#10b981',
                  cursor: 'pointer',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                }}
              >
                {isCopied ? <Check size={13} /> : <Copy size={13} />}
                <span>{isCopied ? 'Copied!' : 'Copy Text'}</span>
              </button>
            </div>

            <div
              style={{
                background: '#dcf8c6',
                color: '#111827',
                padding: '1rem',
                borderRadius: '12px',
                fontSize: '0.85rem',
                lineHeight: 1.55,
                whiteSpace: 'pre-wrap',
                maxHeight: '260px',
                overflowY: 'auto',
                border: '1px solid #86efac',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
              }}
            >
              {pitch.whatsAppText}
            </div>
          </div>

          {/* Queue Navigation & Options */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '0.75rem',
              paddingTop: '0.5rem',
              borderTop: '1px solid var(--border-color, #e5e7eb)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={autoAdvance}
                  onChange={(e) => setAutoAdvance(e.target.checked)}
                />
                <span>ऑटो-अगली लीड</span>
              </label>

              <div style={{ display: 'flex', background: 'var(--bg-muted, #f3f4f6)', padding: '2px', borderRadius: '6px', border: '1px solid var(--border-color, #e5e7eb)' }}>
                <button
                  type="button"
                  onClick={() => toggleWaMode('web')}
                  style={{
                    padding: '0.2rem 0.5rem',
                    fontSize: '0.73rem',
                    fontWeight: useWebWhatsApp ? 700 : 500,
                    borderRadius: '4px',
                    border: 'none',
                    cursor: 'pointer',
                    background: useWebWhatsApp ? '#10b981' : 'transparent',
                    color: useWebWhatsApp ? '#fff' : 'var(--text-muted)',
                  }}
                  title="सीधे ब्राउज़र में WhatsApp Web खोलें"
                >
                  🌐 Web
                </button>
                <button
                  type="button"
                  onClick={() => toggleWaMode('api')}
                  style={{
                    padding: '0.2rem 0.5rem',
                    fontSize: '0.73rem',
                    fontWeight: !useWebWhatsApp ? 700 : 500,
                    borderRadius: '4px',
                    border: 'none',
                    cursor: 'pointer',
                    background: !useWebWhatsApp ? '#10b981' : 'transparent',
                    color: !useWebWhatsApp ? '#fff' : 'var(--text-muted)',
                  }}
                  title="डेस्कटॉप या फ़ोन का WhatsApp ऐप खोलें"
                >
                  📱 App
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                className="btn btn-sm btn-outline"
                disabled={currentIndex === 0}
                onClick={handlePrev}
              >
                <ChevronLeft size={15} /> Prev
              </button>
              <button
                className="btn btn-sm btn-outline"
                disabled={currentIndex === validLeads.length - 1}
                onClick={handleNext}
              >
                Next <ChevronRight size={15} />
              </button>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div
          style={{
            padding: '1rem 1.5rem',
            background: 'var(--bg-muted, #f9fafb)',
            borderTop: '1px solid var(--border-color, #e5e7eb)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '0.75rem',
          }}
        >
          <button className="btn btn-outline" onClick={onClose}>
            Close Queue
          </button>

          <button
            className="btn btn-primary"
            onClick={handleOpenAndSend}
            style={{
              background: '#10b981',
              borderColor: '#10b981',
              fontWeight: 800,
              fontSize: '0.95rem',
              padding: '0.6rem 1.5rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <Send size={16} />
            <span>💬 Open WhatsApp & Send ({currentIndex + 1} of {validLeads.length})</span>
          </button>
        </div>
      </div>
    </div>
  );
};
