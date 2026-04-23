import { useThemeStore } from '../stores/themeStore';
import { t } from '../lib/i18n';

/**
 * Hook to get the translation function with the current language
 * Usage: const { t, lang } = useTranslation();
 *        t('nav.home') // Returns translated string
 */
export function useTranslation() {
  const language = useThemeStore((state) => state.language);

  return {
    t: (key: string) => t(key, language),
    lang: language,
  };
}
