import React from 'react';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmText?: string;
  cancelText?: string;
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
  confirmText = 'Confirm',
  cancelText = 'Cancel'
}) => {
  if (!isOpen) return null;

  const isDanger = confirmText.toLowerCase().includes('delete') || confirmText.toLowerCase().includes('detach');
  const confirmClass = isDanger ? 'btn btn-danger' : 'btn btn-primary';

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ overflow: 'hidden' }}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="modal-close" onClick={onCancel} aria-label="Close">&times;</button>
        </div>
        <p style={{ margin: '0 0 var(--space-5) 0', color: 'var(--color-muted)', fontSize: '14.5px', lineHeight: 1.5 }}>
          {message}
        </p>
        <div className="form-actions" style={{ justifyContent: 'flex-end', marginTop: 'var(--space-5)', gap: '12px' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onCancel}
          >
            {cancelText}
          </button>
          <button
            type="button"
            className={confirmClass}
            onClick={onConfirm}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;
