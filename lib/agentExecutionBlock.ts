/**
 * Agent Execution Block Types
 *
 * Discriminated union types representing ordered execution steps
 * in an agent conversation. Used to display sequential execution
 * in the chat timeline.
 */

// ── Base block fields ────────────────────────────────────────────────────────

interface AgentBlockBase {
  id: string;
  index: number;
  timestamp: string;
}

// ── Block variants ───────────────────────────────────────────────────────────

export interface AgentContentBlock extends AgentBlockBase {
  type: 'content';
  text: string;
}

export interface AgentToolUseBlock extends AgentBlockBase {
  type: 'tool_use';
  toolCallId: string;
  toolName: string;
  toolInput: unknown;
  status: 'running' | 'complete' | 'error';
  result?: string;
  isError?: boolean;
  startTime?: number;
  endTime?: number;
}

export interface AgentFileOutputBlock extends AgentBlockBase {
  type: 'file_output';
  filePath: string;
  operation: 'write' | 'edit';
  toolCallId: string;
}

export interface AgentThinkingBlock extends AgentBlockBase {
  type: 'thinking';
  text: string;
}

export interface AgentTurnSeparatorBlock extends AgentBlockBase {
  type: 'turn_separator';
  turnNumber: number;
}

// ── Discriminated union ──────────────────────────────────────────────────────

export type AgentExecutionBlock =
  | AgentContentBlock
  | AgentToolUseBlock
  | AgentFileOutputBlock
  | AgentThinkingBlock
  | AgentTurnSeparatorBlock;

// ── Helpers ──────────────────────────────────────────────────────────────────

const FILE_PRODUCING_TOOLS = new Set(['write', 'edit']);

/** Returns true if the tool name corresponds to a file-producing operation. */
export const isFileProducingTool = (toolName: string): boolean =>
  FILE_PRODUCING_TOOLS.has(toolName);

/**
 * Extract the file path from a tool's input payload.
 * Pi-coding-agent uses `{ path: string, ... }` for both write and edit tools.
 */
export const extractFilePath = (_toolName: string, toolInput: unknown): string | null => {
  if (!toolInput || typeof toolInput !== 'object') return null;
  const input = toolInput as Record<string, unknown>;
  if (typeof input.path === 'string') return input.path;
  if (typeof input.file_path === 'string') return input.file_path;
  return null;
};

// ── Type guards ──────────────────────────────────────────────────────────────

export const isContentBlock = (block: AgentExecutionBlock): block is AgentContentBlock =>
  block.type === 'content';

export const isToolUseBlock = (block: AgentExecutionBlock): block is AgentToolUseBlock =>
  block.type === 'tool_use';

export const isFileOutputBlock = (block: AgentExecutionBlock): block is AgentFileOutputBlock =>
  block.type === 'file_output';

export const isThinkingBlock = (block: AgentExecutionBlock): block is AgentThinkingBlock =>
  block.type === 'thinking';

export const isTurnSeparatorBlock = (block: AgentExecutionBlock): block is AgentTurnSeparatorBlock =>
  block.type === 'turn_separator';

// ── Factory helpers ──────────────────────────────────────────────────────────

let blockCounter = 0;

export const resetBlockCounter = (): void => {
  blockCounter = 0;
};

/** Distributive Omit that preserves union discrimination */
type DistributiveOmit<T, K extends keyof T> = T extends T ? Omit<T, K> : never;

export const createBlock = (
  fields: DistributiveOmit<AgentExecutionBlock, 'id' | 'index' | 'timestamp'> & { id?: string },
): AgentExecutionBlock => {
  const index = blockCounter++;
  return {
    id: fields.id ?? `block-${index}-${Date.now()}`,
    index,
    timestamp: new Date().toISOString(),
    ...fields,
  } as AgentExecutionBlock;
};
