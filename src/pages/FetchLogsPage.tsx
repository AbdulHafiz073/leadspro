import React from 'react';
import {
  Clock,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  CopyCheck,
  Sparkles,
} from 'lucide-react';
import { useLeads } from '../context/LeadContext';

interface FetchLogsPageProps {
  onShowToast: (title: string, message: string, type: 'success' | 'error' | 'info') => void;
}

export const FetchLogsPage: React.FC<FetchLogsPageProps> = ({ onShowToast }) => {
  const { discoveryHistory, metrics, refreshLeadsFromDb, isLoadingLeads } = useLeads();

  const handleRefresh = async () => {
    await refreshLeadsFromDb();
    onShowToast('Lead History Synced', 'Reloaded permanent SQLite discovery and deduplication history.', 'info');
  };

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <h2 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Clock size={22} color="var(--primary)" />
            <span>Permanent Lead Discovery & Deduplication History</span>
          </h2>
          <p className="page-subtitle">
            Server-side SQLite audit log tracking every discovery batch, verified leads persisted, incomplete leads excluded, and duplicates prevented.
          </p>
        </div>

        <button className="btn btn-outline" onClick={handleRefresh} disabled={isLoadingLeads}>
          <RefreshCw size={15} className={isLoadingLeads ? 'animate-spin' : ''} />
          <span>Refresh History</span>
        </button>
      </div>

      {/* Summary Strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '1rem' }}>
        <div className="stat-card">
          <div className="stat-info">
            <h3>Total Runs Logged</h3>
            <div className="stat-value">{discoveryHistory.length}</div>
            <div className="stat-sub">Persisted SQLite executions</div>
          </div>
          <div className="stat-icon primary">
            <Sparkles size={20} />
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-info">
            <h3>Total Verified Stored</h3>
            <div className="stat-value" style={{ color: '#10b981' }}>{metrics.totalLeadsFound}</div>
            <div className="stat-sub">Unique verified businesses</div>
          </div>
          <div className="stat-icon secondary">
            <CheckCircle2 size={20} />
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-info">
            <h3>Total Duplicates Prevented</h3>
            <div className="stat-value" style={{ color: '#f59e0b' }}>{metrics.duplicateLeadsPrevented}</div>
            <div className="stat-sub">Blocked by Name/Domain/Email/Phone</div>
          </div>
          <div className="stat-icon danger">
            <CopyCheck size={20} />
          </div>
        </div>
      </div>

      {/* Discovery History Table */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title" style={{ margin: 0 }}>Discovery Run Ledger (SQLite: discovery_runs)</h3>
          <span className="badge badge-primary">{discoveryHistory.length} runs</span>
        </div>

        <div className="table-container" style={{ border: 'none' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Run ID</th>
                <th>Categories Targeted</th>
                <th>Exact Location</th>
                <th>Service Focus</th>
                <th>Requested</th>
                <th>Raw Search</th>
                <th>Verified Saved</th>
                <th>Unverified Excluded</th>
                <th>Duplicates Prevented</th>
                <th>Status</th>
                <th>Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {discoveryHistory.length === 0 ? (
                <tr>
                  <td colSpan={11} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                    No discovery runs executed yet. Run Lead Discovery to record your first permanent history entry.
                  </td>
                </tr>
              ) : (
                discoveryHistory.map((run) => (
                  <tr key={run.jobId}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>#{run.id}</td>
                    <td style={{ maxWidth: '200px', fontSize: '0.78rem' }}>{run.categories.join(', ')}</td>
                    <td style={{ fontWeight: 600, fontSize: '0.8rem' }}>
                      {[run.city, run.state, run.region, run.country, run.postalCode].filter(Boolean).join(', ')}
                    </td>
                    <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      {run.serviceRequired || 'Auto-Detect'}
                    </td>
                    <td>{run.requestedCount}</td>
                    <td>{run.foundCount}</td>
                    <td>
                      <strong style={{ color: '#10b981' }}>{run.verifiedCount}</strong>
                    </td>
                    <td style={{ color: 'var(--text-muted)' }}>{run.excludedCount}</td>
                    <td>
                      <span className="badge badge-warning">{run.duplicatesPrevented}</span>
                    </td>
                    <td>
                      <span
                        className={`badge ${
                          run.status === 'Completed'
                            ? 'badge-secondary'
                            : run.status === 'Failed'
                            ? 'badge-danger'
                            : 'badge-primary'
                        }`}
                        title={run.errorMessage || undefined}
                      >
                        {run.status === 'Completed' ? <CheckCircle2 size={11} /> : <AlertTriangle size={11} />} {run.status}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                      {new Date(run.startedAt).toLocaleString()}
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
