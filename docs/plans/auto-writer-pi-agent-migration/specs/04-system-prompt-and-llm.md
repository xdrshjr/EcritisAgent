# Spec 04: 系统提示与 LLM 配置

## 概述

本文档定义文档 Agent 的系统提示（System Prompt）设计、LLM 适配方案和模型配置策略。系统提示是引导 Agent 行为的核心——它定义了 Agent 的角色、能力边界、工作规范和工具使用策略。

## 系统提示设计

### 设计原则

1. **固定专业提示**：预定义详细的文档写作专家角色，不需要用户选择模板
2. **工具引导**：通过提示引导 Agent 正确使用工具，尤其是 section 粒度操作
3. **双语支持**：提示本身用中英双语编写，Agent 根据用户消息语言自动适配
4. **自主决策**：不预设固定阶段，让 Agent 根据任务自行规划

### System Prompt 内容

```
你是一个专业的文档写作助手，擅长创建和修改结构化文档。

## 角色定位
你是一个高水准的文档写作专家，能够：
- 根据用户需求从零创建完整的结构化文档
- 对已有文档进行修改、扩展、精简、重写等操作
- 撰写多种类型的内容：技术文档、博客文章、学术报告、营销文案、商业计划等
- 使用网络搜索丰富内容的参考依据
- 为文档配图以增强可读性

## 工作方式

### 文档操作
你通过工具与文档编辑器交互。文档按章节(Section)组织：
- Section 0: 文档标题(h1)和引言段落
- Section 1+: 各个章节，每个章节包含标题(h2)和内容段落

你可以使用的工具：
- `get_document`: 读取当前文档内容，了解文档现有结构和内容
- `update_section`: 创建、替换、插入或删除章节
- `insert_image`: 在指定章节后插入图片
- `search_web`: 搜索网络获取参考资料
- `search_image`: 搜索适合的图片素材

### 创建文档流程
当用户要求创建新文档时，你应该：
1. 理解用户需求（主题、风格、长度、受众等）
2. 规划文档结构（标题和各章节标题）
3. 逐章节编写内容，使用 update_section(append) 逐步构建
4. 如有需要，使用 search_web 获取参考资料
5. 如有需要，使用 search_image + insert_image 为文档配图
6. 完成后给出总结

### 修改文档流程
当用户要求修改现有文档时：
1. 先调用 get_document 了解当前文档内容
2. 理解用户的修改需求
3. 使用 update_section(replace) 修改需要改动的章节
4. 如需新增章节，使用 update_section(append/insert)
5. 如需删除章节，使用 update_section(delete)
6. 完成后说明修改了哪些内容

## 写作规范

### 内容质量
- 内容充实、有深度，避免空洞的套话
- 段落之间逻辑连贯，过渡自然
- 使用具体的数据、案例和引用来支撑观点
- 根据受众调整专业术语的使用程度

### 格式规范
- 每个章节(Section)的内容使用 HTML 格式
- 使用 <p> 标签包裹段落
- 可以使用 <ul>/<ol>/<li> 创建列表
- 可以使用 <strong>/<em> 进行强调
- 不要在 content 中包含 <h1> 或 <h2> 标签（标题通过 title 参数传递）
- 每个章节建议 2-5 个段落，内容适中

### 引用规范
- 如果使用了 search_web 获取的参考资料，在内容中适当引用
- 引用格式：在段落末尾用 [来源标题](URL) 标注

## 重要注意事项
- 每次只修改需要修改的部分，不要替换整个文档
- 使用 update_section 时，content 参数不要包含标题标签（h1/h2），标题通过 title 参数传递
- 在创建文档时，先追加 Section 0（标题和引言），再逐个追加后续章节
- 如果用户没有明确指定语言，默认使用与用户消息相同的语言
- 回复用户时，简洁说明你做了什么或计划做什么，不要过度解释
```

### 提示管理

```typescript
// lib/docAgentPrompt.ts

export function buildDocAgentSystemPrompt(): string {
  // 返回上述固定提示
  // 未来如需扩展（如根据语言调整），可在此函数中处理
  return DOC_AGENT_SYSTEM_PROMPT;
}
```

## LLM 适配

### 复用现有适配器

文档 Agent 的 LLM 配置完全复用编码 Agent 的 `agentLlmAdapter.ts`：

```typescript
import { getAgentLLMConfig } from '@/lib/agentLlmAdapter';

// 在 DocAgentPanel 中使用
const llmConfig = await getAgentLLMConfig(selectedModel);
```

**适配流程**：

```
用户选择的 ModelConfig (standard | codingPlan | custom)
    ↓
getLLMConfigFromModel(model) → CallConfig { apiKey, apiUrl, modelName, protocol }
    ↓
convertToAgentLLMConfig(callConfig) → AgentLLMConfig { model, streamOptions }
    ↓
传入 /api/doc-agent-chat 请求体
    ↓
API Route 中用于创建 Agent 实例
```

### 支持的协议

- **OpenAI 协议**：通过 `api: 'openai-completions'` 标识
- **Anthropic 协议**：通过 `api: 'anthropic-messages'` 标识
- 协议推断逻辑与编码 Agent 完全相同

### 温度策略

与 LangGraph 版本不同，pi-agent 版本不再按阶段设置不同温度：

- **统一使用用户配置的温度**（通常 0.7）
- 理由：Agent 自主循环不区分"意图分析"和"内容创作"阶段
- 如果模型配置中未指定温度，使用默认值 0.7

## 模型选择

### UI 集成

DocAgentPanel 使用与 ChatPanel 相同的模型选择器：

```typescript
// DocAgentPanel 通过 props 接收 selectedModelId
// 或内部维护独立的模型选择状态
const [selectedModelId, setSelectedModelId] = useState<string | null>(
  props.selectedModelId
);
```

### 模型切换

- 用户可以在对话过程中切换模型
- 切换模型不会清除对话历史
- 新消息使用新选择的模型

## 对话历史处理

### 上下文窗口管理

由于对话历史可能随多轮交互变长，需要考虑 token 限制：

```pseudo
function prepareHistory(messages: DocAgentMessage[], maxTokenEstimate: number):
    // 简单策略：保留所有历史
    // pi-agent-core 内部会处理 token 截断

    history = messages
        .filter(m => m.role !== 'error')
        .map(m => ({
            role: m.role,
            content: m.content
        }))

    return history
```

### 工具调用在历史中的处理

- 工具调用的详细记录（输入、输出）**不**包含在对话历史中
- 只保留 Agent 的最终文本回复作为 assistant 消息
- 理由：工具调用细节占大量 token，但对后续对话价值有限
- Agent 需要了解之前做了什么修改时，可以调用 `get_document` 查看当前状态

### 清除历史

```typescript
// DocAgentPanel 中的清除功能
const handleClearHistory = useCallback(() => {
  setMessages([]);
  setConversationId(generateId());
  // 清除 localStorage
  localStorage.removeItem(STORAGE_KEY);
}, []);
```

## 错误处理

### LLM 调用失败

```typescript
// 在 SSE 流处理中
onError: (error: string) => {
  const errorMessage: DocAgentMessage = {
    id: generateId(),
    role: 'error',
    content: `Agent 执行出错: ${error}`,
    timestamp: Date.now()
  };
  setMessages(prev => [...prev, errorMessage]);
  setIsStreaming(false);
}
```

### 模型不可用

- 如果 selectedModelId 对应的模型配置不存在，显示错误提示
- 引导用户在设置中配置模型

## 文件结构

```
lib/
  docAgentPrompt.ts    # 文档 Agent 系统提示定义
  // agentLlmAdapter.ts — 复用，无需修改
```
