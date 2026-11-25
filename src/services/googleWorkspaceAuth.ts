import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  User as FirebaseUser,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);

export const SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/gmail.readonly',
];

const SEND_CAPABLE_SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://mail.google.com/',
];

const READ_CAPABLE_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://mail.google.com/',
];

function createGoogleProvider(forceConsent = true): GoogleAuthProvider {
  const p = new GoogleAuthProvider();
  SCOPES.forEach((scope) => p.addScope(scope));
  p.setCustomParameters({
    prompt: forceConsent ? 'consent select_account' : 'select_account',
    include_granted_scopes: 'true',
  });
  return p;
}

const STORAGE_KEY_TOKEN = 'maxedlogic_gmail_access_token';
const STORAGE_KEY_EMAIL = 'maxedlogic_gmail_connected_email';
const STORAGE_KEY_EXPIRY = 'maxedlogic_gmail_token_expiry';

// Purge any legacy persisted OAuth tokens from browser storage (workspace-integration compliance)
if (typeof window !== 'undefined') {
  try {
    localStorage.removeItem(STORAGE_KEY_TOKEN);
    localStorage.removeItem(STORAGE_KEY_EXPIRY);
    localStorage.removeItem(STORAGE_KEY_EMAIL);
  } catch {
    // ignore storage access issues
  }
}

let isSigningIn = false;
let inFlightSignIn: Promise<{ user: FirebaseUser; accessToken: string; grantedScopes?: string[] } | null> | null = null;
let cachedAccessToken: string | null = null;
let cachedAccessTokenExpiry = 0;
let cachedConnectedEmail: string | null = null;
let cachedGrantedScopes: string[] = [];
let scopesVerified = false;
let lastAuthIssueMessage: string | null = null;

type AuthListener = (connected: boolean, email: string | null, token: string | null, user: FirebaseUser | null) => void;
const authListeners = new Set<AuthListener>();

type SigningInListener = (signingIn: boolean) => void;
const signingInListeners = new Set<SigningInListener>();

function setGlobalSigningIn(next: boolean) {
  isSigningIn = next;
  for (const listener of signingInListeners) {
    try {
      listener(next);
    } catch {
      // ignore subscriber errors
    }
  }
}

export const subscribeSigningIn = (listener: SigningInListener): (() => void) => {
  signingInListeners.add(listener);
  listener(isSigningIn);
  return () => {
    signingInListeners.delete(listener);
  };
};

function notifyAuthListeners() {
  const validToken =
    cachedAccessToken && (!cachedAccessTokenExpiry || cachedAccessTokenExpiry > Date.now())
      ? cachedAccessToken
      : null;
  if (!validToken) {
    cachedAccessToken = null;
    cachedAccessTokenExpiry = 0;
    cachedGrantedScopes = [];
    scopesVerified = false;
  }
  const email = validToken ? auth.currentUser?.email || cachedConnectedEmail : null;
  for (const listener of authListeners) {
    try {
      listener(Boolean(validToken), email, validToken, auth.currentUser);
    } catch {
      // ignore individual subscriber errors
    }
  }
}

export const subscribeGoogleAuth = (listener: AuthListener): (() => void) => {
  authListeners.add(listener);
  const validToken =
    cachedAccessToken && (!cachedAccessTokenExpiry || cachedAccessTokenExpiry > Date.now())
      ? cachedAccessToken
      : null;
  const email = validToken ? auth.currentUser?.email || cachedConnectedEmail : null;
  listener(Boolean(validToken), email, validToken, auth.currentUser);
  return () => {
    authListeners.delete(listener);
  };
};

export const invalidateAccessToken = (reason?: string) => {
  cachedAccessToken = null;
  cachedAccessTokenExpiry = 0;
  cachedGrantedScopes = [];
  scopesVerified = false;
  if (reason) {
    lastAuthIssueMessage = reason;
  }
  notifyAuthListeners();
};

export const getLastAuthIssue = (): string | null => lastAuthIssueMessage;

export const getGrantedScopes = (): string[] => [...cachedGrantedScopes];

export const hasGmailSendScope = (): boolean => {
  if (!cachedAccessToken) return false;
  if (cachedAccessToken === 'smtp_active' || cachedAccessToken === 'direct_sender') return true;
  if (!scopesVerified) return true; // If tokeninfo lookup couldn't run, allow Gmail API call to test directly
  return SEND_CAPABLE_SCOPES.some((s) => cachedGrantedScopes.includes(s));
};

export const hasGmailReadScope = (): boolean => {
  if (!cachedAccessToken) return false;
  if (cachedAccessToken === 'smtp_active' || cachedAccessToken === 'direct_sender') return true;
  if (!scopesVerified) return true;
  return READ_CAPABLE_SCOPES.some((s) => cachedGrantedScopes.includes(s));
};

async function inspectGrantedScopes(accessToken: string): Promise<{ verified: boolean; scopes: string[] }> {
  try {
    const res = await fetch(
      `https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${encodeURIComponent(accessToken)}`
    );
    if (!res.ok) {
      return { verified: false, scopes: [] };
    }
    const data = await res.json();
    const rawScope = String(data?.scope || '').trim();
    const scopes = rawScope ? rawScope.split(/\s+/).filter(Boolean) : [];
    return { verified: true, scopes };
  } catch {
    return { verified: false, scopes: [] };
  }
}

export const initAuth = (
  onAuthSuccess?: (user: FirebaseUser | null, token: string) => void,
  onAuthFailure?: () => void
) => {
  // Check backend Gmail SMTP status for localhost reliability
  fetch('/api/gmail/status')
    .then((res) => res.json())
    .then((data) => {
      if (data?.connected && data?.email) {
        cachedConnectedEmail = data.email;
        cachedAccessToken = data.mode === 'smtp_app_password' ? 'smtp_active' : 'direct_sender';
        cachedAccessTokenExpiry = Date.now() + 365 * 24 * 3600 * 1000;
        cachedGrantedScopes = [...SEND_CAPABLE_SCOPES];
        scopesVerified = true;
        notifyAuthListeners();
        if (onAuthSuccess) onAuthSuccess(null, cachedAccessToken);
      }
    })
    .catch(() => {});

  const validToken =
    cachedAccessToken && (!cachedAccessTokenExpiry || cachedAccessTokenExpiry > Date.now())
      ? cachedAccessToken
      : null;
  if (validToken && auth.currentUser) {
    if (onAuthSuccess) onAuthSuccess(auth.currentUser, validToken);
  }

  return onAuthStateChanged(auth, async (user: FirebaseUser | null) => {
    if (user) {
      cachedConnectedEmail = user.email || cachedConnectedEmail;
      if (cachedAccessToken && (!cachedAccessTokenExpiry || cachedAccessTokenExpiry > Date.now())) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn && cachedAccessToken !== 'smtp_active' && cachedAccessToken !== 'direct_sender') {
        cachedAccessToken = null;
        cachedAccessTokenExpiry = 0;
        cachedGrantedScopes = [];
        scopesVerified = false;
        if (onAuthFailure) onAuthFailure();
      }
    } else if (cachedAccessToken !== 'smtp_active' && cachedAccessToken !== 'direct_sender') {
      cachedAccessToken = null;
      cachedAccessTokenExpiry = 0;
      cachedConnectedEmail = null;
      cachedGrantedScopes = [];
      scopesVerified = false;
      if (onAuthFailure) onAuthFailure();
    }
    notifyAuthListeners();
  });
};

function isExpectedPopupCancelError(error: any): boolean {
  const code = error?.code || '';
  return code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request';
}

function formatAuthError(error: any): string {
  const code = error?.code || '';
  if (code === 'auth/popup-blocked') {
    return 'Browser ne Google Login popup block kar diya. Popups allow karein aur dubara click karein.';
  }
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
    return 'Google Login popup complete hone se pehle close ho gaya. Dubara "Connect Gmail" click karke allow karein.';
  }
  if (code === 'auth/unauthorized-domain') {
    return 'Current domain Firebase Auth authorized domains me listed nahi hai.';
  }
  return error?.message || 'Google Workspace OAuth sign-in failed.';
}

export const googleSignIn = (
  forceConsent = true
): Promise<{ user: FirebaseUser; accessToken: string; grantedScopes?: string[] } | null> => {
  if (inFlightSignIn) {
    return inFlightSignIn;
  }

  inFlightSignIn = (async () => {
    try {
      setGlobalSigningIn(true);
      lastAuthIssueMessage = null;
      const authProvider = createGoogleProvider(forceConsent);
      const result = await signInWithPopup(auth, authProvider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (!credential?.accessToken) {
        throw new Error('Google OAuth access token nahi mila. Gmail permissions grant karke dubara try karein.');
      }

      const token = credential.accessToken;
      const inspection = await inspectGrantedScopes(token);
      if (inspection.verified) {
        const canSend = SEND_CAPABLE_SCOPES.some((s) => inspection.scopes.includes(s));
        if (!canSend) {
          cachedAccessToken = null;
          cachedAccessTokenExpiry = 0;
          cachedGrantedScopes = [];
          scopesVerified = false;
          const issue =
            'Google Sign-In hua lekin "Send email on your behalf" (gmail.send) permission grant nahi hui! Dubara Connect Gmail click karein aur Google popup me Gmail permission checkboxes (Send + Read) TICK karke Continue karein.';
          lastAuthIssueMessage = issue;
          try {
            await auth.signOut();
          } catch {
            // ignore sign-out error
          }
          setGlobalSigningIn(false);
          notifyAuthListeners();
          throw new Error(issue);
        }
        cachedGrantedScopes = inspection.scopes;
        scopesVerified = true;
      } else {
        cachedGrantedScopes = [];
        scopesVerified = false;
      }

      cachedAccessToken = token;
      cachedAccessTokenExpiry = Date.now() + 55 * 60 * 1000;
      cachedConnectedEmail = result.user.email || cachedConnectedEmail;
      lastAuthIssueMessage = null;
      setGlobalSigningIn(false);
      notifyAuthListeners();

      return { user: result.user, accessToken: cachedAccessToken, grantedScopes: cachedGrantedScopes };
    } catch (error: any) {
      setGlobalSigningIn(false);
      notifyAuthListeners();
      if (!isExpectedPopupCancelError(error)) {
        console.warn('Google sign in warning:', error?.code || error?.message || error);
      }
      if (lastAuthIssueMessage && error?.message === lastAuthIssueMessage) {
        throw error;
      }
      throw new Error(formatAuthError(error));
    } finally {
      inFlightSignIn = null;
      setGlobalSigningIn(false);
    }
  })();

  return inFlightSignIn;
};

export const getAccessToken = async (): Promise<string | null> => {
  if (cachedAccessToken && (!cachedAccessTokenExpiry || cachedAccessTokenExpiry > Date.now())) {
    return cachedAccessToken;
  }
  // Check backend Gmail status before returning null
  try {
    const res = await fetch('/api/gmail/status');
    const data = await res.json();
    if (data?.connected && data?.email) {
      cachedConnectedEmail = data.email;
      cachedAccessToken = data.mode === 'smtp_app_password' ? 'smtp_active' : 'direct_sender';
      cachedAccessTokenExpiry = Date.now() + 365 * 24 * 3600 * 1000;
      cachedGrantedScopes = [...SEND_CAPABLE_SCOPES];
      scopesVerified = true;
      notifyAuthListeners();
      return cachedAccessToken;
    }
  } catch {}
  if (cachedAccessToken) {
    cachedAccessToken = null;
    cachedAccessTokenExpiry = 0;
    cachedGrantedScopes = [];
    scopesVerified = false;
    notifyAuthListeners();
  }
  return null;
};

export const getConnectedGoogleEmail = (): string | null => {
  if (!cachedAccessToken || (cachedAccessTokenExpiry && cachedAccessTokenExpiry <= Date.now())) {
    return null;
  }
  return auth.currentUser?.email || cachedConnectedEmail || null;
};

export const ensureGmailConnected = async (): Promise<string | null> => {
  const existingToken = await getAccessToken();
  if (existingToken && hasGmailSendScope()) return existingToken;

  const res = await googleSignIn(true);
  return res ? res.accessToken : null;
};

export const connectGmailWithAppPassword = async (
  email: string,
  appPassword: string
): Promise<{ success: boolean; email?: string; error?: string }> => {
  try {
    setGlobalSigningIn(true);
    lastAuthIssueMessage = null;
    const res = await fetch('/api/gmail/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, appPassword }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Gmail connect failed');
    }
    cachedConnectedEmail = data.email;
    cachedAccessToken = data.mode === 'smtp_app_password' ? 'smtp_active' : 'direct_sender';
    cachedAccessTokenExpiry = Date.now() + 365 * 24 * 3600 * 1000;
    cachedGrantedScopes = [...SEND_CAPABLE_SCOPES];
    scopesVerified = true;
    lastAuthIssueMessage = null;
    setGlobalSigningIn(false);
    notifyAuthListeners();
    return { success: true, email: data.email };
  } catch (err: any) {
    setGlobalSigningIn(false);
    const msg = err?.message || 'Gmail connect failed';
    lastAuthIssueMessage = msg;
    notifyAuthListeners();
    return { success: false, error: msg };
  }
};

export const logoutGoogle = async () => {
  try {
    await fetch('/api/gmail/disconnect', { method: 'POST' }).catch(() => {});
    await auth.signOut();
  } catch (e) {
    console.error('Sign out error:', e);
  }
  cachedAccessToken = null;
  cachedAccessTokenExpiry = 0;
  cachedConnectedEmail = null;
  cachedGrantedScopes = [];
  scopesVerified = false;
  lastAuthIssueMessage = null;
  notifyAuthListeners();
};
