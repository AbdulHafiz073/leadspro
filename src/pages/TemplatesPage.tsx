import React, { useState } from 'react';
import {
  Plus,
  Edit2,
  Trash2,
  FileCode2,
  Copy,
  MessageSquare,
  Mail,
  Twitter,
  Instagram,
  Send,
  Sparkles
} from 'lucide-react';
import { useOutreach } from '../context/OutreachContext';
import { OutreachChannel, OutreachTemplate } from '../types';
import { Modal } from '../components/ModalAndToast';

interface TemplatesPageProps {
  onShowToast: (title: string, message: string, type: 'success' | 'error' | 'info') => void;
}

export const TemplatesPage: React.FC<TemplatesPageProps> = ({ onShowToast }) => {
  const { templates, addTemplate, updateTemplate, deleteTemplate } = useOutreach();

  const [activeChannelFilter, setActiveChannelFilter] = useState<OutreachChannel | 'all'>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<OutreachTemplate | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formChannel, setFormChannel] = useState<OutreachChannel>('WhatsApp');
  const [formSubject, setFormSubject] = useState('');
  const [formBody, setFormBody] = useState('');

  const filteredTemplates = templates.filter((t) => {
    if (activeChannelFilter === 'all') return true;
    return t.channel === activeChannelFilter;
  });

  const handleOpenCreateModal = () => {
    setEditingTemplate(null);
    setFormName('');
    setFormChannel('WhatsApp');
    setFormSubject('');
    setFormBody('Hi {ContactPerson}, I noticed {BusinessName} in {City} has great reviews...');
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (tpl: OutreachTemplate) => {
    setEditingTemplate(tpl);
    setFormName(tpl.name);
    setFormChannel(tpl.channel);
    setFormSubject(tpl.subject || '');
    setFormBody(tpl.body);
    setIsModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formBody.trim()) {
      onShowToast('Missing Fields', 'Template name and body are required.', 'error');
      return;
    }

    if (editingTemplate) {
      updateTemplate(editingTemplate.id, {
        name: formName,
        channel: formChannel,
        subject: formChannel === 'Email' ? formSubject : null,
        body: formBody,
      });
      onShowToast('Template Updated', `"${formName}" saved successfully.`, 'success');
    } else {
      addTemplate({
        userId: 1,
        name: formName,
        channel: formChannel,
        subject: formChannel === 'Email' ? formSubject : null,
        body: formBody,
      });
      onShowToast('Template Created', `"${formName}" created successfully.`, 'success');
    }

    setIsModalOpen(false);
  };

  const insertToken = (token: string) => {
    setFormBody((prev) => `${prev} ${token}`);
  };

  const channelIcons: Record<OutreachChannel, any> = {
    WhatsApp: MessageSquare,
    Email: Mail,
    Twitter: Twitter,
    Instagram: Instagram,
    Telegram: Send,
  };

  return (
    <div className="page-content">
      {/* Header */}
      <div className="page-header">
        <div>
          <h2 className="page-title">Outreach Message Templates</h2>
          <p className="page-subtitle">
            Craft high-converting pitch scripts with dynamic personalization tags for all outbound channels.
          </p>
        </div>

        <button className="btn btn-primary" onClick={handleOpenCreateModal}>
          <Plus size={16} />
          <span>New Template</span>
        </button>
      </div>

      {/* Channel Filters */}
      <div className="tab-list">
        <button
          className={`tab-btn ${activeChannelFilter === 'all' ? 'active' : ''}`}
          onClick={() => setActiveChannelFilter('all')}
        >
          All Channels ({templates.length})
        </button>
        {(['WhatsApp', 'Email', 'Twitter', 'Instagram', 'Telegram'] as OutreachChannel[]).map((ch) => {
          const count = templates.filter((t) => t.channel === ch).length;
          return (
            <button
              key={ch}
              className={`tab-btn ${activeChannelFilter === ch ? 'active' : ''}`}
              onClick={() => setActiveChannelFilter(ch)}
            >
              {ch} ({count})
            </button>
          );
        })}
      </div>

      {/* Template Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1.25rem' }}>
        {filteredTemplates.map((template, idx) => {
          const Icon = channelIcons[template.channel];
          return (
            <div key={`template-${template.id}-${idx}`} className="card" style={{ display: 'flex', flexDirection: 'column' }}>
              <div className="card-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <Icon size={16} color="var(--primary)" />
                  <span className="badge badge-primary">{template.channel}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <button
                    className="icon-btn"
                    style={{ width: '28px', height: '28px' }}
                    onClick={() => handleOpenEditModal(template)}
                    title="Edit template"
                  >
                    <Edit2 size={13} />
                  </button>
                  <button
                    className="icon-btn"
                    style={{ width: '28px', height: '28px', color: 'var(--danger)' }}
                    onClick={() => {
                      deleteTemplate(template.id);
                      onShowToast('Template Removed', `Template removed.`, 'info');
                    }}
                    title="Delete template"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              <div className="card-body" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 700 }}>{template.name}</h4>

                {template.subject && (
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', background: 'var(--bg-muted)', padding: '0.4rem 0.6rem', borderRadius: 'var(--radius-sm)' }}>
                    <strong>Subject:</strong> {template.subject}
                  </div>
                )}

                <div
                  style={{
                    background: 'var(--bg-main)',
                    border: '1px solid var(--border-color)',
                    padding: '0.85rem',
                    borderRadius: 'var(--radius-md)',
                    fontSize: '0.825rem',
                    color: 'var(--text-main)',
                    whiteSpace: 'pre-wrap',
                    fontFamily: 'var(--font-sans)',
                    lineHeight: '1.5',
                    flex: 1,
                  }}
                >
                  {template.body}
                </div>

                <div style={{ fontSize: '0.7rem', color: 'var(--text-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Created: {new Date(template.createdAt).toLocaleDateString()}</span>
                  <span style={{ fontFamily: 'var(--font-mono)' }}>#{template.id}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Create / Edit Template Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingTemplate ? 'Edit Outreach Template' : 'Create New Outreach Template'}
        large
        footer={
          <>
            <button className="btn btn-outline" onClick={() => setIsModalOpen(false)}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={handleSave}>
              Save Template
            </button>
          </>
        }
      >
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Template Name *</label>
              <input
                type="text"
                className="input-field"
                placeholder="e.g. Website Redesign Offer (WhatsApp)"
                required
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Outreach Channel *</label>
              <select
                className="select-field"
                value={formChannel}
                onChange={(e) => setFormChannel(e.target.value as OutreachChannel)}
              >
                <option value="WhatsApp">WhatsApp (Business API)</option>
                <option value="Email">Email (SendGrid)</option>
                <option value="Twitter">Twitter (API v2 DM)</option>
                <option value="Instagram">Instagram (Graph API DM)</option>
                <option value="Telegram">Telegram (Bot API)</option>
              </select>
            </div>
          </div>

          {formChannel === 'Email' && (
            <div className="form-group">
              <label className="form-label">Email Subject Line</label>
              <input
                type="text"
                className="input-field"
                placeholder="e.g. Quick question regarding {BusinessName} in {City}"
                value={formSubject}
                onChange={(e) => setFormSubject(e.target.value)}
              />
            </div>
          )}

          <div className="form-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label className="form-label">Message Body *</label>
              <span className="form-hint">Click a variable below to insert</span>
            </div>

            <div className="variable-chip-list" style={{ marginBottom: '0.5rem' }}>
              <button type="button" className="variable-chip" onClick={() => insertToken('{BusinessName}')}>
                + {'{BusinessName}'}
              </button>
              <button type="button" className="variable-chip" onClick={() => insertToken('{ContactPerson}')}>
                + {'{ContactPerson}'}
              </button>
              <button type="button" className="variable-chip" onClick={() => insertToken('{City}')}>
                + {'{City}'}
              </button>
              <button type="button" className="variable-chip" onClick={() => insertToken('{Category}')}>
                + {'{Category}'}
              </button>
              <button type="button" className="variable-chip" onClick={() => insertToken('{Rating}')}>
                + {'{Rating}'}
              </button>
              <button type="button" className="variable-chip" onClick={() => insertToken('{WebsiteStatus}')}>
                + {'{WebsiteStatus}'}
              </button>
            </div>

            <textarea
              className="input-field"
              rows={7}
              required
              placeholder="Hi {ContactPerson}, I noticed {BusinessName} in {City} has an impressive rating..."
              value={formBody}
              onChange={(e) => setFormBody(e.target.value)}
              style={{ lineHeight: '1.5' }}
            />
          </div>
        </form>
      </Modal>
    </div>
  );
};
