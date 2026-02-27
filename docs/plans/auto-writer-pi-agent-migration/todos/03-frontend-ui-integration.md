# TODO 03: 前端 UI 集成实现

> 对应 Spec: `specs/03-frontend-ui-integration.md`

## DocAgentPanel 组件

- [ ] 创建 `components/DocAgentPanel.tsx`
  - [ ] 定义 Props 接口
    - getDocumentContent, updateSectionContent, insertImageAfterSection
    - selectedModelId, locale
  - [ ] 实现消息状态管理
    - messages 列表（DocAgentMessage[]）
    - streamingContent, streamingBlocks, isStreaming
    - conversationId
  - [ ] 实现 handleSend 方法
    - 获取编辑器当前内容
    - 获取 LLM 配置（复用 getAgentLLMConfig）
    - 构建请求体（message, documentContent, history, llmConfig）
    - 发送 POST /api/doc-agent-chat
    - 处理 SSE 流
  - [ ] 实现 SSE 流回调处理
    - onContent: 追加 streamingContent
    - onToolUse: 添加 tool_use block
    - onToolResult: 更新 tool_result block
    - onDocUpdate: 调用编辑器更新 + 添加 doc_update block
    - onThinking: 添加 thinking block
    - onTurnEnd: 添加 turn separator
    - onComplete: 最终化 assistant 消息
    - onError: 添加错误消息
  - [ ] 实现 handleDocUpdate 方法
    - 根据 operation 分发到对应的编辑器操作
    - replace/append/insert/delete → updateSectionContent
    - insert_image → insertImageAfterSection
  - [ ] 实现消息列表渲染
    - 用户消息气泡（右对齐）
    - Agent 执行 Timeline（AgentExecutionTimeline 复用）
    - 助手回复气泡（左对齐，带 Markdown 渲染）
  - [ ] 实现输入区域
    - 文本输入框 + 发送按钮
    - 键盘快捷键（Ctrl+Enter 发送）
    - 发送中禁用
  - [ ] 实现顶部工具栏
    - 清除对话按钮
    - 模型选择器（可选）
    - 取消执行按钮（streaming 时显示）
  - [ ] 实现消息持久化
    - 保存到 localStorage
    - 从 localStorage 恢复
  - [ ] 实现自动滚动
    - 新消息和流式内容时自动滚动到底部
    - 使用 flushSync 确保即时更新

## DocUpdateBlockDisplay 组件

- [ ] 创建 `components/DocUpdateBlockDisplay.tsx`
  - [ ] 渲染 replace 操作：显示章节索引和标题
  - [ ] 渲染 append 操作：显示新章节标题
  - [ ] 渲染 insert 操作：显示插入位置和标题
  - [ ] 渲染 delete 操作：显示被删除的章节
  - [ ] 渲染 insert_image 操作：显示图片描述和缩略图
  - [ ] 显示同步状态指示器（✅ 已同步到编辑器）
  - [ ] 使用适当的图标（📝 文档更新, 🖼️ 图片插入）

## SSE 流解析器

- [ ] 创建 `lib/docAgentStreamParser.ts`
  - [ ] 定义 DocAgentStreamCallbacks 接口
    - 复用标准 Agent 回调 + 新增 onDocUpdate
  - [ ] 实现 processDocAgentSSEStream 函数
    - 复用 processAgentSSEStream 的解析逻辑
    - 在 switch/case 中增加 'doc_update' 类型处理
    - 或者扩展现有解析器支持自定义事件类型
  - [ ] 定义 DocUpdatePayload 类型
    - operation, sectionIndex, title?, content?, imageUrl?, imageDescription?

## 编辑器操作函数

- [ ] 创建 `lib/docEditorOperations.ts`
  - [ ] 实现 `findAllH2Positions(doc: ProseMirrorNode): number[]`
    - 遍历 ProseMirror 文档树
    - 找到所有 heading level=2 的节点位置
  - [ ] 实现 `replaceSectionInEditor(editor, sectionIndex, title?, content)`
    - sectionIndex=0: 替换 h1 区域
    - sectionIndex>0: 替换对应 h2 区域
    - 计算正确的 from/to 范围
    - 构建新内容 HTML
    - 使用 editor chain 执行替换
  - [ ] 实现 `appendSectionToEditor(editor, title, content)`
    - 在文档末尾插入 h2 + content
  - [ ] 实现 `insertSectionInEditor(editor, sectionIndex, title, content)`
    - 在指定 h2 位置之前插入新内容
  - [ ] 实现 `deleteSectionFromEditor(editor, sectionIndex)`
    - 计算目标 section 的范围
    - 删除该范围内容
    - 验证不允许删除 Section 0

## AgentExecutionBlock 扩展

- [ ] 修改 `lib/agentExecutionBlock.ts`
  - [ ] 添加 DocUpdateBlock 类型到联合类型
  - [ ] 定义 DocUpdateBlock 接口（type, operation, sectionIndex, title?, imageUrl?, timestamp）
  - [ ] 确保现有代码兼容新类型（编码 Agent 不受影响）

## AIAutoWriterContainer 改造

- [ ] 修改 `components/AIAutoWriterContainer.tsx`
  - [ ] 移除 ChatDialog 导入和使用
  - [ ] 导入 DocAgentPanel
  - [ ] 实现 handleSectionUpdate 回调
    - 委托给编辑器操作函数
  - [ ] 替换右侧面板组件
    - ChatDialog → DocAgentPanel
    - 传递正确的 props
  - [ ] 移除不再需要的状态和回调
    - 移除 auto-writer 相关的 ChatDialog 回调

## AgentExecutionTimeline 适配

- [ ] 检查 `components/AgentExecutionTimeline.tsx` 是否需要修改
  - [ ] 如果 DocUpdateBlock 需要特殊渲染，添加对应的 case
  - [ ] 或者直接在 DocAgentPanel 中处理 DocUpdateBlock 渲染
  - [ ] 确保 Timeline 组件能处理新的 block 类型

## 测试

- [ ] 测试文档创建流程
  - 发送创建指令 → 验证编辑器逐步填充内容
  - 验证 Timeline 显示正确的工具调用和文档更新
- [ ] 测试文档修改流程
  - 先在编辑器中放入内容 → 发送修改指令
  - 验证只有目标 section 被修改
- [ ] 测试图片插入
  - 验证图片正确出现在指定 section 之后
- [ ] 测试清除对话
  - 点击清除 → 验证消息列表清空
  - 编辑器内容不受影响
- [ ] 测试持久化
  - 刷新页面后消息历史恢复
- [ ] 测试自动滚动
  - 长对话时新内容出现后自动滚动
