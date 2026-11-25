import React from 'react';
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  title: string;
  message?: string;
}

interface ToastContainerProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onDismiss }) => {
  return (
    <div className="toast-container">
      {toasts.map((toast, idx) => (
        <div key={`toast-${toast.id}-${idx}`} className={`toast toast-${toast.type}`}>
          {toast.type === 'success' && <CheckCircle size={18} color="var(--secondary)" />}
          {toast.type === 'error' && <AlertCircle size={18} color="var(--danger)" />}
          {toast.type === 'info' && <Info size={18} color="var(--primary)" />}
          
          <div className="toast-content" style={{ flex: 1 }}>
            <h4>{toast.title}</h4>
            {toast.message && <p>{toast.message}</p>}
          </div>

          <button
            onClick={() => onDismiss(toast.id)}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-subtle)' }}
          >
            <X size={15} />
          </button>
        </div>
      ))}
    </div>
  );
};

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  large?: boolean;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  footer,
  large = false,
}) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className={`modal-dialog ${large ? 'large' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3 className="modal-title">{title}</h3>
          <button
            onClick={onClose}
            className="icon-btn"
            style={{ width: '32px', height: '32px' }}
            aria-label="Close modal"
          >
            <X size={16} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
};
