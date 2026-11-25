import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  MessageSquare,
  QrCode,
  KeyRound,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  LogOut,
  X,
  Loader2,
  Smartphone,
  ShieldCheck,
  Eye,
  EyeOff,
} from 'lucide-react';
import {
  connectMetaWhatsApp,
  connectWhatsAppQr,
  disconnectWhatsApp,
  getCachedWhatsAppStatus,
  refreshWhatsAppStatus,
  subscribeWhatsAppStatus,
  type WhatsAppConnectionStatus,
} from '../services/whatsappConnectService';

interface WhatsAppConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnected?: (status: WhatsAppConnectionStatus) => void;
}

export const WhatsAppConnectModal: React.FC<WhatsAppConnectModalProps> = ({
  isOpen,
  onClose,
  onConnected,
}) => {
  const [status, setStatus] = useState<WhatsAppConnectionStatus>(getCachedWhatsAppStatus);
  const [activeTab, setActiveTab] = useState<'qr' | 'meta'>('qr');
  const [isWorking, setIsWorking] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // QR / Pairing Code options
  const [showPairingInput, setShowPairingInput] = useState(false);
  const [pairingPhone, setPairingPhone] = useState('919759725212');

  // Meta Business Cloud API fields
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [metaToken, setMetaToken] = useState('');
  const [showToken, setShowToken] = useState(false);

  const onConnectedRef = useRef(onConnected);
  onConnectedRef.current = onConnected;

  useEffect(() => {
    const unsub = subscribeWhatsAppStatus((next) => {
      setStatus(next);
      if (next.connected && isOpen && onConnectedRef.current) {
        onConnectedRef.current(next);
      }
    });
    return () => unsub();
  }, [isOpen]);

  // Trigger initial QR request when modal opens on QR tab if not already connected
  useEffect(() => {
    if (!isOpen) return;
    setErrorMsg(null);
    let cancelled = false;

    const bootQr = async () => {
      const current = await refreshWhatsAppStatus();
      if (cancelled) return;
      if (!current.connected && activeTab === 'qr' && current.status !== 'qr_ready') {
        setIsWorking(true);
        try {
          await connectWhatsAppQr();
        } catch (err: any) {
          if (!cancelled) setErrorMsg(err?.message || 'Unable to generate WhatsApp QR.');
        } finally {
          if (!cancelled) setIsWorking(false);
        }
      }
    };

    void bootQr();

    // Fast polling (2s) while modal is open so scanning QR updates immediately
    const fastPoll = setInterval(() => {
      void refreshWhatsAppStatus();
    }, 2000);

    return () => {
      cancelled = true;
      clearInterval(fastPoll);
    };
  }, [isOpen, activeTab]);

  if (!isOpen) return null;

  const handleGenerateFreshQr = async (usePairing = false) => {
    setErrorMsg(null);
    setIsWorking(true);
    try {
      const res = await connectWhatsAppQr({
        forceFresh: true,
        pairingPhone: usePairing && pairingPhone.trim() ? pairingPhone.trim() : undefined,
      });
      setStatus(res);
      if (res.lastError) setErrorMsg(res.lastError);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Could not generate QR code.');
    } finally {
      setIsWorking(false);
    }
  };

  const handleMetaConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!phoneNumberId.trim() || !metaToken.trim()) {
      setErrorMsg('Please enter both Phone Number ID and Permanent Access Token.');
      return;
    }
    setIsWorking(true);
    try {
      const res = await connectMetaWhatsApp({
        phoneNumberId: phoneNumberId.trim(),
        token: metaToken.trim(),
      });
      setStatus(res);
      if (onConnectedRef.current) onConnectedRef.current(res);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Meta Cloud API connection failed.');
    } finally {
      setIsWorking(false);
    }
  };

  const handleDisconnect = async () => {
    setErrorMsg(null);
    setIsWorking(true);
    try {
      await disconnectWhatsApp('all');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Disconnect failed.');
    } finally {
      setIsWorking(false);
    }
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Connect WhatsApp Account"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        backgroundColor: 'rgba(15, 23, 42, 0.72)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '540px',
          backgroundColor: 'var(--bg-surface, #ffffff)',
          color: 'var(--text-main, #0f172a)',
          borderRadius: '14px',
          border: '1px solid var(--border-color, #e2e8f0)',
          boxShadow: '0 24px 48px rgba(0, 0, 0, 0.25)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '1rem 1.25rem',
            borderBottom: '1px solid var(--border-color, #e2e8f0)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: '8px',
                backgroundColor: '#16a34a',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <MessageSquare size={18} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>
                Connect Official WhatsApp
              </h3>
              <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted, #64748b)' }}>
                1-Click Chatbot Bulk Sending &amp; Live 4-Step Auto-Reply Bot
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Connect WhatsApp modal"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted, #64748b)',
              cursor: 'pointer',
              padding: '0.35rem',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Connected Banner */}
          {status.connected && (
            <div
              style={{
                padding: '1rem',
                borderRadius: '10px',
                backgroundColor: 'rgba(16, 185, 129, 0.09)',
                border: '1px solid #10b981',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.65rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#059669', fontWeight: 700, fontSize: '0.92rem' }}>
                  <CheckCircle2 size={18} />
                  <span>WhatsApp Connected &amp; Ready</span>
                </div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted, #475569)', fontWeight: 600 }}>
                  {status.mode === 'meta' ? 'Meta Business Cloud API' : 'Linked Device (QR Session)'}
                </span>
              </div>

              <div style={{ fontSize: '0.82rem', color: 'var(--text-main)', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                <div>
                  <strong>Active Number:</strong>{' '}
                  <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: '#059669' }}>
                    {status.phoneNumber || '+91 97597 25212'}
                  </span>
                  {status.displayName && (
                    <span style={{ color: 'var(--text-muted)' }}> · {status.displayName}</span>
                  )}
                </div>
                <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                  Auto-Bot active: Jab bhi client Step 1–4 reply dega (YES/NO), saari details seedha Admin Panel me save hongi.
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.25rem' }}>
                <button
                  type="button"
                  onClick={handleDisconnect}
                  disabled={isWorking}
                  className="btn btn-outline btn-sm"
                  style={{ color: '#dc2626', borderColor: '#fca5a5' }}
                >
                  <LogOut size={14} />
                  <span>Disconnect</span>
                </button>
                <button type="button" onClick={onClose} className="btn btn-primary btn-sm" style={{ background: '#16a34a', borderColor: '#16a34a' }}>
                  Done · Ready to Send
                </button>
              </div>
            </div>
          )}

          {/* Mode Tabs (always allow switching / viewing even when disconnected) */}
          {!status.connected && (
            <>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '0.35rem',
                  padding: '0.25rem',
                  backgroundColor: 'var(--bg-body, #f1f5f9)',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color, #e2e8f0)',
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('qr');
                    setErrorMsg(null);
                  }}
                  style={{
                    padding: '0.5rem 0.75rem',
                    borderRadius: '6px',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.4rem',
                    backgroundColor: activeTab === 'qr' ? 'var(--bg-surface, #ffffff)' : 'transparent',
                    color: activeTab === 'qr' ? '#16a34a' : 'var(--text-muted, #64748b)',
                    boxShadow: activeTab === 'qr' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  }}
                >
                  <QrCode size={15} />
                  <span>Scan QR (Phone Link)</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('meta');
                    setErrorMsg(null);
                  }}
                  style={{
                    padding: '0.5rem 0.75rem',
                    borderRadius: '6px',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.4rem',
                    backgroundColor: activeTab === 'meta' ? 'var(--bg-surface, #ffffff)' : 'transparent',
                    color: activeTab === 'meta' ? '#2563eb' : 'var(--text-muted, #64748b)',
                    boxShadow: activeTab === 'meta' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  }}
                >
                  <KeyRound size={15} />
                  <span>Meta Cloud API</span>
                </button>
              </div>

              {errorMsg && (
                <div
                  style={{
                    padding: '0.65rem 0.85rem',
                    borderRadius: '8px',
                    backgroundColor: 'rgba(239, 68, 68, 0.08)',
                    border: '1px solid rgba(239, 68, 68, 0.35)',
                    color: '#dc2626',
                    fontSize: '0.78rem',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '0.45rem',
                  }}
                >
                  <AlertCircle size={15} style={{ flexShrink: 0, marginTop: '1px' }} />
                  <span>{errorMsg}</span>
                </div>
              )}

              {activeTab === 'qr' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem', alignItems: 'center' }}>
                  <div
                    style={{
                      width: '100%',
                      padding: '1rem',
                      borderRadius: '10px',
                      border: '1px solid var(--border-color, #e2e8f0)',
                      backgroundColor: 'var(--bg-body, #f8fafc)',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '0.75rem',
                    }}
                  >
                    {status.qrDataUrl ? (
                      <div style={{ padding: '0.75rem', background: '#ffffff', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                        <img
                          src={status.qrDataUrl}
                          alt="WhatsApp Link Device QR Code"
                          style={{ width: 210, height: 210, display: 'block' }}
                        />
                      </div>
                    ) : (
                      <div
                        style={{
                          width: 210,
                          height: 210,
                          borderRadius: '10px',
                          background: 'var(--bg-surface, #ffffff)',
                          border: '1px dashed var(--border-color, #cbd5e1)',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.5rem',
                          color: 'var(--text-muted, #64748b)',
                          fontSize: '0.78rem',
                          textAlign: 'center',
                          padding: '1rem',
                        }}
                      >
                        {isWorking || status.status === 'connecting' ? (
                          <>
                            <Loader2 size={28} className="animate-spin" color="#16a34a" />
                            <span>Generating live WhatsApp QR code...</span>
                          </>
                        ) : (
                          <>
                            <QrCode size={28} color="#16a34a" />
                            <span>Click &ldquo;Generate QR Code&rdquo; below to link your WhatsApp number.</span>
                          </>
                        )}
                      </div>
                    )}

                    {status.pairingCode && (
                      <div
                        style={{
                          padding: '0.55rem 0.9rem',
                          borderRadius: '8px',
                          backgroundColor: '#ecfdf5',
                          border: '1px solid #6ee7b7',
                          color: '#065f46',
                          fontSize: '0.84rem',
                          fontWeight: 700,
                          letterSpacing: '0.14em',
                          fontFamily: 'monospace',
                        }}
                      >
                        Pairing Code: {status.pairingCode}
                      </div>
                    )}

                    <div style={{ fontSize: '0.77rem', color: 'var(--text-muted, #475569)', lineHeight: 1.5, textAlign: 'center', maxWidth: '420px' }}>
                      <strong>Phone par scan karein:</strong> Apna WhatsApp (+91 97597 25212) kholein → <strong>Menu / Settings</strong> → <strong>Linked Devices</strong> → <strong>Link a Device</strong> → Is QR ko scan karein.
                    </div>
                  </div>

                  {/* Pairing Code optional toggle */}
                  {showPairingInput && (
                    <div
                      style={{
                        width: '100%',
                        display: 'flex',
                        gap: '0.5rem',
                        alignItems: 'center',
                      }}
                    >
                      <input
                        type="text"
                        className="input-field"
                        value={pairingPhone}
                        onChange={(e) => setPairingPhone(e.target.value)}
                        placeholder="919759725212 (country code + number)"
                        style={{ flex: 1, fontSize: '0.82rem', fontVariantNumeric: 'tabular-nums' }}
                      />
                      <button
                        type="button"
                        onClick={() => handleGenerateFreshQr(true)}
                        disabled={isWorking}
                        className="btn btn-outline btn-sm"
                      >
                        Get Code
                      </button>
                    </div>
                  )}

                  <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <button
                      type="button"
                      onClick={() => setShowPairingInput((v) => !v)}
                      className="btn btn-ghost btn-sm"
                      style={{ fontSize: '0.76rem' }}
                    >
                      <Smartphone size={14} />
                      <span>{showPairingInput ? 'Hide Phone Pairing' : 'Link via Phone Number Code'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleGenerateFreshQr(false)}
                      disabled={isWorking}
                      className="btn btn-primary btn-sm"
                      style={{ background: '#16a34a', borderColor: '#16a34a' }}
                    >
                      <RefreshCw size={14} className={isWorking ? 'animate-spin' : ''} />
                      <span>{status.qrDataUrl ? 'Refresh QR Code' : 'Generate QR Code'}</span>
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleMetaConnect} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted, #475569)', lineHeight: 1.5 }}>
                    Official <strong>Meta WhatsApp Business Cloud API</strong> se connect karne par interactive reply buttons aur unlimited high-speed bulk chatbot sending milti hai.
                  </div>

                  <div>
                    <label className="form-label" style={{ fontSize: '0.76rem', fontWeight: 700 }}>
                      Phone Number ID (from Meta Developers)
                    </label>
                    <input
                      type="text"
                      className="input-field"
                      value={phoneNumberId}
                      onChange={(e) => setPhoneNumberId(e.target.value)}
                      placeholder="e.g. 104829384712345"
                      style={{ fontSize: '0.82rem', fontVariantNumeric: 'tabular-nums' }}
                      required
                    />
                  </div>

                  <div>
                    <label className="form-label" style={{ fontSize: '0.76rem', fontWeight: 700 }}>
                      Permanent System Access Token
                    </label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type={showToken ? 'text' : 'password'}
                        className="input-field"
                        value={metaToken}
                        onChange={(e) => setMetaToken(e.target.value)}
                        placeholder="EAAG..."
                        style={{ fontSize: '0.82rem', paddingRight: '2.25rem' }}
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowToken((v) => !v)}
                        aria-label={showToken ? 'Hide token' : 'Show token'}
                        style={{
                          position: 'absolute',
                          right: '0.5rem',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: 'var(--text-muted)',
                        }}
                      >
                        {showToken ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.25rem' }}>
                    <span style={{ fontSize: '0.73rem', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                      <ShieldCheck size={13} color="#16a34a" /> Verified live via Graph API v21.0
                    </span>
                    <button
                      type="submit"
                      disabled={isWorking}
                      className="btn btn-primary btn-sm"
                      style={{ background: '#2563eb', borderColor: '#2563eb' }}
                    >
                      {isWorking ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                      <span>{isWorking ? 'Verifying...' : 'Verify & Connect API'}</span>
                    </button>
                  </div>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

interface WhatsAppConnectButtonProps {
  compact?: boolean;
  onStatusChange?: (status: WhatsAppConnectionStatus) => void;
}

export const WhatsAppConnectButton: React.FC<WhatsAppConnectButtonProps> = ({
  compact,
  onStatusChange,
}) => {
  const [status, setStatus] = useState<WhatsAppConnectionStatus>(getCachedWhatsAppStatus);
  const [modalOpen, setModalOpen] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  const onStatusChangeRef = useRef(onStatusChange);
  onStatusChangeRef.current = onStatusChange;

  useEffect(() => {
    const unsub = subscribeWhatsAppStatus((next) => {
      setStatus(next);
      if (onStatusChangeRef.current) onStatusChangeRef.current(next);
    });
    return () => unsub();
  }, []);

  const handleQuickDisconnect = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isDisconnecting) return;
    setIsDisconnecting(true);
    try {
      await disconnectWhatsApp('all');
    } finally {
      setIsDisconnecting(false);
    }
  };

  if (status.connected) {
    const labelPhone = status.phoneNumber || '+91 97597 25212';
    return (
      <>
        <div
          onClick={() => setModalOpen(true)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') setModalOpen(true);
          }}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.45rem',
            padding: compact ? '0.2rem 0.6rem' : '0.35rem 0.75rem',
            background: 'rgba(22, 163, 74, 0.1)',
            border: '1px solid #16a34a',
            borderRadius: 'var(--radius-md, 8px)',
            fontSize: compact ? '0.72rem' : '0.8rem',
            color: '#16a34a',
            fontWeight: 700,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            flexShrink: 0,
            fontVariantNumeric: 'tabular-nums',
          }}
          title={`WhatsApp Active via ${status.mode === 'meta' ? 'Meta Business Cloud API' : 'Linked Device QR'} (${labelPhone})`}
        >
          <MessageSquare size={compact ? 12 : 14} />
          <span>WhatsApp Connected ({labelPhone})</span>
          <button
            type="button"
            onClick={handleQuickDisconnect}
            disabled={isDisconnecting}
            title="Disconnect WhatsApp"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              padding: '2px 4px',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            {isDisconnecting ? <Loader2 size={12} className="animate-spin" /> : <LogOut size={12} />}
          </button>
        </div>

        <WhatsAppConnectModal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
        />
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.45rem',
          padding: compact ? '0.3rem 0.65rem' : '0.45rem 0.85rem',
          backgroundColor: '#16a34a',
          color: '#ffffff',
          border: '1px solid #15803d',
          borderRadius: '6px',
          fontWeight: 600,
          fontSize: compact ? '0.75rem' : '0.82rem',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          flexShrink: 0,
          boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
        }}
        title="Connect WhatsApp via QR Code Scan or Meta Business Cloud API for 1-Click Bulk Sending"
      >
        <MessageSquare size={compact ? 13 : 15} />
        <span>{compact ? 'Connect WhatsApp' : 'Connect WhatsApp (QR / API)'}</span>
      </button>

      <WhatsAppConnectModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
      />
    </>
  );
};
