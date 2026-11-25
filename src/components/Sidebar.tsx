import React from 'react';
import {
  LayoutDashboard,
  Users,
  Send,
  FileCode2,
  Clock,
  Settings,
  Sparkles,
  Zap,
  ShieldCheck,
  Mail,
  Globe,
  Smartphone,
  Gamepad2,
  MapPin,
  CheckCircle2,
  MailCheck,
  MessageSquare,
  Code2,
  X,
} from 'lucide-react';
import { useLeads } from '../context/LeadContext';

interface SidebarProps {
  currentTab: string;
  onNavigate: (tab: string) => void;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onNavigate,
  isOpenMobile,
  onCloseMobile,
}) => {
  const { selectedLeadIds, leads, metrics, gmailReplies } = useLeads();
  const selectedCount = selectedLeadIds.size;

  const websiteCount = leads.filter((l) => !l.primaryGroup || l.primaryGroup === 'Website').length;
  const appCount = leads.filter((l) => l.primaryGroup === 'App').length;
  const gameCount = leads.filter((l) => l.primaryGroup === 'Game').length;
  const softwareCount = leads.filter((l) => l.primaryGroup === 'Software').length;
  const verifiedCount = leads.filter((l) => l.qualityTier === '100% Verified' || l.emailVerificationStatus === 'Publicly Listed + MX Verified').length;

  const discoveryNav = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    {
      id: 'google-scanner',
      label: 'Lead Discovery',
      icon: Sparkles,
      badge: 'LIVE AI',
      badgeColor: '#10b981',
    },
    {
      id: 'location-search',
      label: 'Location-Based Search',
      icon: MapPin,
    },
  ];

  const categoriesNav = [
    {
      id: 'website-leads',
      label: 'Website Leads',
      icon: Globe,
      badge: websiteCount > 0 ? `${websiteCount}` : undefined,
    },
    {
      id: 'app-leads',
      label: 'App Leads',
      icon: Smartphone,
      badge: appCount > 0 ? `${appCount}` : undefined,
    },
    {
      id: 'game-leads',
      label: 'Game Leads',
      icon: Gamepad2,
      badge: gameCount > 0 ? `${gameCount}` : undefined,
    },
    {
      id: 'software-leads',
      label: 'Software & MLM / AI',
      icon: Code2,
      badge: softwareCount > 0 ? `${softwareCount}` : undefined,
    },
    {
      id: 'verified-leads',
      label: 'Verified Leads',
      icon: CheckCircle2,
      badge: verifiedCount > 0 ? `${verifiedCount}` : undefined,
      badgeColor: '#10b981',
    },
    {
      id: 'leads',
      label: 'All Leads Directory',
      icon: Users,
      badge: leads.length > 0 ? `${leads.length}` : undefined,
    },
  ];

  const outreachNav = [
    {
      id: 'admin-pipeline',
      label: 'CRM Pipeline',
      icon: ShieldCheck,
      badgeColor: '#6366f1',
    },
    {
      id: 'outreach',
      label: 'Email Campaigns',
      icon: Send,
      badge: selectedCount > 0 ? `${selectedCount} sel` : metrics.pendingEmails > 0 ? `${metrics.pendingEmails}` : undefined,
      badgeColor: 'var(--primary)',
    },
    {
      id: 'chatbot',
      label: 'Interactive Chatbot',
      icon: MessageSquare,
      badge: 'CHAT',
      badgeColor: '#00a884',
    },
    {
      id: 'sent-emails',
      label: 'Sent Emails & Approvals',
      icon: MailCheck,
      badge: metrics.emailsSent > 0 ? `${metrics.emailsSent}` : undefined,
      badgeColor: '#2563eb',
    },
    {
      id: 'gmail-replies',
      label: 'Gmail Reply Tracker',
      icon: Mail,
      badge: gmailReplies.length > 0 ? `${gmailReplies.length}` : undefined,
      badgeColor: '#06b6d4',
    },
    { id: 'templates', label: 'Outreach Templates', icon: FileCode2 },
    { id: 'fetch-logs', label: 'Lead History', icon: Clock },
    { id: 'settings', label: 'Admin Settings', icon: Settings },
  ];

  const renderSection = (title: string, items: Array<{ id: string; label: string; icon: any; badge?: string; badgeColor?: string }>) => (
    <>
      <div className="nav-section-title" style={{ marginTop: title === 'Overview & Discovery' ? '0' : '0.9rem' }}>
        {title}
      </div>
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = currentTab === item.id;
        return (
          <button
            key={item.id}
            className={`nav-item ${isActive ? 'active' : ''}`}
            onClick={() => {
              onNavigate(item.id);
              if (onCloseMobile) onCloseMobile();
            }}
          >
            <div className="nav-item-content">
              <Icon size={17} />
              <span>{item.label}</span>
            </div>
            {item.badge && (
              <span
                className="nav-counter"
                style={item.badgeColor ? { backgroundColor: item.badgeColor } : undefined}
              >
                {item.badge}
              </span>
            )}
          </button>
        );
      })}
    </>
  );

  return (
    <>
      <div
        className={`sidebar-backdrop ${isOpenMobile ? 'active' : ''}`}
        onClick={onCloseMobile}
        aria-hidden={!isOpenMobile}
      />

      <aside className={`sidebar ${isOpenMobile ? 'mobile-open' : ''}`}>
        <div className="sidebar-header">
          <div className="logo-badge">
            <Zap size={22} />
          </div>
          <div className="logo-text">
            <h1>
              LeadHunter <span className="logo-badge-tag">PRO</span>
            </h1>
            <p>Verified Lead & Gmail Engine</p>
          </div>
          <button className="sidebar-close-btn" onClick={onCloseMobile} aria-label="Close menu">
            <X size={20} />
          </button>
        </div>

        <nav className="sidebar-nav">
          {renderSection('Overview & Discovery', discoveryNav)}
          {renderSection('Lead Categories', categoriesNav)}
          {renderSection('CRM & Outreach', outreachNav)}
        </nav>

        <div className="sidebar-footer">
          <div className="cron-status-card">
            <div className="cron-status-dot" />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#f8fafc' }}>
                SQLite + Live Search Active
              </div>
              <div style={{ fontSize: '0.675rem', color: '#94a3b8' }}>
                {metrics.duplicateLeadsPrevented} duplicates prevented
              </div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};
