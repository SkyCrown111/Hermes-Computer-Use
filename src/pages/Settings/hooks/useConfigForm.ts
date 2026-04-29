import { useState, useEffect } from 'react';

export function useConfigForm<T extends Record<string, unknown>>(initialData: T, config: T | null) {
  const [formData, setFormData] = useState<Partial<T>>(initialData);

  useEffect(() => {
    if (config) {
      setFormData(config);
    }
  }, [config]);

  const handleChange = (field: keyof T, value: unknown) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const reset = (data: Partial<T>) => {
    setFormData(data);
  };

  return {
    formData,
    setFormData,
    handleChange,
    reset,
  };
}
