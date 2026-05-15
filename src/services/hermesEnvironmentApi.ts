import { apiClient, getErrorDetail } from './apiClient';
import { logger } from '../lib/logger';
import type {
  HermesCapabilities,
  HermesEnvironment,
  HermesPaths,
  HermesRuntime,
} from '../types/hermesEnvironment';

interface BackendHermesRuntime {
  pythonPath: string | null;
  cliCommand: string | null;
  agentRoot: string | null;
  importRoot: string | null;
}

interface BackendHermesPaths {
  hermesHome: string;
  configYaml: string;
  stateDb: string;
  logsDir: string;
  skillsDir: string;
  memoriesDir: string;
  cronDir: string;
  checkpointsDir: string;
  appDir: string;
  approvalsDir: string;
  clarifyDir: string;
  secretsDir: string;
}

interface BackendHermesCapabilityStatus {
  available: boolean;
  detectionMethod: string;
  reason: string | null;
  checkedPaths: string[];
}

interface BackendHermesCapabilities {
  hasChat: boolean;
  hasSessions: boolean;
  hasSkills: boolean;
  hasMemories: boolean;
  hasMcp: boolean;
  hasCron: boolean;
  hasPlatforms: boolean;
  chat: BackendHermesCapabilityStatus;
  sessions: BackendHermesCapabilityStatus;
  skills: BackendHermesCapabilityStatus;
  memories: BackendHermesCapabilityStatus;
  mcp: BackendHermesCapabilityStatus;
  cron: BackendHermesCapabilityStatus;
  platforms: BackendHermesCapabilityStatus;
}

interface BackendHermesEnvironment {
  hermesHome: string;
  activeProfile: string | null;
  runtime: BackendHermesRuntime;
  paths: BackendHermesPaths;
  capabilities: BackendHermesCapabilities;
  usesWsl: boolean;
}

function mapRuntime(runtime: BackendHermesRuntime): HermesRuntime {
  return {
    python_path: runtime.pythonPath,
    cli_command: runtime.cliCommand,
    agent_root: runtime.agentRoot,
    import_root: runtime.importRoot,
  };
}

function mapPaths(paths: BackendHermesPaths): HermesPaths {
  return {
    hermes_home: paths.hermesHome,
    config_yaml: paths.configYaml,
    state_db: paths.stateDb,
    logs_dir: paths.logsDir,
    skills_dir: paths.skillsDir,
    memories_dir: paths.memoriesDir,
    cron_dir: paths.cronDir,
    checkpoints_dir: paths.checkpointsDir,
    app_dir: paths.appDir,
    approvals_dir: paths.approvalsDir,
    clarify_dir: paths.clarifyDir,
    secrets_dir: paths.secretsDir,
  };
}

function mapCapabilityStatus(status: BackendHermesCapabilityStatus) {
  return {
    available: status.available,
    detection_method: status.detectionMethod,
    reason: status.reason,
    checked_paths: status.checkedPaths,
  };
}

function mapCapabilities(capabilities: BackendHermesCapabilities): HermesCapabilities {
  return {
    has_chat: capabilities.hasChat,
    has_sessions: capabilities.hasSessions,
    has_skills: capabilities.hasSkills,
    has_memories: capabilities.hasMemories,
    has_mcp: capabilities.hasMcp,
    has_cron: capabilities.hasCron,
    has_platforms: capabilities.hasPlatforms,
    chat: mapCapabilityStatus(capabilities.chat),
    sessions: mapCapabilityStatus(capabilities.sessions),
    skills: mapCapabilityStatus(capabilities.skills),
    memories: mapCapabilityStatus(capabilities.memories),
    mcp: mapCapabilityStatus(capabilities.mcp),
    cron: mapCapabilityStatus(capabilities.cron),
    platforms: mapCapabilityStatus(capabilities.platforms),
  };
}

function mapEnvironment(environment: BackendHermesEnvironment): HermesEnvironment {
  return {
    hermes_home: environment.hermesHome,
    active_profile: environment.activeProfile,
    runtime: mapRuntime(environment.runtime),
    paths: mapPaths(environment.paths),
    capabilities: mapCapabilities(environment.capabilities),
    uses_wsl: environment.usesWsl,
  };
}

export async function getHermesEnvironment(): Promise<HermesEnvironment | null> {
  try {
    const environment = await apiClient.invoke<BackendHermesEnvironment>('get_hermes_environment');
    return mapEnvironment(environment);
  } catch (error) {
    logger.error(`[HermesEnvironmentApi] getHermesEnvironment failed: ${getErrorDetail(error)}`);
    return null;
  }
}

export async function getHermesPaths(): Promise<HermesPaths | null> {
  try {
    const paths = await apiClient.invoke<BackendHermesPaths>('get_hermes_paths');
    return mapPaths(paths);
  } catch (error) {
    logger.error(`[HermesEnvironmentApi] getHermesPaths failed: ${getErrorDetail(error)}`);
    return null;
  }
}

export async function getHermesRuntime(): Promise<HermesRuntime | null> {
  try {
    const runtime = await apiClient.invoke<BackendHermesRuntime>('get_hermes_runtime');
    return mapRuntime(runtime);
  } catch (error) {
    logger.error(`[HermesEnvironmentApi] getHermesRuntime failed: ${getErrorDetail(error)}`);
    return null;
  }
}

export async function checkHermesCapabilities(): Promise<HermesCapabilities | null> {
  try {
    const capabilities = await apiClient.invoke<BackendHermesCapabilities>('check_hermes_capabilities');
    return mapCapabilities(capabilities);
  } catch (error) {
    logger.error(`[HermesEnvironmentApi] checkHermesCapabilities failed: ${getErrorDetail(error)}`);
    return null;
  }
}
