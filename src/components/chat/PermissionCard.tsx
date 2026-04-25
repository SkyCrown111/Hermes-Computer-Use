import React, { useState } from 'react';

interface PermissionCardProps {
  approval: { id: string; command: string; description: string; allow_permanent: boolean };
  onRespond: (choice: 'once' | 'session' | 'always' | 'deny') => void;
}

export const PermissionCard: React.FC<PermissionCardProps> = ({ approval, onRespond }) => {
  const [showCommand, setShowCommand] = useState(false);

  return (
    <div className="permission-card">
      <div className="permission-card-header">
        <div className="permission-card-icon">
          <span className="material-symbols-outlined">shield</span>
        </div>
        <div className="permission-card-title">
          <span className="permission-card-label">需要确认</span>
          <span className="permission-card-desc">{approval.description}</span>
        </div>
        <span className="permission-card-badge">
          <span className="permission-pulse" />
          等待确认
        </span>
      </div>
      <div className="permission-card-body">
        <div className="permission-command-preview">
          <code>{approval.command.slice(0, 100)}{approval.command.length > 100 ? '...' : ''}</code>
        </div>
        {approval.command.length > 100 && (
          <button
            className="permission-show-more"
            onClick={() => setShowCommand(v => !v)}
          >
            <span className="material-symbols-outlined">{showCommand ? 'expand_less' : 'expand_more'}</span>
            {showCommand ? '收起' : '查看完整命令'}
          </button>
        )}
        {showCommand && (
          <pre className="permission-command-full">{approval.command}</pre>
        )}
      </div>
      <div className="permission-card-actions">
        <button className="permission-btn allow" onClick={() => onRespond('once')}>
          <span className="material-symbols-outlined">check</span>
          允许
        </button>
        <button className="permission-btn session" onClick={() => onRespond('session')}>
          <span className="material-symbols-outlined">verified</span>
          本次会话
        </button>
        {approval.allow_permanent && (
          <button className="permission-btn always" onClick={() => onRespond('always')}>
            <span className="material-symbols-outlined">done_all</span>
            永久
          </button>
        )}
        <button className="permission-btn deny" onClick={() => onRespond('deny')}>
          <span className="material-symbols-outlined">close</span>
          拒绝
        </button>
      </div>
    </div>
  );
};
