import React from 'react';
import {
  BookIcon,
  ChatIcon,
  ClockIcon,
  FolderIcon,
  GlobeIcon,
  GridIcon,
  PlugIcon,
  ServerIcon,
  SettingsIcon,
  SparklesIcon,
  TargetIcon,
} from '../../components/ui/Icons';
import { useNavigationStore } from '../../stores';
import { useTranslation } from '../../hooks/useTranslation';
import './HelpGuidePage.css';

const pageContent = {
  zh: {
    title: '项目说明与使用指引',
    subtitle: '这一页把 Hermes Computer Use 能做什么、适合从哪里开始、常见工作流怎么走，集中放在一起。',
    overviewTitle: '它是什么',
    overviewLead: 'Hermes Computer Use 是一个围绕 Hermes Agent 的桌面工作台。',
    overviewText: '它把会话、技能、任务、文件、平台连接、MCP、网关状态这些能力放到一个统一界面里，让你可以一边和 Agent 对话，一边管理它的运行环境与工作结果。',
    capabilitiesTitle: '核心能力',
    capabilities: [
      ['会话与多标签', '同时维护多个任务上下文，保留历史记录，并在聊天里查看推理、工具调用和输出结果。'],
      ['技能与自动化', '把可复用的能力封装成技能，按需手动执行，或配合定时任务长期运行。'],
      ['文件与工作区', '直接浏览、编辑和整理本地文件，把对话和实际产物放在同一条工作链里。'],
      ['平台与网关', '查看平台连接状态，管理网关配置，观察系统指标与运行健康度。'],
      ['MCP 与扩展', '接入更多外部工具和资源，让 Agent 可以处理更复杂的任务。'],
    ],
    startTitle: '建议起步路径',
    startSteps: [
      '先到“配置”页检查模型、终端、压缩等基础设置。',
      '回到“新会话”直接下达一个具体任务，观察回复、推理与工具调用。',
      '需要重复使用的流程，整理进“技能”或“任务”。',
      '如果任务涉及本地资产，再切到“文件”“平台”“MCP”等页面补全环境。',
    ],
    navTitle: '去哪儿做什么',
    quickTitle: '常用入口',
    openLabel: '打开',
    sections: [
      ['chat', '会话', '日常对话、连续协作、多标签任务处理。'],
      ['skills', '技能', '管理可复用能力，查看技能详情与执行范围。'],
      ['tasks', '任务', '创建定时任务，安排自动执行和巡检。'],
      ['files', '文件', '浏览目录、查看文件树、处理本地产物。'],
      ['platforms', '平台', '查看平台连接和消息流。'],
      ['gateway', 'Gateway', '检查网关状态、重启或验证运行情况。'],
      ['mcp', 'MCP', '连接工具服务器、资源和扩展能力。'],
      ['preferences', '偏好设置', '调整主题、布局、通知和显示偏好。'],
    ] as Array<[string, string, string]>,
    tipsTitle: '使用小提示',
    tips: [
      '新任务尽量说清目标、约束和产出格式，Agent 会更稳。',
      '涉及长期复用的流程，优先沉淀成技能，而不是反复口述。',
      '看不清当前状态时，先去 Dashboard、Gateway 或 Monitor 看健康信息。',
    ],
  },
  en: {
    title: 'Project Overview & Guide',
    subtitle: 'A compact guide to what Hermes Computer Use does, where to start, and how the main workflows fit together.',
    overviewTitle: 'What It Is',
    overviewLead: 'Hermes Computer Use is a desktop workspace built around Hermes Agent.',
    overviewText: 'It brings conversations, skills, tasks, files, platform connections, MCP, and gateway health into one interface so you can manage real work alongside the agent conversation.',
    capabilitiesTitle: 'Core Capabilities',
    capabilities: [
      ['Chat and tabs', 'Work across multiple task contexts, keep history, and inspect reasoning, tool calls, and outputs.'],
      ['Skills and automation', 'Package reusable abilities as skills and schedule recurring jobs when needed.'],
      ['Files and workspace', 'Browse and manage local files so conversation and artifacts stay in one flow.'],
      ['Platforms and gateway', 'Track platform connectivity, gateway settings, and runtime health.'],
      ['MCP and extensions', 'Connect more tools and resources for broader agent capabilities.'],
    ],
    startTitle: 'Suggested Starting Path',
    startSteps: [
      'Review the base model, terminal, and related settings first.',
      'Start a new chat with a concrete task and observe replies, reasoning, and tool usage.',
      'Turn repeated flows into skills or scheduled tasks.',
      'Use Files, Platforms, or MCP when the task needs real assets or integrations.',
    ],
    navTitle: 'Where To Go',
    quickTitle: 'Quick Destinations',
    openLabel: 'Open',
    sections: [
      ['chat', 'Chat', 'Daily collaboration, multi-tab work, and active task handling.'],
      ['skills', 'Skills', 'Manage reusable capabilities and inspect their scope.'],
      ['tasks', 'Tasks', 'Create scheduled jobs and recurring automation.'],
      ['files', 'Files', 'Browse directories, inspect trees, and manage local outputs.'],
      ['platforms', 'Platforms', 'Review integrations and message channels.'],
      ['gateway', 'Gateway', 'Check gateway health and operational state.'],
      ['mcp', 'MCP', 'Connect tool servers, resources, and extensions.'],
      ['preferences', 'Preferences', 'Adjust theme, layout, notifications, and display behavior.'],
    ] as Array<[string, string, string]>,
    tipsTitle: 'Tips',
    tips: [
      'Be explicit about the goal, constraints, and expected output format.',
      'Promote repeated workflows into skills instead of repeating the same prompt.',
      'When the app feels unclear, check Dashboard, Gateway, or Monitor for runtime context.',
    ],
  },
} as const;

const sectionIcons = {
  chat: ChatIcon,
  skills: TargetIcon,
  tasks: ClockIcon,
  files: FolderIcon,
  platforms: GlobeIcon,
  gateway: ServerIcon,
  mcp: PlugIcon,
  preferences: SettingsIcon,
} as const;

export const HelpGuidePage: React.FC = () => {
  const { lang } = useTranslation();
  const setActiveItem = useNavigationStore((s) => s.setActiveItem);
  const copy = pageContent[lang];

  return (
    <div className="help-guide-page">
      <section className="help-guide-hero">
        <div className="help-guide-hero-mark"><BookIcon size={18} /></div>
        <div className="help-guide-hero-copy">
          <h1>{copy.title}</h1>
          <p>{copy.subtitle}</p>
        </div>
      </section>

      <section className="help-guide-grid">
        <article className="help-guide-panel help-guide-panel-wide">
          <div className="help-guide-panel-header">
            <span className="help-guide-panel-icon"><SparklesIcon size={16} /></span>
            <h2>{copy.overviewTitle}</h2>
          </div>
          <p className="help-guide-lead">{copy.overviewLead}</p>
          <p>{copy.overviewText}</p>
        </article>

        <article className="help-guide-panel">
          <div className="help-guide-panel-header">
            <span className="help-guide-panel-icon"><GridIcon size={16} /></span>
            <h2>{copy.capabilitiesTitle}</h2>
          </div>
          <div className="help-guide-list">
            {copy.capabilities.map(([title, desc]) => (
              <div key={title} className="help-guide-list-item">
                <strong>{title}</strong>
                <p>{desc}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="help-guide-panel">
          <div className="help-guide-panel-header">
            <span className="help-guide-panel-icon"><BookIcon size={16} /></span>
            <h2>{copy.startTitle}</h2>
          </div>
          <ol className="help-guide-steps">
            {copy.startSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </article>
      </section>

      <section className="help-guide-panel help-guide-nav-panel">
        <div className="help-guide-panel-header">
          <span className="help-guide-panel-icon"><GlobeIcon size={16} /></span>
          <h2>{copy.quickTitle}</h2>
        </div>
        <div className="help-guide-links">
          {copy.sections.map(([id, label, desc]) => {
            const Icon = sectionIcons[id as keyof typeof sectionIcons];
            return (
              <button key={id} className="help-guide-link-card" onClick={() => setActiveItem(id)}>
                <span className="help-guide-link-icon"><Icon size={16} /></span>
                <span className="help-guide-link-copy">
                  <strong>{label}</strong>
                  <span>{desc}</span>
                </span>
                <span className="help-guide-link-action">{copy.openLabel}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="help-guide-panel">
        <div className="help-guide-panel-header">
          <span className="help-guide-panel-icon"><SparklesIcon size={16} /></span>
          <h2>{copy.tipsTitle}</h2>
        </div>
        <ul className="help-guide-tips">
          {copy.tips.map((tip) => (
            <li key={tip}>{tip}</li>
          ))}
        </ul>
      </section>
    </div>
  );
};
