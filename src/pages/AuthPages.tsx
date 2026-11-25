import React, { useState } from 'react';
import { Zap, Mail, Lock, User, ArrowRight, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface AuthPagesProps {
  initialMode?: 'login' | 'register';
  onSuccess: () => void;
  onShowToast: (title: string, message: string, type: 'success' | 'error' | 'info') => void;
}

export const AuthPages: React.FC<AuthPagesProps> = ({ initialMode = 'login', onSuccess, onShowToast }) => {
  const { login, register } = useAuth();
  const [isLogin, setIsLogin] = useState(initialMode === 'login');

  const [email, setEmail] = useState('aabdulhafiz073@gmail.com');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('Abdul Hafiz (MaxedLogic)');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      if (isLogin) {
        await login(email, password);
        onShowToast('Signed In', `Welcome back, ${email}!`, 'success');
      } else {
        await register(fullName, email, password);
        onShowToast('Account Created', `Account registered for ${fullName}.`, 'success');
      }
      setIsLoading(false);
      onSuccess();
    } catch (err: any) {
      setIsLoading(false);
      onShowToast('Authentication Error', err.message || 'Failed to authenticate.', 'error');
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-main)',
        padding: '1.5rem',
      }}
    >
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: '440px',
          boxShadow: 'var(--shadow-xl)',
        }}
      >
        <div style={{ padding: '2rem 2rem 1rem 2rem', textAlign: 'center' }}>
          <div
            style={{
              width: 50,
              height: 50,
              borderRadius: 'var(--radius-md)',
              background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 1rem auto',
              boxShadow: '0 4px 12px rgba(37,99,235,0.3)',
            }}
          >
            <Zap size={28} />
          </div>

          <h2 style={{ fontSize: '1.5rem', fontWeight: 800 }}>LeadHunter Pro</h2>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            {isLogin ? 'Sign in to access global lead generation' : 'Create an operator account'}
          </p>
        </div>

        <div className="card-body" style={{ padding: '1rem 2rem 2rem 2rem' }}>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
            {!isLogin && (
              <div className="form-group">
                <label className="form-label">Full Name</label>
                <div style={{ position: 'relative' }}>
                  <User size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-subtle)' }} />
                  <input
                    type="text"
                    className="input-field"
                    style={{ paddingLeft: '2.25rem', width: '100%' }}
                    placeholder="e.g. John Doe"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                  />
                </div>
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Email Address</label>
              <div style={{ position: 'relative' }}>
                <Mail size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-subtle)' }} />
                <input
                  type="email"
                  className="input-field"
                  style={{ paddingLeft: '2.25rem', width: '100%' }}
                  placeholder="admin@leadhunterpro.com"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Password (BCrypt Hashed)</label>
              <div style={{ position: 'relative' }}>
                <Lock size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-subtle)' }} />
                <input
                  type="password"
                  className="input-field"
                  style={{ paddingLeft: '2.25rem', width: '100%' }}
                  placeholder="••••••••"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            <div
              style={{
                background: 'rgba(99, 102, 241, 0.08)',
                border: '1px solid #6366f1',
                borderRadius: 'var(--radius-md)',
                padding: '0.85rem 1rem',
                fontSize: '0.8rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 800, color: '#6366f1', marginBottom: '0.4rem' }}>
                <ShieldCheck size={16} />
                <span>Workspace Shortcuts (कीबोर्ड शॉर्टकट):</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', color: 'var(--text-color)' }}>
                <div>
                  <strong style={{ color: 'var(--text-muted)' }}>Operator Email:</strong>{' '}
                  <code style={{ background: 'var(--bg-muted)', padding: '2px 5px', borderRadius: '4px', fontWeight: 700 }}>
                    aabdulhafiz073@gmail.com
                  </code>
                </div>
                <div>
                  <strong style={{ color: 'var(--text-muted)' }}>Admin Panel Shortcut:</strong>{' '}
                  <kbd style={{ background: '#1e293b', color: '#f8fafc', padding: '2px 6px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 700 }}>
                    Alt + A
                  </kbd>{' '}
                  या{' '}
                  <kbd style={{ background: '#1e293b', color: '#f8fafc', padding: '2px 6px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 700 }}>
                    Ctrl + Shift + A
                  </kbd>
                </div>
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-lg"
              style={{ width: '100%', marginTop: '0.5rem' }}
              disabled={isLoading}
            >
              <span>{isLogin ? 'Sign In to Dashboard' : 'Register Operator'}</span>
              <ArrowRight size={16} />
            </button>
          </form>

          <div style={{ marginTop: '1.5rem', textAlign: 'center', fontSize: '0.85rem' }}>
            <span style={{ color: 'var(--text-muted)' }}>
              {isLogin ? "Don't have an account? " : 'Already registered? '}
            </span>
            <button
              onClick={() => setIsLogin(!isLogin)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--primary)',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {isLogin ? 'Sign Up' : 'Sign In'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
