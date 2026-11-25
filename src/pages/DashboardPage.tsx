import React, { useMemo } from 'react';
import {
  Users,
  Globe2,
  Send,
  Zap,
  CheckCircle2,
  ArrowRight,
  Sparkles,
  PhoneCall,
  Clock,
  Mail,
  ShieldCheck,
  ShieldAlert,
  Smartphone,
  Gamepad2,
  Globe,
  MapPin,
  CopyCheck,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { useLeads } from '../context/LeadContext';

interface DashboardPageProps {
  onNavigate: (tab: string) => void;
  onOpenQuickFetch: () => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({ onNavigate }) => {
  const { leads, metrics, discoveryHistory, selectedCountryId } = useLeads();

  const effectiveLeads = useMemo(() => {
    if (selectedCountryId === 'all') return leads;
    return leads.filter((l) => l.countryId === selectedCountryId);
  }, [leads, selectedCountryId]);

  const categoryData = useMemo(() => {
    const counts: Record<string, number> = {};
    effectiveLeads.forEach((l) => {
      counts[l.category] = (counts[l.category] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 7);
  }, [effectiveLeads]);

  const groupDistribution = useMemo(() => {
    const counts = {
      Website: effectiveLeads.filter((l) => !l.primaryGroup || l.primaryGroup === 'Website').length,
      App: effectiveLeads.filter((l) => l.primaryGroup === 'App').length,
      Game: effectiveLeads.filter((l) => l.primaryGroup === 'Game').length,
    };
    return [
      { name: 'Website Leads', value: counts.Website },
      { name: 'App Leads', value: counts.App },
      { name: 'Game Leads', value: counts.Game },
    ].filter((d) => d.value > 0);
  }, [effectiveLeads]);

  const qualityDistribution = useMemo(() => {
    return [
      {
        tier: '100% Verified',
        count: effectiveLeads.filter((l) => l.qualityTier === '100% Verified').length,
      },
      {
        tier: 'High Quality',
        count: effectiveLeads.filter((l) => l.qualityTier === 'High Quality').length,
      },
      {
        tier: 'Medium Quality',
        count: effectiveLeads.filter((l) => l.qualityTier === 'Medium Quality').length,
      },
    ];
  }, [effectiveLeads]);

  const PIE_COLORS = ['#2563eb', '#10b981', '#8b5cf6', '#f59e0b'];

  const metricCards = [
    {
      title: 'Total Leads Found',
      value: metrics.totalLeadsFound,
      sub: 'Permanent verified SQLite records',
      icon: Users,
      iconClass: 'primary',
      color: 'var(--primary)',
      nav: 'leads',
    },
    {
      title: 'New Unique Leads',
      value: metrics.newUniqueLeads,
      sub: 'Latest verified discovery run',
      icon: Sparkles,
      iconClass: 'secondary',
      color: '#10b981',
      nav: 'verified-leads',
    },
    {
      title: 'Verified Emails',
      value: metrics.verifiedEmails,
      sub: 'Publicly listed + DNS MX checked',
      icon: Mail,
      iconClass: 'primary',
      color: '#2563eb',
      nav: 'verified-leads',
    },
    {
      title: 'Verified Phone Numbers',
      value: metrics.verifiedPhoneNumbers,
      sub: 'Direct business & location phones',
      icon: PhoneCall,
      iconClass: 'secondary',
      color: '#059669',
      nav: 'leads',
    },
    {
      title: 'Available Websites',
      value: metrics.availableWebsites,
      sub: 'Live URLs inspected via HTTP',
      icon: Globe,
      iconClass: 'primary',
      color: '#0284c7',
      nav: 'website-leads',
    },
    {
      title: 'Potential Business Opportunities',
      value: metrics.potentialOpportunities,
      sub: 'Factual High/Medium need evidence',
      icon: Zap,
      iconClass: 'secondary',
      color: '#f59e0b',
      nav: 'google-scanner',
    },
    {
      title: 'Emails Sent',
      value: metrics.emailsSent,
      sub: 'Approved & dispatched via Gmail OAuth',
      icon: Send,
      iconClass: 'primary',
      color: '#6366f1',
      nav: 'sent-emails',
    },
    {
      title: 'Pending Emails',
      value: metrics.pendingEmails,
      sub: 'Awaiting preview approval or send',
      icon: Clock,
      iconClass: 'danger',
      color: '#eab308',
      nav: 'outreach',
    },
    {
      title: 'Duplicate Leads Prevented',
      value: metrics.duplicateLeadsPrevented,
      sub: 'Blocked by Name/Domain/Email/Phone',
      icon: CopyCheck,
      iconClass: 'danger',
      color: '#ef4444',
      nav: 'fetch-logs',
    },
  ];

  return (
    <div className="page-content">
      {/* Header */}
      <div className="page-header">
        <div>
          <h2 className="page-title">Verified Lead Generation & Gmail Outreach Dashboard</h2>
          <p className="page-subtitle">
            Real-time Google Search grounding, live website auditing, DNS MX email verification, and OAuth Gmail campaigns.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button
            className="btn btn-primary"
            onClick={() => onNavigate('google-scanner')}
            style={{ background: '#10b981', borderColor: '#10b981' }}
          >
            <Sparkles size={16} />
            <span>Execute AI Discovery (100 Leads)</span>
          </button>
          <button className="btn btn-outline" onClick={() => onNavigate('location-search')}>
            <MapPin size={16} />
            <span>Location Search</span>
          </button>
          <button className="btn btn-primary" onClick={() => onNavigate('outreach')}>
            <Mail size={16} />
            <span>Email Campaigns ({metrics.pendingEmails})</span>
          </button>
        </div>
      </div>

      {/* Quick Category Workspaces */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
          gap: '0.85rem',
          marginBottom: '1.25rem',
        }}
      >
        <button
          className="card"
          onClick={() => onNavigate('website-leads')}
          style={{ padding: '1rem', textAlign: 'left', cursor: 'pointer', borderLeft: '4px solid #2563eb' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>Website Leads</span>
            <Globe size={17} color="#2563eb" />
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            17 Website & Niche Categories ➜
          </div>
        </button>

        <button
          className="card"
          onClick={() => onNavigate('app-leads')}
          style={{ padding: '1rem', textAlign: 'left', cursor: 'pointer', borderLeft: '4px solid #10b981' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>Mobile App Leads</span>
            <Smartphone size={17} color="#10b981" />
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            11 Android & iOS Categories ➜
          </div>
        </button>

        <button
          className="card"
          onClick={() => onNavigate('game-leads')}
          style={{ padding: '1rem', textAlign: 'left', cursor: 'pointer', borderLeft: '4px solid #8b5cf6' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>Game Studio Leads</span>
            <Gamepad2 size={17} color="#8b5cf6" />
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            11 Game & Studio Categories ➜
          </div>
        </button>

        <button
          className="card"
          onClick={() => onNavigate('sent-emails')}
          style={{ padding: '1rem', textAlign: 'left', cursor: 'pointer', borderLeft: '4px solid #f59e0b' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>Sent Emails & Logs</span>
            <ShieldCheck size={17} color="#f59e0b" />
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            Approved, Sent, Failed & Opt-Outs ➜
          </div>
        </button>
      </div>

      {/* 9 Required Real Metrics Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
          gap: '1rem',
          marginBottom: '1.5rem',
        }}
      >
        {metricCards.map((m) => {
          const Icon = m.icon;
          return (
            <div
              key={m.title}
              className="stat-card"
              style={{ cursor: 'pointer' }}
              onClick={() => onNavigate(m.nav)}
            >
              <div className="stat-info">
                <h3>{m.title}</h3>
                <div className="stat-value" style={{ color: m.color }}>
                  {m.value}
                </div>
                <div className="stat-sub">
                  <span>{m.sub}</span>
                </div>
              </div>
              <div className={`stat-icon ${m.iconClass}`}>
                <Icon size={20} />
              </div>
            </div>
          );
        })}
      </div>

      {leads.length === 0 && (
        <div
          className="card"
          style={{
            marginBottom: '1.5rem',
            padding: '1.5rem',
            borderLeft: '4px solid var(--primary)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem',
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800 }}>
              Database Ready for 100% Genuine Verified Lead Discovery
            </h3>
            <p style={{ margin: '0.35rem 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Zero placeholder or dummy leads are preloaded. Run <strong>Lead Discovery</strong> with your exact Category + Country + City filters to verify live websites, extract publicly listed emails, check DNS MX records, and store permanent unique leads.
            </p>
          </div>
          <button className="btn btn-primary" onClick={() => onNavigate('google-scanner')}>
            <Sparkles size={16} />
            <span>Start Verified Discovery</span>
            <ArrowRight size={15} />
          </button>
        </div>
      )}

      {/* Charts Section */}
      {leads.length > 0 && (
        <div className="dashboard-charts-grid" style={{ marginBottom: '1.5rem' }}>
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Verified Leads by Category</h3>
            </div>
            <div className="card-body" style={{ height: 270, padding: '1rem 0.5rem 0.5rem 0.5rem' }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categoryData} layout="vertical">
                  <XAxis type="number" stroke="var(--text-subtle)" fontSize={12} tickLine={false} />
                  <YAxis dataKey="name" type="category" stroke="var(--text-subtle)" fontSize={11} tickLine={false} width={145} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: 'var(--border-color)',
                      borderRadius: '8px',
                    }}
                  />
                  <Bar dataKey="count" fill="#2563eb" radius={[0, 4, 4, 0]} name="Verified Leads" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Quality Verification & Segment Mix</h3>
            </div>
            <div className="card-body" style={{ height: 270, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={groupDistribution} cx="50%" cy="50%" innerRadius={45} outerRadius={72} paddingAngle={4} dataKey="value">
                    {groupDistribution.map((_, index) => (
                      <Cell key={`g-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend verticalAlign="bottom" height={32} iconType="circle" />
                </PieChart>
              </ResponsiveContainer>

              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={qualityDistribution}>
                  <XAxis dataKey="tier" stroke="var(--text-subtle)" fontSize={11} tickLine={false} />
                  <YAxis stroke="var(--text-subtle)" fontSize={11} tickLine={false} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#10b981" radius={[4, 4, 0, 0]} name="Leads" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* Real Discovery Runs Table */}
      <div className="card">
        <div className="card-header">
          <div>
            <h3 className="card-title">Recent Discovery & Deduplication History</h3>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Real backend execution records stored in SQLite (excluded incomplete/unverified records & duplicates prevented)
            </p>
          </div>
          <button className="btn btn-outline btn-sm" onClick={() => onNavigate('fetch-logs')}>
            View Full History <ArrowRight size={14} />
          </button>
        </div>
        <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Run ID</th>
                <th>Target Categories</th>
                <th>Exact Location</th>
                <th>Requested</th>
                <th>Verified Found</th>
                <th>Duplicates Blocked</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {discoveryHistory.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)' }}>
                    No discovery runs recorded yet. Launch Lead Discovery to collect your first verified batch.
                  </td>
                </tr>
              ) : (
                discoveryHistory.slice(0, 6).map((run) => (
                  <tr key={run.jobId}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>#{run.id}</td>
                    <td style={{ fontSize: '0.8rem' }}>{run.categories.join(', ')}</td>
                    <td style={{ fontWeight: 600 }}>
                      {[run.city, run.state, run.country].filter(Boolean).join(', ')}
                    </td>
                    <td>{run.requestedCount}</td>
                    <td>
                      <strong style={{ color: '#10b981' }}>{run.verifiedCount}</strong>
                    </td>
                    <td>
                      <span className="badge badge-warning">{run.duplicatesPrevented}</span>
                    </td>
                    <td>
                      <span className={`badge ${run.status === 'Completed' ? 'badge-secondary' : run.status === 'Failed' ? 'badge-danger' : 'badge-primary'}`}>
                        {run.status === 'Completed' ? <CheckCircle2 size={12} /> : <ShieldAlert size={12} />} {run.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
