import React, { useState, useEffect, useCallback } from 'react';
import {
  MailCheck,
  CheckCircle2,
  XCircle,
  Clock,
  Ban,
  RefreshCw,
  ExternalLink,
  Plus,
} from 'lucide-react';
import { EmailCampaignItem } from '../types';
import { fetchEmailCampaigns, fetchUnsubscribes, unsubscribeEmail } from '../services/googleLeadsApi';
import { GMAIL_SENT_FOLDER_URL } from '../services/gmailApiService';

interface SentEmailsPageProps {
  onShowToast: (title: string, message: string, type: 'success' | 'error' | 'info') => void;
}

export const SentEmailsPage: React.FC<SentEmailsPageProps> = ({ onShowToast }) => {
  const [items, setItems] = useState<EmailCampaignItem[]>([]);
  const [unsubscribes, setUnsubscribes] = useState<Array<{ email: string; reason: string; unsubscribedAt: string }>>([]);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [newUnsubEmail, setNewUnsubEmail] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const loadAll = useCallback(async () => {
    setIsLoading(true);
    try {
      const [cRes, uRes] = await Promise.all([fetchEmailCampaigns('all'), fetchUnsubscribes()]);
      if (cRes.success) setItems(cRes.items);
      if (uRes.success) setUnsubscribes(uRes.list);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleAddUnsub = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUnsubEmail.includes('@')) return;
    await unsubscribeEmail(newUnsubEmail.trim(), 'Manual Opt-Out Entry');
    setNewUnsubEmail('');
    await loadAll();
    onShowToast('Unsubscribe Recorded', 'Address permanently blocked from outreach.', 'info');
  };

  const filtered = statusFilter === 'all' ? items : items.filter((i) => i.status === statusFilter);
  const counts = {
    Sent: items.filter((i) => i.status === 'Sent').length,
    Failed: items.filter((i) => i.status === 'Failed').length,
    Pending: items.filter((i) => i.status === 'PendingApproval' || i.status === 'Approved').length,
    Rejected: items.filter((i) => i.status === 'Rejected').length,
    Unsubscribed: unsubscribes.length,
  };

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <h2 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <MailCheck size={22} color="var(--primary)" />
            <span>Sent Emails, Delivery Failures, Pending & Unsubscribes</span>
          </h2>
          <p className="page-subtitle">
            Complete audit ledger persisted in SQLite with real Gmail Message IDs, delivery errors, and privacy opt-out compliance.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-outline" onClick={loadAll} disabled={isLoading}>
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} /> Refresh
          </button>
          <a href={GMAIL_SENT_FOLDER_URL} target="_blank" rel="noreferrer" className="btn btn-primary">
            Open Gmail Sent <ExternalLink size={14} />
          </a>
        </div>
      </div>

      {/* Status Filter Pills */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        {[
          { key: 'all', label: `All Records (${items.length})` },
          { key: 'Sent', label: `Sent (${counts.Sent})` },
          { key: 'PendingApproval', label: `Pending Approval (${items.filter((i) => i.status === 'PendingApproval').length})` },
          { key: 'Approved', label: `Approved Ready (${items.filter((i) => i.status === 'Approved').length})` },
          { key: 'Failed', label: `Failed (${counts.Failed})` },
          { key: 'Rejected', label: `Rejected (${counts.Rejected})` },
          { key: 'Unsubscribed', label: `Unsubscribed (${counts.Unsubscribed})` },
        ].map((tab) => (
          <button
            key={tab.key}
            className={`btn btn-sm ${statusFilter === tab.key ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setStatusFilter(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Records Table */}
      <div className="card">
        <div className="table-container" style={{ border: 'none' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Business</th>
                <th>Recipient Email</th>
                <th>Category & Client Location</th>
                <th>Subject</th>
                <th>Status</th>
                <th>Gmail ID / Error Detail</th>
                <th>Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                    No email records matching this filter yet.
                  </td>
                </tr>
              ) : (
                filtered.map((item) => (
                  <tr key={item.id}>
                    <td style={{ fontWeight: 700 }}>{item.businessName}</td>
                    <td style={{ fontSize: '0.8rem' }}>{item.recipientEmail}</td>
                    <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)', maxWidth: '250px' }}>
                      <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>{item.category}</div>
                      {item.address && <div style={{ fontSize: '0.72rem' }}>{item.address}</div>}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                        <span>{[item.city, item.countryName].filter(Boolean).join(', ')}</span>
                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                            [item.businessName, item.address, item.city, item.countryName].filter(Boolean).join(' ')
                          )}`}
                          target="_blank"
                          rel="noreferrer"
                          style={{ fontSize: '0.69rem', color: '#dc2626', fontWeight: 700, textDecoration: 'none' }}
                        >
                          Maps <ExternalLink size={9} />
                        </a>
                      </div>
                    </td>
                    <td style={{ maxWidth: '260px', fontSize: '0.8rem' }}>{item.subject}</td>
                    <td>
                      <span
                        className={`badge ${
                          item.status === 'Sent'
                            ? 'badge-secondary'
                            : item.status === 'Failed' || item.status === 'Unsubscribed'
                            ? 'badge-danger'
                            : item.status === 'Approved'
                            ? 'badge-primary'
                            : 'badge-warning'
                        }`}
                      >
                        {item.status === 'Sent' ? <CheckCircle2 size={11} /> : item.status === 'Failed' ? <XCircle size={11} /> : <Clock size={11} />}{' '}
                        {item.status}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.76rem', maxWidth: '250px' }}>
                      {item.gmailMessageId ? (
                        <code style={{ color: '#059669' }}>ID: {item.gmailMessageId}</code>
                      ) : item.errorMessage ? (
                        <span style={{ color: '#ef4444' }}>{item.errorMessage}</span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>Awaiting send</span>
                      )}
                    </td>
                    <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {new Date(item.sentAt || item.updatedAt).toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Unsubscribe Opt-Out Compliance Section */}
      <div className="card">
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Ban size={18} color="#ef4444" />
            <h3 className="card-title" style={{ margin: 0 }}>
              Permanent Unsubscribe & Opt-Out Suppression List ({unsubscribes.length})
            </h3>
          </div>
          <form onSubmit={handleAddUnsub} style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              type="email"
              className="input-field"
              placeholder="Add email to opt-out list..."
              value={newUnsubEmail}
              onChange={(e) => setNewUnsubEmail(e.target.value)}
              style={{ width: '240px', fontSize: '0.8rem' }}
            />
            <button type="submit" className="btn btn-outline btn-sm">
              <Plus size={14} /> Add Opt-Out
            </button>
          </form>
        </div>
        <div className="card-body">
          {unsubscribes.length === 0 ? (
            <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)' }}>
              No unsubscribed addresses recorded.
            </p>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {unsubscribes.map((u) => (
                <span key={u.email} className="badge badge-danger" style={{ fontSize: '0.76rem' }}>
                  {u.email} ({new Date(u.unsubscribedAt).toLocaleDateString()})
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
