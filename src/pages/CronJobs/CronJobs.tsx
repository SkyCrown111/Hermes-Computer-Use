import React, { useEffect, useState } from 'react';
import { Card, Button, Input, Textarea, PlusIcon, ClockIcon, TargetIcon, ExportIcon, AlertIcon, EmptyIcon, ConfirmModal, ChevronDownIcon, ChevronUpIcon } from '../../components';
import { useCronJobsStore } from '../../stores';
import { useTranslation } from '../../hooks/useTranslation';
import { toast } from '../../stores/toastStore';
import { validateSchedule } from '../../utils/validation';
import type { CronJob } from '../../types/cron';
import type { CreateCronJobParams } from '../../stores/cronJobsStore';
import './CronJobs.css';

// 格式化日期时间
const formatDateTime = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

// 格式化相对时间
const formatRelativeTime = (dateString: string, t: (key: string) => string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const diff = date.getTime() - now.getTime();

  if (diff < 0) return t('tasks.expired');

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days} ${t('tasks.daysLater')}`;
  if (hours > 0) return `${hours} ${t('tasks.hoursLater')}`;
  if (minutes > 0) return `${minutes} ${t('tasks.minutesLater')}`;
  return t('tasks.soon');
};

// 格式化执行时长
const formatDuration = (seconds: number): string => {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}m ${secs}s`;
};

export const CronJobs: React.FC = () => {
  const { t } = useTranslation();
  const {
    jobs,
    isLoadingJobs,
    jobOutputs,
    isLoadingOutputs,
    isEditing,
    editingJob,
    error,
    fetchJobs,
    fetchJobOutputs,
    createJob,
    updateJob,
    deleteJob,
    pauseJob,
    resumeJob,
    triggerJob,
    setEditingJob,
    clearSelectedJob,
  } = useCronJobsStore();

  // 表单状态
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [formData, setFormData] = useState<CreateCronJobParams>({
    name: '',
    prompt: '',
    schedule: 'every 1h',
    skills: [],
  });
  const [skillInput, setSkillInput] = useState('');
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  // 展开的输出索引
  const [expandedOutputs, setExpandedOutputs] = useState<Set<number>>(new Set());

  // 切换输出展开状态
  const toggleOutputExpand = (index: number) => {
    setExpandedOutputs(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  // 查看任务详情
  const handleViewJob = async (job: CronJob) => {
    fetchJobOutputs(job.id, 20);
  };

  // 创建任务
  const handleCreateJob = async () => {
    if (!formData.name || !formData.prompt || !formData.schedule) return;

    // Validate schedule
    const validation = validateSchedule(formData.schedule);
    if (!validation.valid) {
      setScheduleError(validation.error || 'Invalid schedule');
      toast.error(validation.error || 'Invalid schedule format');
      return;
    }

    const result = await createJob(formData);
    if (result) {
      toast.success('Task created successfully');
      setShowCreateForm(false);
      setFormData({
        name: '',
        prompt: '',
        schedule: 'every 1h',
        skills: [],
      });
      setScheduleError(null);
    }
  };

  // 更新任务
  const handleUpdateJob = async () => {
    if (!editingJob) return;

    // Validate schedule
    const validation = validateSchedule(formData.schedule);
    if (!validation.valid) {
      setScheduleError(validation.error || 'Invalid schedule');
      toast.error(validation.error || 'Invalid schedule format');
      return;
    }

    const result = await updateJob(editingJob.id, formData);
    if (result) {
      toast.success('Task updated successfully');
      setScheduleError(null);
    }
  };

  // 删除任务
  const [deleteConfirmJob, setDeleteConfirmJob] = useState<string | null>(null);

  const handleDeleteJob = async (jobId: string) => {
    setDeleteConfirmJob(jobId);
  };

  const confirmDeleteJob = async () => {
    if (deleteConfirmJob) {
      await deleteJob(deleteConfirmJob);
      setDeleteConfirmJob(null);
    }
  };

  // 手动触发
  const handleTrigger = async (jobId: string) => {
    const success = await triggerJob(jobId);
    if (success) {
      // 刷新列表
      fetchJobs();
    }
  };

  // 开始编辑
  const startEditing = (job: CronJob) => {
    setEditingJob(job);
    setFormData({
      name: job.name,
      prompt: job.prompt,
      schedule: job.schedule.display,
      skills: job.skills || [],
      deliver: job.deliver,
    });
    setScheduleError(null);
  };

  // 添加技能
  const addSkill = () => {
    if (skillInput.trim() && !formData.skills?.includes(skillInput.trim())) {
      setFormData({
        ...formData,
        skills: [...(formData.skills || []), skillInput.trim()],
      });
      setSkillInput('');
    }
  };

  // 移除技能
  const removeSkill = (skill: string) => {
    setFormData({
      ...formData,
      skills: formData.skills?.filter((s: string) => s !== skill) || [],
    });
  };

  // 统计数据
  const stats = {
    total: jobs.length,
    enabled: jobs.filter((j) => j.enabled).length,
    disabled: jobs.filter((j) => !j.enabled).length,
    pending: jobs.filter((j) => j.enabled && j.next_run_at).length,
  };

  return (
    <div className="cron-jobs-page">
      {/* Stats */}
        <div className="jobs-stats">
          <Card className="stat-card">
            <div className="stat-content">
              <span className="stat-value">{stats.total}</span>
              <span className="stat-label">{t('tasks.total')}</span>
            </div>
          </Card>
          <Card className="stat-card stat-card-success">
            <div className="stat-content">
              <span className="stat-value">{stats.enabled}</span>
              <span className="stat-label">{t('tasks.enabled')}</span>
            </div>
          </Card>
          <Card className="stat-card stat-card-warning">
            <div className="stat-content">
              <span className="stat-value">{stats.disabled}</span>
              <span className="stat-label">{t('tasks.paused')}</span>
            </div>
          </Card>
          <Card className="stat-card stat-card-info">
            <div className="stat-content">
              <span className="stat-value">{stats.pending}</span>
              <span className="stat-label">{t('tasks.pending')}</span>
            </div>
          </Card>
        </div>

        {/* Header Actions */}
        <div className="jobs-header">
          <h2 className="section-title">{t('tasks.taskList')}</h2>
          <Button
            variant="primary"
            icon={<PlusIcon size={16} />}
            onClick={() => setShowCreateForm(true)}
          >
            {t('tasks.createTask')}
          </Button>
        </div>

        {/* Error Message */}
        {error && (
          <div className="error-message">
            <AlertIcon size={16} />
            <span>{error}</span>
          </div>
        )}

        {/* Jobs List */}
        <div className="jobs-list">
          {isLoadingJobs ? (
            <div className="loading-container">
              <div className="loading-spinner" />
            </div>
          ) : jobs.length > 0 ? (
            jobs.map((job) => (
              <Card key={job.id} className="job-card">
                <div className="job-header">
                  <div className="job-info">
                    <div className="job-title-row">
                      <h3 className="job-name">{job.name}</h3>
                      <span
                        className={`job-status ${
                          job.enabled ? 'status-enabled' : 'status-disabled'
                        }`}
                      >
                        {job.enabled ? '🟢 ' + t('tasks.enabled') : '🔴 ' + t('tasks.paused')}
                      </span>
                    </div>
                    <div className="job-schedule">
                      <span className="schedule-icon"><ClockIcon size={14} /></span>
                      <span className="schedule-text">
                        {job.schedule.display}
                      </span>
                      {job.next_run_at && (
                        <span className="next-run">
                          {t('tasks.nextRun')}: {formatRelativeTime(job.next_run_at, t)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="job-quick-actions">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleTrigger(job.id)}
                    >
                      ▶️ {t('tasks.trigger')}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        job.enabled ? pauseJob(job.id) : resumeJob(job.id)
                      }
                    >
                      {job.enabled ? '⏸️ 暂停' : '▶️ ' + t('tasks.resume')}
                    </Button>
                  </div>
                </div>

                <div className="job-prompt">
                  <p>{job.prompt}</p>
                </div>

                <div className="job-meta">
                  <div className="meta-left">
                    {job.skills && job.skills.length > 0 && (
                      <div className="job-skills">
                        {job.skills.map((skill) => (
                          <span key={skill} className="skill-badge">
                            <TargetIcon size={12} /> {skill}
                          </span>
                        ))}
                      </div>
                    )}
                    {job.deliver && (
                      <span className="deliver-badge"><ExportIcon size={12} /> {job.deliver}</span>
                    )}
                  </div>
                  <div className="meta-right">
                    <span className="run-count">
                      {t('tasks.runCount')}: {job.run_count}
                    </span>
                    {job.last_run_at && (
                      <span className="last-run">
                        {t('tasks.lastRun')}: {formatDateTime(job.last_run_at)}
                      </span>
                    )}
                  </div>
                </div>

                <div className="job-actions">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleViewJob(job)}
                  >
                    {t('tasks.viewHistory')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => startEditing(job)}
                  >
                    {t('tasks.edit')}
                  </Button>
                  <Button
                    variant="error"
                    size="sm"
                    onClick={() => handleDeleteJob(job.id)}
                  >
                    {t('tasks.delete')}
                  </Button>
                </div>
              </Card>
            ))
          ) : (
            <div className="empty-state">
              <span className="empty-icon"><EmptyIcon size={32} /></span>
              <p>{t('tasks.noTasks')}</p>
              <Button variant="primary" onClick={() => setShowCreateForm(true)}>
                {t('tasks.createFirst')}
              </Button>
            </div>
          )}
        </div>

        {/* Create/Edit Form Modal */}
        {(showCreateForm || isEditing) && (
          <div
            className="form-overlay"
            onClick={() => {
              setShowCreateForm(false);
              setEditingJob(null);
            }}
          >
            <div className="form-modal" onClick={(e) => e.stopPropagation()}>
              <div className="form-header">
                <h2>{isEditing ? t('tasks.editTask') : t('tasks.createNew')}</h2>
                <button
                  className="close-button"
                  onClick={() => {
                    setShowCreateForm(false);
                    setEditingJob(null);
                  }}
                >
                  ✕
                </button>
              </div>

              <div className="form-content">
                <Input
                  label={t('tasks.taskName')}
                  placeholder={t('tasks.enterTaskName')}
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                />

                <Textarea
                  label={t('tasks.prompt')}
                  placeholder={t('tasks.enterPrompt')}
                  value={formData.prompt}
                  onChange={(e) =>
                    setFormData({ ...formData, prompt: e.target.value })
                  }
                  rows={4}
                />

                <Input
                  label={t('tasks.schedule')}
                  placeholder="例如: every 1h, every 30m, 0 9 * * *"
                  value={formData.schedule}
                  onChange={(e) => {
                    const value = e.target.value;
                    setFormData({ ...formData, schedule: value });
                    // Real-time validation
                    if (value.trim()) {
                      const validation = validateSchedule(value);
                      setScheduleError(validation.valid ? null : validation.error || null);
                    } else {
                      setScheduleError(null);
                    }
                  }}
                  hint={t('tasks.scheduleHint')}
                  error={scheduleError || undefined}
                />

                <div className="form-field">
                  <label className="field-label">{t('tasks.relatedSkills')}</label>
                  <div className="skills-input-row">
                    <Input
                      placeholder={t('tasks.enterSkillName')}
                      value={skillInput}
                      onChange={(e) => setSkillInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addSkill();
                        }
                      }}
                    />
                    <Button variant="secondary" onClick={addSkill}>
                      {t('tasks.add')}
                    </Button>
                  </div>
                  {formData.skills && formData.skills.length > 0 && (
                    <div className="selected-skills">
                      {formData.skills.map((skill: string) => (
                        <span key={skill} className="selected-skill">
                          {skill}
                          <button onClick={() => removeSkill(skill)}>✕</button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <Input
                  label={t('tasks.outputTarget')}
                  placeholder="例如: telegram:123456"
                  value={formData.deliver || ''}
                  onChange={(e) =>
                    setFormData({ ...formData, deliver: e.target.value })
                  }
                />
              </div>

              <div className="form-actions">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setShowCreateForm(false);
                    setEditingJob(null);
                  }}
                >
                  {t('common.cancel')}
                </Button>
                <Button
                  variant="primary"
                  onClick={isEditing ? handleUpdateJob : handleCreateJob}
                >
                  {isEditing ? t('tasks.saveChanges') : t('tasks.createTask')}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Job Outputs Modal */}
        {jobOutputs.length > 0 && (
          <div className="form-overlay" onClick={() => clearSelectedJob()}>
            <div className="form-modal" onClick={(e) => e.stopPropagation()}>
              <div className="form-header">
                <h2>{t('tasks.executionHistory')}</h2>
                <button className="close-button" onClick={() => clearSelectedJob()}>
                  ✕
                </button>
              </div>

              <div className="outputs-list">
                {isLoadingOutputs ? (
                  <div className="loading-container">
                    <div className="loading-spinner" />
                  </div>
                ) : (
                  jobOutputs.map((output, index) => {
                    const isExpanded = expandedOutputs.has(index);
                    const outputText = output.output || '-';
                    const hasLongOutput = outputText.length > 100;

                    return (
                      <div key={index} className="output-item">
                        <div className="output-header">
                          <span
                            className={`output-status ${
                              output.status === 'success'
                                ? 'status-success'
                                : 'status-error'
                            }`}
                          >
                            {output.status === 'success' ? '✅ ' + t('tasks.success') : '❌ ' + t('tasks.failed')}
                          </span>
                          <span className="output-time">
                            {formatDateTime(output.started_at)}
                          </span>
                          <span className="output-duration">
                            {t('tasks.duration')}: {output.duration_ms ? formatDuration(output.duration_ms / 1000) : '-'}
                          </span>
                        </div>
                        <div className="output-content-wrapper">
                          <div className={`output-file ${isExpanded ? 'output-expanded' : ''}`}>
                            {isExpanded ? outputText : (hasLongOutput ? outputText.slice(0, 100) + '...' : outputText)}
                          </div>
                          {hasLongOutput && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="output-expand-btn"
                              onClick={() => toggleOutputExpand(index)}
                            >
                              {isExpanded ? (
                                <><ChevronUpIcon size={14} /> 收起</>
                              ) : (
                                <><ChevronDownIcon size={14} /> 展开全部</>
                              )}
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="form-actions">
                <Button variant="ghost" onClick={() => clearSelectedJob()}>
                  {t('tasks.close')}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        <ConfirmModal
          isOpen={deleteConfirmJob !== null}
          title={t('tasks.delete')}
          message={`${t('common.confirm')}?`}
          confirmText={t('tasks.delete')}
          cancelText={t('common.cancel')}
          variant="danger"
          onConfirm={confirmDeleteJob}
          onCancel={() => setDeleteConfirmJob(null)}
        />
      </div>
  );
};
