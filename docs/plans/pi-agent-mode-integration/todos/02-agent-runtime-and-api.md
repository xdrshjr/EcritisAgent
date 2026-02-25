# TODO 02: Agent 运行时与 API Route

> 对应 spec: `specs/02-agent-runtime-and-api.md`

## API Route 搭建

- [ ] 创建 `app/api/agent-chat/route.ts`
- [ ] 实现 POST handler：解析请求体（message, workDir, history, llmConfig）
- [ ] 实现工作目录路径验证（fs.access 检查存在性和可读性）
- [ ] 设置 SSE 响应头（Content-Type, Cache-Control, Connection）
- [ ] 实现 ReadableStream 包装 Agent 事件流

## Agent 事件映射

- [ ] 创建 `lib/agentEventMapper.ts`
- [ ] 实现 `mapAgentEventToSSE(event)` 函数
- [ ] 映射 agent_start → agent_start SSE 帧
- [ ] 映射 message_start/update/end → thinking_start/content/thinking_end
- [ ] 映射 tool_execution_start → tool_use（含 toolName, toolInput, toolId）
- [ ] 映射 tool_execution_update → tool_update（含 partial results）
- [ ] 映射 tool_execution_end → tool_result（含 content, isError）
- [ ] 映射 agent_end → complete
- [ ] 错误情况 → error SSE 帧

## Agent 初始化

- [ ] 实现 `buildAgentSystemPrompt(workDir)` 系统提示词构建
- [ ] 实现 `buildStreamOptions(llmConfig)` 配置构建
- [ ] 创建 Agent 实例并配置 model、systemPrompt、tools
- [ ] 实现 `convertToLlm` 回调：将 AgentMessage → LLM Message 格式
- [ ] 订阅 Agent 事件并转发到 SSE 流

## 工具注册

- [ ] 创建 `lib/agentTools.ts`
- [ ] 研究 pi-coding-agent 源码，确定工具导入方式
- [ ] 方案 A: 直接从 `@mariozechner/pi-coding-agent` 导入工具定义和 execute 函数
- [ ] 方案 B（备选）: 如果导入困难，自行实现核心工具：
  - [ ] `read_file` — 使用 fs.readFile
  - [ ] `write_file` — 使用 fs.writeFile
  - [ ] `edit_file` — 搜索替换实现
  - [ ] `list_directory` — 使用 fs.readdir
  - [ ] `search_files` — 使用 ripgrep 或 Node.js grep
  - [ ] `glob_files` — 使用 glob 库
  - [ ] `execute_command` — 使用 child_process.exec
  - [ ] `diff` — 使用 diff 库
- [ ] 为每个工具添加路径安全检查（确保在 workDir 内）
- [ ] 为 execute_command 添加超时限制（默认 30 秒）

## 会话管理

- [ ] 实现对话历史转换：前端 Message[] → pi-agent AgentMessage[]
- [ ] 支持通过 history 参数恢复上下文
- [ ] 实现流中断处理：监听 request.signal abort → 停止 Agent

## 目录验证 API

- [ ] 创建 `app/api/agent-chat/validate-dir/route.ts`
- [ ] 实现 GET handler：验证路径是否存在、是否为目录、是否可读
- [ ] 返回 { valid: boolean, error?: string }

## 错误处理

- [ ] LLM API 错误 → 返回 SSE error 帧
- [ ] 工具执行失败 → 返回给 Agent 作为工具结果
- [ ] 工作目录无效 → 400 Bad Request
- [ ] API Key 缺失 → 401 Unauthorized
- [ ] 连接中断 → 清理资源
