/**
 * Agent Tools
 *
 * Wraps pi-coding-agent's built-in coding tools for use in the Agent API route.
 * Uses createCodingTools(cwd) to produce tools bound to the user's working directory.
 */

import { createCodingTools, createGrepTool, createFindTool, createLsTool } from '@mariozechner/pi-coding-agent';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import { logger } from './logger';
import { ensureShellConfigured } from './agentShellConfig';

/**
 * Create the full set of coding agent tools bound to the given working directory.
 *
 * Default coding tools from pi-coding-agent: read, bash, edit, write
 * We add grep, find, ls for comprehensive code navigation.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const createAgentTools = (workDir: string): AgentTool<any>[] => {
  ensureShellConfigured();
  logger.info('Creating agent tools', { workDir }, 'AgentTools');

  // Core coding tools (read, bash, edit, write) — all bound to workDir
  const coreTools = createCodingTools(workDir);

  // Additional navigation tools
  const grepTool = createGrepTool(workDir);
  const findTool = createFindTool(workDir);
  const lsTool = createLsTool(workDir);

  // Cast needed: pi-coding-agent's Tool type uses specific TSchema generics
  // that don't unify with AgentTool<TSchema> — structurally compatible at runtime.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allTools = [...coreTools, grepTool, findTool, lsTool] as AgentTool<any>[];

  logger.info('Agent tools created', {
    workDir,
    toolNames: allTools.map(t => t.name),
    count: allTools.length,
  }, 'AgentTools');

  return allTools;
};
