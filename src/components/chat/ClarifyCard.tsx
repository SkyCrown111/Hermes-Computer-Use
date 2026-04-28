import React, { useState, memo } from 'react';
import { logger } from '../../lib/logger';
import { useTranslation } from '../../hooks/useTranslation';

interface ClarifyCardProps {
  clarify: {
    id: string;
    question: string;
    choices: string[];
    is_open_ended: boolean;
  };
  onRespond: (answer: string) => void | Promise<void>;
}

const ClarifyCardComponent: React.FC<ClarifyCardProps> = ({ clarify, onRespond }) => {
  const [customAnswer, setCustomAnswer] = useState('');
  const [responding, setResponding] = useState(false);
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const { t } = useTranslation();

  const handleChoice = async (choice: string) => {
    if (responding) return;
    setResponding(true);
    setSelectedChoice(choice);
    logger.info('[ClarifyCard] User selected:', choice, 'for clarify:', clarify.id);
    try {
      await onRespond(choice);
      logger.info('[ClarifyCard] Response completed:', choice);
    } catch (err) {
      logger.error('[ClarifyCard] Response failed:', err);
    } finally {
      setResponding(false);
    }
  };

  const handleCustomSubmit = async () => {
    if (responding || !customAnswer.trim()) return;
    await handleChoice(customAnswer.trim());
  };

  const hasChoices = clarify.choices && clarify.choices.length > 0;

  return (
    <div className="clarify-card">
      <div className="clarify-card-header">
        <div className="clarify-card-icon">
          <span className="material-symbols-outlined">help</span>
        </div>
        <div className="clarify-card-title">
          <span className="clarify-card-label">{t('clarify.needsConfirm')}</span>
          <span className="clarify-card-question">{clarify.question}</span>
        </div>
        <span className="clarify-card-badge">
          <span className="clarify-pulse" />
          {t('clarify.waitingAnswer')}
        </span>
      </div>
      <div className="clarify-card-body">
        {/* Choice buttons for multiple choice */}
        {hasChoices && (
          <div className="clarify-choices">
            {clarify.choices.map((choice, index) => (
              <button
                key={index}
                className={`clarify-choice-btn ${selectedChoice === choice ? 'selected' : ''}`}
                onClick={() => handleChoice(choice)}
                disabled={responding}
              >
                <span className="clarify-choice-index">{index + 1}</span>
                {choice}
              </button>
            ))}
          </div>
        )}

        {/* Custom answer input - always available */}
        <div className="clarify-custom-input">
          <input
            type="text"
            placeholder={hasChoices ? t('clarify.otherAnswer') : t('clarify.enterAnswer')}
            value={customAnswer}
            onChange={(e) => setCustomAnswer(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && customAnswer.trim()) {
                handleCustomSubmit();
              }
            }}
            disabled={responding}
          />
          {customAnswer.trim() && (
            <button
              className="clarify-submit-btn"
              onClick={handleCustomSubmit}
              disabled={responding}
            >
              <span className="material-symbols-outlined">send</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// Memoize to prevent re-renders when parent updates but clarify props haven't changed
export const ClarifyCard = memo(ClarifyCardComponent);
