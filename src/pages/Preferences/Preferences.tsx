import React from 'react';
import { Card } from '../../components';
import { useThemeStore } from '../../stores';
import { useTranslation } from '../../hooks/useTranslation';
import './Preferences.css';

// About info - 用户可以自定义这些信息
const aboutInfo = {
  author: 'Crown_22',
  email: 'akangx@foxmail.com',
  github: 'https://github.com/SkyCrown111',
  version: '0.1.0',
  description: {
    zh: 'Hermes Console - AI Agent 管理控制台',
    en: 'Hermes Console - AI Agent Management Console',
  },
};

export const Preferences: React.FC = () => {
  const { mode, language, setLanguage } = useThemeStore();
  const { t } = useTranslation();

  return (
    <div className="preferences-page">
      <div className="preferences-header">
        <h1>{t('prefs.title')}</h1>
        <p>{t('prefs.subtitle')}</p>
      </div>

      {/* Appearance Section */}
      <Card className="preferences-card">
        <div className="preferences-section">
          <div className="section-header">
            <span className="section-icon">🎨</span>
            <div>
              <h2>{t('prefs.appearance')}</h2>
              <p>{t('prefs.appearanceDesc')}</p>
            </div>
          </div>

          <div className="preference-item">
            <div className="preference-info">
              <span className="preference-label">{t('prefs.theme')}</span>
              <span className="preference-description">{t('prefs.themeDesc')}</span>
            </div>
            <div className="theme-toggle">
              <button
                className={`theme-btn ${mode === 'light' ? 'active' : ''}`}
                onClick={() => useThemeStore.getState().setTheme('light')}
              >
                <span className="theme-icon">☀️</span>
                <span>{t('prefs.light')}</span>
              </button>
              <button
                className={`theme-btn ${mode === 'dark' ? 'active' : ''}`}
                onClick={() => useThemeStore.getState().setTheme('dark')}
              >
                <span className="theme-icon">🌙</span>
                <span>{t('prefs.dark')}</span>
              </button>
            </div>
          </div>

          <div className="preference-item">
            <div className="preference-info">
              <span className="preference-label">{t('prefs.language')}</span>
              <span className="preference-description">{t('prefs.languageDesc')}</span>
            </div>
            <div className="language-toggle">
              <button
                className={`lang-btn ${language === 'zh' ? 'active' : ''}`}
                onClick={() => setLanguage('zh')}
              >
                中文
              </button>
              <button
                className={`lang-btn ${language === 'en' ? 'active' : ''}`}
                onClick={() => setLanguage('en')}
              >
                English
              </button>
            </div>
          </div>
        </div>
      </Card>

      {/* About Section */}
      <Card className="preferences-card">
        <div className="preferences-section">
          <div className="section-header">
            <span className="section-icon">ℹ️</span>
            <div>
              <h2>{t('prefs.about')}</h2>
              <p>{t('prefs.aboutDesc')}</p>
            </div>
          </div>

          <div className="about-content">
            <div className="about-logo">
              <span className="logo-icon">👑</span>
              <div className="logo-text">
                <h3>Hermes Crown</h3>
                <span className="version">v{aboutInfo.version}</span>
              </div>
            </div>

            <p className="about-description">{aboutInfo.description[language]}</p>

            <div className="about-details">
              <div className="about-item">
                <span className="about-label">{t('prefs.author')}</span>
                <span className="about-value">{aboutInfo.author}</span>
              </div>
              <div className="about-item">
                <span className="about-label">{t('prefs.email')}</span>
                <a href={`mailto:${aboutInfo.email}`} className="about-link">
                  {aboutInfo.email}
                </a>
              </div>
            </div>

            <div className="social-links">
              <a
                href={aboutInfo.github}
                target="_blank"
                rel="noopener noreferrer"
                className="social-link"
              >
                <span className="social-icon">📦</span>
                <span>GitHub</span>
              </a>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
};
