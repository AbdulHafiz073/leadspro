import React, { useState } from 'react';
import {
  ArrowLeft,
  Building2,
  MapPin,
  Phone,
  Mail,
  MessageSquare,
  Globe,
  Star,
  Calendar,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Send,
  ExternalLink,
  ShieldCheck,
  Sparkles
} from 'lucide-react';
import { Lead } from '../types';
import { WebsiteStatusBadge, LeadScoreBadge } from '../components/Badges';
import { useOutreach } from '../context/OutreachContext';
import { useLeads } from '../context/LeadContext';

interface LeadDetailPageProps {
  lead: Lead;
  onBack: () => void;
  onLaunchOutreachForLead: (lead: Lead) => void;
  onShowToast: (title: string, message: string, type: 'success' | 'error' | 'info') => void;
}

export const LeadDetailPage: React.FC<LeadDetailPageProps> = ({
  lead,
  onBack,
  onLaunchOutreachForLead,
  onShowToast,
}) => {
  const { logs } = useOutreach();
  const { updateWebsiteStatus } = useLeads();

  // Find logs related to this lead
  const leadLogs = logs.filter((l) => l.leadId === lead.id);

  // Score factor breakdown
  const hasNoWebsite = !lead.hasWebsite || lead.websiteStatus === 'NoWebsite';
  const hasPhone = !!(lead.phoneNumber && lead.phoneNumber.trim().length > 0);
  const hasEmail = !!(lead.email && lead.email.trim().length > 0);
  const hasHighRating = lead.rating >= 4.0;
  const hasHighReviews = lead.reviewCount >= 10;
  const hasAddress = !!(lead.address && lead.city && (lead.postalCode || lead.state));

  return (
    <div className="page-content">
      {/* Back button */}
      <div>
        <button className="btn btn-ghost btn-sm" onClick={onBack}>
          <ArrowLeft size={16} /> Back to Leads Directory
        </button>
      </div>

      {/* Header Profile Card */}
      <div className="card">
        <div className="card-body" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1.5rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 800 }}>{lead.businessName}</h2>
              <WebsiteStatusBadge status={lead.websiteStatus} url={lead.websiteUrl} />
              <span className="badge badge-primary">{lead.category}</span>
              {(() => {
                const need =
                  lead.buyerNeedType ||
                  (!lead.hasWebsite || lead.websiteStatus === 'NoWebsite'
                    ? 'New Create'
                    : lead.buyingIntentLevel === 'HIGH INTENT' && Boolean(lead.requirementPostingUrl)
                    ? 'Buy'
                    : 'Update');
                const cls = need === 'Buy' ? 'badge-primary' : need === 'New Create' ? 'badge-danger' : 'badge-warning';
                const label =
                  need === 'Buy'
                    ? '🔵 Buy Software / RFP Requirement'
                    : need === 'New Create'
                    ? '🔴 New Create (नई वेबसाइट / ऐप बनवानी है)'
                    : '🟠 Update (पुरानी वेबसाइट अपडेट करानी है)';
                return (
                  <span className={`badge ${cls}`} style={{ fontWeight: 700 }}>
                    {label}
                  </span>
                );
              })()}
            </div>

            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <MapPin size={14} color="#dc2626" />
              <span>{lead.address}, {lead.city}, {lead.state} {lead.postalCode} • {lead.countryName} ({lead.countryCode})</span>
              <a
                href={lead.googleMapsUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lead.businessName} ${lead.address || ''} ${lead.city}`)}`}
                target="_blank"
                rel="noreferrer"
                style={{ color: '#2563eb', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.25rem', marginLeft: '0.5rem', textDecoration: 'none', background: '#eff6ff', padding: '0.2rem 0.5rem', borderRadius: '4px', border: '1px solid #bfdbfe', fontSize: '0.75rem' }}
              >
                <span>📍 Verify on Google Maps</span>
                <ExternalLink size={12} />
              </a>
            </p>

            <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', marginTop: '0.75rem', fontSize: '0.85rem' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#f59e0b', fontWeight: 700 }}>
                <Star size={14} fill="#f59e0b" />
                {lead.rating} rating ({lead.reviewCount} Google reviews)
              </span>
              <span style={{ color: 'var(--text-subtle)' }}>•</span>
              <span style={{ color: 'var(--text-muted)' }}>
                Found On: <strong style={{ color: '#2563eb' }}>{lead.sourcePlatform || lead.source}</strong>
              </span>
              {lead.googlePlaceId && (
                <>
                  <span style={{ color: 'var(--text-subtle)' }}>•</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-subtle)' }}>
                    ID: {lead.googlePlaceId.slice(0, 14)}...
                  </span>
                </>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>Lead Score:</span>
              <LeadScoreBadge score={lead.leadScore} />
            </div>

            <button
              className="btn btn-primary"
              onClick={() => onLaunchOutreachForLead(lead)}
            >
              <Send size={15} />
              <span>Launch Outreach</span>
            </button>
          </div>
        </div>
      </div>

      {/* Complete 26-Field High-Intent Buyer & Project Dossier */}
      <div className="card" style={{ borderLeft: '4px solid var(--primary)', background: 'var(--card-bg)' }}>
        <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Sparkles size={18} color="var(--primary)" />
            <h3 className="card-title">Verified High-Intent Buyer & Project Dossier (26 Fields)</h3>
          </div>
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            {lead.buyingIntentLevel && (
              <span className={`badge ${lead.buyingIntentLevel === 'HIGH INTENT' ? 'badge-danger' : 'badge-warning'}`} style={{ fontWeight: 700 }}>
                {lead.buyingIntentLevel}
              </span>
            )}
            {lead.priorityTier && (
              <span className="badge badge-primary" style={{ fontWeight: 700 }}>
                {lead.priorityTier}
              </span>
            )}
            <span className="badge badge-secondary" style={{ fontWeight: 700 }}>
              {lead.leadVerificationBadge || lead.qualityTier || 'PARTIALLY VERIFIED'}
            </span>
          </div>
        </div>

        <div className="card-body" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem', fontSize: '0.82rem' }}>
          <div style={{ padding: '0.85rem', background: 'var(--bg-muted)', borderRadius: 'var(--radius-sm)', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <strong style={{ color: 'var(--primary)', fontSize: '0.78rem', textTransform: 'uppercase' }}>Buyer Identity & Location</strong>
            <div><strong>1. Company:</strong> {lead.businessName}</div>
            <div><strong>2. Contact Person:</strong> {lead.contactPerson || 'Not publicly available'}</div>
            <div><strong>3. Designation:</strong> {lead.designation || 'Not publicly available'}</div>
            <div><strong>10. Country:</strong> {lead.countryName || 'Not publicly available'}</div>
            <div><strong>11. State / Region:</strong> {lead.state || lead.region || 'Not publicly available'}</div>
            <div><strong>12. City:</strong> {lead.city || 'Not publicly available'}</div>
          </div>

          <div style={{ padding: '0.85rem', background: 'var(--bg-muted)', borderRadius: 'var(--radius-sm)', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <strong style={{ color: 'var(--primary)', fontSize: '0.78rem', textTransform: 'uppercase' }}>Project Scope & Budget</strong>
            <div><strong>13. Required IT Service:</strong> {lead.serviceRequired || 'Not publicly available'}</div>
            <div><strong>14. Exact Project Requirement:</strong> {lead.exactProjectRequirement || lead.evidenceSummary || 'Not publicly available'}</div>
            <div>
              <strong>15. Buyer Need / Project Type:</strong>{' '}
              <span className="badge badge-secondary" style={{ fontWeight: 700, marginRight: '0.35rem' }}>
                {lead.buyerNeedType ||
                  (!lead.hasWebsite || lead.websiteStatus === 'NoWebsite'
                    ? 'New Create'
                    : lead.buyingIntentLevel === 'HIGH INTENT' && Boolean(lead.requirementPostingUrl)
                    ? 'Buy'
                    : 'Update')}
              </span>
              ({lead.projectType || 'New Development'})
            </div>
            <div><strong>16. Budget:</strong> {lead.projectBudget || 'Not publicly available'} ({lead.budgetConfidence || 'Unknown Budget'})</div>
            <div><strong>17. Currency:</strong> {lead.budgetCurrency || 'Not publicly available'}</div>
            <div><strong>18. Timeline:</strong> {lead.projectTimeline || 'Not publicly available'}</div>
          </div>

          <div style={{ padding: '0.85rem', background: 'var(--bg-muted)', borderRadius: 'var(--radius-sm)', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <strong style={{ color: 'var(--primary)', fontSize: '0.78rem', textTransform: 'uppercase' }}>Buying Signal & Source Audit</strong>
            <div><strong>19. Buying Intent Level:</strong> {lead.buyingIntentLevel || 'Unclassified'}</div>
            <div><strong>20. Buying Signal Reason:</strong> {lead.buyingSignalReason || lead.evidenceSummary || 'Not publicly available'}</div>
            <div><strong>21. Discovered On Platform:</strong> <strong style={{ color: '#2563eb' }}>{lead.sourcePlatform || lead.source}</strong></div>
            <div>
              <strong>22. Direct Origin URL:</strong>{' '}
              {(lead.directSourceUrl || lead.requirementPostingUrl) ? (
                <a href={lead.directSourceUrl || lead.requirementPostingUrl || '#'} target="_blank" rel="noreferrer" style={{ color: 'var(--primary)' }}>
                  Open Origin ({lead.sourcePlatform || lead.source}) <ExternalLink size={11} />
                </a>
              ) : 'Not publicly available'}
            </div>
            <div>
              <strong>23. Requirement Posting URL:</strong>{' '}
              {lead.requirementPostingUrl ? (
                <a href={lead.requirementPostingUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--primary)' }}>
                  Open RFP / Brief <ExternalLink size={11} />
                </a>
              ) : 'Not publicly available'}
            </div>
            <div><strong>24. Posting Date:</strong> {lead.postingDate || 'Unknown'}</div>
            <div><strong>25. Last Verification Date:</strong> {lead.lastVerificationDate || (lead.lastCheckedAt || '').slice(0, 10) || 'Unknown'}</div>
            <div><strong>26. Verification Status:</strong> {lead.leadVerificationBadge || lead.qualityTier || 'PARTIALLY VERIFIED'}</div>
          </div>
        </div>

        {lead.websiteSignals && (
          <div style={{ margin: '0 1.25rem 1.25rem', padding: '0.75rem', background: 'var(--bg-muted)', borderRadius: 'var(--radius-sm)', fontSize: '0.78rem', display: 'flex', gap: '1.25rem', flexWrap: 'wrap' }}>
            <strong>Live HTTP Inspection:</strong>
            <span>HTTP Status: <strong>{lead.websiteSignals.httpStatus ?? 'N/A'}</strong></span>
            <span>Response: <strong>{lead.websiteSignals.loadTimeMs ?? '-'}ms</strong></span>
            <span>HTTPS/SSL: <strong>{lead.websiteSignals.hasSsl ? 'Yes' : 'No'}</strong></span>
            <span>Mobile Viewport: <strong>{lead.websiteSignals.hasViewportMeta ? 'Yes' : 'Missing'}</strong></span>
            {lead.mxHost && <span>MX Host: <code>{lead.mxHost}</code></span>}
          </div>
        )}
      </div>

      {/* Grid: All Contact Channels (incl. LinkedIn) + 6-Factor 100-Point Buyer Scoring Audit */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '1.5rem' }}>
        {/* Contact info card */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Verified Contact Channels & LinkedIn Profiles</h3>
          </div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.6rem 0.85rem', background: 'var(--bg-muted)', borderRadius: 'var(--radius-md)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <Globe size={16} color="var(--primary)" />
                <div>
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>4. Official Website</div>
                  <div style={{ fontWeight: 600, fontSize: '0.86rem' }}>{lead.websiteUrl || 'Not publicly available'}</div>
                </div>
              </div>
              {lead.websiteUrl && (
                <a href={lead.websiteUrl} target="_blank" rel="noreferrer" className="btn btn-outline btn-sm">
                  <ExternalLink size={13} />
                </a>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.6rem 0.85rem', background: 'var(--bg-muted)', borderRadius: 'var(--radius-md)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <Mail size={16} color="#3b82f6" />
                <div>
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>5. Business / Personal Email ({lead.emailVerificationStatus || 'Unverified'})</div>
                  <div style={{ fontWeight: 600, fontSize: '0.86rem' }}>{lead.email || 'Not publicly available'}</div>
                </div>
              </div>
              {lead.email && (
                <a href={`mailto:${lead.email}`} className="btn btn-outline btn-sm">Compose</a>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.6rem 0.85rem', background: 'var(--bg-muted)', borderRadius: 'var(--radius-md)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <Phone size={16} color="var(--primary)" />
                <div>
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>6. Phone Number</div>
                  <div style={{ fontWeight: 600, fontSize: '0.86rem' }}>{lead.locationPhone || lead.phoneNumber || 'Not publicly available'}</div>
                </div>
              </div>
              {(lead.locationPhone || lead.phoneNumber) && (
                <a href={`tel:${lead.locationPhone || lead.phoneNumber}`} className="btn btn-outline btn-sm">Call</a>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.6rem 0.85rem', background: 'var(--bg-muted)', borderRadius: 'var(--radius-md)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <MessageSquare size={16} color="var(--secondary)" />
                <div>
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>7. WhatsApp / Direct Phone</div>
                  <div style={{ fontWeight: 600, fontSize: '0.86rem', color: lead.whatsAppNumber || lead.ownerPhone ? '#059669' : 'var(--text-muted)' }}>
                    {lead.ownerPhone || lead.whatsAppNumber || 'Not publicly available'}
                  </div>
                </div>
              </div>
              {(lead.ownerPhone || lead.whatsAppNumber) && (
                <a
                  href={`https://wa.me/${(lead.ownerPhone || lead.whatsAppNumber || '').replace(/[^0-9]/g, '')}`}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-secondary btn-sm"
                >
                  WhatsApp
                </a>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
              <div style={{ padding: '0.55rem 0.75rem', background: 'var(--bg-muted)', borderRadius: 'var(--radius-md)', fontSize: '0.78rem' }}>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>8. Company LinkedIn</div>
                {lead.linkedInCompanyUrl ? (
                  <a href={lead.linkedInCompanyUrl} target="_blank" rel="noreferrer" style={{ color: '#0a66c2', fontWeight: 600 }}>
                    View Profile <ExternalLink size={10} />
                  </a>
                ) : (
                  <span>Not publicly available</span>
                )}
              </div>
              <div style={{ padding: '0.55rem 0.75rem', background: 'var(--bg-muted)', borderRadius: 'var(--radius-md)', fontSize: '0.78rem' }}>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>9. Contact LinkedIn</div>
                {lead.contactLinkedInUrl ? (
                  <a href={lead.contactLinkedInUrl} target="_blank" rel="noreferrer" style={{ color: '#0a66c2', fontWeight: 600 }}>
                    View Profile <ExternalLink size={10} />
                  </a>
                ) : (
                  <span>Not publicly available</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 6-Factor 100-Point Buyer Scoring Audit Card */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">
              {lead.scoreBreakdown ? '6-Factor 100-Point Buyer Score Breakdown' : 'Score Calculation Audit'}
            </h3>
            <span className="badge badge-primary tabular-nums">{lead.leadScore} / 100</span>
          </div>
          <div className="card-body tabular-nums" style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            {lead.scoreBreakdown ? (
              <>
                {[
                  { label: 'Actual Project Requirement', val: lead.scoreBreakdown.actualRequirement, max: 30 },
                  { label: 'Active Buying Intent', val: lead.scoreBreakdown.activeIntent, max: 25 },
                  { label: 'Budget / Investment Evidence', val: lead.scoreBreakdown.budgetEvidence, max: 20 },
                  { label: 'Business Authenticity', val: lead.scoreBreakdown.businessAuthenticity, max: 10 },
                  { label: 'Contact Info Verification', val: lead.scoreBreakdown.contactVerification, max: 10 },
                  { label: 'Requirement Freshness', val: lead.scoreBreakdown.requirementFreshness, max: 5 },
                ].map((row) => (
                  <div key={row.label} style={{ fontSize: '0.84rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                      <span>{row.label}</span>
                      <strong>
                        {row.val} / {row.max}
                      </strong>
                    </div>
                    <div style={{ height: '6px', background: 'var(--bg-muted)', borderRadius: '99px', overflow: 'hidden' }}>
                      <div
                        style={{
                          width: `${Math.round((row.val / row.max) * 100)}%`,
                          height: '100%',
                          background: row.val / row.max >= 0.7 ? '#10b981' : row.val / row.max >= 0.4 ? '#3b82f6' : '#f59e0b',
                        }}
                      />
                    </div>
                  </div>
                ))}
                <div style={{ marginTop: '0.35rem', padding: '0.6rem', background: 'var(--bg-muted)', borderRadius: '6px', fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                  <strong>Rubric Notes:</strong> {lead.scoreBreakdown.evidenceNotes}
                </div>
              </>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {hasNoWebsite ? <CheckCircle2 size={16} color="var(--secondary)" /> : <XCircle size={16} color="var(--text-subtle)" />}
                    No Website (+30 points)
                  </span>
                  <strong style={{ color: hasNoWebsite ? 'var(--secondary)' : 'var(--text-subtle)' }}>
                    {hasNoWebsite ? '+30' : '0'}
                  </strong>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {hasPhone ? <CheckCircle2 size={16} color="var(--secondary)" /> : <XCircle size={16} color="var(--text-subtle)" />}
                    Phone Number Available (+20 points)
                  </span>
                  <strong style={{ color: hasPhone ? 'var(--secondary)' : 'var(--text-subtle)' }}>
                    {hasPhone ? '+20' : '0'}
                  </strong>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {hasEmail ? <CheckCircle2 size={16} color="var(--secondary)" /> : <XCircle size={16} color="var(--text-subtle)" />}
                    Email Verified (+15 points)
                  </span>
                  <strong style={{ color: hasEmail ? 'var(--secondary)' : 'var(--text-subtle)' }}>
                    {hasEmail ? '+15' : '0'}
                  </strong>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {hasHighRating ? <CheckCircle2 size={16} color="var(--secondary)" /> : <XCircle size={16} color="var(--text-subtle)" />}
                    Google Rating ≥ 4.0 (+10 points)
                  </span>
                  <strong style={{ color: hasHighRating ? 'var(--secondary)' : 'var(--text-subtle)' }}>
                    {hasHighRating ? '+10' : '0'}
                  </strong>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {hasHighReviews ? <CheckCircle2 size={16} color="var(--secondary)" /> : <XCircle size={16} color="var(--text-subtle)" />}
                    Review Count ≥ 10 (+10 points)
                  </span>
                  <strong style={{ color: hasHighReviews ? 'var(--secondary)' : 'var(--text-subtle)' }}>
                    {hasHighReviews ? '+10' : '0'}
                  </strong>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {hasAddress ? <CheckCircle2 size={16} color="var(--secondary)" /> : <XCircle size={16} color="var(--text-subtle)" />}
                    Complete Address Available (+5 points)
                  </span>
                  <strong style={{ color: hasAddress ? 'var(--secondary)' : 'var(--text-subtle)' }}>
                    {hasAddress ? '+5' : '0'}
                  </strong>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Outreach History For This Lead */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Outreach Communication History</h3>
          <span className="badge badge-muted">{leadLogs.length} attempts</span>
        </div>
        <div className="card-body">
          {leadLogs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--text-muted)' }}>
              <p>No outreach messages sent to this lead yet.</p>
              <button
                className="btn btn-primary btn-sm"
                style={{ marginTop: '0.75rem' }}
                onClick={() => onLaunchOutreachForLead(lead)}
              >
                Send First Outreach Message
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {leadLogs.map((log, idx) => (
                <div
                  key={`lead-log-${log.id}-${idx}`}
                  style={{
                    padding: '1rem',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-main)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span className="badge badge-primary">{log.channel}</span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {new Date(log.sentAt).toLocaleString()}
                      </span>
                    </div>
                    <span
                      className={`badge ${
                        log.status === 'Delivered' || log.status === 'Sent'
                          ? 'badge-secondary'
                          : 'badge-danger'
                      }`}
                    >
                      {log.status}
                    </span>
                  </div>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-main)', whiteSpace: 'pre-wrap' }}>
                    {log.messageBody}
                  </p>
                  {log.errorMessage && (
                    <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--danger)' }}>
                      Error: {log.errorMessage}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
