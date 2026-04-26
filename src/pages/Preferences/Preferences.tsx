import React, { useState, useEffect } from 'react';
import { Card, SettingsIcon, GlobeIcon, CrownIcon, SkeletonText } from '../../components';
import { useThemeStore } from '../../stores';
import { useTranslation } from '../../hooks/useTranslation';
import { getCurrentVersion } from '../../services/updateApi';
import './Preferences.css';

const aboutInfo = {
  author: 'Crown_22',
  email: 'akangx@foxmail.com',
  github: 'https://github.com/SkyCrown111',
  description: {
    zh: 'Hermes Console - AI Agent 管理控制台',
    en: 'Hermes Console - AI Agent Management Console',
  },
};

export const Preferences: React.FC = () => {
  const { mode, language, setLanguage } = useThemeStore();
  const { t } = useTranslation();
  const [version, setVersion] = useState('0.1.0');

  useEffect(() => {
    getCurrentVersion().then(setVersion).catch(() => setVersion('0.1.0'));
  }, []);

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
            <span className="section-icon"><SettingsIcon size={18} /></span>
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
                <span className="theme-icon">L</span>
                <span>{t('prefs.light')}</span>
              </button>
              <button
                className={`theme-btn ${mode === 'dark' ? 'active' : ''}`}
                onClick={() => useThemeStore.getState().setTheme('dark')}
              >
                <span className="theme-icon">D</span>
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
            <span className="section-icon"><SettingsIcon size={18} /></span>
            <div>
              <h2>{t('prefs.about')}</h2>
              <p>{t('prefs.aboutDesc')}</p>
            </div>
          </div>

          <div className="about-content">
            <div className="about-logo">
              <span className="logo-icon"><CrownIcon size={24} /></span>
              <div className="logo-text">
                <h3>Hermes Crown</h3>
                {version ? <span className="version">v{version}</span> : <SkeletonText lines={1} lineHeight="0.9em" />}
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
                <span className="social-icon"><GlobeIcon size={14} /></span>
                <span>GitHub</span>
              </a>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
};
