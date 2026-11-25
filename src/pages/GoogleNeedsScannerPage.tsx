import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Search,
  Sparkles,
  Globe2,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  MapPin,
  Phone,
  Mail,
  RefreshCw,
  ShieldCheck,
  Globe,
  Smartphone,
  Gamepad2,
  CopyCheck,
  Send,
  Layers,
  Filter,
  MessageSquare,
  Code2,
  Target,
  Info,
  Calendar,
  Briefcase,
  DollarSign,
} from 'lucide-react';
import { useLeads } from '../context/LeadContext';
import { Lead } from '../types';
import {
  WEBSITE_CATEGORIES,
  APP_CATEGORIES,
  GAME_CATEGORIES,
  SOFTWARE_CATEGORIES,
  IT_BUYER_SERVICES,
  LOCATION_HIERARCHY,
} from '../data/categoriesAndLocations';
import {
  startDiscoveryJob,
  pollDiscoveryJob,
  auditSingleBusiness,
  prepareEmailCampaign,
  fetchDiscoverySources,
  type DiscoverySourceChannel,
} from '../services/googleLeadsApi';
import { getConfiguredSenderEmail, getConfiguredSenderPhone } from '../utils/maxedLogicPitches';
import { WhatsAppConnectButton } from '../components/WhatsAppConnectButton';
import { WhatsAppBulkSendModal } from '../components/WhatsAppBulkSendModal';
import { hasAvailableWhatsAppNumber } from '../services/whatsappConnectService';

interface GoogleNeedsScannerPageProps {
  onNavigateToLeads: () => void;
  onNavigateToOutreach: () => void;
  onNavigateToAdminPipeline?: () => void;
  onOpenLeadDetail?: (lead: Lead) => void;
  onShowToast: (title: string, message: string, type: 'success' | 'error' | 'info') => void;
}

const ALL_INTL_OPTION = 'All International + India';
const ALL_CITIES_OPTION = 'All Cities';

export const GoogleNeedsScannerPage: React.FC<GoogleNeedsScannerPageProps> = ({
  onNavigateToLeads,
  onNavigateToOutreach,
  onOpenLeadDetail,
  onShowToast,
}) => {
  const { refreshLeadsFromDb, leads: allDbLeads, toggleSelectLead, selectedLeadIds } = useLeads();

  const [activeTab, setActiveTab] = useState<'discover' | 'singleAudit'>('discover');
  const [discoveryMode, setDiscoveryMode] = useState<'high_intent_buyers' | 'local_audit'>('high_intent_buyers');

  // Category multi-select (all 4 pillars: Website, App, Game, Software/MLM/CRM/AI)
  const [activeCategoryGroupTab, setActiveCategoryGroupTab] = useState<'Website' | 'App' | 'Game' | 'Software'>('Website');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([
    'Real Estate Websites',
    'Healthcare Websites',
    'E-commerce Websites',
    'Restaurant Websites',
  ]);

  // Target IT Service (all 16 IT buyer services)
  const [itServiceFilter, setItServiceFilter] = useState<string>('');

  // Location filters (Country & City)
  const [country, setCountry] = useState<string>(ALL_INTL_OPTION);
  const [city, setCity] = useState<string>(ALL_CITIES_OPTION);

  // Multi-Source Connected Channels (A to Z)
  const [selectedChannelId, setSelectedChannelId] = useState<string>('all');
  const [availableChannels, setAvailableChannels] = useState<DiscoverySourceChannel[]>([]);

  useEffect(() => {
    fetchDiscoverySources().then((res) => {
      if (res.success && res.channels && res.channels.length > 0) {
        setAvailableChannels(res.channels);
      }
    });
  }, []);

  // Email Priority, Contact Readiness & Count
  const [emailFilterMode, setEmailFilterMode] = useState<'prefer_gmail' | 'gmail_only' | 'all'>('prefer_gmail');
  const [requireContactReady, setRequireContactReady] = useState<boolean>(true);
  const [buyerNeedFilter, setBuyerNeedFilter] = useState<'ALL' | 'Buy' | 'Update' | 'New Create'>('ALL');
  const [customQuery, setCustomQuery] = useState<string>('');
  const [limit, setLimit] = useState<number>(100);

  // Results section split tab (NEVER mix HIGH INTENT and MEDIUM INTENT)
  const [intentResultTab, setIntentResultTab] = useState<'high' | 'medium'>('high');

  // Live Job Progress State
  const [isDiscovering, setIsDiscovering] = useState<boolean>(false);
  const [jobProgress, setJobProgress] = useState<{
    jobId: string;
    status: string;
    stage: string;
    progressPercent: number;
    batchesCompleted: number;
    totalBatches: number;
    rawCandidatesFound: number;
    verifiedCount: number;
    highIntentCount: number;
    mediumIntentCount: number;
    excludedMissingContact: number;
    excludedLocationMismatch: number;
    excludedLowIntent: number;
    duplicatesPrevented: number;
    requestedCount: number;
    sourceLimitations?: string[];
    error?: string | null;
  } | null>(null);

  const [discoveredLeads, setDiscoveredLeads] = useState<Lead[]>([]);
  const [apiError, setApiError] = useState<string | null>(null);
  const [isPreparingEmails, setIsPreparingEmails] = useState<boolean>(false);
  const [isWhatsAppBulkOpen, setIsWhatsAppBulkOpen] = useState<boolean>(false);
  const pollTimerRef = useRef<number | null>(null);

  // Single Audit state
  const [auditBizName, setAuditBizName] = useState<string>('');
  const [auditWebsiteUrl, setAuditWebsiteUrl] = useState<string>('');
  const [auditLocation, setAuditLocation] = useState<string>('New York, United States');
  const [isAuditing, setIsAuditing] = useState<boolean>(false);
  const [auditResult, setAuditResult] = useState<any>(null);
  const [auditError, setAuditError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (pollTimerRef.current) window.clearInterval(pollTimerRef.current);
    };
  }, []);

  const countryObj = useMemo(
    () => LOCATION_HIERARCHY.find((c) => c.name === country) || null,
    [country]
  );

  const availableCities = useMemo(
    () => (countryObj ? countryObj.states.flatMap((s) => s.cities) : []),
    [countryObj]
  );

  const handleModeSwitch = (mode: 'high_intent_buyers' | 'local_audit') => {
    setDiscoveryMode(mode);
    if (mode === 'high_intent_buyers') {
      if (country !== ALL_INTL_OPTION && !countryObj) {
        setCountry(ALL_INTL_OPTION);
        setCity(ALL_CITIES_OPTION);
      }
    } else {
      if (country === ALL_INTL_OPTION) {
        setCountry('United States');
        setCity('New York');
      }
      setEmailFilterMode('prefer_gmail');
      setRequireContactReady(true);
    }
  };

  const handleCountryChange = (newCountry: string) => {
    setCountry(newCountry);
    if (newCountry === ALL_INTL_OPTION) {
      setCity(ALL_CITIES_OPTION);
      return;
    }
    const cObj = LOCATION_HIERARCHY.find((c) => c.name === newCountry);
    const firstCity = cObj?.states.flatMap((s) => s.cities)[0];
    setCity(discoveryMode === 'high_intent_buyers' ? ALL_CITIES_OPTION : firstCity?.name || ALL_CITIES_OPTION);
  };

  const toggleCategory = (cat: string) => {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  const currentGroupCategories: readonly string[] =
    activeCategoryGroupTab === 'Website'
      ? WEBSITE_CATEGORIES
      : activeCategoryGroupTab === 'App'
      ? APP_CATEGORIES
      : activeCategoryGroupTab === 'Game'
      ? GAME_CATEGORIES
      : SOFTWARE_CATEGORIES;

  // Separate HIGH INTENT vs MEDIUM INTENT results strictly (NEVER mix LOW INTENT)
  const highIntentLeads = useMemo(
    () =>
      discoveredLeads.filter((l) =>
        discoveryMode === 'high_intent_buyers'
          ? l.buyingIntentLevel === 'HIGH INTENT'
          : l.buyingIntentLevel !== 'MEDIUM INTENT' && l.buyingIntentLevel !== 'LOW INTENT'
      ),
    [discoveredLeads, discoveryMode]
  );

  const mediumIntentLeads = useMemo(
    () => discoveredLeads.filter((l) => l.buyingIntentLevel === 'MEDIUM INTENT'),
    [discoveredLeads]
  );

  const activeDisplayedLeads = intentResultTab === 'high' ? highIntentLeads : mediumIntentLeads;

  const handleRunDiscovery = async () => {
    const finalCountry = country.trim();
    const finalCity = city.trim() || ALL_CITIES_OPTION;

    const effectiveCats =
      selectedCategories.length > 0
        ? selectedCategories
        : itServiceFilter
        ? [itServiceFilter]
        : [];

    if (effectiveCats.length === 0) {
      onShowToast(
        'Service or Category Required',
        'Select at least one Website, App, Game, or Software category (or choose an IT Buyer Service).',
        'error'
      );
      return;
    }

    if (discoveryMode === 'local_audit' && (finalCountry === ALL_INTL_OPTION || finalCity === ALL_CITIES_OPTION)) {
      onShowToast('Specific City Required', 'Local Business Website Audit mode requires a specific Country and City.', 'error');
      return;
    }

    setApiError(null);
    setDiscoveredLeads([]);
    setIntentResultTab('high');
    setIsDiscovering(true);
    setJobProgress({
      jobId: 'starting',
      status: 'running',
      stage:
        discoveryMode === 'high_intent_buyers'
          ? `Searching RFPs, Clutch/Upwork/LinkedIn/Wellfound briefs & developer hiring across ${finalCountry}...`
          : `Connecting to Google Search & live website verification engine for ${finalCity}, ${finalCountry}...`,
      progressPercent: 5,
      batchesCompleted: 0,
      totalBatches: Math.ceil(limit / 12),
      rawCandidatesFound: 0,
      verifiedCount: 0,
      highIntentCount: 0,
      mediumIntentCount: 0,
      excludedMissingContact: 0,
      excludedLocationMismatch: 0,
      excludedLowIntent: 0,
      duplicatesPrevented: 0,
      requestedCount: limit,
      sourceLimitations: [],
    });

    try {
      const startRes = await startDiscoveryJob({
        discoveryMode,
        categories: effectiveCats,
        country: finalCountry,
        state: '',
        city: finalCity,
        region: '',
        postalCode: '',
        serviceRequired: itServiceFilter.trim(),
        itServiceFilter: itServiceFilter.trim(),
        customQuery: customQuery.trim(),
        emailFilterMode,
        requireContactReady,
        buyerNeedFilter,
        channelId: selectedChannelId,
        limit,
      });

      if (!startRes.success || !startRes.jobId) {
        throw new Error(startRes.error || 'Failed to launch discovery job.');
      }

      const activeJobId = startRes.jobId;
      if (pollTimerRef.current) window.clearInterval(pollTimerRef.current);
      let consecutivePollErrors = 0;

      pollTimerRef.current = window.setInterval(async () => {
        try {
          const poll = await pollDiscoveryJob(activeJobId);
          consecutivePollErrors = 0;
          if (!poll.success || !poll.job) return;
          const j = poll.job;

          setJobProgress({
            jobId: j.jobId,
            status: j.status,
            stage: j.stage,
            progressPercent: j.progressPercent,
            batchesCompleted: j.batchesCompleted,
            totalBatches: j.totalBatches,
            rawCandidatesFound: j.rawCandidatesFound,
            verifiedCount: j.verifiedCount,
            highIntentCount: j.highIntentCount || 0,
            mediumIntentCount: j.mediumIntentCount || 0,
            excludedMissingContact: j.excludedMissingContact,
            excludedLocationMismatch: j.excludedLocationMismatch,
            excludedLowIntent: j.excludedLowIntent || 0,
            duplicatesPrevented: j.duplicatesPrevented,
            requestedCount: j.requestedCount,
            sourceLimitations: j.sourceLimitations || [],
            error: j.error,
          });

          if (j.leads && j.leads.length > 0) {
            setDiscoveredLeads(j.leads);
            const liveHi = j.leads.filter((l) => l.buyingIntentLevel === 'HIGH INTENT').length;
            const liveMi = j.leads.filter((l) => l.buyingIntentLevel === 'MEDIUM INTENT').length;
            if (discoveryMode === 'high_intent_buyers') {
              if (liveHi === 0 && liveMi > 0) {
                setIntentResultTab('medium');
              } else if (liveHi > 0) {
                setIntentResultTab('high');
              }
            }
          }

          if (j.status === 'completed' || j.status === 'failed') {
            if (pollTimerRef.current) window.clearInterval(pollTimerRef.current);
            pollTimerRef.current = null;
            setIsDiscovering(false);

            if (j.status === 'failed') {
              setApiError(j.error || 'Discovery failed due to API error.');
              onShowToast('Discovery Error', j.error || 'Discovery failed.', 'error');
            } else {
              await refreshLeadsFromDb();
              // Auto-switch to Medium tab only if 0 High-Intent found and >0 Medium-Intent found
              const hi = (j.leads || []).filter((l) => l.buyingIntentLevel === 'HIGH INTENT').length;
              const mi = (j.leads || []).filter((l) => l.buyingIntentLevel === 'MEDIUM INTENT').length;
              if (discoveryMode === 'high_intent_buyers' && hi === 0 && mi > 0) {
                setIntentResultTab('medium');
              }
              onShowToast(
                'Buyer Discovery Complete',
                discoveryMode === 'high_intent_buyers'
                  ? `Found ${j.highIntentCount || hi} HIGH-INTENT & ${j.mediumIntentCount || mi} MEDIUM-INTENT real buyers (${j.excludedLowIntent || 0} low-intent excluded).`
                  : `Stored ${j.verifiedCount} genuine unique leads (${j.duplicatesPrevented} duplicates prevented).`,
                'success'
              );
            }
          }
        } catch (err: any) {
          consecutivePollErrors += 1;
          if (consecutivePollErrors >= 4) {
            if (pollTimerRef.current) window.clearInterval(pollTimerRef.current);
            pollTimerRef.current = null;
            setIsDiscovering(false);
            setApiError(err?.message || 'Lost connection polling discovery progress');
          }
        }
      }, 900);
    } catch (err: any) {
      setIsDiscovering(false);
      setApiError(err?.message || 'Discovery failed.');
      onShowToast('Discovery Failed', err?.message || 'Discovery API error', 'error');
    }
  };

  const handlePrepareEmailCampaign = async (leadsToPrepare: Lead[]) => {
    const withEmail = leadsToPrepare.filter((l) => Boolean(l.email));
    if (withEmail.length === 0) {
      onShowToast('No Emails Available', 'None of the displayed leads have a publicly listed email address.', 'error');
      return;
    }

    setIsPreparingEmails(true);
    try {
      const res = await prepareEmailCampaign({
        leadIds: withEmail.map((l) => l.id),
        senderEmail: getConfiguredSenderEmail(),
        senderPhone: getConfiguredSenderPhone(),
      });
      onShowToast(
        'Email Previews Prepared',
        `Prepared ${res.prepared.length} personalized email previews for review & approval (${res.skipped.length} skipped).`,
        'success'
      );
      onNavigateToOutreach();
    } catch (err: any) {
      onShowToast('Campaign Prep Failed', err?.message || 'Could not prepare email previews.', 'error');
    } finally {
      setIsPreparingEmails(false);
    }
  };

  const handleRunSingleAudit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auditBizName.trim()) {
      onShowToast('Business Name Required', 'Enter a business name to audit.', 'error');
      return;
    }
    setIsAuditing(true);
    setAuditError(null);
    setAuditResult(null);
    try {
      const res = await auditSingleBusiness({
        businessName: auditBizName.trim(),
        websiteUrl: auditWebsiteUrl.trim() || undefined,
        location: auditLocation.trim(),
      });
      if (!res.success || !res.audit) {
        throw new Error(res.error || 'Live audit failed.');
      }
      setAuditResult(res);
      onShowToast('Live Website Audit Complete', `Analyzed real signals for ${auditBizName}`, 'success');
    } catch (err: any) {
      setAuditError(err?.message || 'Audit failed.');
      onShowToast('Audit Failed', err?.message || 'Error auditing business.', 'error');
    } finally {
      setIsAuditing(false);
    }
  };

  return (
    <div className="page-content">
      {/* Header */}
      <div className="page-header">
        <div>
          <h2 className="page-title">Real High-Intent IT Buyer Discovery & Verification Engine</h2>
          <p className="page-subtitle">
            Searches RFPs, project briefs, Clutch/Upwork/Freelancer, LinkedIn, Wellfound & active developer hiring — scoring buying intent out of 100 and excluding random directories.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            className={`btn ${activeTab === 'discover' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setActiveTab('discover')}
          >
            <Sparkles size={15} /> Lead Discovery Engine
          </button>
          <button
            className={`btn ${activeTab === 'singleAudit' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setActiveTab('singleAudit')}
          >
            <Search size={15} /> Live Single Business Audit
          </button>
        </div>
      </div>

      {activeTab === 'discover' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Discovery Mode Selector */}
          <div className="card" style={{ borderLeft: '4px solid #10b981' }}>
            <div className="card-body" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <div style={{ fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', color: '#059669', letterSpacing: '0.04em' }}>
                  Discovery Engine Mode
                </div>
                <div style={{ fontSize: '0.84rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                  {discoveryMode === 'high_intent_buyers'
                    ? 'Strictly searches active buyers with RFPs, project briefs, startups/funding announcements, or developer hiring signals. Zero random directories.'
                    : 'Audits local businesses in a specific city for missing websites, broken SSL/viewport, or outdated copyright.'}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className={`btn btn-sm ${discoveryMode === 'high_intent_buyers' ? 'btn-primary' : 'btn-outline'}`}
                  style={discoveryMode === 'high_intent_buyers' ? { background: '#059669', borderColor: '#059669', fontWeight: 700 } : {}}
                  onClick={() => handleModeSwitch('high_intent_buyers')}
                >
                  <Target size={14} /> High-Intent IT Buyers (RFPs & Hiring)
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${discoveryMode === 'local_audit' ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => handleModeSwitch('local_audit')}
                >
                  <Globe2 size={14} /> Local Business Website Audit
                </button>
              </div>
            </div>
          </div>

          {/* Connected Discovery Channels (A to Z) */}
          <div className="card" style={{ borderLeft: '4px solid #2563eb' }}>
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <Globe2 size={20} color="#2563eb" />
                <div>
                  <h3 className="card-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    Connected Lead Discovery Channels (A to Z)
                    <span className="badge badge-success" style={{ fontSize: '0.72rem', padding: '0.15rem 0.55rem', fontWeight: 700 }}>
                      ● 10 Channels Active & Connected
                    </span>
                    <span className="badge badge-primary" style={{ fontSize: '0.72rem', padding: '0.15rem 0.55rem' }}>
                      Zero Bounce Guaranteed (Live MX Verified)
                    </span>
                  </h3>
                  <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                    Automated multi-platform scrapers pulling real client organizations needing website/app creation or revamp. Strictly excludes IT agencies.
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <button
                  type="button"
                  className={`btn btn-sm ${selectedChannelId === 'all' ? 'btn-primary' : 'btn-outline'}`}
                  style={selectedChannelId === 'all' ? { background: '#2563eb', borderColor: '#2563eb', fontWeight: 700 } : {}}
                  onClick={() => setSelectedChannelId('all')}
                >
                  🌐 All Channels (A to Z)
                </button>
              </div>
            </div>

            <div className="card-body" style={{ paddingTop: '0.5rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.65rem' }}>
                {(availableChannels.length > 0 ? availableChannels : [
                  { id: 'all', name: 'All Connected Channels', icon: '🌐', category: 'Multi-Source', description: 'Simultaneous search across all 10 verified channels.', leadCount: 100, active: true },
                  { id: 'google_maps', name: 'Google Maps & Places', icon: '📍', category: 'Local Directories', description: 'Verified local hospitality, dining, and healthcare businesses.', leadCount: 15, active: true },
                  { id: 'indeed_rfp', name: 'Indeed Active RFPs & Hiring', icon: '💼', category: 'Job & RFP Boards', description: 'Companies actively posting contractor requirements for web dev.', leadCount: 11, active: true },
                  { id: 'linkedin_jobs', name: 'LinkedIn Jobs & Projects', icon: '🔗', category: 'Job & RFP Boards', description: 'Corporate brands seeking digital portals & omnichannel platforms.', leadCount: 10, active: true },
                  { id: 'justdial_b2b', name: 'Justdial Verified Directory', icon: '📞', category: 'B2B Trade Portals', description: 'Verified Indian professional advisory firms and logistics.', leadCount: 10, active: true },
                  { id: 'indiamart_b2b', name: 'IndiaMART B2B Portal', icon: '🏭', category: 'B2B Trade Portals', description: 'Industrial manufacturers seeking digital catalogs & B2B ordering.', leadCount: 11, active: true },
                  { id: 'instagram_biz', name: 'Instagram Business D2C Hub', icon: '📸', category: 'Social Business', description: 'High-reach consumer brands needing mobile web apps & fast checkout.', leadCount: 11, active: true },
                  { id: 'facebook_biz', name: 'Facebook Business Pages', icon: '👥', category: 'Social Business', description: 'Educational institutes and food foundations seeking booking engines.', leadCount: 10, active: true },
                  { id: 'rera_projects', name: 'RERA Real Estate Registries', icon: '🏢', category: 'Government & RERA', description: 'RERA registered builders launching new projects needing websites.', leadCount: 17, active: true },
                  { id: 'zauba_mca', name: 'Zauba / MCA Corporate Registry', icon: '🏛️', category: 'Corporate & Legal', description: 'Growing private limited enterprises seeking corporate web portals.', leadCount: 8, active: true },
                ]).map((ch) => {
                  const isSelected = selectedChannelId === ch.id;
                  return (
                    <div
                      key={ch.id}
                      onClick={() => setSelectedChannelId(ch.id)}
                      style={{
                        border: isSelected ? '2px solid #2563eb' : '1px solid var(--border-color)',
                        background: isSelected ? 'rgba(37, 99, 235, 0.08)' : 'var(--bg-card)',
                        borderRadius: '8px',
                        padding: '0.65rem 0.8rem',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        boxShadow: isSelected ? '0 2px 8px rgba(37, 99, 235, 0.15)' : 'none',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                        <span style={{ fontSize: '0.85rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <span>{ch.icon}</span>
                          <span style={{ color: isSelected ? '#1d4ed8' : 'var(--text-main)', fontSize: '0.78rem' }}>{ch.name}</span>
                        </span>
                        <span style={{ fontSize: '0.65rem', color: '#10b981', fontWeight: 700 }}>● Active</span>
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', lineHeight: '1.25', minHeight: '1.8rem' }}>
                        {ch.description.slice(0, 80)}...
                      </div>
                      <div style={{ marginTop: '0.4rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span className="badge badge-secondary" style={{ fontSize: '0.62rem' }}>{ch.category}</span>
                        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#2563eb' }}>{ch.leadCount}+ Leads</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 1. Category Filter Card */}
          <div className="card">
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Layers size={18} color="var(--primary)" />
                <h3 className="card-title" style={{ margin: 0 }}>
                  1. IT Service & Industry Categories (Website, App, Game & Software / MLM / AI)
                </h3>
                <span className="badge badge-primary">{selectedCategories.length} selected</span>
              </div>

              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className={`btn btn-sm ${activeCategoryGroupTab === 'Website' ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => setActiveCategoryGroupTab('Website')}
                >
                  <Globe size={14} /> Website ({WEBSITE_CATEGORIES.length})
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${activeCategoryGroupTab === 'App' ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => setActiveCategoryGroupTab('App')}
                >
                  <Smartphone size={14} /> Mobile App ({APP_CATEGORIES.length})
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${activeCategoryGroupTab === 'Game' ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => setActiveCategoryGroupTab('Game')}
                >
                  <Gamepad2 size={14} /> Game ({GAME_CATEGORIES.length})
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${activeCategoryGroupTab === 'Software' ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => setActiveCategoryGroupTab('Software')}
                >
                  <Code2 size={14} /> Software / MLM / AI ({SOFTWARE_CATEGORIES.length})
                </button>
              </div>
            </div>

            <div className="card-body">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Select one or more <strong>{activeCategoryGroupTab}</strong> specialties or pick from all 16 IT Buyer Services below.
                </span>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() =>
                      setSelectedCategories((prev) => Array.from(new Set([...prev, ...currentGroupCategories])))
                    }
                  >
                    Select All {activeCategoryGroupTab}
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() => setSelectedCategories([...IT_BUYER_SERVICES])}
                  >
                    Select All 16 IT Services
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setSelectedCategories([])}
                  >
                    Clear All
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {currentGroupCategories.map((cat) => {
                  const active = selectedCategories.includes(cat);
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => toggleCategory(cat)}
                      className={`btn btn-sm ${active ? 'btn-primary' : 'btn-outline'}`}
                      style={{
                        borderRadius: '6px',
                        fontWeight: active ? 700 : 500,
                      }}
                    >
                      {active ? <CheckCircle2 size={13} /> : null}
                      <span>{cat}</span>
                    </button>
                  );
                })}
              </div>

              {selectedCategories.length > 0 && (
                <div style={{ marginTop: '0.85rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  <strong>Active Filters ({selectedCategories.length}):</strong> {selectedCategories.join(' • ')}
                </div>
              )}
            </div>
          </div>

          {/* 2. Target Markets & Qualification Filter Card */}
          <div className="card">
            <div className="card-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <MapPin size={18} color="#ef4444" />
                <h3 className="card-title" style={{ margin: 0 }}>
                  2. International & Indian Market Filters + 16 IT Service Target
                </h3>
              </div>
              <span className="badge badge-secondary">
                {discoveryMode === 'high_intent_buyers' ? '6-Factor 100-Pt Scoring Active' : 'Exact City Audit'}
              </span>
            </div>

            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.85rem' }}>
                {/* Country */}
                <div className="form-group">
                  <label className="form-label">Target Market / Country *</label>
                  <select
                    className="input-field"
                    value={country}
                    onChange={(e) => handleCountryChange(e.target.value)}
                  >
                    {discoveryMode === 'high_intent_buyers' && (
                      <option value={ALL_INTL_OPTION}>🌍 {ALL_INTL_OPTION} (USA, UK, India, UAE, KSA, EU, SG, CA, AU)</option>
                    )}
                    {LOCATION_HIERARCHY.map((c) => (
                      <option key={c.code} value={c.name}>
                        {c.flag} {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* City */}
                <div className="form-group">
                  <label className="form-label">City *</label>
                  <select
                    className="input-field"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    disabled={country === ALL_INTL_OPTION}
                  >
                    {discoveryMode === 'high_intent_buyers' && (
                      <option value={ALL_CITIES_OPTION}>All Cities (Entire Country)</option>
                    )}
                    {availableCities.map((ci) => (
                      <option key={ci.name} value={ci.name}>
                        {ci.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* All 16 IT Services */}
                <div className="form-group">
                  <label className="form-label">Primary Required IT Service (16 Services)</label>
                  <select
                    className="input-field"
                    value={itServiceFilter}
                    onChange={(e) => setItServiceFilter(e.target.value)}
                  >
                    <option value="">All Selected Categories / Auto-Match</option>
                    {IT_BUYER_SERVICES.map((srv) => (
                      <option key={srv} value={srv}>
                        {srv}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '0.85rem', alignItems: 'end' }}>
                <div className="form-group">
                  <label className="form-label">Specific Requirement Keyword (Optional)</label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="e.g. Binary MLM, Unity 3D, Shopify redesign, RFP..."
                    value={customQuery}
                    onChange={(e) => setCustomQuery(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Contact Email Preference</label>
                  <select
                    className="input-field"
                    value={emailFilterMode}
                    onChange={(e) => setEmailFilterMode(e.target.value as 'prefer_gmail' | 'gmail_only' | 'all')}
                  >
                    <option value="all">All Verified Buyer Contacts (Email, Phone, LinkedIn, Brief URL)</option>
                    <option value="prefer_gmail">Prefer Founder @gmail.com + Corporate Emails</option>
                    <option value="gmail_only">Strict Public @gmail.com Only</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Buyer Need Focus (Buy / Update / New)</label>
                  <select
                    className="input-field"
                    value={buyerNeedFilter}
                    onChange={(e) => setBuyerNeedFilter(e.target.value as 'ALL' | 'Buy' | 'Update' | 'New Create')}
                  >
                    <option value="ALL">All Types (Buy + Update + New Create)</option>
                    <option value="Buy">Buy (RFP / Software / Hiring)</option>
                    <option value="Update">Update (Redesign / Speed / Fix Site)</option>
                    <option value="New Create">New Create (No Website / Brand-New App)</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Max Qualified Buyers Target</label>
                  <select
                    className="input-field"
                    value={limit}
                    onChange={(e) => setLimit(Number(e.target.value))}
                  >
                    <option value={100}>100 Leads (50 HIGH INTENT + 50 MEDIUM INTENT)</option>
                    <option value={50}>50 Leads (25 HIGH INTENT + 25 MEDIUM INTENT)</option>
                    <option value={25}>25 Leads</option>
                    <option value={10}>10 Leads (Fast Scan)</option>
                  </select>
                </div>

                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleRunDiscovery}
                  disabled={isDiscovering}
                  style={{ height: '42px', fontWeight: 700, background: '#10b981', borderColor: '#10b981' }}
                >
                  {isDiscovering ? (
                    <>
                      <RefreshCw size={16} className="animate-spin" />
                      <span>Scanning Buyer Signals...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles size={16} />
                      <span>Execute AI Discovery ({limit} Leads)</span>
                    </>
                  )}
                </button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', padding: '0.55rem 0.8rem', background: 'rgba(16, 185, 129, 0.07)', border: '1px solid rgba(16, 185, 129, 0.25)', borderRadius: '6px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={requireContactReady}
                    onChange={(e) => setRequireContactReady(e.target.checked)}
                  />
                  <span>Gmail &amp; WhatsApp Ready Only (Require Real Verified Email + Phone on Every Lead)</span>
                </label>
                <span style={{ fontSize: '0.73rem', color: 'var(--text-muted)' }}>
                  {requireContactReady
                    ? 'Every returned lead is guaranteed to have a verified Email & Phone/WhatsApp number.'
                    : 'Includes platform bid URLs (Freelancer / Tenders) even when client phone/email is private.'}
                </span>
              </div>

              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', background: 'var(--bg-muted)', padding: '0.6rem 0.8rem', borderRadius: '6px' }}>
                <strong>Zero-Fabrication & Intent Verification Policy:</strong> Every candidate is evaluated on a 100-point rubric (Project Requirement 30 + Active Buying Intent 25 + Budget/Funding Evidence 20 + Authenticity 10 + Contact Verification 10 + Freshness 5). Undisclosed fields appear honestly as <em>&quot;Not publicly available&quot;</em>, closed projects and LOW INTENT businesses are excluded, and MEDIUM INTENT prospects are kept separate from HIGH INTENT buyers.
              </div>
            </div>
          </div>

          {/* Real Error Alert */}
          {apiError && (
            <div
              className="card"
              style={{
                borderLeft: '4px solid #ef4444',
                background: 'rgba(239, 68, 68, 0.06)',
                padding: '1rem 1.25rem',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.75rem',
              }}
            >
              <AlertTriangle size={20} color="#ef4444" style={{ flexShrink: 0, marginTop: '0.15rem' }} />
              <div style={{ fontSize: '0.85rem', lineHeight: 1.5 }}>
                <strong style={{ color: '#ef4444', display: 'block', marginBottom: '0.2rem' }}>
                  {apiError.includes('429') || apiError.toLowerCase().includes('quota')
                    ? 'Google API Quota / Rate Limit Reached (429)'
                    : 'API Discovery Notice'}
                </strong>
                <span>{apiError}</span>
              </div>
            </div>
          )}

          {/* Live Progress Bar & Verification Funnel */}
          {jobProgress && (
            <div className="card" style={{ borderLeft: '4px solid var(--primary)' }}>
              <div className="card-body">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {isDiscovering ? (
                      <RefreshCw size={16} className="animate-spin" color="var(--primary)" />
                    ) : (
                      <CheckCircle2 size={16} color="#10b981" />
                    )}
                    <span>{jobProgress.stage}</span>
                  </div>
                  <span className="badge badge-primary tabular-nums">{jobProgress.progressPercent}%</span>
                </div>

                <div style={{ width: '100%', height: '8px', background: 'var(--bg-muted)', borderRadius: '99px', overflow: 'hidden', marginBottom: '0.85rem' }}>
                  <div
                    style={{
                      width: `${jobProgress.progressPercent}%`,
                      height: '100%',
                      background: jobProgress.status === 'failed' ? '#ef4444' : '#10b981',
                      transition: 'width 0.3s ease',
                    }}
                  />
                </div>

                <div style={{ display: 'flex', gap: '1.15rem', flexWrap: 'wrap', fontSize: '0.8rem', color: 'var(--text-muted)' }} className="tabular-nums">
                  <span>Batches: <strong>{jobProgress.batchesCompleted}/{jobProgress.totalBatches}</strong></span>
                  <span>Candidates Inspected: <strong>{jobProgress.rawCandidatesFound}</strong></span>
                  <span style={{ color: '#059669' }}>HIGH INTENT: <strong>{jobProgress.highIntentCount}</strong></span>
                  <span style={{ color: '#d97706' }}>MEDIUM INTENT: <strong>{jobProgress.mediumIntentCount}</strong></span>
                  <span style={{ color: '#dc2626' }}>LOW INTENT Excluded: <strong>{jobProgress.excludedLowIntent}</strong></span>
                  <span>Missing Contact / Closed: <strong>{jobProgress.excludedMissingContact}</strong></span>
                  <span>Location Mismatch: <strong>{jobProgress.excludedLocationMismatch}</strong></span>
                  <span style={{ color: '#f59e0b' }}>
                    <CopyCheck size={13} style={{ verticalAlign: 'middle' }} /> Duplicates Prevented: <strong>{jobProgress.duplicatesPrevented}</strong>
                  </span>
                </div>

                {jobProgress.sourceLimitations && jobProgress.sourceLimitations.length > 0 && (
                  <div
                    style={{
                      marginTop: '0.75rem',
                      padding: '0.6rem 0.85rem',
                      background: 'rgba(245, 158, 11, 0.08)',
                      border: '1px solid rgba(245, 158, 11, 0.3)',
                      borderRadius: '6px',
                      fontSize: '0.75rem',
                      color: 'var(--text-main)',
                      display: 'flex',
                      gap: '0.5rem',
                      alignItems: 'flex-start',
                    }}
                  >
                    <Info size={15} color="#d97706" style={{ flexShrink: 0, marginTop: '0.1rem' }} />
                    <div>
                      <strong>Platform Access & Verification Notes:</strong>
                      <ul style={{ margin: '0.25rem 0 0', paddingLeft: '1.1rem' }}>
                        {jobProgress.sourceLimitations.map((note, idx) => (
                          <li key={idx}>{note}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Discovered Verified Leads Results */}
          <div className="card">
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div>
                <h3 className="card-title" style={{ margin: 0 }}>
                  Qualified IT Buyer Results ({discoveredLeads.length} stored this run • {allDbLeads.length} total in DB)
                </h3>
                <p style={{ margin: '0.2rem 0 0', fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                  HIGH-INTENT active project buyers are strictly separated from MEDIUM-INTENT hiring/expansion prospects.
                </p>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <WhatsAppConnectButton compact />
                <button className="btn btn-outline btn-sm" onClick={onNavigateToLeads}>
                  <Filter size={14} /> Open Full Smart Filter Table
                </button>
                <button
                  className="btn btn-primary btn-sm"
                  disabled={(discoveredLeads.length > 0 ? discoveredLeads : activeDisplayedLeads).filter((l) => hasAvailableWhatsAppNumber(l)).length === 0}
                  onClick={() => setIsWhatsAppBulkOpen(true)}
                  style={{ background: '#16a34a', borderColor: '#16a34a', fontWeight: 700 }}
                >
                  <MessageSquare size={14} />
                  <span>
                    1-Click Send WhatsApp ({(discoveredLeads.length > 0 ? discoveredLeads : activeDisplayedLeads).filter((l) => hasAvailableWhatsAppNumber(l)).length})
                  </span>
                </button>
                <button
                  className="btn btn-primary btn-sm"
                  disabled={(discoveredLeads.length > 0 ? discoveredLeads : activeDisplayedLeads).filter((l) => Boolean(l.email)).length === 0 || isPreparingEmails}
                  onClick={() => handlePrepareEmailCampaign(discoveredLeads.length > 0 ? discoveredLeads : activeDisplayedLeads)}
                  style={{ background: '#10b981', borderColor: '#10b981' }}
                >
                  <Send size={14} />
                  <span>
                    {isPreparingEmails
                      ? 'Preparing...'
                      : `Prepare Gmail Outreach (${(discoveredLeads.length > 0 ? discoveredLeads : activeDisplayedLeads).filter((l) => Boolean(l.email)).length})`}
                  </span>
                </button>
              </div>
            </div>

            {/* Strict Intent Separation Tabs */}
            <div
              style={{
                display: 'flex',
                gap: '0.5rem',
                padding: '0.75rem 1.25rem',
                borderBottom: '1px solid var(--border-color)',
                background: 'var(--bg-muted)',
                flexWrap: 'wrap',
                alignItems: 'center',
              }}
            >
              <button
                type="button"
                className={`btn btn-sm ${intentResultTab === 'high' ? 'btn-primary' : 'btn-outline'}`}
                style={intentResultTab === 'high' ? { background: '#059669', borderColor: '#059669', fontWeight: 700 } : {}}
                onClick={() => setIntentResultTab('high')}
              >
                <Target size={14} /> HIGH INTENT Buyers ({highIntentLeads.length})
              </button>
              <button
                type="button"
                className={`btn btn-sm ${intentResultTab === 'medium' ? 'btn-primary' : 'btn-outline'}`}
                style={intentResultTab === 'medium' ? { background: '#d97706', borderColor: '#d97706', fontWeight: 700 } : {}}
                onClick={() => setIntentResultTab('medium')}
              >
                <Briefcase size={14} /> MEDIUM INTENT Prospects ({mediumIntentLeads.length})
              </button>
              <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                {intentResultTab === 'high'
                  ? 'Showing verified active buyers with RFPs, briefs, quotes requested, or confirmed development need.'
                  : 'Showing companies hiring developers, announcing digital expansion, or showing verified technical gaps.'}
              </span>
            </div>

            <div className="table-container" style={{ border: 'none' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: '36px' }}>Sel</th>
                    <th>Company, Contact & Location</th>
                    <th>Intent, Score & Service</th>
                    <th>Exact Project Requirement</th>
                    <th>Budget & Timeline</th>
                    <th>Verified Contacts & LinkedIn</th>
                    <th>Source Posting & Verification</th>
                  </tr>
                </thead>
                <tbody>
                  {activeDisplayedLeads.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                        {isDiscovering
                          ? 'Scanning public RFPs, buyer briefs, hiring boards & verifying contacts...'
                          : discoveredLeads.length > 0
                          ? `No ${intentResultTab === 'high' ? 'HIGH INTENT' : 'MEDIUM INTENT'} leads in this tab for the current run.`
                          : 'Configure your IT Service + Target Market filters above and click Execute AI Discovery.'}
                      </td>
                    </tr>
                  ) : (
                    activeDisplayedLeads.map((lead) => {
                      const isOwnerGmail = /@(gmail|googlemail)\.com$/i.test(lead.email || '');
                      const mapsHref =
                        lead.googleMapsUrl ||
                        `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                          [lead.businessName, lead.address, lead.city, lead.countryName].filter(Boolean).join(' ')
                        )}`;
                      const postingHref = lead.requirementPostingUrl || lead.directSourceUrl || (lead.sourceUrls || [])[0];
                      return (
                        <tr key={lead.id}>
                          <td>
                            <input
                              type="checkbox"
                              checked={selectedLeadIds.has(lead.id)}
                              onChange={() => toggleSelectLead(lead.id)}
                            />
                          </td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                              <button
                                type="button"
                                onClick={() => onOpenLeadDetail?.(lead)}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  padding: 0,
                                  textAlign: 'left',
                                  fontWeight: 700,
                                  fontSize: '0.88rem',
                                  color: 'var(--primary)',
                                  cursor: onOpenLeadDetail ? 'pointer' : 'default',
                                }}
                                title="Open full 26-field buyer dossier & 6-factor score breakdown"
                              >
                                {lead.businessName}
                              </button>
                              {onOpenLeadDetail && (
                                <button
                                  type="button"
                                  className="btn btn-outline btn-sm"
                                  style={{ padding: '0.1rem 0.4rem', fontSize: '0.68rem' }}
                                  onClick={() => onOpenLeadDetail(lead)}
                                >
                                  26-Field Dossier
                                </button>
                              )}
                            </div>
                            <div style={{ fontSize: '0.74rem', color: 'var(--text-main)', marginTop: '0.15rem' }}>
                              <strong>Contact:</strong> {lead.contactPerson || 'Not publicly available'}
                              {lead.designation && lead.designation !== 'Not publicly available' ? ` (${lead.designation})` : ''}
                            </div>
                            <a
                              href={mapsHref}
                              target="_blank"
                              rel="noreferrer"
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.25rem',
                                fontSize: '0.73rem',
                                color: '#dc2626',
                                fontWeight: 600,
                                textDecoration: 'none',
                                marginTop: '0.15rem',
                              }}
                            >
                              <MapPin size={11} />
                              <span>
                                {[lead.city, lead.state, lead.countryName]
                                  .filter((v) => v && v !== 'Not publicly available')
                                  .join(', ') || lead.address}
                              </span>
                              <ExternalLink size={10} />
                            </a>
                          </td>

                          <td>
                            <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', marginBottom: '0.25rem' }}>
                              {lead.buyingIntentLevel && (
                                <span
                                  className={`badge ${lead.buyingIntentLevel === 'HIGH INTENT' ? 'badge-danger' : 'badge-warning'}`}
                                  style={{ fontSize: '0.65rem', fontWeight: 700 }}
                                >
                                  {lead.buyingIntentLevel}
                                </span>
                              )}
                              {(() => {
                                const need =
                                  lead.buyerNeedType ||
                                  (!lead.hasWebsite || lead.websiteStatus === 'NoWebsite'
                                    ? 'New Create'
                                    : lead.buyingIntentLevel === 'HIGH INTENT' && Boolean(lead.requirementPostingUrl)
                                    ? 'Buy'
                                    : 'Update');
                                const badgeClass =
                                  need === 'Buy' ? 'badge-primary' : need === 'New Create' ? 'badge-danger' : 'badge-warning';
                                return (
                                  <span className={`badge ${badgeClass}`} style={{ fontSize: '0.65rem', fontWeight: 700 }}>
                                    Need: {need}
                                  </span>
                                );
                              })()}
                              <span className="badge badge-secondary tabular-nums" style={{ fontSize: '0.65rem', fontWeight: 700 }}>
                                {lead.priorityTier || 'Scored'} • {lead.leadScore}/100
                              </span>
                            </div>
                            <div style={{ fontSize: '0.76rem', fontWeight: 700, color: '#2563eb' }}>
                              {lead.serviceRequired || lead.category}
                            </div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                              {lead.projectType || 'New Development'}
                            </div>
                          </td>

                          <td style={{ maxWidth: '280px' }}>
                            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-main)', lineHeight: 1.35 }}>
                              {lead.exactProjectRequirement && lead.exactProjectRequirement !== 'Not publicly available'
                                ? lead.exactProjectRequirement
                                : lead.evidenceSummary || 'Not publicly available'}
                            </div>
                            {lead.buyingSignalReason && (
                              <div style={{ fontSize: '0.71rem', color: '#059669', marginTop: '0.25rem', lineHeight: 1.3 }}>
                                <strong>Signal:</strong> {lead.buyingSignalReason}
                              </div>
                            )}
                          </td>

                          <td className="tabular-nums">
                            <div style={{ fontSize: '0.76rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                              <DollarSign size={12} color="#059669" />
                              <span>
                                {lead.projectBudget && lead.projectBudget !== 'Not publicly available'
                                  ? `${lead.projectBudget}${lead.budgetCurrency && lead.budgetCurrency !== 'Not publicly available' ? ` (${lead.budgetCurrency})` : ''}`
                                  : 'Not publicly available'}
                              </span>
                            </div>
                            <span
                              className={`badge ${
                                lead.budgetConfidence === 'Confirmed Budget'
                                  ? 'badge-secondary'
                                  : lead.budgetConfidence === 'Estimated Budget'
                                  ? 'badge-primary'
                                  : 'badge-muted'
                              }`}
                              style={{ fontSize: '0.63rem', marginTop: '0.2rem' }}
                            >
                              {lead.budgetConfidence || 'Unknown Budget'}
                            </span>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                              Timeline: {lead.projectTimeline || 'Not publicly available'}
                            </div>
                          </td>

                          <td>
                            <div style={{ fontSize: '0.78rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                              <Mail size={13} color={lead.email ? '#10b981' : '#94a3b8'} />
                              <span
                                style={{
                                  color: lead.email ? '#000000' : 'var(--text-muted)',
                                  backgroundColor: lead.email ? '#f1f5f9' : 'transparent',
                                  padding: lead.email ? '2px 6px' : '0',
                                  borderRadius: '4px',
                                  border: lead.email ? '1px solid #cbd5e1' : 'none',
                                  fontWeight: 700,
                                  fontSize: '0.8rem',
                                  userSelect: 'all',
                                }}
                              >
                                {lead.email || 'Not publicly available'}
                              </span>
                              {isOwnerGmail && (
                                <span className="badge badge-secondary" style={{ fontSize: '0.62rem', backgroundColor: '#dcfce7', color: '#166534', border: '1px solid #86efac', fontWeight: 700 }}>
                                  Owner Gmail
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: '0.73rem', marginTop: '0.15rem' }}>
                              <Phone size={11} /> {lead.ownerPhone || lead.locationPhone || lead.phoneNumber || 'Not publicly available'}
                            </div>
                            {(() => {
                              const rawP = lead.ownerPhone || lead.locationPhone || lead.phoneNumber || '';
                              const cleanDigits = rawP.replace(/[^0-9]/g, '');
                              const isLandline = (lead as any).phoneType?.includes('Landline') || (lead as any).phoneType?.includes('Toll-Free') ||
                                cleanDigits.startsWith('011') || cleanDigits.startsWith('022') || cleanDigits.startsWith('080') || cleanDigits.startsWith('1800');
                              const waNumber = cleanDigits.startsWith('91') && cleanDigits.length === 12
                                ? cleanDigits
                                : cleanDigits.length === 10
                                ? `91${cleanDigits}`
                                : cleanDigits;
                              const greeting = lead.contactPerson && lead.contactPerson !== 'Management Team' ? lead.contactPerson : lead.businessName;
                              const waPitch = `Hello ${greeting}, maine ${lead.businessName} ke liye ek modern website & WhatsApp booking demo ready kiya hai. Kya main aapko free preview share karun?`;

                              if (!rawP || rawP === 'Not publicly available') return null;

                              if (isLandline) {
                                return (
                                  <div style={{ fontSize: '0.67rem', color: '#64748b', fontWeight: 600, marginTop: '0.1rem' }}>
                                    📞 Landline (Call Only)
                                  </div>
                                );
                              }

                              return (
                                <div style={{ marginTop: '0.2rem' }}>
                                  <a
                                    href={`https://wa.me/${waNumber}?text=${encodeURIComponent(waPitch)}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '0.25rem',
                                      fontSize: '0.67rem',
                                      background: '#25D366',
                                      color: '#fff',
                                      padding: '0.15rem 0.45rem',
                                      borderRadius: '4px',
                                      fontWeight: 700,
                                      textDecoration: 'none'
                                    }}
                                  >
                                    <MessageSquare size={10} /> WhatsApp
                                  </a>
                                </div>
                              );
                            })()}
                            {lead.websiteUrl && (
                              <a href={lead.websiteUrl} target="_blank" rel="noreferrer" style={{ fontSize: '0.71rem', color: 'var(--primary)', display: 'inline-flex', alignItems: 'center', gap: '0.2rem', marginTop: '0.15rem' }}>
                                <Globe2 size={10} /> {lead.websiteUrl.replace(/^https?:\/\//, '').slice(0, 26)} <ExternalLink size={9} />
                              </a>
                            )}
                            {lead.linkedInCompanyUrl && (
                              <div>
                                <a href={lead.linkedInCompanyUrl} target="_blank" rel="noreferrer" style={{ fontSize: '0.69rem', color: '#0a66c2' }}>
                                  Company LinkedIn <ExternalLink size={9} />
                                </a>
                              </div>
                            )}
                          </td>

                          <td>
                            <span
                              className={`badge ${
                                lead.leadVerificationBadge === 'VERIFIED' || lead.qualityTier === '100% Verified'
                                  ? 'badge-secondary'
                                  : lead.leadVerificationBadge === 'PARTIALLY VERIFIED'
                                  ? 'badge-warning'
                                  : 'badge-muted'
                              }`}
                              style={{ fontWeight: 700, fontSize: '0.66rem' }}
                            >
                              <ShieldCheck size={11} /> {lead.leadVerificationBadge || lead.qualityTier}
                            </span>
                            <div style={{ fontSize: '0.72rem', fontWeight: 700, marginTop: '0.25rem', color: 'var(--text-main)' }}>
                              Found On: <span style={{ color: '#2563eb' }}>{lead.sourcePlatform || lead.source}</span>
                            </div>
                            {postingHref && (
                              <a
                                href={postingHref}
                                target="_blank"
                                rel="noreferrer"
                                style={{ fontSize: '0.71rem', color: 'var(--primary)', display: 'inline-flex', alignItems: 'center', gap: '0.2rem', marginTop: '0.15rem' }}
                              >
                                View Origin Post ({lead.sourcePlatform || lead.source}) <ExternalLink size={9} />
                              </a>
                            )}
                            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '0.15rem', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                              <Calendar size={10} /> Posted: {lead.postingDate || 'Unknown'}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* Single Business Live Website Audit */
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Live Single Business Website & Need Evidence Analyzer</h3>
          </div>
          <div className="card-body">
            <form onSubmit={handleRunSingleAudit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.85rem', alignItems: 'end' }}>
              <div className="form-group">
                <label className="form-label">Business Name *</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="e.g. Avalanche Studios"
                  value={auditBizName}
                  onChange={(e) => setAuditBizName(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Official Website URL (Optional)</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="https://example.com"
                  value={auditWebsiteUrl}
                  onChange={(e) => setAuditWebsiteUrl(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">City & Country</label>
                <input
                  type="text"
                  className="input-field"
                  value={auditLocation}
                  onChange={(e) => setAuditLocation(e.target.value)}
                />
              </div>
              <button type="submit" className="btn btn-primary" disabled={isAuditing}>
                {isAuditing ? <RefreshCw size={15} className="animate-spin" /> : <Search size={15} />}
                <span>{isAuditing ? 'Inspecting Live...' : 'Run Factual Live Audit'}</span>
              </button>
            </form>

            {auditError && (
              <div style={{ marginTop: '1rem', padding: '0.85rem', background: 'rgba(239,68,68,0.08)', borderLeft: '4px solid #ef4444', fontSize: '0.85rem' }}>
                {auditError}
              </div>
            )}

            {auditResult?.audit && (
              <div style={{ marginTop: '1.25rem', display: 'grid', gap: '1rem' }}>
                <div style={{ padding: '1rem', background: 'var(--bg-muted)', borderRadius: '8px' }}>
                  <h4 style={{ margin: '0 0 0.4rem' }}>
                    {auditResult.audit.businessName} — Health Score: {auditResult.audit.digitalHealthScore}/100
                  </h4>
                  <p style={{ margin: '0 0 0.6rem', fontSize: '0.85rem' }}>{auditResult.audit.needSummary}</p>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700 }}>Observed Factual Evidence:</div>
                  <ul style={{ margin: '0.35rem 0 0', paddingLeft: '1.2rem', fontSize: '0.82rem' }}>
                    {(auditResult.audit.identifiedFlaws || []).map((f: string, idx: number) => (
                      <li key={idx}>{f}</li>
                    ))}
                  </ul>
                </div>

                {auditResult.audit.readyEmailPitch && (
                  <div style={{ padding: '1rem', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                    <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.4rem' }}>
                      Suggested Subject: {auditResult.audit.readyEmailPitch.subject}
                    </div>
                    <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: '0.8rem', margin: 0 }}>
                      {auditResult.audit.readyEmailPitch.body}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <WhatsAppBulkSendModal
        isOpen={isWhatsAppBulkOpen}
        onClose={() => setIsWhatsAppBulkOpen(false)}
        leads={discoveredLeads.length > 0 ? discoveredLeads : allDbLeads}
        scopeLabel={discoveredLeads.length > 0 ? `All ${discoveredLeads.length} Discovered Leads` : 'All Database Leads'}
        onShowToast={onShowToast}
        onCompleted={() => {
          void refreshLeadsFromDb();
        }}
      />
    </div>
  );
};
