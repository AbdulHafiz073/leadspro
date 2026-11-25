import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { LeadProvider, useLeads } from './context/LeadContext';
import { OutreachProvider } from './context/OutreachContext';
import { FetchProvider, useFetch } from './context/FetchContext';
import { Sidebar } from './components/Sidebar';
import { TopNav } from './components/TopNav';
import { ToastContainer, ToastMessage, Modal } from './components/ModalAndToast';
import { DashboardPage } from './pages/DashboardPage';
import { AdminPipelinePage } from './pages/AdminPipelinePage';
import { GoogleNeedsScannerPage } from './pages/GoogleNeedsScannerPage';
import { LeadsPage } from './pages/LeadsPage';
import { LeadDetailPage } from './pages/LeadDetailPage';
import { OutreachPage } from './pages/OutreachPage';
import { SentEmailsPage } from './pages/SentEmailsPage';
import { TemplatesPage } from './pages/TemplatesPage';
import { FetchLogsPage } from './pages/FetchLogsPage';
import { SettingsPage } from './pages/SettingsPage';
import { ChatbotPage } from './pages/ChatbotPage';
import { ClientChatbotPortal } from './pages/ClientChatbotPortal';
import { WhatsAppChatbot } from './components/WhatsAppChatbot';
import { AuthPages } from './pages/AuthPages';
import { Lead } from './types';
import { PipelineTab } from './pages/AdminPipelinePage';
import { Zap, MessageSquare } from 'lucide-react';

const AppContent: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const [currentTab, setCurrentTab] = useState<string>('dashboard');
  const [adminInitialTab, setAdminInitialTab] = useState<PipelineTab>('scanned');
  const [selectedLeadForDetail, setSelectedLeadForDetail] = useState<Lead | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [isQuickFetchModalOpen, setIsQuickFetchModalOpen] = useState(false);
  const [isShortcutsModalOpen, setIsShortcutsModalOpen] = useState(false);
  const [isFloatingChatOpen, setIsFloatingChatOpen] = useState(false);

  const { runDailyLeadFetchJob, isRunningJob } = useFetch();

  // Keyboard Shortcuts (Alt + A for Admin Panel, etc.)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return;
      }

      if (
        (e.altKey && (e.key === 'a' || e.key === 'A')) ||
        (e.ctrlKey && e.shiftKey && (e.key === 'a' || e.key === 'A'))
      ) {
        e.preventDefault();
        setCurrentTab('admin-pipeline');
        showToast('CRM Pipeline Opened', 'Opened CRM Pipeline via shortcut (Alt + A)', 'info');
      }

      if (e.altKey && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        setCurrentTab('dashboard');
      }

      if (e.altKey && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        setCurrentTab('google-scanner');
      }

      if (e.altKey && (e.key === 'l' || e.key === 'L')) {
        e.preventDefault();
        setCurrentTab('leads');
      }

      if (e.altKey && (e.key === 'o' || e.key === 'O')) {
        e.preventDefault();
        setCurrentTab('outreach');
      }

      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault();
        setIsShortcutsModalOpen((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const showToast = (title: string, message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Date.now().toString() + Math.random().toString();
    setToasts((prev) => [...prev, { id, title, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  };

  const handleDismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  if (!isAuthenticated) {
    return (
      <>
        <AuthPages onSuccess={() => setCurrentTab('dashboard')} onShowToast={showToast} />
        <ToastContainer toasts={toasts} onDismiss={handleDismissToast} />
      </>
    );
  }

  const handleOpenLeadDetail = (lead: Lead) => {
    setSelectedLeadForDetail(lead);
    setCurrentTab('lead-detail');
  };

  const handleLaunchOutreachForLead = () => {
    setCurrentTab('outreach');
  };

  const handleTriggerQuickFetch = async () => {
    setIsQuickFetchModalOpen(false);
    setCurrentTab('google-scanner');
  };

  return (
    <div className="app-container">
      <Sidebar
        currentTab={currentTab}
        onNavigate={(tab) => {
          if (tab === 'gmail-replies') {
            setCurrentTab('admin-pipeline');
            setAdminInitialTab('gmailReplies');
          } else {
            setCurrentTab(tab);
            if (tab === 'admin-pipeline') {
              setAdminInitialTab('scanned');
            }
          }
          setIsMobileMenuOpen(false);
        }}
        isOpenMobile={isMobileMenuOpen}
        onCloseMobile={() => setIsMobileMenuOpen(false)}
      />

      <div className="main-wrapper">
        <TopNav
          onToggleMobileMenu={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          onOpenQuickFetch={() => setCurrentTab('google-scanner')}
          onNavigateToAdmin={() => {
            setCurrentTab('admin-pipeline');
            setAdminInitialTab('scanned');
          }}
          onOpenShortcuts={() => setIsShortcutsModalOpen(true)}
        />

        <main>
          {currentTab === 'dashboard' && (
            <DashboardPage
              onNavigate={(tab) => setCurrentTab(tab)}
              onOpenQuickFetch={() => setCurrentTab('google-scanner')}
            />
          )}

          {currentTab === 'admin-pipeline' && (
            <AdminPipelinePage
              initialTab={adminInitialTab}
              onNavigateToScanner={() => setCurrentTab('google-scanner')}
              onNavigateToLeads={() => setCurrentTab('leads')}
              onOpenLeadDetail={handleOpenLeadDetail}
              onShowToast={showToast}
            />
          )}

          {currentTab === 'google-scanner' && (
            <GoogleNeedsScannerPage
              onNavigateToLeads={() => setCurrentTab('leads')}
              onNavigateToOutreach={() => setCurrentTab('outreach')}
              onNavigateToAdminPipeline={() => setCurrentTab('admin-pipeline')}
              onOpenLeadDetail={handleOpenLeadDetail}
              onShowToast={showToast}
            />
          )}

          {(currentTab === 'leads' ||
            currentTab === 'website-leads' ||
            currentTab === 'app-leads' ||
            currentTab === 'game-leads' ||
            currentTab === 'software-leads' ||
            currentTab === 'location-search' ||
            currentTab === 'verified-leads') && (
            <LeadsPage
              viewMode={
                currentTab === 'website-leads'
                  ? 'website'
                  : currentTab === 'app-leads'
                  ? 'app'
                  : currentTab === 'game-leads'
                  ? 'game'
                  : currentTab === 'software-leads'
                  ? 'software'
                  : currentTab === 'location-search'
                  ? 'location'
                  : currentTab === 'verified-leads'
                  ? 'verified'
                  : 'all'
              }
              onNavigateToOutreach={() => setCurrentTab('outreach')}
              onNavigateToDiscovery={() => setCurrentTab('google-scanner')}
              onOpenLeadDetail={handleOpenLeadDetail}
              onShowToast={showToast}
            />
          )}

          {currentTab === 'lead-detail' && selectedLeadForDetail && (
            <LeadDetailPage
              lead={selectedLeadForDetail}
              onBack={() => setCurrentTab('leads')}
              onLaunchOutreachForLead={handleLaunchOutreachForLead}
              onShowToast={showToast}
            />
          )}

          {currentTab === 'outreach' && (
            <OutreachPage
              onNavigateToLeads={() => setCurrentTab('leads')}
              onNavigateToSentEmails={() => setCurrentTab('sent-emails')}
              onShowToast={showToast}
            />
          )}

          {currentTab === 'sent-emails' && <SentEmailsPage onShowToast={showToast} />}

          {currentTab === 'templates' && <TemplatesPage onShowToast={showToast} />}

          {currentTab === 'fetch-logs' && <FetchLogsPage onShowToast={showToast} />}

          {currentTab === 'chatbot' && (
            <ChatbotPage
              onOpenLeadDetail={handleOpenLeadDetail}
              onNavigateToDiscovery={() => setCurrentTab('google-scanner')}
              onShowToast={showToast}
            />
          )}

          {currentTab === 'settings' && <SettingsPage onShowToast={showToast} />}
        </main>
      </div>

      {/* Floating WhatsApp-Style Interactive Option Chatbot (accessible from any screen) */}
      {currentTab !== 'chatbot' && (
        <div
          style={{
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            zIndex: 60,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            gap: '0.65rem',
          }}
        >
          {isFloatingChatOpen ? (
            <div style={{ width: 'min(390px, calc(100vw - 24px))' }}>
              <WhatsAppChatbot
                selectedLead={selectedLeadForDetail}
                onOpenLeadDetail={(lead) => {
                  setIsFloatingChatOpen(false);
                  handleOpenLeadDetail(lead);
                }}
                onShowToast={showToast}
                mode="floating"
                onCloseFloating={() => setIsFloatingChatOpen(false)}
                onExpandToFullPage={() => {
                  setIsFloatingChatOpen(false);
                  setCurrentTab('chatbot');
                }}
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setIsFloatingChatOpen(true)}
              aria-label="Open Interactive Chatbot"
              title="Open WhatsApp-style Interactive Chatbot"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                backgroundColor: '#00a884',
                color: '#0b141a',
                border: 'none',
                borderRadius: '9999px',
                padding: '0.75rem 1.15rem',
                fontWeight: 800,
                fontSize: '0.88rem',
                cursor: 'pointer',
                boxShadow: '0 8px 24px rgba(0, 168, 132, 0.38)',
                transition: 'transform 0.15s ease',
              }}
            >
              <MessageSquare size={18} />
              <span>Chat Bot</span>
            </button>
          )}
        </div>
      )}

      {/* Quick Fetch Modal */}
      <Modal
        isOpen={isQuickFetchModalOpen}
        onClose={() => setIsQuickFetchModalOpen(false)}
        title="Launch Lead Discovery & Verification Engine"
        footer={
          <>
            <button className="btn btn-outline" onClick={() => setIsQuickFetchModalOpen(false)}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={handleTriggerQuickFetch}
              disabled={isRunningJob}
            >
              <Zap size={15} />
              <span>{isRunningJob ? 'Opening...' : 'Open Discovery Scanner'}</span>
            </button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', fontSize: '0.875rem' }}>
          <p>
            Launches the <strong>High-Intent Lead Discovery Engine</strong> on the Node.js + SQLite verification pipeline.
          </p>
          <div style={{ background: 'var(--bg-muted)', padding: '0.85rem', borderRadius: 'var(--radius-md)' }}>
            <ul style={{ paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <li>Searches public RFPs, developer hiring boards, and SME registries</li>
              <li>Verifies real business emails (DNS MX) and country-matched phone numbers</li>
              <li>Prevents duplicates against previously saved SQLite records</li>
              <li>Computes 6-factor Buying Intent Score (0–100) with live HTTP website checks</li>
            </ul>
          </div>
        </div>
      </Modal>

      {/* Shortcuts & Session Modal */}
      <Modal
        isOpen={isShortcutsModalOpen}
        onClose={() => setIsShortcutsModalOpen(false)}
        title="Active Admin Session & Keyboard Shortcuts"
        footer={
          <button className="btn btn-primary" onClick={() => setIsShortcutsModalOpen(false)}>
            Close (बंद करें)
          </button>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', fontSize: '0.875rem' }}>
          <div style={{ background: 'var(--bg-muted)', padding: '0.85rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
            <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem', fontWeight: 800, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              🔑 Active Workspace Profile
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <div>
                <strong>Account Email:</strong>{' '}
                <code style={{ background: 'var(--bg-surface)', padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--border-color)', color: 'var(--primary)', fontWeight: 700 }}>
                  aabdulhafiz073@gmail.com
                </code>
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--secondary)', marginTop: '0.2rem', fontWeight: 600 }}>
                ✓ सक्रिय एडमिन प्रोफ़ाइल: Abdul Hafiz | MaxedLogic (+91 97597 25212)
              </div>
            </div>
          </div>

          <div>
            <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              ⚡ Keyboard Shortcuts (शॉर्टकट कीज़)
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', background: 'rgba(99, 102, 241, 0.08)', borderRadius: '6px', border: '1px solid rgba(99, 102, 241, 0.2)' }}>
                <span style={{ fontWeight: 700, color: '#6366f1' }}>Open Admin Panel (एडमिन पैनल खोलें)</span>
                <kbd style={{ background: '#6366f1', color: '#fff', padding: '2px 8px', borderRadius: '4px', fontWeight: 800, fontFamily: 'monospace' }}>
                  Alt + A
                </kbd>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.4rem 0.75rem', background: 'var(--bg-muted)', borderRadius: '6px' }}>
                <span>Open Dashboard (मुख्य डैशबोर्ड)</span>
                <kbd style={{ background: 'var(--bg-surface)', padding: '2px 8px', borderRadius: '4px', fontWeight: 700, fontFamily: 'monospace' }}>
                  Alt + D
                </kbd>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.4rem 0.75rem', background: 'var(--bg-muted)', borderRadius: '6px' }}>
                <span>Launch Google Scanner (गूगल स्कैनर)</span>
                <kbd style={{ background: 'var(--bg-surface)', padding: '2px 8px', borderRadius: '4px', fontWeight: 700, fontFamily: 'monospace' }}>
                  Alt + S
                </kbd>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.4rem 0.75rem', background: 'var(--bg-muted)', borderRadius: '6px' }}>
                <span>Open Leads Directory (लीड्स डायरेक्टरी)</span>
                <kbd style={{ background: 'var(--bg-surface)', padding: '2px 8px', borderRadius: '4px', fontWeight: 700, fontFamily: 'monospace' }}>
                  Alt + L
                </kbd>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.4rem 0.75rem', background: 'var(--bg-muted)', borderRadius: '6px' }}>
                <span>Open Outreach Hub (आउटरीच)</span>
                <kbd style={{ background: 'var(--bg-surface)', padding: '2px 8px', borderRadius: '4px', fontWeight: 700, fontFamily: 'monospace' }}>
                  Alt + O
                </kbd>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.4rem 0.75rem', background: 'var(--bg-muted)', borderRadius: '6px' }}>
                <span>Show Shortcuts Help (यह मदद विंडो)</span>
                <kbd style={{ background: 'var(--bg-surface)', padding: '2px 8px', borderRadius: '4px', fontWeight: 700, fontFamily: 'monospace' }}>
                  ?
                </kbd>
              </div>
            </div>
          </div>
        </div>
      </Modal>

      <ToastContainer toasts={toasts} onDismiss={handleDismissToast} />
    </div>
  );
};

export default function App() {
  const isClientChatbotRoute =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('clientChat') === '1';

  if (isClientChatbotRoute) {
    return (
      <ThemeProvider>
        <ClientChatbotPortal />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <AuthProvider>
        <LeadProvider>
          <OutreachProvider>
            <FetchProvider>
              <AppContent />
            </FetchProvider>
          </OutreachProvider>
        </LeadProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
