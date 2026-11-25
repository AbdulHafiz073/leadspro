import React from 'react';
import {
  Globe2,
  Moon,
  Sun,
  Menu,
  Zap,
  Bell,
  LogOut,
  ChevronDown,
  ShieldCheck,
  Keyboard,
} from 'lucide-react';
import { useLeads } from '../context/LeadContext';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { GoogleConnectButton } from './GoogleConnectButton';
import { WhatsAppConnectButton } from './WhatsAppConnectButton';

interface TopNavProps {
  onToggleMobileMenu: () => void;
  onOpenQuickFetch?: () => void;
  onNavigateToAdmin?: () => void;
  onOpenShortcuts?: () => void;
}

export const TopNav: React.FC<TopNavProps> = ({
  onToggleMobileMenu,
  onOpenQuickFetch,
  onNavigateToAdmin,
  onOpenShortcuts,
}) => {
  const { countries, selectedCountryId, setSelectedCountryId } = useLeads();
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useAuth();

  return (
    <header className="topbar">
      <div className="topbar-left">
        <button
          className="icon-btn menu-toggle-btn"
          onClick={onToggleMobileMenu}
          aria-label="Toggle menu"
        >
          <Menu size={18} />
        </button>

        {/* Global Country Selector with high contrast colors */}
        <div className="country-selector-wrap" title="Filter leads by country globally">
          <Globe2 size={16} color="var(--primary)" />
          <select
            value={selectedCountryId}
            onChange={(e) => {
              const val = e.target.value;
              setSelectedCountryId(val === 'all' ? 'all' : Number(val));
            }}
            aria-label="Filter leads by country globally"
            style={{
              backgroundColor: 'transparent',
              color: 'var(--text-main)',
              fontWeight: 600,
              border: 'none',
              outline: 'none',
              cursor: 'pointer',
            }}
          >
            <option
              value="all"
              style={{
                backgroundColor: theme === 'dark' ? '#1e293b' : '#ffffff',
                color: theme === 'dark' ? '#f8fafc' : '#0f172a',
                fontWeight: 600,
              }}
            >
              🌍 All Countries (Global)
            </option>
            {countries.map((country) => (
              <option
                key={country.id}
                value={country.id}
                style={{
                  backgroundColor: theme === 'dark' ? '#1e293b' : '#ffffff',
                  color: theme === 'dark' ? '#f8fafc' : '#0f172a',
                }}
              >
                {country.flag} {country.name} ({country.code})
              </option>
            ))}
          </select>
          <ChevronDown size={14} color="var(--text-subtle)" />
        </div>
      </div>

      <div className="topbar-right">
        <GoogleConnectButton compact />
        <WhatsAppConnectButton compact />

        {onNavigateToAdmin && (
          <button
            className="btn btn-sm"
            onClick={onNavigateToAdmin}
            title="Open Admin Panel & Pitches (Shortcut: Alt + A)"
            style={{
              background: 'rgba(99, 102, 241, 0.1)',
              borderColor: '#6366f1',
              color: '#6366f1',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
            }}
          >
            <ShieldCheck size={14} />
            <span className="topbar-hide-mobile">Admin Panel</span>
            <span
              className="topbar-hide-tablet"
              style={{
                background: '#6366f1',
                color: '#fff',
                padding: '1px 5px',
                borderRadius: '4px',
                fontSize: '0.65rem',
                fontFamily: 'monospace',
                fontWeight: 700,
              }}
            >
              Alt+A
            </span>
          </button>
        )}

        {onOpenShortcuts && (
          <button
            className="icon-btn topbar-hide-mobile"
            onClick={onOpenShortcuts}
            title="Keyboard Shortcuts Guide (Press ?)"
            aria-label="Keyboard Shortcuts"
          >
            <Keyboard size={16} />
          </button>
        )}

        {onOpenQuickFetch && (
          <button
            className="btn btn-primary btn-sm topbar-hide-mobile"
            onClick={onOpenQuickFetch}
            title="Open Lead Discovery Scanner"
          >
            <Zap size={14} />
            <span>Run Fetch Now</span>
          </button>
        )}

        <button
          className="icon-btn"
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
        </button>

        <div className="user-profile-btn" title={`Signed in as ${user?.email}`}>
          <div className="user-avatar">
            {user?.fullName ? user.fullName.slice(0, 1).toUpperCase() : 'U'}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'left' }}>
            <span className="user-name-text">{user?.fullName || 'Architect'}</span>
            <span className="user-role-badge">{user?.role || 'Admin'}</span>
          </div>
          <button
            onClick={logout}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-subtle)',
              padding: '2px 4px',
              marginLeft: '4px',
            }}
            title="Sign out"
          >
            <LogOut size={14} />
          </button>
        </div>
      </div>
    </header>
  );
};
