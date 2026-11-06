import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { McpServerConfig } from '@anthropic-ai/claude-agent-sdk';

function required(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required env var: ${key}`);
  }
  return value;
}

/**
 * Load MCP server configs from the user's ~/.claude/settings.json.
 * Returns the mcpServers record if found, typed for the Agent SDK.
 */
function loadUserMcpServers(): Record<string, McpServerConfig> | undefined {
  try {
    const settingsPath = join(homedir(), '.claude', 'settings.json');
    const raw = readFileSync(settingsPath, 'utf-8');
    const settings = JSON.parse(raw);
    if (settings.mcpServers && typeof settings.mcpServers === 'object') {
      const count = Object.keys(settings.mcpServers).length;
      if (count > 0) {
        console.log(`[config] Loaded ${count} MCP server(s) from ~/.claude/settings.json: ${Object.keys(settings.mcpServers).join(', ')}`);
        return settings.mcpServers as Record<string, McpServerConfig>;
      }
    }
  } catch {
    // No settings file or invalid JSON — that's fine
  }
  return undefined;
}

const MINUTE = 60_000;

/**
 * How long a single Bash command may run.
 *
 * The Agent SDK's own defaults (2 min default, 10 min ceiling) are far too
 * tight for this host: a container rebuild, a full pytest sweep or a `du`
 * across a 228 GB disk all overrun them and get cut off mid-command, which
 * presents as "the harness killed my session".  These are handed to the Bash
 * tool through the SDK's `env` option — see `cleanEnv` in `claudeRunner.ts`.
 */
const bashDefaultTimeoutMs = parseInt(
  process.env.BASH_DEFAULT_TIMEOUT_MS ?? String(10 * MINUTE), 10
);
const bashMaxTimeoutMs = parseInt(
  process.env.BASH_MAX_TIMEOUT_MS ?? String(30 * MINUTE), 10
);

/**
 * Inactivity budget for a session (see `armIdleTimer` in `claudeRunner.ts`).
 *
 * This is NOT a wall-clock cap.  The timer is re-armed on every stream event,
 * so a session that keeps making progress runs as long as it needs; it fires
 * only when nothing has happened for this long.
 *
 * A running tool call emits no stream events, so the budget has to comfortably
 * exceed the longest a single Bash command may legally take — otherwise a
 * session waiting on a slow-but-healthy build gets aborted as "idle".  That's
 * why this takes a floor instead of using CLAUDE_TIMEOUT_MS at face value.
 */
const requestedIdleMs = parseInt(
  process.env.CLAUDE_TIMEOUT_MS ?? String(15 * MINUTE), 10
);
const claudeTimeoutMs = Math.max(requestedIdleMs, bashMaxTimeoutMs + 5 * MINUTE);

export const config = {
  discordToken: required('DISCORD_TOKEN'),
  clientId: required('DISCORD_CLIENT_ID'),
  guildId: required('DISCORD_GUILD_ID'),
  authorizedRoleIds: required('AUTHORIZED_ROLE_IDS').split(',').map(s => s.trim()),
  notifyUserId: process.env.NOTIFY_USER_ID ?? '',
  claudeTimeoutMs,
  bashDefaultTimeoutMs,
  bashMaxTimeoutMs,
  roborevCliPath: process.env.ROBOREV_CLI_PATH ?? 'roborev',
  projectsBaseDir: process.env.PROJECTS_BASE_DIR ?? '',
  allowNonGit: process.env.ALLOW_NON_GIT === 'true',
  mcpServers: loadUserMcpServers(),
  usageChannelId: process.env.USAGE_CHANNEL_ID ?? '',
  defaultModel: process.env.CLAUDE_MODEL ?? '',
} as const;
