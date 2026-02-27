# TODO 05: 旧代码移除与清理

> 对应 Spec: `specs/05-legacy-cleanup.md`

## 前置条件：确认新代码就绪

- [ ] 确认 `lib/docAgentTools.ts` 已实现并可用
- [ ] 确认 `lib/docSectionParser.ts` 已实现并可用
- [ ] 确认 `lib/docAgentPrompt.ts` 已实现并可用
- [ ] 确认 `lib/docAgentStreamParser.ts` 已实现并可用
- [ ] 确认 `lib/docEditorOperations.ts` 已实现并可用
- [ ] 确认 `app/api/doc-agent-chat/route.ts` 已实现并可用
- [ ] 确认 `components/DocAgentPanel.tsx` 已实现并可用
- [ ] 确认 `components/DocUpdateBlockDisplay.tsx` 已实现并可用
- [ ] 确认文档创建和修改的基本流程可正常工作

## 前端切换

- [ ] 修改 `components/AIAutoWriterContainer.tsx`
  - 用 DocAgentPanel 替换 ChatDialog
  - 移除不再需要的 imports 和回调
- [ ] 修改 `components/ChatDialog.tsx`
  - [ ] 移除 `agentVariant` prop 和类型定义
  - [ ] 移除 `getDocumentContent` prop
  - [ ] 移除 `updateDocumentContent` prop
  - [ ] 移除 `insertImageAfterSection` prop
  - [ ] 移除 `isAutoWriterAgent` 判断逻辑
  - [ ] 移除 auto-writer 专用事件处理代码
    - `parameters` 事件处理
    - `section_progress` 事件处理
    - `network_search_status` 事件处理
    - `article_draft` 事件处理
    - `paragraph_summary` 事件处理
    - `paragraph_image` 事件处理
  - [ ] 移除 `enableNetworkSearch` 状态和网络搜索开关 UI
  - [ ] 移除 auto-writer 专用的 API URL 选择逻辑
  - [ ] 验证 ChatDialog 的 modal 和 embedded 变体仍正常工作
- [ ] 修改 `app/page.tsx`（如有 props 变化）

## 前端路由清理

- [ ] 删除 `app/api/auto-writer/route.ts`
- [ ] 搜索 `agent-route` 路由文件，如存在则删除
- [ ] 确认 `app/api/agent-validation/route.ts` 是否被 AIDocValidation 依赖
  - 如果是 → 保留不删
  - 如果不是 → 删除

## 后端文件删除

- [ ] 删除 `backend/agent/auto_writer_agent.py`
- [ ] 删除 `backend/agent/document_agent.py`
- [ ] 删除 `backend/agent/agent_router.py`
- [ ] 删除 `backend/agent/writer_intent.py`
- [ ] 检查 `backend/agent/` 目录下是否还有其他文件
  - 如果目录为空 → 删除 `__init__.py` 和整个目录
  - 如果有其他文件 → 保留目录，只删除上述文件
- [ ] 删除 `backend/domains/agent/routes.py`
- [ ] 检查 `backend/domains/agent/` 目录下是否还有其他文件
  - 如果目录为空 → 删除 `__init__.py` 和整个目录
  - 如果有其他文件 → 保留目录，只删除 routes.py

## 后端配置修改

- [ ] 修改 `backend/app.py`
  - 移除 agent 域蓝图注册代码
  - 搜索 `agent_bp` 或类似引用并移除
- [ ] 检查 `backend/requirements.txt`（或 `requirements.in`）
  - [ ] 确认 `langgraph` 是否可以移除
  - [ ] 确认 `langchain` 相关包的使用情况
    - 检查 `backend/llm_factory.py` 是否仍在使用 langchain
    - 检查 `backend/domains/chat/` 是否使用 langchain
    - 如果仍在使用 → 保留
    - 如果不再使用 → 移除

## 引用扫描

- [ ] 全局搜索以下关键词，确认无残留引用：
  - [ ] `auto_writer_agent` / `AutoWriterAgent`
  - [ ] `document_agent` / `DocumentAgent` / `DocumentModifierAgent`
  - [ ] `agent_router` / `AgentRouter`
  - [ ] `writer_intent` / `analyze_intent` / `IntentResult`
  - [ ] `agentVariant` (在前端代码中)
  - [ ] `auto-writer-agent` (API 路径)
  - [ ] `agent-route` (API 路径)
  - [ ] `WriterParameters` / `WriterState`
  - [ ] `build_outline` / `extract_writer_parameters`
  - [ ] `article_draft` / `section_progress` / `paragraph_summary` / `paragraph_image`
  - [ ] `network_search_status`
  - [ ] `enableNetworkSearch` / `enableImageGeneration`

## 验证

- [ ] 文档写作功能测试
  - 创建新文档：发送指令 → 编辑器生成内容
  - 修改文档：编辑器有内容 → 发送修改指令 → 内容更新
  - 搜索引用：Agent 使用 search_web 并引用结果
  - 图片插入：Agent 使用 search_image + insert_image
- [ ] 文档验证功能测试
  - AIDocValidationContainer 正常加载
  - 上传文档 → 验证 → 结果显示
- [ ] 普通聊天功能测试
  - AIChatContainer 正常工作
  - ChatDialog modal 模式正常
  - ChatDialog embedded 模式正常（在非 auto-writer 场景）
- [ ] 编码 Agent 功能测试
  - Agent 模式切换正常
  - 工具调用正常
  - Timeline 显示正常
- [ ] 构建测试
  - `npm run build` 无错误
  - `npm run lint` 无新错误
  - Flask 后端启动无错误

## 清理完成确认

- [ ] 所有旧文件已删除
- [ ] 所有旧引用已清理
- [ ] 新功能正常工作
- [ ] 其他功能未受影响
- [ ] 构建和 lint 通过
