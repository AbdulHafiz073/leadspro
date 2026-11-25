import React from 'react';
import { WebsiteStatus } from '../types';
import { Globe, AlertTriangle, XCircle, CheckCircle2 } from 'lucide-react';

interface WebsiteStatusBadgeProps {
  status: WebsiteStatus;
  url?: string | null;
}

export const WebsiteStatusBadge: React.FC<WebsiteStatusBadgeProps> = ({ status, url }) => {
  switch (status) {
    case 'NoWebsite':
      return (
        <span className="website-pill status-nowebsite" title="High conversion target: No website found">
          <XCircle size={13} />
          No Website
        </span>
      );
    case 'NeedsUpdate':
      return (
        <span className="website-pill status-needsupdate" title="Website is outdated or has mobile layout issues">
          <AlertTriangle size={13} />
          Needs Update
        </span>
      );
    case 'Outdated':
      return (
        <span className="website-pill status-outdated" title="Legacy website detected">
          <AlertTriangle size={13} />
          Outdated
        </span>
      );
    case 'HasWebsite':
      return (
        <a
          href={url || '#'}
          target="_blank"
          rel="noreferrer"
          className="website-pill status-haswebsite"
          onClick={(e) => !url && e.preventDefault()}
          title={url || 'Active website'}
        >
          <CheckCircle2 size={13} />
          Active
        </a>
      );
    default:
      return (
        <span className="website-pill" style={{ background: 'var(--bg-muted)', color: 'var(--text-muted)' }}>
          <Globe size={13} />
          Unknown
        </span>
      );
  }
};

interface LeadScoreBadgeProps {
  score: number;
}

export const LeadScoreBadge: React.FC<LeadScoreBadgeProps> = ({ score }) => {
  let scoreClass = 'score-low';
  if (score >= 75) {
    scoreClass = 'score-high';
  } else if (score >= 45) {
    scoreClass = 'score-med';
  }

  return (
    <div className={`lead-score-badge ${scoreClass}`} title={`Lead Score: ${score}/100`}>
      <div className="score-bar-bg">
        <div className="score-bar-fill" style={{ width: `${Math.min(100, Math.max(5, score))}%` }} />
      </div>
      <span>{score}</span>
    </div>
  );
};
