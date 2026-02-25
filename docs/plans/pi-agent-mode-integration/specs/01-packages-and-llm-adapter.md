# Spec 01: npm 依赖安装与 LLM 配置适配器

## 1. 概述

本 spec 覆盖两个基础工作：安装 pi-mono 相关 npm 包，以及设计 LLM 配置适配器，将本项目的 modelConfig 体系桥接到 pi-ai 的 StreamOptions 格式。

## 2. npm 依赖安装

### 2.1 需要安装的包

```bash
npm install @mariozechner/pi-agent-core @mariozechner/pi-ai @mariozechner/pi-coding-agent
```

### 2.2 依赖关系

```
@mariozechner/pi-coding-agent
  ├── @mariozechner/pi-agent-core
  │     └── @mariozechner/pi-ai
  ├── @mariozechner/pi-ai
  ├── glob, minimatch, ignore (文件操作)
  ├── diff (差异比较)
  └── chalk, marked, yaml (格式化)
```

### 2.3 潜在冲突检查

需检查以下依赖是否与本项目冲突：
- `glob` — 本项目可能已有
- `chalk` — 版本兼容性（ESM vs CJS）
- `marked` — 本项目已使用 `react-markdown`，不冲突

### 2.4 Node.js 版本要求

pi-mono 要求 Node.js >= 20.0.0，本项目已要求 Node.js 20+，兼容。

## 3. LLM 配置适配器

### 3.1 目标

创建适配器模块 `lib/agentLlmAdapter.ts`，将本项目的 `ModelConfig` / `call_config` 转换为 pi-ai 的 `StreamOptions` 格式。

### 3.2 类型映射

**本项目 call_config（Python 端，通过 API 返回）：**

```typescript
interface CallConfig {
  apiKey: string;
  apiUrl: string;       // e.g., "https://api.openai.com/v1"
  modelName: string;    // e.g., "gpt-4"
  protocol: 'openai' | 'anthropic';
  extraHeaders?: Record<string, string>;
  defaultParams?: {
    temperature?: number;
    top_p?: number;
    max_tokens?: number;
  };
  timeout?: number;
}
```

**pi-ai StreamOptions（目标格式）：**

```typescript
interface StreamOptions {
  apiKey?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  headers?: Record<string, string>;
  baseUrl?: string;
  // ... 其他选项
}
```

### 3.3 适配器伪代码

```
function convertToStreamOptions(callConfig: CallConfig): StreamOptions {
  获取 pi-ai 的 provider 名称 ← 根据 callConfig.apiUrl 和 callConfig.protocol 推断

  构建 StreamOptions:
    - apiKey = callConfig.apiKey
    - model = callConfig.modelName
    - baseUrl = callConfig.apiUrl
    - temperature = callConfig.defaultParams?.temperature
    - maxTokens = callConfig.defaultParams?.max_tokens
    - topP = callConfig.defaultParams?.top_p
    - headers = callConfig.extraHeaders

  返回 StreamOptions
}

function resolveProvider(apiUrl: string, protocol: string): ProviderName {
  如果 apiUrl 包含 "openai.com" → "openai"
  如果 apiUrl 包含 "anthropic.com" → "anthropic"
  如果 protocol === "openai" → "openai" (兼容任何 OpenAI 协议的 API)
  如果 protocol === "anthropic" → "anthropic"
  默认 → "openai" (大多数自定义端点兼容 OpenAI 协议)
}
```

### 3.4 前端获取 LLM 配置

适配器需要从前端获取当前选择的模型配置：

```
1. 使用 getLLMConfigFromModel(selectedModel) 获取 call_config
   - 对于 standard/codingPlan 模型，自动合并 provider 模板
   - 对于 custom 模型，直接使用用户配置
2. 将 call_config 传入 convertToStreamOptions()
3. 将结果传给 API Route
```

### 3.5 特殊处理

**Anthropic 协议适配**：
- pi-ai 原生支持 Anthropic，但 API URL 格式可能不同
- 本项目的 Anthropic URL 格式：`https://api.anthropic.com/v1`
- pi-ai 的 Anthropic URL 格式：需确认是否一致

**自定义端点适配**：
- 本项目的 custom 模型可能使用非标准 API URL
- pi-ai 支持自定义 baseUrl，需确保格式兼容
- 可能需要路径后缀调整（如 `/v1/chat/completions` vs `/v1`）

**超时设置**：
- 本项目 timeout 单位为毫秒
- pi-ai timeout 需确认单位

## 4. 配置获取 API

### 4.1 新增 API 端点（可选）

如果前端直接传递 call_config 到 API Route，则不需要新增后端 API。

**方案 A（推荐）**：前端获取 call_config → 转换为 StreamOptions → 随请求发送到 API Route
- 优点：不需要 API Route 访问 Python 后端获取配置
- 缺点：API Key 经过前端传输

**方案 B**：API Route 调用 Flask 后端 `/api/model-configs` 获取配置
- 优点：API Key 不经过前端
- 缺点：增加一次后端调用

推荐方案 A，因为现有 Chat 流程中已经是前端传递 modelId 到 API Route，且 API Key 已通过 cookies 或 API 传递。

## 5. 文件清单

| 文件路径 | 类型 | 说明 |
|---------|------|------|
| `lib/agentLlmAdapter.ts` | 新建 | LLM 配置适配器 |
| `package.json` | 修改 | 添加 pi-mono 依赖 |

## 6. 验证标准

- [ ] `npm install` 成功，无依赖冲突
- [ ] pi-mono 包可正常 import（TypeScript 编译通过）
- [ ] `convertToStreamOptions()` 正确转换 OpenAI 协议配置
- [ ] `convertToStreamOptions()` 正确转换 Anthropic 协议配置
- [ ] `convertToStreamOptions()` 正确处理 custom 模型配置
