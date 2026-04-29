import { useState, useCallback } from 'react';

export function useConfigSave<T>(
  onSave: (data: Partial<T>) => void,
  validate?: (data: Partial<T>) => boolean,
) {
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSave = useCallback(
    async (data: Partial<T>) => {
      if (validate && !validate(data)) {
        return;
      }

      setIsSaving(true);
      setSaveError(null);

      try {
        onSave(data);
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : 'Save failed');
      } finally {
        setIsSaving(false);
      }
    },
    [onSave, validate],
  );

  return {
    isSaving,
    saveError,
    handleSave,
    setIsSaving,
    setSaveError,
  };
}
