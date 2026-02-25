# Spec 02: Agent 运行时与 API Route

## 1. 概述

本 spec 设计 Next.js API Route `/api/agent-chat`，在 Node.js 进程中运行 pi-agent 的 Agent 循环，注册 pi-coding-agent 工具集，并将 Agent 事件流转换为 SSE 帧返回前端。

## 2. API Route 设计

### 2.1 端点定义

```
POST /api/agent-chat
Content-Type: application/json

请求体:
{
  "message": string,          // 用户消息
  "workDir": string,          // 工作目录路径
  "history": AgentMessage[],  // 对话历史（可选，用于上下文延续）
  "llmConfig": {              // 已转换的 LLM 配置
    "apiKey": string,
    "model": string,
    "baseUrl": string,
    "provider": string,       // "openai" | "anthropic" | ...
    "temperature": number,
    "maxTokens": number,
    "headers": Record<string, string>
  }
}

响应: SSE 流 (text/event-stream)
```

### 2.2 文件路径

`app/api/agent-chat/route.ts`

### 2.3 SSE 事件格式

将 pi-agent 的 `AgentEvent` 映射为以下 SSE 数据类型：

| AgentEvent | SSE type | 说明 |
|-----------|----------|------|
| `agent_start` | `agent_start` | Agent 循环开始 |
| `message_start` | `thinking_start` | 开始生成回复 |
| `message_update` | `content` | 文本内容增量 |
| `message_end` | `thinking_end` | 回复生成完成 |
| `tool_execution_start` | `tool_use` | 开始执行工具 |
| `tool_execution_update` | `tool_update` | 工具执行中间结果 |
| `tool_execution_end` | `tool_result` | 工具执行完成 |
| `agent_end` | `complete` | Agent 循环结束 |
| (错误) | `error` | 错误信息 |

**SSE 帧格式示例：**

```
data: {"type":"agent_start"}\n\n

data: {"type":"thinking_start"}\n\n

data: {"type":"content","content":"让我查看一下项目结构..."}\n\n

data: {"type":"tool_use","toolName":"read_file","toolInput":{"path":"src/index.ts"},"toolId":"tool_1"}\n\n

data: {"type":"tool_update","toolId":"tool_1","content":"// 部分内容..."}\n\n

data: {"type":"tool_result","toolId":"tool_1","content":"// 完整文件内容...","isError":false}\n\n

data: {"type":"content","content":"根据文件内容，我建议..."}\n\n

data: {"type":"complete"}\n\n
```

## 3. Agent 初始化流程

### 3.1 伪代码

```
async function POST(request):
  解析请求体 { message, workDir, history, llmConfig }

  验证 workDir 路径存在且可访问

  // 1. 创建 pi-ai 流选项
  streamOptions = buildStreamOptions(llmConfig)

  // 2. 创建 Agent 工具集（pi-coding-agent 的工具）
  tools = createCodingAgentTools(workDir)

  // 3. 初始化系统提示词
  systemPrompt = buildAgentSystemPrompt(workDir)

  // 4. 创建 Agent 实例
  agent = new Agent({
    model: llmConfig.model,
    systemPrompt: systemPrompt,
    tools: tools,
    convertToLlm: (messages) => convertMessages(messages, streamOptions),
    // ... 其他配置
  })

  // 5. 创建 SSE 流
  stream = new ReadableStream({
    start(controller) {
      // 订阅 Agent 事件
      agent.subscribe((event) => {
        sseData = mapAgentEventToSSE(event)
        controller.enqueue(encode(`data: ${JSON.stringify(sseData)}\n\n`))

        if event.type === 'agent_end':
          controller.close()
      })

      // 6. 启动 Agent 循环
      if history:
        // 恢复历史上下文
        agent.state.messages = history
        agent.prompt(message)
      else:
        agent.prompt(message)
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    }
  })
```

### 3.2 系统提示词

```
function buildAgentSystemPrompt(workDir: string): string {
  return `You are an AI coding assistant working in the directory: ${workDir}

You have access to tools for reading/writing files, executing shell commands,
searching code, and more. Use these tools to help the user with their
coding tasks.

Guidelines:
- Always read files before modifying them
- Explain what you're doing before taking actions
- Show file changes clearly
- Report errors clearly if they occur

Current working directory: ${workDir}
Operating system: ${process.platform}
`
}
```

## 4. 工具注册

### 4.1 pi-coding-agent 工具清单

从 `@mariozechner/pi-coding-agent` 提取以下工具：

| 工具名 | 功能 | 参数 |
|-------|------|------|
| `read_file` | 读取文件内容 | path, offset?, limit? |
| `write_file` | 写入文件 | path, content |
| `edit_file` | 编辑文件（搜索替换） | path, old_string, new_string |
| `list_directory` | 列出目录内容 | path, pattern? |
| `search_files` | 搜索文件内容（grep） | pattern, path?, include? |
| `glob_files` | Glob 模式匹配 | pattern, path? |
| `execute_command` | 执行 shell 命令 | command, cwd? |
| `diff` | 查看文件差异 | file_a, file_b |

### 4.2 工具适配

pi-coding-agent 的工具可能依赖于 CLI 上下文（如 terminal 宽度、交互式输入）。需要创建适配层：

```
function createCodingAgentTools(workDir: string): AgentTool[] {
  // 方案 A: 直接从 pi-coding-agent 导入并适配
  从 @mariozechner/pi-coding-agent 导入工具定义
  修改每个工具的 execute 函数：
    - 将相对路径解析为 workDir 下的绝对路径
    - 禁用任何交互式提示（headless 模式）
    - 捕获输出并返回为文本

  // 方案 B: 如果直接导入有困难，自行实现工具
  参考 pi-coding-agent 源码，用 Node.js 原生 API 实现：
    - fs.readFile / fs.writeFile / fs.readdir
    - child_process.exec
    - glob 库
    - ripgrep 或 Node.js grep 实现

  返回 AgentTool 数组
}
```

### 4.3 工具安全性

虽然用户选择了"不加限制"，但基本的安全措施仍然需要：

- 所有文件操作路径必须在 workDir 下（防止路径穿越）
- Shell 命令的 cwd 设置为 workDir
- 命令执行有超时限制（默认 30 秒）

## 5. 会话管理

### 5.1 Agent 实例生命周期

每个 Agent 对话通过 API Route 请求创建：
- 每次请求创建新的 Agent 实例
- 通过 history 参数传递对话历史，实现上下文延续
- 请求结束后 Agent 实例自动销毁
- 不在服务器端保持 Agent 状态

### 5.2 对话历史传递

```
// 前端发送的 history 格式
interface AgentHistoryMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  toolName?: string;
  toolInput?: any;
  toolResult?: string;
}

// API Route 将 history 转换为 pi-agent AgentMessage 格式
function convertHistory(history: AgentHistoryMessage[]): AgentMessage[] {
  return history.map(msg => {
    根据 role 转换为对应的 AgentMessage 类型
  })
}
```

### 5.3 流中断处理

用户点击停止按钮时：

```
// 前端: AbortController.abort()
// API Route: 监听请求中断信号
request.signal.addEventListener('abort', () => {
  // 通知 Agent 停止
  agent.abort()  // 如果 pi-agent 支持
  controller.close()
})
```

## 6. 错误处理

```
错误类型:
- LLM API 错误 → SSE error 帧 + 错误信息
- 工具执行失败 → 返回给 Agent 作为工具结果（Agent 可以自行决定后续行动）
- 工作目录不存在 → 400 Bad Request
- 配置缺失（无 API Key）→ 401 Unauthorized
- 连接中断 → 清理资源，关闭流
```

## 7. 文件清单

| 文件路径 | 类型 | 说明 |
|---------|------|------|
| `app/api/agent-chat/route.ts` | 新建 | Agent Chat API Route |
| `lib/agentTools.ts` | 新建 | 工具集适配层（如需自行实现） |
| `lib/agentEventMapper.ts` | 新建 | AgentEvent → SSE 映射 |

## 8. 验证标准

- [ ] API Route 可接收请求并返回 SSE 流
- [ ] Agent 能正确调用文件读取工具并返回结果
- [ ] Agent 能正确执行 shell 命令并返回输出
- [ ] 对话历史正确传递，Agent 有上下文延续能力
- [ ] 流中断时资源正确清理
- [ ] 错误信息通过 SSE error 帧正确传递
