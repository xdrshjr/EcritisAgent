# TODO 01: 文档 Agent 工具集实现

> 对应 Spec: `specs/01-document-agent-tools.md`

## Section 解析器

- [ ] 创建 `lib/docSectionParser.ts`
  - [ ] 实现 `parseHtmlToSections(html: string): Section[]` 函数
    - 按 `<h2>` 标签分割 HTML
    - Section 0 提取 `<h1>` 标题和引言内容
    - Section 1+ 提取 `<h2>` 标题和对应内容
  - [ ] 实现 `extractH1Title(html: string): string` 辅助函数
  - [ ] 实现 `extractH2Title(html: string): string` 辅助函数
  - [ ] 实现 `removeH1Tag(html: string): string` 辅助函数
  - [ ] 实现 `removeH2Tag(html: string): string` 辅助函数
  - [ ] 定义 `Section` 接口：`{ index: number, title: string, content: string }`
  - [ ] 处理空文档（返回空数组）
  - [ ] 处理无 h2 的文档（整体作为 Section 0）

## 工具创建函数

- [ ] 创建 `lib/docAgentTools.ts`
  - [ ] 定义 `ServiceConfig` 接口（搜索和图片服务配置）
  - [ ] 实现 `createDocAgentTools(documentContent, sseController, serviceConfig)` 主函数
  - [ ] 实现 `get_document` 工具
    - 无参数
    - 返回 sections 列表、totalSections、rawHtml
    - 从闭包中读取 parsedSections
  - [ ] 实现 `update_section` 工具
    - 参数验证：operation 必须是 replace/append/insert/delete 之一
    - replace: 验证 sectionIndex 有效、content 非空
    - append: title 和 content 非空
    - insert: sectionIndex 有效、title 和 content 非空
    - delete: sectionIndex 有效且不为 0
    - 执行后发送 `doc_update` SSE 事件
    - 更新内部 parsedSections 状态
  - [ ] 实现 `insert_image` 工具
    - 参数验证：sectionIndex、imageUrl、imageDescription 非空
    - 发送 `doc_update` SSE 事件（operation: insert_image）
    - 返回成功消息
  - [ ] 实现 `search_web` 工具
    - 参数验证：query 非空
    - 调用 Tavily API（直接 HTTP 调用或通过 Flask 代理）
    - 处理 API Key 未配置的情况
    - 处理网络请求失败
    - 返回搜索结果列表
  - [ ] 实现 `search_image` 工具
    - 参数验证：keywords 非空
    - 调用 Unsplash API
    - 处理 API Key 未配置的情况
    - 返回图片列表（url, thumbnailUrl, description, author）

## 工具与 Pi-Agent 集成

- [ ] 研究 `@mariozechner/pi-agent-core` 的 Tool 接口要求
  - 确认 Tool 需要哪些字段（name, description, parameters schema, execute）
  - 确认参数 schema 格式（JSON Schema?）
  - 确认异步 execute 函数的支持方式
- [ ] 确保所有 5 个工具符合 pi-agent-core 的 Tool 接口
- [ ] 为每个工具编写清晰的 description（用于 LLM function calling）
- [ ] 为每个工具定义 JSON Schema 格式的 parameters

## SSE 事件发送

- [ ] 实现 `buildDocUpdateEvent(params)` 函数
  - 构建 `{ type: 'doc_update', operation, sectionIndex, title?, content?, imageUrl?, imageDescription? }` 对象
  - 编码为 SSE 格式 `data: {...}\n\n`
- [ ] 确保工具执行函数能通过闭包访问 SSE controller
- [ ] 验证 doc_update 事件能正确到达前端

## 测试

- [ ] 测试 Section 解析器
  - 空文档
  - 只有 h1 的文档
  - 有 h1 + 多个 h2 的标准文档
  - 无 h1 但有 h2 的文档
  - 含图片和列表的复杂文档
- [ ] 测试 update_section 的四种操作
  - replace: 正常替换、越界索引
  - append: 正常追加
  - insert: 正常插入、索引边界
  - delete: 正常删除、禁止删除 Section 0
- [ ] 测试 search_web 和 search_image 的错误处理
  - API Key 未配置
  - 网络请求超时
  - API 返回错误
