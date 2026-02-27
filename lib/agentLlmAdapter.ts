/**
 * Agent LLM Adapter
 *
 * Bridges the project's ModelConfig / call_config to pi-ai's Model + StreamOptions
 * so that pi-agent-core Agent instances can use the same LLM configuration
 * system as the rest of the application.
 */

import type {
  Api,
  Model,
  Provider,
  StreamOptions,
  OpenAICompletionsCompat,
} from '@mariozechner/pi-ai';

import type { ModelConfig } from './modelConfig';
import { getLLMConfigFromModel, isCodingPlanModel, loadProviders } from './modelConfig';
import { logger } from './logger';

// ── CallConfig (mirrors the Python backend call_config) ──────────────────────

/** LLM call configuration returned by the backend's `get_llm_config()` */
export interface CallConfig {
  apiKey: string;
  apiUrl: string;
  modelName: string;
  protocol: 'openai' | 'anthropic';
  extraHeaders?: Record<string, string>;
  defaultParams?: {
    temperature?: number;
    top_p?: number;
    max_tokens?: number;
  };
  timeout?: number;
}

// ── Output type ──────────────────────────────────────────────────────────────

/** Everything needed to initialise a pi-agent Agent for a given model */
export interface AgentLLMConfig {
  /** pi-ai Model descriptor (provider, api, baseUrl, etc.) */
  model: Model<Api>;
  /** Streaming options (apiKey, temperature, headers, …) */
  streamOptions: Omit<StreamOptions, 'signal'>;
}

// ── Provider / API resolution ────────────────────────────────────────────────

/** Well-known base-URL fragments → pi-ai Provider name */
const URL_PROVIDER_MAP: [pattern: string, provider: Provider][] = [
  ['api.openai.com', 'openai'],
  ['api.anthropic.com', 'anthropic'],
  ['generativelanguage.googleapis.com', 'google'],
  ['api.groq.com', 'groq'],
  ['api.x.ai', 'xai'],
  ['api.cerebras.ai', 'cerebras'],
  ['openrouter.ai', 'openrouter'],
  ['api.deepseek.com', 'openai'],       // DeepSeek uses OpenAI protocol
  ['api.minimax.chat', 'minimax'],
  ['api.mistral.ai', 'mistral'],
];

/**
 * Infer the pi-ai Provider name from an API URL and protocol.
 *
 * 1. Check known URL patterns first (most specific).
 * 2. Fall back to the protocol string itself (openai / anthropic).
 */
export const resolveProvider = (apiUrl: string, protocol: string): Provider => {
  const lower = apiUrl.toLowerCase();

  for (const [pattern, provider] of URL_PROVIDER_MAP) {
    if (lower.includes(pattern)) {
      return provider;
    }
  }

  // Generic fallback based on protocol
  if (protocol === 'anthropic') return 'anthropic';
  return 'openai';
};

/**
 * Map our protocol discriminator to the pi-ai API string.
 *
 * - `openai`    → `openai-completions` (chat completions format)
 * - `anthropic` → `anthropic-messages`
 */
const resolveApi = (protocol: 'openai' | 'anthropic'): Api => {
  return protocol === 'anthropic' ? 'anthropic-messages' : 'openai-completions';
};

// ── Core conversion ──────────────────────────────────────────────────────────

const DEFAULT_CONTEXT_WINDOW = 128_000;
const DEFAULT_MAX_TOKENS = 8_192;

/**
 * Convert a `CallConfig` (our backend format) into a pi-ai `Model` + `StreamOptions`.
 */
export const convertToAgentLLMConfig = (callConfig: CallConfig): AgentLLMConfig => {
  const provider = resolveProvider(callConfig.apiUrl, callConfig.protocol);
  const api = resolveApi(callConfig.protocol);

  // Build OpenAI compat hints for non-standard endpoints
  let compat: OpenAICompletionsCompat | undefined;
  if (api === 'openai-completions' && provider === 'openai' && !callConfig.apiUrl.includes('api.openai.com')) {
    // Custom OpenAI-compatible endpoint — use conservative defaults
    compat = {
      supportsStore: false,
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
      maxTokensField: 'max_tokens',
    };
  }

  const maxTokens = callConfig.defaultParams?.max_tokens ?? DEFAULT_MAX_TOKENS;

  const model: Model<Api> = {
    id: callConfig.modelName,
    name: callConfig.modelName,
    api,
    provider,
    baseUrl: callConfig.apiUrl,
    reasoning: false,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: DEFAULT_CONTEXT_WINDOW,
    maxTokens,
    ...(callConfig.extraHeaders ? { headers: callConfig.extraHeaders } : {}),
    ...(compat ? { compat } : {}),
  } as Model<Api>;

  const streamOptions: Omit<StreamOptions, 'signal'> = {
    apiKey: callConfig.apiKey,
    ...(callConfig.defaultParams?.temperature != null && {
      temperature: callConfig.defaultParams.temperature,
    }),
    ...(callConfig.defaultParams?.max_tokens != null && {
      maxTokens: callConfig.defaultParams.max_tokens,
    }),
    ...(callConfig.extraHeaders ? { headers: callConfig.extraHeaders } : {}),
    // pi-ai maxRetryDelayMs is in milliseconds — same unit as our timeout
    ...(callConfig.timeout != null && { maxRetryDelayMs: callConfig.timeout }),
  };

  logger.debug('Converted CallConfig to AgentLLMConfig', {
    provider,
    api,
    model: callConfig.modelName,
  }, 'AgentLlmAdapter');

  return { model, streamOptions };
};

// ── Convenience wrapper for ModelConfig ──────────────────────────────────────

/**
 * One-step conversion: take a project `ModelConfig` → `AgentLLMConfig`.
 *
 * For `codingPlan` models, automatically resolves apiUrl, modelName, protocol,
 * extraHeaders, and defaultParams from the provider template via `loadProviders()`.
 */
export const getAgentLLMConfig = async (
  selectedModel: ModelConfig,
  resolvedApiUrl?: string,
  resolvedModelName?: string,
  protocol?: 'openai' | 'anthropic',
  extraHeaders?: Record<string, string>,
  defaultParams?: CallConfig['defaultParams'],
): Promise<AgentLLMConfig> => {
  // For codingPlan models, resolve provider template fields automatically
  if (isCodingPlanModel(selectedModel) && !resolvedApiUrl) {
    const providers = await loadProviders();
    const service = providers.codingPlan.find(s => s.id === selectedModel.serviceId);

    if (service) {
      resolvedApiUrl = service.apiUrl;
      resolvedModelName = service.model;
      protocol = protocol ?? service.protocol;
      extraHeaders = extraHeaders ?? service.extraHeaders;
      defaultParams = defaultParams ?? service.defaultParams as CallConfig['defaultParams'];

      logger.debug('Resolved codingPlan service template', {
        serviceId: selectedModel.serviceId,
        apiUrl: service.apiUrl,
        model: service.model,
        protocol: service.protocol,
      }, 'AgentLlmAdapter');
    } else {
      logger.error('CodingPlan service template not found', {
        serviceId: selectedModel.serviceId,
      }, 'AgentLlmAdapter');
    }
  }

  // Reuse the existing helper to get apiKey / apiUrl / modelName / timeout
  const llmConfig = getLLMConfigFromModel(selectedModel, resolvedApiUrl, resolvedModelName);

  const callConfig: CallConfig = {
    apiKey: llmConfig.apiKey,
    apiUrl: llmConfig.apiUrl,
    modelName: llmConfig.modelName,
    protocol: protocol ?? 'openai',
    timeout: llmConfig.timeout,
    ...(extraHeaders ? { extraHeaders } : {}),
    ...(defaultParams ? { defaultParams } : {}),
  };

  return convertToAgentLLMConfig(callConfig);
};
