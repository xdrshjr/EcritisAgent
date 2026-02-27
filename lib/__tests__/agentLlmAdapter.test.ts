import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  resolveProvider,
  convertToAgentLLMConfig,
  getAgentLLMConfig,
  type CallConfig,
} from '../agentLlmAdapter';

vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock('@/lib/flaskConfig', () => ({
  buildFlaskApiUrl: vi.fn((path: string) => `http://localhost:5000${path}`),
}));

// ── resolveProvider ──────────────────────────────────────────────────────────

describe('resolveProvider', () => {
  it('resolves OpenAI URL to openai', () => {
    expect(resolveProvider('https://api.openai.com/v1', 'openai')).toBe('openai');
  });

  it('resolves Anthropic URL to anthropic', () => {
    expect(resolveProvider('https://api.anthropic.com/v1', 'anthropic')).toBe('anthropic');
  });

  it('resolves Groq URL to groq', () => {
    expect(resolveProvider('https://api.groq.com/openai/v1', 'openai')).toBe('groq');
  });

  it('resolves xAI URL to xai', () => {
    expect(resolveProvider('https://api.x.ai/v1', 'openai')).toBe('xai');
  });

  it('resolves DeepSeek URL to openai', () => {
    expect(resolveProvider('https://api.deepseek.com/v1', 'openai')).toBe('openai');
  });

  it('resolves OpenRouter URL to openrouter', () => {
    expect(resolveProvider('https://openrouter.ai/api/v1', 'openai')).toBe('openrouter');
  });

  it('resolves Cerebras URL to cerebras', () => {
    expect(resolveProvider('https://api.cerebras.ai/v1', 'openai')).toBe('cerebras');
  });

  it('falls back to anthropic for unknown URL with anthropic protocol', () => {
    expect(resolveProvider('https://custom-proxy.example.com/v1', 'anthropic')).toBe('anthropic');
  });

  it('falls back to openai for unknown URL with openai protocol', () => {
    expect(resolveProvider('https://custom-proxy.example.com/v1', 'openai')).toBe('openai');
  });

  it('is case-insensitive for URL matching', () => {
    expect(resolveProvider('https://API.OPENAI.COM/v1', 'openai')).toBe('openai');
  });
});

// ── convertToAgentLLMConfig ──────────────────────────────────────────────────

describe('convertToAgentLLMConfig', () => {
  describe('OpenAI protocol', () => {
    const openaiConfig: CallConfig = {
      apiKey: 'sk-test-key',
      apiUrl: 'https://api.openai.com/v1',
      modelName: 'gpt-4o',
      protocol: 'openai',
      defaultParams: {
        temperature: 0.7,
        max_tokens: 4096,
        top_p: 0.9,
      },
    };

    it('creates correct Model object', () => {
      const result = convertToAgentLLMConfig(openaiConfig);

      expect(result.model.id).toBe('gpt-4o');
      expect(result.model.name).toBe('gpt-4o');
      expect(result.model.api).toBe('openai-completions');
      expect(result.model.provider).toBe('openai');
      expect(result.model.baseUrl).toBe('https://api.openai.com/v1');
      expect(result.model.reasoning).toBe(false);
      expect(result.model.input).toEqual(['text']);
    });

    it('creates correct StreamOptions', () => {
      const result = convertToAgentLLMConfig(openaiConfig);

      expect(result.streamOptions.apiKey).toBe('sk-test-key');
      expect(result.streamOptions.temperature).toBe(0.7);
      expect(result.streamOptions.maxTokens).toBe(4096);
    });

    it('does not set compat for official OpenAI endpoint', () => {
      const result = convertToAgentLLMConfig(openaiConfig);
      expect(result.model.compat).toBeUndefined();
    });
  });

  describe('Anthropic protocol', () => {
    const anthropicConfig: CallConfig = {
      apiKey: 'sk-ant-test-key',
      apiUrl: 'https://api.anthropic.com/v1',
      modelName: 'claude-sonnet-4-5-20250514',
      protocol: 'anthropic',
      extraHeaders: {
        'anthropic-version': '2023-06-01',
      },
      defaultParams: {
        temperature: 0.5,
        max_tokens: 8192,
      },
    };

    it('creates correct Model with anthropic-messages api', () => {
      const result = convertToAgentLLMConfig(anthropicConfig);

      expect(result.model.api).toBe('anthropic-messages');
      expect(result.model.provider).toBe('anthropic');
      expect(result.model.baseUrl).toBe('https://api.anthropic.com/v1');
      expect(result.model.id).toBe('claude-sonnet-4-5-20250514');
    });

    it('passes extraHeaders to model and streamOptions', () => {
      const result = convertToAgentLLMConfig(anthropicConfig);

      expect(result.model.headers).toEqual({ 'anthropic-version': '2023-06-01' });
      expect(result.streamOptions.headers).toEqual({ 'anthropic-version': '2023-06-01' });
    });

    it('maps temperature and maxTokens', () => {
      const result = convertToAgentLLMConfig(anthropicConfig);

      expect(result.streamOptions.temperature).toBe(0.5);
      expect(result.streamOptions.maxTokens).toBe(8192);
    });
  });

  describe('Custom / self-hosted model', () => {
    const customConfig: CallConfig = {
      apiKey: 'custom-key',
      apiUrl: 'https://my-llm-proxy.local/v1',
      modelName: 'my-model',
      protocol: 'openai',
    };

    it('creates Model with conservative compat for custom endpoint', () => {
      const result = convertToAgentLLMConfig(customConfig);

      expect(result.model.provider).toBe('openai');
      expect(result.model.api).toBe('openai-completions');
      expect(result.model.compat).toEqual({
        supportsStore: false,
        supportsDeveloperRole: false,
        supportsReasoningEffort: false,
        maxTokensField: 'max_tokens',
      });
    });

    it('uses default maxTokens when not provided', () => {
      const result = convertToAgentLLMConfig(customConfig);

      expect(result.model.maxTokens).toBe(8192);
    });

    it('does not set temperature when not provided', () => {
      const result = convertToAgentLLMConfig(customConfig);

      expect(result.streamOptions.temperature).toBeUndefined();
    });
  });

  describe('Missing/optional fields', () => {
    it('handles config with no defaultParams', () => {
      const config: CallConfig = {
        apiKey: 'key',
        apiUrl: 'https://api.openai.com/v1',
        modelName: 'gpt-4',
        protocol: 'openai',
      };

      const result = convertToAgentLLMConfig(config);

      expect(result.streamOptions.temperature).toBeUndefined();
      expect(result.streamOptions.maxTokens).toBeUndefined();
      expect(result.model.maxTokens).toBe(8192);
    });

    it('handles config with no extraHeaders', () => {
      const config: CallConfig = {
        apiKey: 'key',
        apiUrl: 'https://api.anthropic.com/v1',
        modelName: 'claude-3-opus',
        protocol: 'anthropic',
      };

      const result = convertToAgentLLMConfig(config);

      expect(result.model.headers).toBeUndefined();
      expect(result.streamOptions.headers).toBeUndefined();
    });

    it('sets default contextWindow', () => {
      const config: CallConfig = {
        apiKey: 'key',
        apiUrl: 'https://api.openai.com/v1',
        modelName: 'gpt-4',
        protocol: 'openai',
      };

      const result = convertToAgentLLMConfig(config);

      expect(result.model.contextWindow).toBe(128_000);
    });

    it('maps timeout to maxRetryDelayMs when provided', () => {
      const config: CallConfig = {
        apiKey: 'key',
        apiUrl: 'https://api.openai.com/v1',
        modelName: 'gpt-4',
        protocol: 'openai',
        timeout: 30000,
      };

      const result = convertToAgentLLMConfig(config);

      expect(result.streamOptions.maxRetryDelayMs).toBe(30000);
    });

    it('does not set maxRetryDelayMs when timeout is not provided', () => {
      const config: CallConfig = {
        apiKey: 'key',
        apiUrl: 'https://api.openai.com/v1',
        modelName: 'gpt-4',
        protocol: 'openai',
      };

      const result = convertToAgentLLMConfig(config);

      expect(result.streamOptions.maxRetryDelayMs).toBeUndefined();
    });
  });
});

// ── getAgentLLMConfig ────────────────────────────────────────────────────────

describe('getAgentLLMConfig', () => {
  it('converts a standard ModelConfig', async () => {
    const model = {
      id: 'model_123',
      type: 'standard' as const,
      name: 'My GPT-4',
      providerId: 'openai',
      apiUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-test',
      modelName: 'gpt-4o',
    };

    const result = await getAgentLLMConfig(model, undefined, undefined, 'openai');

    expect(result.model.id).toBe('gpt-4o');
    expect(result.model.provider).toBe('openai');
    expect(result.streamOptions.apiKey).toBe('sk-test');
  });

  it('converts a custom ModelConfig', async () => {
    const model = {
      id: 'model_456',
      type: 'custom' as const,
      name: 'My Custom LLM',
      apiUrl: 'https://my-server.com/v1',
      apiKey: 'custom-key',
      modelName: 'llama3',
    };

    const result = await getAgentLLMConfig(model, undefined, undefined, 'openai');

    expect(result.model.id).toBe('llama3');
    expect(result.model.baseUrl).toBe('https://my-server.com/v1');
    expect(result.streamOptions.apiKey).toBe('custom-key');
  });

  it('converts a codingPlan ModelConfig with resolved URL and model', async () => {
    const model = {
      id: 'model_789',
      type: 'codingPlan' as const,
      name: 'Kimi K2.5',
      serviceId: 'kimi',
      apiKey: 'kimi-key',
    };

    const result = await getAgentLLMConfig(
      model,
      'https://api.moonshot.cn/v1',
      'kimi-k2.5',
      'anthropic',
      { 'anthropic-version': '2023-06-01' },
    );

    expect(result.model.id).toBe('kimi-k2.5');
    expect(result.model.baseUrl).toBe('https://api.moonshot.cn/v1');
    expect(result.model.api).toBe('anthropic-messages');
    expect(result.streamOptions.apiKey).toBe('kimi-key');
    expect(result.streamOptions.headers).toEqual({ 'anthropic-version': '2023-06-01' });
  });

  it('passes defaultParams through', async () => {
    const model = {
      id: 'model_1',
      type: 'standard' as const,
      name: 'Test',
      providerId: 'openai',
      apiUrl: 'https://api.openai.com/v1',
      apiKey: 'key',
      modelName: 'gpt-4',
    };

    const result = await getAgentLLMConfig(
      model,
      undefined,
      undefined,
      'openai',
      undefined,
      { temperature: 0.3, max_tokens: 2048 },
    );

    expect(result.streamOptions.temperature).toBe(0.3);
    expect(result.streamOptions.maxTokens).toBe(2048);
  });
});
