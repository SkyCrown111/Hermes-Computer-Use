import React, { useEffect, useMemo, useState } from 'react';
import { Card, Button, Input } from '../../components';
import { PlusIcon, XIcon } from '../../components';
import { useSkillsStore } from '../../stores';
import { useTranslation } from '../../hooks/useTranslation';
import './Skills.css';

// 格式化类别名称
const formatCategoryName = (name: string): string => {
  return name
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

export const Skills: React.FC = () => {
  const { t } = useTranslation();

  const {
    skills,
    isLoadingSkills,
    categories,
    isLoadingCategories,
    selectedCategory,
    searchQuery,
    selectedSkill,
    isLoadingDetail,
    error,
    fetchSkills,
    fetchCategories,
    fetchSkillDetail,
    toggleSkill,
    createSkill,
    setSearchQuery,
    setSelectedCategory,
    clearSelectedSkill,
  } = useSkillsStore();

  // 添加 Skill 模态框状态
  const [showAddModal, setShowAddModal] = useState(false);
  const [newSkill, setNewSkill] = useState({
    name: '',
    category: '',
    description: '',
    content: '',
  });

  useEffect(() => {
    fetchSkills();
    fetchCategories();
  }, [fetchSkills, fetchCategories]);

  // Debug log for categories
  useEffect(() => {
    console.log('[Skills] categories:', categories);
  }, [categories]);

  // 过滤后的 Skills
  const filteredSkills = useMemo(() => {
    let result = skills;
    
    // 按类别过滤
    if (selectedCategory) {
      result = result.filter((skill) => skill.category === selectedCategory);
    }
    
    // 按搜索词过滤
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (skill) =>
          skill.name.toLowerCase().includes(query) ||
          (skill.description?.toLowerCase().includes(query)) ||
          (skill.tags?.some((tag) => tag.toLowerCase().includes(query)))
      );
    }
    
    return result;
  }, [skills, selectedCategory, searchQuery]);

  // 按类别分组
  const groupedSkills = useMemo(() => {
    const groups: Record<string, typeof skills> = {};
    filteredSkills.forEach((skill) => {
      const cat = skill.category || 'uncategorized';
      if (!groups[cat]) {
        groups[cat] = [];
      }
      groups[cat].push(skill);
    });
    return groups;
  }, [filteredSkills]);

  return (
    <div className="skills-page">
      {/* Header Actions */}
        <div className="skills-header">
          {/* Search */}
          <div className="skills-search">
            <Input
              placeholder={t('skills.search')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              icon="🔍"
              className="search-input"
            />
          </div>

          {/* Category Filter */}
          <div className="category-filter">
            <Button
              variant={selectedCategory === null ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setSelectedCategory(null)}
            >
              {t('common.all')}
            </Button>
            {isLoadingCategories ? (
              <span className="category-loading">{t('common.loading')}</span>
            ) : (
              categories.map((category) => (
                <Button
                  key={category.name}
                  variant={selectedCategory === category.name ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => setSelectedCategory(category.name)}
                >
                  {formatCategoryName(category.name)} ({category.skill_count})
                </Button>
              ))
            )}
          </div>

          {/* Add Skill Button */}
          <Button
            variant="primary"
            size="sm"
            className="add-skill-btn"
            onClick={() => setShowAddModal(true)}
          >
            <PlusIcon size={16} />
            <span>{t('skills.add')}</span>
          </Button>
        </div>

        {/* Error Message */}
        {error && (
          <div className="error-message">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {/* Main Content */}
        <div className="skills-content">
          {/* Skills Grid */}
          <div className="skills-grid-section">
            {isLoadingSkills ? (
              <div className="loading-container">
                <div className="loading-spinner" />
              </div>
            ) : Object.keys(groupedSkills).length > 0 ? (
              Object.entries(groupedSkills).map(([category, categorySkills]) => (
                <div key={category} className="skill-category-group">
                  <h3 className="category-title">
                    📁 {formatCategoryName(category)}
                    <span className="category-count">({categorySkills.length})</span>
                  </h3>
                  <div className="skills-grid">
                    {categorySkills.map((skill) => (
                      <Card
                        key={skill.path}
                        className={`skill-card ${!skill.enabled ? 'skill-card-disabled' : ''}`}
                      >
                        <div className="skill-card-header">
                          <div className="skill-icon">🎯</div>
                          <div className="skill-info">
                            <h4 className="skill-name">{skill.name}</h4>
                            {skill.version && <span className="skill-version">v{skill.version}</span>}
                          </div>
                          <label className="skill-toggle">
                            <input
                              type="checkbox"
                              checked={skill.enabled}
                              onChange={(e) => toggleSkill(skill.name, e.target.checked)}
                            />
                            <span className="toggle-slider" />
                          </label>
                        </div>
                        <p className="skill-description">{skill.description || t('skills.noDescription')}</p>
                        <div className="skill-meta">
                          <span className="skill-author">👤 {skill.author || (t('nav.home') === 'Home' ? 'Unknown' : '未知')}</span>
                          <div className="skill-tags">
                            {(skill.tags || []).slice(0, 3).map((tag) => (
                              <span key={tag} className="skill-tag">
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="skill-actions">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => fetchSkillDetail(skill.category || '', skill.name)}
                          >
                            {t('skills.viewDetail')}
                          </Button>
                          <Button variant="primary" size="sm" disabled={!skill.enabled}>
                            {t('skills.execute')}
                          </Button>
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <div className="empty-state">
                <span className="empty-icon">📭</span>
                <p>{t('common.noData')}</p>
              </div>
            )}
          </div>

          {/* Skill Detail Panel */}
          {selectedSkill && (
            <div className="skill-detail-overlay" onClick={clearSelectedSkill}>
              <div className="skill-detail-panel" onClick={(e) => e.stopPropagation()}>
                <div className="detail-header">
                  <div className="detail-title-group">
                    <span className="detail-icon">🎯</span>
                    <div>
                      <h2 className="detail-title">{selectedSkill.name}</h2>
                      <span className="detail-category">
                        {formatCategoryName(selectedSkill.category)}
                      </span>
                    </div>
                  </div>
                  <button className="close-button" onClick={clearSelectedSkill}>
                    ✕
                  </button>
                </div>

                {isLoadingDetail ? (
                  <div className="loading-container">
                    <div className="loading-spinner" />
                  </div>
                ) : (
                  <>
                    <div className="detail-meta">
                      <div className="meta-item">
                        <span className="meta-label">{t('skills.version')}</span>
                        <span className="meta-value">
                          v{selectedSkill.metadata.version}
                        </span>
                      </div>
                      <div className="meta-item">
                        <span className="meta-label">{t('skills.author')}</span>
                        <span className="meta-value">
                          {selectedSkill.metadata.author}
                        </span>
                      </div>
                      {selectedSkill.metadata.license && (
                        <div className="meta-item">
                          <span className="meta-label">{t('skills.license')}</span>
                          <span className="meta-value">
                            {selectedSkill.metadata.license}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="detail-tags">
                      {selectedSkill.metadata.metadata?.hermes?.tags.map((tag) => (
                        <span key={tag} className="detail-tag">
                          {tag}
                        </span>
                      ))}
                    </div>

                    <div className="detail-content">
                      <h3 className="content-title">{t('skills.content')}</h3>
                      <pre className="content-code">{selectedSkill.content}</pre>
                    </div>

                    <div className="detail-actions">
                      <Button variant="secondary" onClick={clearSelectedSkill}>
                        {t('skills.close')}
                      </Button>
                      <Button variant="primary">{t('skills.executeSkill')}</Button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Add Skill Modal */}
        {showAddModal && (
          <div className="add-skill-modal-overlay" onClick={() => setShowAddModal(false)}>
            <div className="add-skill-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>{t('skills.addModal.title')}</h2>
                <button className="close-button" onClick={() => setShowAddModal(false)}>
                  <XIcon size={18} />
                </button>
              </div>
              <div className="modal-content">
                <div className="form-group">
                  <label>{t('skills.addModal.name')}</label>
                  <Input
                    placeholder={t('skills.addModal.name') + '...'}
                    value={newSkill.name}
                    onChange={(e) => setNewSkill({ ...newSkill, name: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>{t('skills.addModal.category')}</label>
                  <Input
                    placeholder={t('skills.addModal.category') + '...'}
                    value={newSkill.category}
                    onChange={(e) => setNewSkill({ ...newSkill, category: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>{t('skills.addModal.description')}</label>
                  <Input
                    placeholder={t('skills.addModal.description') + '...'}
                    value={newSkill.description}
                    onChange={(e) => setNewSkill({ ...newSkill, description: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>{t('skills.addModal.content')}</label>
                  <textarea
                    className="skill-content-textarea"
                    placeholder={t('skills.addModal.placeholder')}
                    value={newSkill.content}
                    onChange={(e) => setNewSkill({ ...newSkill, content: e.target.value })}
                    rows={10}
                  />
                </div>
              </div>
              <div className="modal-actions">
                <Button variant="secondary" onClick={() => setShowAddModal(false)}>
                  {t('common.cancel')}
                </Button>
                <Button
                  variant="primary"
                  disabled={!newSkill.name || !newSkill.category}
                  onClick={async () => {
                    const success = await createSkill(newSkill);
                    if (success) {
                      setShowAddModal(false);
                      setNewSkill({ name: '', category: '', description: '', content: '' });
                    }
                  }}
                >
                  {t('skills.addModal.add')}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
  );
};
