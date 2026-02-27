# Spec 02: API 路由与 Agent 循环设计

## 概述

本文档定义新的 Next.js API 路由 `/api/doc-agent-chat`，用于运行文档 Agent 的 pi-agent 循环。该路由的设计模式与现有编码 Agent 路由 (`/api/agent-chat`) 保持一致，但使用文档专用工具替代编码工具。

## API 端点设计

### POST `/api/doc-agent-chat`

**请求体**：
```json
{
  "message": "写一篇关于人工智能发展趋势的文章",
  "documentContent": "<h1>现有标题</h1><p>现有内容...</p>",
  "history": [
    {
      "role": "user",
      "content": "帮我写一篇文章"
    },
    {
      "role": "assistant",
      "content": "好的，我来帮你规划一下..."
    }
  ],
  "llmConfig": {
    "model": { "api": "openai-completions", "modelId": "gpt-4o" },
    "streamOptions": {
      "apiKey": "sk-...",
      "temperature": 0.7,
      "baseUrl": "https://api.openai.com/v1"
    }
  }
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `message` | string | 是 | 用户本次的指令/消息 |
| `documentContent` | string | 是 | 编辑器当前的 HTML 内容（可为空字符串） |
| `history` | AgentMessage[] | 否 | 对话历史消息列表 |
| `llmConfig` | AgentLLMConfig | 是 | LLM 模型配置（与编码 Agent 相同格式） |

**响应**：`text/event-stream`（SSE 流）

### GET `/api/doc-agent-chat/config`

**用途**：获取搜索/图片服务配置（API Key 等），供工具使用

**响应**：
```json
{
  "searchService": {
    "type": "tavily",
    "apiKey": "tvly-..."
  },
  "imageService": {
    "type": "unsplash",
    "apiKey": "..."
  }
}
```

**实现**：从 Flask 后端获取或直接读取配置文件。

## Agent 循环实现

### 整体流程

```pseudo
export async function POST(request: NextRequest):
    body = await request.json()
    { message, documentContent, history, llmConfig } = body

    // 1. 验证请求
    if not message:
        return Response("Missing message", 400)

    // 2. 创建 SSE 流控制器
    controller = new TransformStreamController()
    stream = new ReadableStream({
        start(ctrl) { controller = ctrl }
    })

    // 3. 加载服务配置（搜索、图片 API Key）
    serviceConfig = await loadServiceConfigs()

    // 4. 创建文档专用工具集
    tools = createDocAgentTools(documentContent, controller, serviceConfig)

    // 5. 构建系统提示
    systemPrompt = buildDocAgentSystemPrompt()

    // 6. 创建 Agent 实例
    agent = new Agent({
        systemPrompt: systemPrompt,
        model: llmConfig.model,
        tools: tools,
        thinkingLevel: 'off',
        convertToLlm: (messages) => convertMessages(messages, llmConfig),
        getApiKey: () => llmConfig.streamOptions.apiKey
    })

    // 7. 订阅事件并转发为 SSE
    agent.subscribe((event: AgentEvent) => {
        ssePayloads = mapDocAgentEventToSSE(event)
        for payload in ssePayloads:
            encoded = new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`)
            controller.enqueue(encoded)
    })

    // 8. 构建消息历史
    agentMessages = []
    if history:
        agentMessages = convertHistoryToAgentMessages(history)

    // 9. 启动 Agent 循环
    agent.prompt(message, agentMessages)
        .then(() => {
            controller.enqueue(encode({ type: 'complete' }))
            controller.close()
        })
        .catch((error) => {
            controller.enqueue(encode({ type: 'error', error: error.message }))
            controller.close()
        })

    // 10. 处理客户端断开
    request.signal.addEventListener('abort', () => agent.abort())

    // 11. 返回 SSE 流
    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
        }
    })
```

### 与编码 Agent 路由的关键差异

| 方面 | 编码 Agent (`/api/agent-chat`) | 文档 Agent (`/api/doc-agent-chat`) |
|------|------|------|
| 工具集 | `createAgentTools(workDir)` | `createDocAgentTools(docContent, controller, config)` |
| 请求参数 | `workDir` (工作目录) | `documentContent` (编辑器 HTML) |
| 系统提示 | 编码助手 | 文档写作专家 |
| SSE 事件 | 标准 agent 事件 | 标准事件 + `doc_update` 事件 |
| 目录验证 | 验证 workDir 路径 | 无目录验证 |
| 安全约束 | 限制在 workDir 内 | 无文件系统访问 |

## SSE 事件流设计

### 标准 Agent 事件（复用）

这些事件与编码 Agent 完全相同，复用 `agentEventMapper.ts` 的映射逻辑：

| 事件类型 | 说明 |
|---------|------|
| `agent_start` | Agent 循环开始 |
| `thinking_start` | LLM 开始思考 |
| `thinking_end` | LLM 思考结束 |
| `thinking` | 思考内容（推理过程） |
| `content` | 回复文本片段 |
| `tool_use` | 工具被调用 |
| `tool_update` | 工具执行中（部分结果） |
| `tool_result` | 工具执行完成 |
| `turn_end` | 一轮循环结束 |
| `complete` | Agent 循环完成 |
| `error` | 发生错误 |

### 文档专用事件（新增）

| 事件类型 | 说明 | 数据结构 |
|---------|------|---------|
| `doc_update` | 文档更新通知 | `{ operation, sectionIndex?, title?, content?, imageUrl?, imageDescription? }` |

`doc_update` 事件在以下工具执行时发送：
- `update_section` → 包含 `operation`, `sectionIndex`, `title`, `content`
- `insert_image` → 包含 `operation: "insert_image"`, `sectionIndex`, `imageUrl`, `imageDescription`

### 事件映射扩展

```pseudo
function mapDocAgentEventToSSE(event: AgentEvent) -> SSEPayload[]:
    // 首先复用标准映射
    standardPayloads = mapAgentEventToSSE(event)

    // doc_update 事件不在标准映射中，
    // 而是由工具执行函数直接 enqueue 到 SSE 流中
    // 所以这里只返回标准映射结果

    return standardPayloads
```

**注意**：`doc_update` 事件不通过 `mapAgentEventToSSE` 映射产生，而是由工具函数在执行时直接写入 SSE 流。这样设计的原因是：
- Pi-agent-core 的 `AgentEvent` 不包含自定义事件类型
- 工具函数通过闭包持有 `controller` 引用，可以直接 enqueue
- 这保持了与 pi-agent-core 的松耦合

## 对话历史管理

### 历史消息格式

```typescript
interface DocAgentHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
  // assistant 消息可能包含工具调用记录（可选）
  toolCalls?: {
    toolName: string;
    toolInput: Record<string, unknown>;
    toolResult: string;
  }[];
}
```

### 历史消息处理

```pseudo
function convertHistoryToAgentMessages(history: DocAgentHistoryMessage[]):
    agentMessages = []
    for msg in history:
        if msg.role == 'user':
            agentMessages.push({ role: 'user', content: msg.content })
        else:
            // assistant 消息转为 pi-agent 的 assistant message 格式
            agentMessages.push({ role: 'assistant', content: msg.content })
    return agentMessages
```

### 前端历史管理

- 每次 Agent 循环完成后，将用户消息和 Agent 的最终回复存入对话历史
- 对话历史存储在 ChatPanel 的 `messagesMap` 中（与现有机制一致）
- 工具调用的详细记录保存在 `agentExecutionBlocks` 中（用于 Timeline 显示）
- 发送新消息时，将历史消息传入请求体的 `history` 字段
- 支持清除历史：重置当前 conversation 的消息列表

## 服务配置加载

```pseudo
async function loadServiceConfigs():
    // 从配置文件或 Flask API 获取搜索和图片服务配置
    searchConfig = null
    imageConfig = null

    try:
        // 读取搜索服务配置
        searchData = await readFile('backend/config/search-service-configs.json')
        searchServices = JSON.parse(searchData)
        defaultSearch = searchServices.searchServices.find(
            s => s.id === searchServices.defaultServiceId
        )
        if defaultSearch and defaultSearch.apiKeys.length > 0:
            searchConfig = {
                type: defaultSearch.type,
                apiKey: defaultSearch.apiKeys[0]
            }
    catch:
        logger.warn('搜索服务配置加载失败', {}, 'DocAgent')

    try:
        // 读取图片服务配置
        imageData = await readFile('backend/config/image-service-configs.json')
        imageServices = JSON.parse(imageData)
        defaultImage = imageServices.imageServices.find(
            s => s.id === imageServices.defaultServiceId
        )
        if defaultImage and defaultImage.apiKeys.length > 0:
            imageConfig = {
                type: defaultImage.type,
                apiKey: defaultImage.apiKeys[0]
            }
    catch:
        logger.warn('图片服务配置加载失败', {}, 'DocAgent')

    return { searchConfig, imageConfig }
```

## 错误处理

### 请求级别
- 缺少 `message`：返回 400
- 缺少 `llmConfig`：返回 400
- `documentContent` 为 undefined：默认为空字符串

### Agent 级别
- LLM 调用失败：发送 `error` SSE 事件，流关闭
- 工具执行失败：通过 `tool_result` 事件返回错误信息，Agent 可尝试修复
- 客户端断开：调用 `agent.abort()` 中止循环

### 超时处理
- Agent 循环总时间限制：5 分钟（与 auto-writer 现有超时一致）
- 单次 LLM 调用超时：由 llmConfig 中的 timeout 控制
- 搜索/图片 API 调用超时：30 秒

## 文件结构

```
app/api/
  doc-agent-chat/
    route.ts              # 主 API 路由
    config/
      route.ts            # 服务配置获取端点
```
