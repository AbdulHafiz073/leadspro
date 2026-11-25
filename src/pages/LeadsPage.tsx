import React, { useState, useMemo } from 'react';
import {
  Search,
  Download,
  Plus,
  Send,
  Trash2,
  ExternalLink,
  Phone,
  Mail,
  ChevronLeft,
  ChevronRight,
  CheckSquare,
  Square,
  ShieldCheck,
  Globe,
  Smartphone,
  Gamepad2,
  MapPin,
  CheckCircle2,
  RotateCcw,
  MessageSquare,
  Code2,
} from 'lucide-react';
import { useLeads } from '../context/LeadContext';
import { Lead, WebsiteStatus } from '../types';
import {
  WEBSITE_CATEGORIES,
  APP_CATEGORIES,
  GAME_CATEGORIES,
  SOFTWARE_CATEGORIES,
  SERVICE_REQUIREMENTS,
} from '../data/categoriesAndLocations';
import { Modal } from '../components/ModalAndToast';
import { prepareEmailCampaign } from '../services/googleLeadsApi';
import { getConfiguredSenderEmail, getConfiguredSenderPhone } from '../utils/maxedLogicPitches';
import { WhatsAppConnectButton } from '../components/WhatsAppConnectButton';
import { WhatsAppBulkSendModal } from '../components/WhatsAppBulkSendModal';
import { hasAvailableWhatsAppNumber } from '../services/whatsappConnectService';

export type LeadsViewMode = 'all' | 'website' | 'app' | 'game' | 'software' | 'location' | 'verified';

interface LeadsPageProps {
  viewMode?: LeadsViewMode;
  onNavigateToOutreach: () => void;
  onNavigateToDiscovery?: () => void;
  onOpenLeadDetail: (lead: Lead) => void;
  onShowToast: (title: string, message: string, type: 'success' | 'error' | 'info') => void;
}

export const LeadsPage: React.FC<LeadsPageProps> = ({
  viewMode = 'all',
  onNavigateToOutreach,
  onNavigateToDiscovery,
  onOpenLeadDetail,
  onShowToast,
}) => {
  const {
    leads,
    filteredLeads,
    countries,
    filters,
    setFilters,
    resetFilters,
    selectedLeadIds,
    toggleSelectLead,
    selectAllPage,
    unselectAllPage,
    selectAllFiltered,
    unselectAll,
    isAllPageSelected,
    selectedLeads,
    deleteLead,
    deleteSelectedLeads,
    addLead,
    exportLeadsCSV,
    exportLeadsJSON,
    refreshLeadsFromDb,
  } = useLeads();

  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 12;

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [leadToDelete, setLeadToDelete] = useState<number | null>(null);
  const [isPreparingEmails, setIsPreparingEmails] = useState(false);
  const [isWhatsAppBulkOpen, setIsWhatsAppBulkOpen] = useState(false);

  const [newLeadForm, setNewLeadForm] = useState({
    businessName: '',
    contactPerson: 'Management Team',
    category: 'Business Websites',
    countryId: 2,
    countryName: 'United States',
    city: '',
    state: '',
    region: '',
    address: '',
    postalCode: '',
    phoneNumber: '',
    ownerPhone: '',
    email: '',
    websiteUrl: '',
    serviceRequired: 'Website Redesign',
    websiteStatus: 'HasWebsite' as WebsiteStatus,
    rating: 4.5,
    reviewCount: 15,
  });

  // Dynamic dropdown options extracted cleanly from actual database leads + full taxonomy
  const availableCountries = useMemo(
    () => Array.from(new Set(leads.map((l) => l.countryName).filter(Boolean) as string[])).sort(),
    [leads]
  );

  const availableCities = useMemo(() => {
    let base = leads;
    if (filters.countryName !== 'all') {
      base = base.filter((l) => (l.countryName || '').toLowerCase() === filters.countryName.toLowerCase());
    }
    if (filters.state !== 'all') {
      base = base.filter((l) => (l.state || '').toLowerCase() === filters.state.toLowerCase());
    }
    return Array.from(new Set(base.map((l) => l.city).filter(Boolean))).sort();
  }, [leads, filters.countryName, filters.state]);

  // Apply viewMode scoping cleanly on top of smart filters
  const modeLeads = useMemo(() => {
    return filteredLeads.filter((l) => {
      if (viewMode === 'website') return !l.primaryGroup || l.primaryGroup === 'Website';
      if (viewMode === 'app') return l.primaryGroup === 'App';
      if (viewMode === 'game') return l.primaryGroup === 'Game';
      if (viewMode === 'software') return l.primaryGroup === 'Software';
      if (viewMode === 'verified') {
        return (
          (l.qualityTier === '100% Verified' || l.qualityTier === 'High Quality' || l.leadVerificationBadge === 'VERIFIED') &&
          Boolean(l.email) &&
          l.emailVerificationStatus === 'Publicly Listed + MX Verified'
        );
      }
      return true;
    });
  }, [filteredLeads, viewMode]);

  const totalPages = Math.ceil(modeLeads.length / pageSize) || 1;
  const safePage = Math.min(currentPage, totalPages);
  const paginatedLeads = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return modeLeads.slice(start, start + pageSize);
  }, [modeLeads, safePage]);

  const currentPageIds = paginatedLeads.map((l) => l.id);
  const isCurrentPageFullySelected = isAllPageSelected(currentPageIds);

  const handleSelectAllPageToggle = () => {
    if (isCurrentPageFullySelected) unselectAllPage(currentPageIds);
    else selectAllPage(currentPageIds);
  };

  const unsentFilteredLeads = useMemo(
    () =>
      modeLeads.filter(
        (l) =>
          l.email &&
          l.outreachStatus !== 'EmailSent' &&
          l.outreachStatus !== 'BothSent' &&
          l.outreachStatus !== 'Replied' &&
          l.outreachStatus !== 'Unsubscribed'
      ),
    [modeLeads]
  );

  const whatsAppBulkTargets = useMemo(() => {
    const base = selectedLeads.length > 0 ? selectedLeads : modeLeads;
    return base.filter((l) => l.outreachStatus !== 'Unsubscribed' && hasAvailableWhatsAppNumber(l));
  }, [selectedLeads, modeLeads]);

  const handlePrepareSelectedEmails = async () => {
    const targets = selectedLeads.length > 0 ? selectedLeads : unsentFilteredLeads;
    if (targets.length === 0) {
      onShowToast('No Eligible Leads', 'No unsent verified leads with email found in this view.', 'error');
      return;
    }
    setIsPreparingEmails(true);
    try {
      const res = await prepareEmailCampaign({
        leadIds: targets.map((l) => l.id),
        senderEmail: getConfiguredSenderEmail(),
        senderPhone: getConfiguredSenderPhone(),
      });
      onShowToast(
        'Email Previews Ready',
        `Prepared ${res.prepared.length} personalized email previews for your approval (${res.skipped.length} skipped).`,
        'success'
      );
      onNavigateToOutreach();
    } catch (err: any) {
      onShowToast('Prepare Error', err?.message || 'Could not prepare emails.', 'error');
    } finally {
      setIsPreparingEmails(false);
    }
  };

  const handleCreateLead = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const hasWebsite = Boolean(newLeadForm.websiteUrl.trim());
      const cObj = countries.find((c) => c.id === Number(newLeadForm.countryId));
      await addLead({
        businessName: newLeadForm.businessName.trim(),
        contactPerson: newLeadForm.contactPerson.trim() || 'Management Team',
        category: newLeadForm.category,
        countryId: Number(newLeadForm.countryId),
        countryName: cObj?.name || newLeadForm.countryName,
        countryCode: cObj?.code || 'US',
        city: newLeadForm.city.trim(),
        state: newLeadForm.state.trim(),
        region: newLeadForm.region.trim(),
        address: newLeadForm.address.trim(),
        postalCode: newLeadForm.postalCode.trim(),
        phoneNumber: newLeadForm.phoneNumber.trim(),
        locationPhone: newLeadForm.phoneNumber.trim(),
        ownerPhone: newLeadForm.ownerPhone.trim() || null,
        whatsAppNumber: newLeadForm.ownerPhone.trim() || newLeadForm.phoneNumber.trim(),
        email: newLeadForm.email.trim(),
        emailVerificationStatus: 'Publicly Listed',
        qualityTier: 'High Quality',
        opportunityLevel: 'Medium',
        serviceRequired: newLeadForm.serviceRequired,
        websiteUrl: hasWebsite ? newLeadForm.websiteUrl.trim() : null,
        hasWebsite,
        websiteStatus: hasWebsite ? newLeadForm.websiteStatus : 'NoWebsite',
        rating: Number(newLeadForm.rating),
        reviewCount: Number(newLeadForm.reviewCount),
        source: 'Manual',
      });
      setIsAddModalOpen(false);
      onShowToast('Verified Lead Saved', `${newLeadForm.businessName} added to SQLite DB.`, 'success');
    } catch (err: any) {
      onShowToast('Validation Rejected', err?.message || 'Lead failed validation or duplicate check.', 'error');
    }
  };

  const confirmDelete = () => {
    if (leadToDelete) {
      deleteLead(leadToDelete);
      setLeadToDelete(null);
      onShowToast('Lead Removed', 'Lead deleted from permanent database.', 'info');
    } else {
      deleteSelectedLeads();
      onShowToast('Leads Removed', `${selectedLeadIds.size} leads removed.`, 'info');
    }
    setIsDeleteConfirmOpen(false);
  };

  const viewTitles: Record<LeadsViewMode, { title: string; subtitle: string; icon: any }> = {
    all: {
      title: 'All Discovered Business Leads & Smart Filter Hub',
      subtitle: 'Filter simultaneously across Country, City, Website/App/Game Type, Service Required, Quality Tier, and Verification Status.',
      icon: CheckCircle2,
    },
    website: {
      title: 'Website Business Leads',
      subtitle: 'Targeted E-commerce, Corporate, SaaS, Fintech, Outdated, Broken & Businesses Without Websites.',
      icon: Globe,
    },
    app: {
      title: 'Mobile App Business Leads',
      subtitle: 'Android, iOS, Food Delivery, Healthcare, E-commerce & Business App opportunities.',
      icon: Smartphone,
    },
    game: {
      title: 'Game Development & Studio Leads',
      subtitle: 'Mobile Games, 2D/3D, PC/Console, Unity, Unreal Engine, Gaming Studios & Game Development Buyers.',
      icon: Gamepad2,
    },
    software: {
      title: 'Software, MLM, CRM, ERP, SaaS & AI Leads',
      subtitle: 'High-intent buyers requesting Custom Software, MLM (Binary/Unilevel/Matrix/Hybrid), CRM/ERP, SaaS, AI Automation, Portals & APIs.',
      icon: Code2,
    },
    location: {
      title: 'Location-Based Verified Lead Search',
      subtitle: 'Inspect exact Country, State, City, Region & Postal matched leads with verified street addresses.',
      icon: MapPin,
    },
    verified: {
      title: '100% Verified & High-Quality Leads',
      subtitle: 'Strictly vetted prospects with publicly listed + DNS MX verified business emails, verified phones, and factual evidence.',
      icon: ShieldCheck,
    },
  };

  const activeMeta = viewTitles[viewMode];
  const HeaderIcon = activeMeta.icon;

  return (
    <div className="page-content">
      {/* Header */}
      <div className="page-header">
        <div>
          <h2 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <HeaderIcon size={22} color="var(--primary)" />
            <span>{activeMeta.title}</span>
          </h2>
          <p className="page-subtitle">{activeMeta.subtitle}</p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <WhatsAppConnectButton compact />
          {onNavigateToDiscovery && (
            <button className="btn btn-outline" onClick={onNavigateToDiscovery}>
              + Discover New Leads
            </button>
          )}
          <button className="btn btn-outline" onClick={() => setIsAddModalOpen(true)}>
            <Plus size={15} /> Add Manual Verified Lead
          </button>
          <button className="btn btn-outline" onClick={() => exportLeadsCSV(modeLeads)} disabled={modeLeads.length === 0}>
            <Download size={15} /> CSV
          </button>
          <button className="btn btn-outline" onClick={() => exportLeadsJSON(modeLeads)} disabled={modeLeads.length === 0}>
            JSON
          </button>
          <button
            className="btn btn-primary"
            style={{ background: '#16a34a', borderColor: '#16a34a', fontWeight: 700 }}
            disabled={whatsAppBulkTargets.length === 0}
            onClick={() => setIsWhatsAppBulkOpen(true)}
            title="Send 4-Step Interactive Chatbot to all available WhatsApp numbers in 1 click"
          >
            <MessageSquare size={15} />
            <span>
              {selectedLeads.length > 0
                ? `WhatsApp Selected (${whatsAppBulkTargets.length})`
                : `1-Click WhatsApp All (${whatsAppBulkTargets.length})`}
            </span>
          </button>
          <button
            className="btn btn-primary"
            disabled={(selectedLeads.length === 0 && unsentFilteredLeads.length === 0) || isPreparingEmails}
            onClick={handlePrepareSelectedEmails}
          >
            <Send size={15} />
            <span>
              {isPreparingEmails
                ? 'Preparing...'
                : selectedLeads.length > 0
                ? `Prepare & Send Selected (${selectedLeads.length})`
                : `Send All Filtered Leads (${unsentFilteredLeads.length})`}
            </span>
          </button>
        </div>
      </div>

      {/* Smart Multi-Filter Bar (All filters work together simultaneously) */}
      <div className="card">
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>
            Smart Lead Filters ({modeLeads.length} matching records out of {leads.length} total)
          </div>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => {
              resetFilters();
              setCurrentPage(1);
            }}
          >
            <RotateCcw size={13} /> Reset All Filters
          </button>
        </div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          {/* Row 1: Search + Location */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))', gap: '0.75rem' }}>
            <div>
              <label className="form-label" style={{ fontSize: '0.72rem' }}>Search Keyword</label>
              <div style={{ position: 'relative' }}>
                <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-subtle)' }} />
                <input
                  type="text"
                  className="input-field"
                  style={{ paddingLeft: '2rem', fontSize: '0.8rem' }}
                  placeholder="Name, email, website..."
                  value={filters.searchQuery}
                  onChange={(e) => {
                    setFilters((f) => ({ ...f, searchQuery: e.target.value }));
                    setCurrentPage(1);
                  }}
                />
              </div>
            </div>

            <div>
              <label className="form-label" style={{ fontSize: '0.72rem' }}>Country</label>
              <select
                className="input-field"
                style={{ fontSize: '0.8rem' }}
                value={filters.countryName}
                onChange={(e) => {
                  setFilters((f) => ({ ...f, countryName: e.target.value, state: 'all', city: 'all' }));
                  setCurrentPage(1);
                }}
              >
                <option value="all">All Countries</option>
                {availableCountries.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="form-label" style={{ fontSize: '0.72rem' }}>City</label>
              <select
                className="input-field"
                style={{ fontSize: '0.8rem' }}
                value={filters.city}
                onChange={(e) => {
                  setFilters((f) => ({ ...f, city: e.target.value }));
                  setCurrentPage(1);
                }}
              >
                <option value="all">All Cities</option>
                {availableCities.map((ci) => (
                  <option key={ci} value={ci}>{ci}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="form-label" style={{ fontSize: '0.72rem' }}>Website / App / Game Category</label>
              <select
                className="input-field"
                style={{ fontSize: '0.8rem' }}
                value={filters.category}
                onChange={(e) => {
                  setFilters((f) => ({ ...f, category: e.target.value }));
                  setCurrentPage(1);
                }}
              >
                <option value="all">All Categories</option>
                {(viewMode === 'website' || viewMode === 'all' || viewMode === 'location' || viewMode === 'verified') && (
                  <optgroup label="Website Categories">
                    {WEBSITE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </optgroup>
                )}
                {(viewMode === 'app' || viewMode === 'all' || viewMode === 'location' || viewMode === 'verified') && (
                  <optgroup label="Mobile App Categories">
                    {APP_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </optgroup>
                )}
                {(viewMode === 'game' || viewMode === 'all' || viewMode === 'location' || viewMode === 'verified') && (
                  <optgroup label="Game Categories">
                    {GAME_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </optgroup>
                )}
                {(viewMode === 'software' || viewMode === 'all' || viewMode === 'location' || viewMode === 'verified') && (
                  <optgroup label="Software, MLM, CRM, ERP, SaaS & AI">
                    {SOFTWARE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </optgroup>
                )}
              </select>
            </div>
          </div>

          {/* Row 2: Service Required + Status + Quality + Checkboxes */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))', gap: '0.75rem', alignItems: 'end' }}>
            <div>
              <label className="form-label" style={{ fontSize: '0.72rem' }}>Service Required</label>
              <select
                className="input-field"
                style={{ fontSize: '0.8rem' }}
                value={filters.serviceRequired}
                onChange={(e) => {
                  setFilters((f) => ({ ...f, serviceRequired: e.target.value }));
                  setCurrentPage(1);
                }}
              >
                <option value="all">All Services</option>
                {SERVICE_REQUIREMENTS.map((srv) => <option key={srv} value={srv}>{srv}</option>)}
              </select>
            </div>

            <div>
              <label className="form-label" style={{ fontSize: '0.72rem' }}>Website Availability</label>
              <select
                className="input-field"
                style={{ fontSize: '0.8rem' }}
                value={filters.hasWebsite}
                onChange={(e) => {
                  setFilters((f) => ({ ...f, hasWebsite: e.target.value as any }));
                  setCurrentPage(1);
                }}
              >
                <option value="all">All Websites</option>
                <option value="yes">Website Available</option>
                <option value="no">Without Website</option>
              </select>
            </div>

            <div>
              <label className="form-label" style={{ fontSize: '0.72rem' }}>Contact / Freshness Status</label>
              <select
                className="input-field"
                style={{ fontSize: '0.8rem' }}
                value={filters.contactedFilter}
                onChange={(e) => {
                  setFilters((f) => ({ ...f, contactedFilter: e.target.value as any }));
                  setCurrentPage(1);
                }}
              >
                <option value="all">All Leads</option>
                <option value="new_only">New Leads Only (Last 24h, Uncontacted)</option>
                <option value="not_contacted">Not Contacted Yet</option>
                <option value="contacted">Previously Contacted</option>
              </select>
            </div>

            <div>
              <label className="form-label" style={{ fontSize: '0.72rem' }}>Lead Quality Score</label>
              <select
                className="input-field"
                style={{ fontSize: '0.8rem' }}
                value={filters.qualityTier}
                onChange={(e) => {
                  setFilters((f) => ({ ...f, qualityTier: e.target.value as any }));
                  setCurrentPage(1);
                }}
              >
                <option value="all">All Verified Tiers</option>
                <option value="100% Verified">100% Verified Only</option>
                <option value="High Quality">High Quality Only</option>
                <option value="Medium Quality">Medium Quality Only</option>
              </select>
            </div>

            <div>
              <label className="form-label" style={{ fontSize: '0.72rem' }}>Opportunity / Intent</label>
              <select
                className="input-field"
                style={{ fontSize: '0.8rem' }}
                value={filters.buyingIntentLevel !== 'all' ? filters.buyingIntentLevel : filters.opportunityLevel}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === 'HIGH INTENT' || v === 'MEDIUM INTENT') {
                    setFilters((f) => ({ ...f, buyingIntentLevel: v, opportunityLevel: 'all' }));
                  } else {
                    setFilters((f) => ({ ...f, buyingIntentLevel: 'all', opportunityLevel: v as any }));
                  }
                  setCurrentPage(1);
                }}
              >
                <option value="all">All Intent & Opportunity</option>
                <option value="HIGH INTENT">HIGH INTENT Buyers Only</option>
                <option value="MEDIUM INTENT">MEDIUM INTENT Prospects</option>
                <option value="High">High Opportunity</option>
                <option value="Medium">Medium Opportunity</option>
                <option value="Low">Low Opportunity</option>
              </select>
            </div>

            <div>
              <label className="form-label" style={{ fontSize: '0.72rem' }}>Buyer Need Type</label>
              <select
                className="input-field"
                style={{ fontSize: '0.8rem' }}
                value={filters.buyerNeedType}
                onChange={(e) => {
                  setFilters((f) => ({ ...f, buyerNeedType: e.target.value as any }));
                  setCurrentPage(1);
                }}
              >
                <option value="all">All Needs (Buy + Update + New)</option>
                <option value="Buy">Buy (Software / RFP / Hiring)</option>
                <option value="Update">Update (Redesign / Fix Website)</option>
                <option value="New Create">New Create (No Website / New App)</option>
              </select>
            </div>

            <div>
              <label className="form-label" style={{ fontSize: '0.72rem' }}>Origin Platform (Found On)</label>
              <select
                className="input-field"
                style={{ fontSize: '0.8rem' }}
                value={filters.sourcePlatform}
                onChange={(e) => {
                  setFilters((f) => ({ ...f, sourcePlatform: e.target.value }));
                  setCurrentPage(1);
                }}
              >
                <option value="all">All Discovery Platforms (A to Z)</option>
                <option value="Google Maps">📍 Google Maps Verified Listing</option>
                <option value="Indeed">💼 Indeed Active RFP & Hiring</option>
                <option value="LinkedIn">🔗 LinkedIn Jobs & Projects</option>
                <option value="Justdial">📞 Justdial Verified Directory</option>
                <option value="IndiaMART">🏭 IndiaMART B2B Supplier Portal</option>
                <option value="Instagram">📸 Instagram Business D2C Hub</option>
                <option value="Facebook">👥 Facebook Business Directory</option>
                <option value="RERA">🏢 RERA Real Estate Registry</option>
                <option value="Zauba">🏛️ Zauba / MCA Corporate Registry</option>
                <option value="Google Search">🔍 Google Search Grounding</option>
                <option value="Freelancer">💻 Freelancer Client Briefs</option>
              </select>
            </div>
          </div>

          {/* Toggle Pills Row */}
          <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap', alignItems: 'center', fontSize: '0.8rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontWeight: 600 }}>
              <input
                type="checkbox"
                checked={filters.verifiedEmailOnly}
                onChange={(e) => setFilters((f) => ({ ...f, verifiedEmailOnly: e.target.checked }))}
              />
              <span>Verified Email Only (Publicly Listed + MX Checked)</span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontWeight: 600, color: '#059669' }}>
              <input
                type="checkbox"
                checked={filters.personalGmailOnly}
                onChange={(e) => {
                  setFilters((f) => ({ ...f, personalGmailOnly: e.target.checked }));
                  setCurrentPage(1);
                }}
              />
              <span>Owner Personal @gmail.com Only</span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontWeight: 600 }}>
              <input
                type="checkbox"
                checked={filters.verifiedPhoneOnly}
                onChange={(e) => setFilters((f) => ({ ...f, verifiedPhoneOnly: e.target.checked }))}
              />
              <span>Verified Phone Only</span>
            </label>

            {selectedLeads.length > 0 && (
              <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <span className="badge badge-primary">{selectedLeads.length} selected</span>
                <button className="btn btn-outline btn-sm" onClick={selectAllFiltered}>
                  Select All {modeLeads.length}
                </button>
                <button className="btn btn-ghost btn-sm" onClick={unselectAll}>
                  Clear
                </button>
                <button
                  className="btn btn-danger btn-sm"
                  onClick={() => {
                    setLeadToDelete(null);
                    setIsDeleteConfirmOpen(true);
                  }}
                >
                  <Trash2 size={13} /> Delete
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Leads Table */}
      <div className="card">
        <div className="table-container" style={{ border: 'none' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: '36px' }}>
                  <button
                    onClick={handleSelectAllPageToggle}
                    style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                    title="Select Page"
                  >
                    {isCurrentPageFullySelected ? <CheckSquare size={16} color="var(--primary)" /> : <Square size={16} />}
                  </button>
                </th>
                <th>Business & Complete Address</th>
                <th>Category & Service Required</th>
                <th>Verified Email & MX</th>
                <th>Phones (Location & Owner)</th>
                <th>Website & Factual Evidence</th>
                <th>Quality & Sources</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedLeads.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
                    No verified leads match the active filters. Use <strong>Lead Discovery</strong> to discover genuine verified companies for this segment.
                  </td>
                </tr>
              ) : (
                paginatedLeads.map((lead) => {
                  const isSel = selectedLeadIds.has(lead.id);
                  return (
                    <tr key={lead.id}>
                      <td>
                        <input type="checkbox" checked={isSel} onChange={() => toggleSelectLead(lead.id)} />
                      </td>
                      <td>
                        <button
                          onClick={() => onOpenLeadDetail(lead)}
                          style={{
                            background: 'none',
                            border: 'none',
                            padding: 0,
                            textAlign: 'left',
                            fontWeight: 700,
                            fontSize: '0.88rem',
                            color: 'var(--primary)',
                            cursor: 'pointer',
                          }}
                          title="Click to check full client details & audit"
                        >
                          {lead.businessName}
                        </button>
                        <div>
                          <a
                            href={
                              lead.googleMapsUrl ||
                              `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                                [lead.businessName, lead.address, lead.city, lead.countryName].filter(Boolean).join(' ')
                              )}`
                            }
                            target="_blank"
                            rel="noreferrer"
                            style={{ fontSize: '0.74rem', color: '#dc2626', fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.2rem', marginTop: '0.15rem' }}
                            title="Click to open location on Google Maps"
                          >
                            <MapPin size={11} />
                            <span>{lead.address}</span>
                            <ExternalLink size={9} />
                          </a>
                        </div>
                        <div style={{ fontSize: '0.73rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                          {lead.city}{lead.state ? `, ${lead.state}` : ''} {lead.postalCode} • {lead.countryName}
                        </div>
                      </td>
                      <td>
                        <span className="badge badge-primary" style={{ marginBottom: '0.2rem' }}>{lead.category}</span>
                        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#2563eb' }}>
                          {lead.serviceRequired || 'Assessment Pending'}
                        </div>
                        <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', marginTop: '0.2rem' }}>
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
                              <span className={`badge ${badgeClass}`} style={{ fontSize: '0.64rem', fontWeight: 700 }}>
                                Need: {need}
                              </span>
                            );
                          })()}
                          {lead.buyingIntentLevel && (
                            <span
                              className={`badge ${lead.buyingIntentLevel === 'HIGH INTENT' ? 'badge-danger' : 'badge-warning'}`}
                              style={{ fontSize: '0.64rem', fontWeight: 700 }}
                            >
                              {lead.buyingIntentLevel}
                            </span>
                          )}
                          {lead.priorityTier && (
                            <span className="badge badge-secondary" style={{ fontSize: '0.64rem', fontWeight: 700 }}>
                              {lead.priorityTier}
                            </span>
                          )}
                          {!lead.buyingIntentLevel && (
                            <span
                              className={`badge ${lead.opportunityLevel === 'High' ? 'badge-danger' : 'badge-warning'}`}
                              style={{ fontSize: '0.66rem' }}
                            >
                              {lead.opportunityLevel || 'Medium'} Opportunity
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <div style={{ fontSize: '0.8rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                          <Mail size={13} color="#10b981" />
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
                          {/@(gmail|googlemail)\.com$/i.test(lead.email || '') && (
                            <span className="badge badge-secondary" style={{ fontSize: '0.62rem', backgroundColor: '#dcfce7', color: '#166534', border: '1px solid #86efac', fontWeight: 700 }}>
                              Owner Gmail
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '0.68rem', color: '#059669', fontWeight: 600 }}>
                          {lead.emailVerificationStatus || 'Unverified'}
                        </div>
                        {lead.emailSourceUrl && (
                          <a href={lead.emailSourceUrl} target="_blank" rel="noreferrer" style={{ fontSize: '0.68rem', color: 'var(--primary)' }}>
                            Source <ExternalLink size={9} />
                          </a>
                        )}
                      </td>
                      <td>
                        <div style={{ fontSize: '0.76rem' }}>
                          <Phone size={11} /> <strong>{lead.locationPhone || lead.phoneNumber || 'Not publicly available'}</strong>
                        </div>
                        {lead.ownerPhone && (
                          <div style={{ fontSize: '0.74rem', color: '#059669', fontWeight: 600 }}>
                            Owner: {lead.ownerPhone}
                          </div>
                        )}
                      </td>
                      <td style={{ maxWidth: '250px' }}>
                        {lead.hasWebsite && lead.websiteUrl ? (
                          <a href={lead.websiteUrl} target="_blank" rel="noreferrer" style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--primary)' }}>
                            {lead.websiteUrl.replace(/^https?:\/\//, '').slice(0, 30)} <ExternalLink size={10} />
                          </a>
                        ) : (
                          <span className="badge badge-danger" style={{ fontSize: '0.68rem' }}>No Website</span>
                        )}
                        {(lead.exactProjectRequirement || lead.evidenceSummary) && (
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.2rem', lineHeight: 1.3 }}>
                            {lead.exactProjectRequirement && lead.exactProjectRequirement !== 'Not publicly available'
                              ? lead.exactProjectRequirement
                              : lead.evidenceSummary}
                          </div>
                        )}
                      </td>
                      <td>
                        <span
                          className={`badge ${
                            lead.qualityTier === '100% Verified'
                              ? 'badge-secondary'
                              : lead.qualityTier === 'High Quality'
                              ? 'badge-primary'
                              : 'badge-warning'
                          }`}
                        >
                          {lead.leadVerificationBadge || lead.qualityTier || 'High Quality'} ({lead.leadScore})
                        </span>
                        <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#2563eb', marginTop: '0.25rem' }}>
                          Found On: {lead.sourcePlatform || lead.source}
                        </div>
                        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.15rem' }}>
                          {(lead.sourceUrls || []).slice(0, 2).map((u, i) => (
                            <a key={i} href={u} target="_blank" rel="noreferrer" style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                              {i === 0 ? 'Origin Link' : `URL #${i + 1}`} <ExternalLink size={9} />
                            </a>
                          ))}
                        </div>
                      </td>
                      <td>
                        <span
                          className={`badge ${
                            lead.outreachStatus === 'EmailSent' || lead.outreachStatus === 'Replied'
                              ? 'badge-secondary'
                              : lead.outreachStatus === 'EmailError' || lead.outreachStatus === 'Unsubscribed'
                              ? 'badge-danger'
                              : 'badge-muted'
                          }`}
                        >
                          {lead.outreachStatus || 'Pending'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.3rem' }}>
                          <button className="btn btn-outline btn-sm" onClick={() => onOpenLeadDetail(lead)}>
                            Inspect
                          </button>
                          <button
                            className="icon-btn"
                            title="Delete lead"
                            onClick={() => {
                              setLeadToDelete(lead.id);
                              setIsDeleteConfirmOpen(true);
                            }}
                          >
                            <Trash2 size={14} color="#ef4444" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '0.85rem 1.25rem',
            borderTop: '1px solid var(--border-color)',
            fontSize: '0.8rem',
          }}
        >
          <span>
            Page <strong>{safePage}</strong> of <strong>{totalPages}</strong> ({modeLeads.length} matching leads)
          </span>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              className="btn btn-outline btn-sm"
              disabled={safePage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft size={14} /> Prev
            </button>
            <button
              className="btn btn-outline btn-sm"
              disabled={safePage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            >
              Next <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Add Verified Manual Lead Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Add Manually Verified Lead"
        footer={
          <>
            <button className="btn btn-outline" onClick={() => setIsAddModalOpen(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleCreateLead}>Verify & Save to DB</button>
          </>
        }
      >
        <form onSubmit={handleCreateLead} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          <div className="form-group">
            <label className="form-label">Business Name *</label>
            <input
              type="text"
              className="input-field"
              value={newLeadForm.businessName}
              onChange={(e) => setNewLeadForm({ ...newLeadForm, businessName: e.target.value })}
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">Public Business Email *</label>
            <input
              type="email"
              className="input-field"
              value={newLeadForm.email}
              onChange={(e) => setNewLeadForm({ ...newLeadForm, email: e.target.value })}
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">Verified Office Phone *</label>
            <input
              type="text"
              className="input-field"
              value={newLeadForm.phoneNumber}
              onChange={(e) => setNewLeadForm({ ...newLeadForm, phoneNumber: e.target.value })}
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">Owner Direct Phone (Optional)</label>
            <input
              type="text"
              className="input-field"
              value={newLeadForm.ownerPhone}
              onChange={(e) => setNewLeadForm({ ...newLeadForm, ownerPhone: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Country *</label>
            <select
              className="input-field"
              value={newLeadForm.countryId}
              onChange={(e) => setNewLeadForm({ ...newLeadForm, countryId: Number(e.target.value) })}
            >
              {countries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">City *</label>
            <input
              type="text"
              className="input-field"
              value={newLeadForm.city}
              onChange={(e) => setNewLeadForm({ ...newLeadForm, city: e.target.value })}
              required
            />
          </div>
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label className="form-label">Complete Verified Street Address *</label>
            <input
              type="text"
              className="input-field"
              value={newLeadForm.address}
              onChange={(e) => setNewLeadForm({ ...newLeadForm, address: e.target.value })}
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">Category</label>
            <select
              className="input-field"
              value={newLeadForm.category}
              onChange={(e) => setNewLeadForm({ ...newLeadForm, category: e.target.value })}
            >
              {[...WEBSITE_CATEGORIES, ...APP_CATEGORIES, ...GAME_CATEGORIES, ...SOFTWARE_CATEGORIES].map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Official Website URL</label>
            <input
              type="text"
              className="input-field"
              value={newLeadForm.websiteUrl}
              onChange={(e) => setNewLeadForm({ ...newLeadForm, websiteUrl: e.target.value })}
            />
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={isDeleteConfirmOpen}
        onClose={() => setIsDeleteConfirmOpen(false)}
        title="Confirm Permanent Delete"
        footer={
          <>
            <button className="btn btn-outline" onClick={() => setIsDeleteConfirmOpen(false)}>Cancel</button>
            <button className="btn btn-danger" onClick={confirmDelete}>Delete Permanently</button>
          </>
        }
      >
        <p style={{ fontSize: '0.9rem' }}>
          Remove {leadToDelete ? 'this lead' : `${selectedLeadIds.size} selected leads`} from the SQLite database?
        </p>
      </Modal>

      <WhatsAppBulkSendModal
        isOpen={isWhatsAppBulkOpen}
        onClose={() => setIsWhatsAppBulkOpen(false)}
        leads={whatsAppBulkTargets}
        scopeLabel={selectedLeads.length > 0 ? 'Selected Leads' : 'Filtered Leads'}
        onShowToast={onShowToast}
        onCompleted={() => {
          void refreshLeadsFromDb();
        }}
      />
    </div>
  );
};
