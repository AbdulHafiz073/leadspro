import React, { useState, useMemo } from 'react';
import {
  Search,
  MapPin,
  Mail,
  Phone,
  Globe,
  MessageSquare,
  ExternalLink,
  CheckCircle2,
} from 'lucide-react';
import { Lead } from '../types';
import { useLeads } from '../context/LeadContext';
import { WhatsAppChatbot } from '../components/WhatsAppChatbot';
import { isRealDeliverableEmail } from '../utils/deliverability';

interface ChatbotPageProps {
  onOpenLeadDetail: (lead: Lead) => void;
  onNavigateToDiscovery: () => void;
  onShowToast: (title: string, message: string, type: 'success' | 'error' | 'info') => void;
}

export const ChatbotPage: React.FC<ChatbotPageProps> = ({
  onOpenLeadDetail,
  onNavigateToDiscovery,
  onShowToast,
}) => {
  const { leads } = useLeads();
  const [searchQuery, setSearchQuery] = useState('');
  const [onlyGmailOwners, setOnlyGmailOwners] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState<number | null>(() => leads[0]?.id ?? null);

  const filteredLeads = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return leads.filter((l) => {
      if (onlyGmailOwners && (!l.email || !/@(gmail|googlemail)\.com$/i.test(l.email))) {
        return false;
      }
      if (!q) return true;
      return (
        l.businessName.toLowerCase().includes(q) ||
        (l.email || '').toLowerCase().includes(q) ||
        (l.city || '').toLowerCase().includes(q) ||
        (l.countryName || '').toLowerCase().includes(q) ||
        (l.category || '').toLowerCase().includes(q)
      );
    });
  }, [leads, searchQuery, onlyGmailOwners]);

  const activeLead = useMemo(() => {
    return (
      leads.find((l) => l.id === selectedLeadId) ||
      filteredLeads[0] ||
      leads[0] ||
      null
    );
  }, [leads, filteredLeads, selectedLeadId]);

  return (
    <div style={{ padding: '1.5rem', maxWidth: '1440px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '-0.02em' }}>
            Interactive Outreach Chatbot
          </h1>
          <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
            Select options or type a message to send WhatsApp chats, Gmail proposals, and AI-drafted pitches to verified leads.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-outline btn-sm"
          onClick={onNavigateToDiscovery}
        >
          Discover More Leads
        </button>
      </div>

      <div className="chatbot-workspace-grid">
        {/* Left Column: Verified Client Directory */}
        <div
          className="card"
          style={{
            display: 'flex',
            flexDirection: 'column',
            height: '660px',
            padding: '1rem',
            gap: '0.75rem',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div style={{ position: 'relative' }}>
              <Search
                size={15}
                style={{
                  position: 'absolute',
                  left: '0.7rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-subtle)',
                }}
              />
              <input
                type="text"
                className="input"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search business, Gmail, or city..."
                style={{ paddingLeft: '2.1rem', width: '100%', fontSize: '0.84rem' }}
              />
            </div>

            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.45rem',
                fontSize: '0.78rem',
                fontWeight: 600,
                color: 'var(--text-muted)',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={onlyGmailOwners}
                onChange={(e) => setOnlyGmailOwners(e.target.checked)}
              />
              <span>Only Owner @gmail.com Leads</span>
            </label>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
            {filteredLeads.length === 0 ? (
              <div
                style={{
                  padding: '2rem 1rem',
                  textAlign: 'center',
                  color: 'var(--text-muted)',
                  fontSize: '0.84rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem',
                  alignItems: 'center',
                }}
              >
                <span>No matching verified leads found.</span>
                <button type="button" className="btn btn-primary btn-sm" onClick={onNavigateToDiscovery}>
                  Run Lead Discovery
                </button>
              </div>
            ) : (
              filteredLeads.map((lead) => {
                const isSelected = activeLead?.id === lead.id;
                const isPersonalGmail = Boolean(lead.email && /@(gmail|googlemail)\.com$/i.test(lead.email));
                const hasDeliverableEmail = Boolean(lead.email && isRealDeliverableEmail(lead.email));
                const phone = lead.whatsAppNumber || lead.phoneNumber || lead.ownerPhone;

                return (
                  <div
                    key={lead.id}
                    onClick={() => setSelectedLeadId(lead.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedLeadId(lead.id);
                      }
                    }}
                    style={{
                      padding: '0.75rem',
                      borderRadius: '10px',
                      border: isSelected ? '1px solid #00a884' : '1px solid var(--border-color)',
                      background: isSelected ? 'rgba(0, 168, 132, 0.08)' : 'var(--bg-main)',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.3rem',
                      transition: 'border-color 0.15s ease, background 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.4rem' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-main)' }}>
                        {lead.businessName}
                      </span>
                      {lead.outreachStatus && lead.outreachStatus !== 'Pending' && (
                        <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#10b981', whiteSpace: 'nowrap' }}>
                          {lead.outreachStatus}
                        </span>
                      )}
                    </div>

                    <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                      <span>{lead.category}</span>
                      <span>·</span>
                      <span>{lead.city}, {lead.countryName}</span>
                    </div>

                    <div style={{ fontSize: '0.74rem', color: hasDeliverableEmail ? 'var(--text-main)' : 'var(--text-subtle)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <Mail size={12} color={isPersonalGmail ? '#00a884' : 'currentColor'} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {lead.email || 'No email'}
                      </span>
                      {isPersonalGmail && (
                        <span style={{ color: '#00a884', fontWeight: 700, fontSize: '0.68rem', whiteSpace: 'nowrap' }}>
                          Owner Gmail
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.4rem', marginTop: '0.1rem' }}>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontVariantNumeric: 'tabular-nums' }}>
                        <Phone size={11} /> {phone || 'No phone'}
                      </span>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                        {lead.googleMapsUrl && (
                          <a
                            href={lead.googleMapsUrl}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            style={{ fontSize: '0.72rem', color: 'var(--primary)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}
                          >
                            <MapPin size={11} /> Map
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenLeadDetail(lead);
                          }}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--text-muted)',
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            textDecoration: 'underline',
                          }}
                        >
                          Details
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Full WhatsApp-Style Interactive Option Chatbot */}
        <div style={{ height: '660px', minWidth: 0 }}>
          <WhatsAppChatbot
            selectedLead={activeLead}
            onSelectLead={(lead) => setSelectedLeadId(lead.id)}
            onOpenLeadDetail={onOpenLeadDetail}
            onShowToast={onShowToast}
            mode="embedded"
          />
        </div>
      </div>
    </div>
  );
};
