import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  MessageSquare,
  Send,
  X,
  CheckCircle2,
  AlertCircle,
  Loader2,
  StopCircle,
  QrCode,
  Phone,
} from 'lucide-react';
import type { Lead } from '../types';
import {
  extractLeadPhoneDigits,
  fetchBulkWhatsAppStatus,
  getCachedWhatsAppStatus,
  startBulkWhatsAppSend,
  stopBulkWhatsAppSend,
  subscribeWhatsAppStatus,
  type BulkWhatsAppStatus,
  type WhatsAppConnectionStatus,
} from '../services/whatsappConnectService';
import { WhatsAppConnectModal } from './WhatsAppConnectButton';

interface WhatsAppBulkSendModalProps {
  isOpen: boolean;
  onClose: () => void;
  leads: Lead[];
  scopeLabel?: string;
  onShowToast?: (title: string, msg: string, type: 'success' | 'error' | 'info') => void;
  onCompleted?: () => void;
}

export const WhatsAppBulkSendModal: React.FC<WhatsAppBulkSendModalProps> = ({
  isOpen,
  onClose,
  leads,
  scopeLabel = 'All Available Leads',
  onShowToast,
  onCompleted,
}) => {
  const [waStatus, setWaStatus] = useState<WhatsAppConnectionStatus>(getCachedWhatsAppStatus);
  const [connectModalOpen, setConnectModalOpen] = useState(false);
  const [includeAlreadySent, setIncludeAlreadySent] = useState(false);
  const [isLaunching, setIsLaunching] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [bulkStatus, setBulkStatus] = useState<BulkWhatsAppStatus | null>(null);

  useEffect(() => {
    const unsub = subscribeWhatsAppStatus(setWaStatus);
    return () => unsub();
  }, []);

  // Poll bulk progress whenever modal is open and job is running or checking initial state
  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    let notifiedDone = false;

    const loadStatus = async () => {
      try {
        const s = await fetchBulkWhatsAppStatus();
        if (!active) return;
        setBulkStatus(s);
        if ((s.status === 'completed' || s.status === 'stopped') && !notifiedDone && s.processed > 0) {
          notifiedDone = true;
          if (onCompleted) onCompleted();
        }
      } catch {
        // ignore transient polling error
      }
    };

    void loadStatus();
    const timer = setInterval(() => {
      void loadStatus();
    }, 1000);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [isOpen, onCompleted]);

  const leadsWithPhones = useMemo(
    () => leads.filter((l) => l.outreachStatus !== 'Unsubscribed' && extractLeadPhoneDigits(l).length >= 7),
    [leads]
  );

  const unsentPhoneLeads = useMemo(
    () =>
      leadsWithPhones.filter(
        (l) =>
          l.outreachStatus !== 'WhatsAppSent' &&
          l.outreachStatus !== 'BothSent' &&
          l.outreachStatus !== 'Replied'
      ),
    [leadsWithPhones]
  );

  // Auto-select "includeAlreadySent" if all available phone numbers were already contacted once
  useEffect(() => {
    if (isOpen && unsentPhoneLeads.length === 0 && leadsWithPhones.length > 0) {
      setIncludeAlreadySent(true);
    }
  }, [isOpen, unsentPhoneLeads.length, leadsWithPhones.length]);

  const targetLeads = includeAlreadySent ? leadsWithPhones : unsentPhoneLeads;
  const isRunning = bulkStatus?.status === 'running';

  if (!isOpen) return null;

  const handleLaunchBulkSend = async () => {
    setErrorMsg(null);
    if (!waStatus.connected) {
      setConnectModalOpen(true);
      return;
    }
    if (targetLeads.length === 0) {
      setErrorMsg('No leads with valid WhatsApp phone numbers found in this selection.');
      return;
    }

    setIsLaunching(true);
    try {
      const res = await startBulkWhatsAppSend({
        leadIds: targetLeads.map((l) => l.id),
        origin: window.location.origin,
        includeAlreadySent,
      });
      setBulkStatus(res.status);
      if (onShowToast) {
        onShowToast(
          'WhatsApp Chatbot Bulk Dispatch Started',
          `Sending 4-step chatbot to ${targetLeads.length} available phone number(s).`,
          'info'
        );
      }
    } catch (err: any) {
      const msg = err?.message || 'Failed to start bulk WhatsApp chatbot send.';
      setErrorMsg(msg);
      if (onShowToast) onShowToast('Bulk WhatsApp Error', msg, 'error');
    } finally {
      setIsLaunching(false);
    }
  };

  const handleStopBulk = async () => {
    try {
      const stopped = await stopBulkWhatsAppSend();
      setBulkStatus(stopped);
      if (onCompleted) onCompleted();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Could not stop dispatch.');
    }
  };

  const progressPct =
    bulkStatus && bulkStatus.total > 0
      ? Math.min(100, Math.round((bulkStatus.processed / bulkStatus.total) * 100))
      : 0;

  return createPortal(
    <>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="1-Click Send WhatsApp Chatbot to All Available Numbers"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9998,
          backgroundColor: 'rgba(15, 23, 42, 0.72)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem',
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget && !isRunning) onClose();
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: '640px',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: '8px',
                  backgroundColor: '#16a34a',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <MessageSquare size={18} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>
                  1-Click Send WhatsApp Chatbot to All Numbers
                </h3>
                <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted, #64748b)' }}>
                  Scope: {scopeLabel} · {leadsWithPhones.length} available phone number(s)
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close bulk WhatsApp modal"
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: '0.35rem',
              }}
            >
              <X size={18} />
            </button>
          </div>

          {/* Body */}
          <div style={{ padding: '1.25rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Connection Check Banner */}
            <div
              style={{
                padding: '0.85rem 1rem',
                borderRadius: '10px',
                backgroundColor: waStatus.connected ? 'rgba(16, 185, 129, 0.08)' : 'rgba(245, 158, 11, 0.1)',
                border: `1px solid ${waStatus.connected ? '#10b981' : '#f59e0b'}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.75rem',
                flexWrap: 'wrap',
              }}
            >
              {waStatus.connected ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.84rem', fontWeight: 700, color: '#059669' }}>
                    <CheckCircle2 size={17} />
                    <span>
                      WhatsApp Active: {waStatus.phoneNumber || '+91 97597 25212'} ({waStatus.mode === 'meta' ? 'Meta Cloud API' : 'Linked Device QR'})
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setConnectModalOpen(true)}
                    className="btn btn-outline btn-sm"
                  >
                    Manage Connection
                  </button>
                </>
              ) : (
                <>
                  <div style={{ fontSize: '0.82rem', color: '#92400e' }}>
                    <strong>WhatsApp Not Connected:</strong> Pehle apna WhatsApp (+91 97597 25212) QR scan ya Meta Cloud API se connect karein.
                  </div>
                  <button
                    type="button"
                    onClick={() => setConnectModalOpen(true)}
                    className="btn btn-primary btn-sm"
                    style={{ background: '#16a34a', borderColor: '#16a34a' }}
                  >
                    <QrCode size={14} />
                    <span>Connect WhatsApp</span>
                  </button>
                </>
              )}
            </div>

            {errorMsg && (
              <div
                style={{
                  padding: '0.65rem 0.85rem',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(239, 68, 68, 0.08)',
                  border: '1px solid rgba(239, 68, 68, 0.35)',
                  color: '#dc2626',
                  fontSize: '0.8rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                }}
              >
                <AlertCircle size={15} />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Target Summary + 4-Step Flow Overview */}
            <div
              style={{
                padding: '0.9rem 1rem',
                borderRadius: '10px',
                border: '1px solid var(--border-color, #e2e8f0)',
                backgroundColor: 'var(--bg-body, #f8fafc)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.6rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontWeight: 700, fontSize: '0.85rem' }}>
                  <Phone size={15} color="#16a34a" />
                  <span>Target Phone Numbers Ready:</span>
                  <span style={{ color: '#16a34a', fontVariantNumeric: 'tabular-nums' }}>
                    {targetLeads.length}
                  </span>
                </div>

                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.76rem', color: 'var(--text-muted)', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={includeAlreadySent}
                    onChange={(e) => setIncludeAlreadySent(e.target.checked)}
                    disabled={isRunning}
                  />
                  <span>Re-send to numbers already pitched earlier ({leadsWithPhones.length} total)</span>
                </label>
              </div>

              <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', lineHeight: 1.55 }}>
                <strong>Har client ko WhatsApp par yeh 4-Step Chatbot flow jayega:</strong>
                <br />
                1️⃣ <strong>Update Existing</strong> ya <strong>New Create</strong> (+ Interactive Web Chatbot link)
                <br />
                2️⃣ Category choose: <strong>Website</strong> / <strong>Mobile App</strong> / <strong>Game</strong> / <strong>Custom Software</strong>
                <br />
                3️⃣ Selected category ke exact <strong>5 Sub-Types</strong> (client select karega)
                <br />
                4️⃣ Final <strong>YES / NO</strong> confirm hote hi saari detail <strong>Admin Panel</strong> me aa jayegi.
              </div>
            </div>

            {/* Live Bulk Execution Status */}
            {bulkStatus && bulkStatus.status !== 'idle' && (
              <div
                style={{
                  padding: '0.95rem 1rem',
                  borderRadius: '10px',
                  border: '1px solid var(--border-color, #e2e8f0)',
                  backgroundColor: 'var(--bg-surface, #ffffff)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.65rem',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.82rem', fontWeight: 700 }}>
                  <span>
                    {bulkStatus.status === 'running'
                      ? `Sending: ${bulkStatus.currentBusiness} (${bulkStatus.currentPhone})`
                      : bulkStatus.status === 'completed'
                      ? 'Bulk WhatsApp Chatbot Dispatch Completed'
                      : bulkStatus.status === 'stopped'
                      ? 'Bulk WhatsApp Dispatch Stopped'
                      : 'Dispatch Update'}
                  </span>
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {bulkStatus.processed} / {bulkStatus.total} ({progressPct}%)
                  </span>
                </div>

                <div style={{ height: 8, width: '100%', backgroundColor: '#e2e8f0', borderRadius: 999, overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      width: `${progressPct}%`,
                      backgroundColor: bulkStatus.status === 'error' ? '#dc2626' : '#16a34a',
                      transition: 'width 0.25s ease',
                    }}
                  />
                </div>

                <div style={{ display: 'flex', gap: '1.25rem', fontSize: '0.78rem', fontVariantNumeric: 'tabular-nums' }}>
                  <span style={{ color: '#059669', fontWeight: 700 }}>Sent: {bulkStatus.sentCount}</span>
                  <span style={{ color: '#dc2626', fontWeight: 700 }}>Failed: {bulkStatus.failedCount}</span>
                  <span style={{ color: 'var(--text-muted)' }}>Status: {bulkStatus.status}</span>
                </div>

                {bulkStatus.logs.length > 0 && (
                  <div
                    style={{
                      maxHeight: '170px',
                      overflowY: 'auto',
                      borderTop: '1px solid var(--border-color, #e2e8f0)',
                      paddingTop: '0.5rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.35rem',
                    }}
                  >
                    {bulkStatus.logs.slice(0, 30).map((entry, idx) => (
                      <div
                        key={`${entry.leadId}_${idx}`}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          fontSize: '0.75rem',
                          gap: '0.5rem',
                          padding: '0.25rem 0',
                        }}
                      >
                        <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {entry.businessName} · <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted)' }}>{entry.phone}</span>
                        </span>
                        <span
                          style={{
                            fontWeight: 700,
                            flexShrink: 0,
                            color: entry.status === 'sent' ? '#059669' : '#dc2626',
                          }}
                        >
                          {entry.status === 'sent' ? 'Sent' : entry.message}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div
            style={{
              padding: '0.9rem 1.25rem',
              borderTop: '1px solid var(--border-color, #e2e8f0)',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '0.6rem',
            }}
          >
            {isRunning ? (
              <button
                type="button"
                onClick={handleStopBulk}
                className="btn btn-outline"
                style={{ color: '#dc2626', borderColor: '#fca5a5', fontWeight: 700 }}
              >
                <StopCircle size={15} />
                <span>Stop Dispatch</span>
              </button>
            ) : (
              <>
                <button type="button" onClick={onClose} className="btn btn-outline">
                  Close
                </button>
                <button
                  type="button"
                  onClick={handleLaunchBulkSend}
                  disabled={isLaunching || targetLeads.length === 0}
                  className="btn btn-primary"
                  style={{
                    backgroundColor: '#16a34a',
                    borderColor: '#16a34a',
                    fontWeight: 700,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {isLaunching ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                  <span>
                    {!waStatus.connected
                      ? `Connect & Send to ${targetLeads.length} Numbers`
                      : `Send Chatbot to All (${targetLeads.length} Numbers)`}
                  </span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <WhatsAppConnectModal
        isOpen={connectModalOpen}
        onClose={() => setConnectModalOpen(false)}
        onConnected={() => setConnectModalOpen(false)}
      />
    </>,
    document.body
  );
};
