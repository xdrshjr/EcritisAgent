# TODO 02: API 路由与 Agent 循环实现

> 对应 Spec: `specs/02-api-route-and-agent-loop.md`

## API 路由

- [ ] 创建 `app/api/doc-agent-chat/route.ts`
  - [ ] 实现 POST handler
    - 解析请求体：message, documentContent, history, llmConfig
    - 验证必填字段（message, llmConfig）
    - documentContent 默认空字符串
  - [ ] 创建 SSE ReadableStream
    - 初始化 TransformStream controller
    - 设置响应头：Content-Type, Cache-Control, Connection
  - [ ] 加载服务配置
    - 读取搜索服务配置（Tavily API Key）
    - 读取图片服务配置（Unsplash API Key）
    - 配置加载失败时不阻塞（工具调用时再报错）
  - [ ] 创建文档工具集
    - 调用 `createDocAgentTools(documentContent, controller, serviceConfig)`
  - [ ] 构建系统提示
    - 调用 `buildDocAgentSystemPrompt()`
  - [ ] 创建 Agent 实例
    - 设置 systemPrompt, model, tools, thinkingLevel
    - 设置 convertToLlm, getApiKey
  - [ ] 订阅 Agent 事件
    - 使用 `mapAgentEventToSSE` 或 `mapDocAgentEventToSSE` 映射事件
    - 编码为 SSE 格式并 enqueue 到 controller
  - [ ] 转换对话历史
    - 将 history 数组转为 pi-agent AgentMessage 格式
  - [ ] 启动 Agent 循环
    - 调用 `agent.prompt(message, agentMessages)`
    - 成功时发送 `complete` 事件并关闭流
    - 失败时发送 `error` 事件并关闭流
  - [ ] 处理客户端断开
    - 监听 `request.signal.abort` 事件
    - 调用 `agent.abort()` 中止循环

## 配置端点

- [ ] 创建 `app/api/doc-agent-chat/config/route.ts`（可选）
  - [ ] 实现 GET handler
    - 读取搜索和图片服务配置
    - 返回配置信息（不含敏感信息给前端）

## 服务配置加载

- [ ] 实现 `loadServiceConfigs()` 函数（在 route.ts 内或独立模块）
  - [ ] 读取 `backend/config/search-service-configs.json`
    - 找到 defaultServiceId 对应的服务
    - 提取 apiKey 和 type
    - 文件不存在时返回 null
  - [ ] 读取 `backend/config/image-service-configs.json`
    - 同上逻辑
  - [ ] 错误处理：配置缺失时 warn 日志，不阻塞启动

## 对话历史处理

- [ ] 实现 `convertHistoryToAgentMessages(history)` 函数
  - 过滤 error 类型消息
  - 映射 role 和 content 字段
  - 确保符合 pi-agent AgentMessage 格式

## 事件映射

- [ ] 确认是否需要扩展 `agentEventMapper.ts`
  - 如果 `mapAgentEventToSSE` 能直接复用 → 不修改
  - 如果需要自定义映射 → 创建 `docAgentEventMapper.ts`
- [ ] doc_update 事件通过工具函数直接 enqueue（不走事件映射）

## 超时和资源管理

- [ ] 设置 Agent 循环总超时：5 分钟
- [ ] 确保流关闭后资源清理
- [ ] 处理并发请求（每个请求独立的 Agent 实例）

## 测试

- [ ] 测试基本请求-响应流程
  - 发送简单消息，验证 SSE 流正常
  - 验证 content 事件正确传递
- [ ] 测试文档工具调用
  - 验证 update_section 触发 doc_update 事件
  - 验证 get_document 返回正确的文档内容
- [ ] 测试错误场景
  - 缺少 message 字段
  - LLM 配置无效
  - 客户端中途断开
- [ ] 测试对话历史传递
  - 多轮对话时历史正确传递
  - 空历史时正常工作
