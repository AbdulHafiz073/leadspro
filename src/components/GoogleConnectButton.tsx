import React, { useState, useEffect, useRef } from 'react';
import {
  initAuth,
  logoutGoogle,
  subscribeGoogleAuth,
  subscribeSigningIn,
  getLastAuthIssue,
  connectGmailWithAppPassword,
} from '../services/googleWorkspaceAuth';
import { User as FirebaseUser } from 'firebase/auth';
import { Mail, LogOut, Loader2, AlertCircle, Key, ExternalLink, X, CheckCircle, ShieldCheck, Zap, AlertTriangle } from 'lucide-react';

interface GoogleConnectButtonProps {
  onStatusChange?: (connected: boolean, email?: string) => void;
  onError?: (message: string) => void;
  compact?: boolean;
}

export const GoogleConnectButton: React.FC<GoogleConnectButtonProps> = ({ onStatusChange, onError, compact }) => {
  const [googleUser, setGoogleUser] = useState<FirebaseUser | null>(null);
  const [connectedEmail, setConnectedEmail] = useState<string | null>(null);
  const [hasToken, setHasToken] = useState<boolean>(false);
  const [tokenMode, setTokenMode] = useState<'smtp_active' | 'direct_sender' | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [inputEmail, setInputEmail] = useState<string>('aabdulhafiz073@gmail.com');
  const [inputPassword, setInputPassword] = useState<string>('');
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [modalSuccess, setModalSuccess] = useState<string | null>(null);

  const onStatusChangeRef = useRef(onStatusChange);
  onStatusChangeRef.current = onStatusChange;

  const checkServerStatus = async () => {
    try {
      const res = await fetch('/api/gmail/status');
      const data = await res.json();
      if (data?.connected && data?.email) {
        setConnectedEmail(data.email);
        setInputEmail(data.email);
        setHasToken(true);
        setTokenMode(data.mode === 'smtp_app_password' ? 'smtp_active' : 'direct_sender');
        if (onStatusChangeRef.current) onStatusChangeRef.current(true, data.email);
      } else {
        setHasToken(false);
        setConnectedEmail(null);
        setTokenMode(null);
      }
    } catch {}
  };

  useEffect(() => {
    checkServerStatus();
    const unsubInit = initAuth();
    const unsubSigningIn = subscribeSigningIn((signingIn) => {
      setIsLoading(signingIn);
    });
    const unsubStore = subscribeGoogleAuth((connected, email, token, user) => {
      setGoogleUser(user);
      setHasToken(connected);
      setConnectedEmail(email);
      setTokenMode(token === 'smtp_active' ? 'smtp_active' : 'direct_sender');
      if (onStatusChangeRef.current) {
        onStatusChangeRef.current(connected, email || undefined);
      }
    });

    return () => {
      unsubSigningIn();
      unsubStore();
      unsubInit();
    };
  }, []);

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputEmail || !inputEmail.includes('@')) {
      setModalError('Valid Gmail address enter karein (e.g. yourname@gmail.com)');
      return;
    }

    setIsConnecting(true);
    setModalError(null);
    setModalSuccess(null);

    const res = await connectGmailWithAppPassword(inputEmail.trim(), inputPassword.trim());
    setIsConnecting(false);

    if (res.success && res.email) {
      setConnectedEmail(res.email);
      setHasToken(true);
      setModalSuccess('Gmail connected successfully!');
      await checkServerStatus();
      setTimeout(() => {
        setIsModalOpen(false);
      }, 1200);
      if (onStatusChangeRef.current) onStatusChangeRef.current(true, res.email);
    } else {
      setModalError(res.error || 'Gmail connect failed. Check your password or email address.');
    }
  };

  const handleSignOut = async () => {
    setIsLoading(true);
    setAuthError(null);
    try {
      await fetch('/api/gmail/disconnect', { method: 'POST' });
      await logoutGoogle();
      setGoogleUser(null);
      setHasToken(false);
      setConnectedEmail(null);
      setTokenMode(null);
      if (onStatusChangeRef.current) onStatusChangeRef.current(false);
    } finally {
      setIsLoading(false);
    }
  };

  if (hasToken) {
    const displayEmail = googleUser?.email || connectedEmail || 'Connected Gmail';
    const isSmtpReady = tokenMode === 'smtp_active';

    return (
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
        <div
          onClick={() => {
            setInputEmail(displayEmail);
            setIsModalOpen(true);
          }}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.45rem',
            padding: compact ? '0.2rem 0.6rem' : '0.35rem 0.75rem',
            background: isSmtpReady ? 'rgba(16, 185, 129, 0.12)' : 'rgba(245, 158, 11, 0.12)',
            border: `1px solid ${isSmtpReady ? '#10b981' : '#f59e0b'}`,
            borderRadius: 'var(--radius-md, 6px)',
            fontSize: compact ? '0.72rem' : '0.8rem',
            color: isSmtpReady ? '#10b981' : '#d97706',
            fontWeight: 700,
            cursor: 'pointer',
          }}
          title={
            isSmtpReady
              ? `Gmail Active: Real Emails will send directly from ${displayEmail}`
              : `App Password Needed: Click to enter your 16-digit Google App Password for ${displayEmail}`
          }
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: isSmtpReady ? '#10b981' : '#f59e0b',
              boxShadow: isSmtpReady ? '0 0 6px #10b981' : '0 0 6px #f59e0b',
              flexShrink: 0,
            }}
          />
          <Mail size={compact ? 12 : 14} />
          <span>
            {isSmtpReady ? 'Gmail Live (Sending Ready)' : 'Gmail Connected (Enter App Password)'} ({displayEmail.length > 20 ? displayEmail.slice(0, 17) + '...' : displayEmail})
          </span>
        </div>
        <button
          type="button"
          onClick={handleSignOut}
          title="Disconnect Gmail"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-muted, #6b7280)',
            padding: '2px 4px',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <LogOut size={13} />
        </button>
      </div>
    );
  }

  return (
    <>
      <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.25rem' }}>
        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          disabled={isLoading}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: compact ? '0.3rem 0.65rem' : '0.45rem 0.85rem',
            backgroundColor: '#ffffff',
            color: '#1f2937',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            fontWeight: 600,
            fontSize: compact ? '0.75rem' : '0.82rem',
            cursor: isLoading ? 'not-allowed' : 'pointer',
            boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
            transition: 'all 0.15s ease',
          }}
          title="Connect Gmail App Password to send real cold emails to clients"
        >
          {isLoading ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <svg
              version="1.1"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 48 48"
              style={{ width: 16, height: 16, display: 'block' }}
            >
              <path
                fill="#EA4335"
                d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
              />
              <path
                fill="#4285F4"
                d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
              />
              <path
                fill="#FBBC05"
                d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
              />
              <path
                fill="#34A853"
                d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
              />
              <path fill="none" d="M0 0h48v48H0z" />
            </svg>
          )}
          <span>{compact ? 'Connect Gmail' : 'Connect Gmail (App Password)'}</span>
        </button>
      </div>

      {/* Gmail Connect Modal */}
      {isModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '1rem',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsModalOpen(false);
          }}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              color: '#000000',
              borderRadius: '12px',
              maxWidth: '540px',
              width: '100%',
              padding: '1.6rem',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.35)',
              border: '2px solid #1f2937',
              position: 'relative',
            }}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.85rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <div
                  style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '8px',
                    backgroundColor: '#fee2e2',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#dc2626',
                  }}
                >
                  <Mail size={22} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#000000' }}>Connect Gmail for Real Cold Outreach</h3>
                  <p style={{ margin: 0, fontSize: '0.78rem', color: '#4b5563', fontWeight: 600 }}>
                    Google SMTP Authenticated Delivery (Direct to Inboxes)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#1f2937',
                  padding: '4px',
                  borderRadius: '6px',
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Explanation: Why App Password is required */}
            <div
              style={{
                backgroundColor: '#eff6ff',
                border: '1.5px solid #3b82f6',
                borderRadius: '8px',
                padding: '0.75rem 0.9rem',
                marginBottom: '1rem',
                fontSize: '0.82rem',
                lineHeight: 1.45,
                color: '#1e3a8a',
              }}
            >
              <strong style={{ color: '#1e3a8a' }}>🔒 Gmail se Real Emails Send Karne Ka Tarika:</strong>
              <div style={{ marginTop: '0.35rem', color: '#1f2937' }}>
                Google security rules ke mutabik, kisi bhi third-party app se aapke Gmail account se real email deliver karne ke liye <strong>16-digit Google App Password</strong> zaroori hota hai.
              </div>
              <div style={{ marginTop: '0.5rem', background: '#ffffff', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid #93c5fd' }}>
                <strong style={{ color: '#000000' }}>30-Second Steps:</strong>
                <ol style={{ margin: '0.25rem 0 0', paddingLeft: '1.2rem', fontSize: '0.8rem', color: '#000000' }}>
                  <li>
                    Google link open karein:{' '}
                    <a
                      href="https://myaccount.google.com/apppasswords"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: '#2563eb', fontWeight: 700, textDecoration: 'underline' }}
                    >
                      myaccount.google.com/apppasswords ↗
                    </a>
                  </li>
                  <li>"App name" me <strong>LeadHunter</strong> likhein aur <strong>Create</strong> dabayein.</li>
                  <li>Google jo 16-letter ka password dega, use neeche paste karke <strong>Connect</strong> dabayein!</li>
                </ol>
              </div>
            </div>

            {/* Error Message */}
            {modalError && (
              <div
                style={{
                  backgroundColor: '#fef2f2',
                  border: '1.5px solid #f87171',
                  borderRadius: '8px',
                  padding: '0.65rem 0.85rem',
                  marginBottom: '1rem',
                  fontSize: '0.82rem',
                  color: '#991b1b',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
              >
                <AlertCircle size={16} style={{ flexShrink: 0 }} />
                <span>{modalError}</span>
              </div>
            )}

            {/* Success Message */}
            {modalSuccess && (
              <div
                style={{
                  backgroundColor: '#f0fdf4',
                  border: '1.5px solid #4ade80',
                  borderRadius: '8px',
                  padding: '0.65rem 0.85rem',
                  marginBottom: '1rem',
                  fontSize: '0.82rem',
                  color: '#166534',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
              >
                <CheckCircle size={16} style={{ flexShrink: 0 }} />
                <span>{modalSuccess}</span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleConnect}>
              <div style={{ marginBottom: '0.9rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 800, marginBottom: '0.35rem', color: '#000000' }}>
                  Apna Gmail Address:
                </label>
                <input
                  type="email"
                  className="modal-black-input"
                  value={inputEmail}
                  onChange={(e) => setInputEmail(e.target.value)}
                  placeholder="e.g. yourname@gmail.com"
                  required
                  style={{
                    width: '100%',
                    padding: '0.65rem 0.85rem',
                    borderRadius: '6px',
                    border: '2px solid #000000',
                    backgroundColor: '#ffffff',
                    color: '#000000',
                    WebkitTextFillColor: '#000000',
                    caretColor: '#000000',
                    fontSize: '0.95rem',
                    fontWeight: 700,
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div style={{ marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 800, color: '#000000' }}>
                    16-Digit Google App Password: *
                  </label>
                  <a
                    href="https://myaccount.google.com/apppasswords"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: '0.76rem', color: '#2563eb', fontWeight: 700, textDecoration: 'underline' }}
                  >
                    Generate App Password ↗
                  </a>
                </div>
                <input
                  type="text"
                  className="modal-black-input"
                  value={inputPassword}
                  onChange={(e) => setInputPassword(e.target.value)}
                  placeholder="e.g. abcd efgh ijkl mnop"
                  required
                  style={{
                    width: '100%',
                    padding: '0.65rem 0.85rem',
                    borderRadius: '6px',
                    border: '2px solid #000000',
                    backgroundColor: '#ffffff',
                    color: '#000000',
                    WebkitTextFillColor: '#000000',
                    caretColor: '#000000',
                    fontSize: '0.95rem',
                    fontWeight: 700,
                    letterSpacing: '1px',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
                <p style={{ margin: '0.35rem 0 0', fontSize: '0.74rem', color: '#1f2937', fontWeight: 600 }}>
                  ✅ Is password se emails seedha aapke Gmail account se send honge aur aapke Gmail "Sent" folder me dikhenge.
                </p>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  style={{
                    padding: '0.55rem 1rem',
                    borderRadius: '6px',
                    border: '1px solid var(--border-color, #d1d5db)',
                    backgroundColor: 'transparent',
                    color: 'var(--text-main, #374151)',
                    cursor: 'pointer',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isConnecting}
                  style={{
                    padding: '0.55rem 1.35rem',
                    borderRadius: '6px',
                    border: 'none',
                    backgroundColor: '#10b981',
                    color: '#ffffff',
                    cursor: isConnecting ? 'not-allowed' : 'pointer',
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.45rem',
                    boxShadow: '0 2px 4px rgba(16, 185, 129, 0.25)',
                  }}
                >
                  {isConnecting ? (
                    <>
                      <Loader2 size={15} className="animate-spin" /> Verifying with Google...
                    </>
                  ) : (
                    <>
                      <Zap size={15} /> Save & Enable Live Sending
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};
