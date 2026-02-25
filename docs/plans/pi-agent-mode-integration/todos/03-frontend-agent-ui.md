# TODO 03: 前端 Agent UI

> 对应 spec: `specs/03-frontend-agent-ui.md`

## Agent 开关组件

- [ ] 创建 `components/AgentToggle.tsx`
- [ ] 实现开关 UI（toggle switch，与现有 Advanced Mode 开关风格一致）
- [ ] props: `enabled`, `onChange`, `disabled`
- [ ] 添加 "Agent" 文本标签
- [ ] 添加 Tailwind 样式和状态动画

## 工作目录栏

- [ ] 创建 `components/AgentWorkDirBar.tsx`
- [ ] 显示当前工作目录路径（长路径截断，hover 显示完整路径 title）
- [ ] 📁 按钮：点击触发 `onChangeDir` 回调
- [ ] 目录有效性状态指示（✓ / ✗ 图标）
- [ ] Tailwind 样式：紧凑布局，与控件栏协调

## 工作目录选择弹窗

- [ ] 创建 `components/AgentWorkDirDialog.tsx`
- [ ] 弹窗 UI：路径输入框 + 📁 文件夹选择按钮
- [ ] 最近使用目录列表 + 快速选择按钮
- [ ] Electron 环境：调用 `window.electronAPI.selectDirectory()`
- [ ] Web 环境：尝试 `showDirectoryPicker()` API，fallback 到手动输入
- [ ] 取消/确定按钮
- [ ] 确定时验证路径并保存

## Agent SSE 流解析器

- [ ] 创建 `lib/agentStreamParser.ts`
- [ ] 实现 `processAgentSSEStream(body, callbacks)` 函数
- [ ] 解析 SSE `data: ` 前缀
- [ ] 处理 buffer 拼接（应对分包）
- [ ] 回调：onContent, onToolUse, onToolUpdate, onToolResult, onComplete, onError
- [ ] 处理 JSON 解析错误

## 工具调用展示组件

- [ ] 创建 `components/AgentToolCallDisplay.tsx`
- [ ] 工具名显示 + 展开/折叠控件
- [ ] 输入参数展示（JSON 格式化）
- [ ] 执行结果展示（代码块，支持语法高亮）
- [ ] 状态图标：running (旋转) / complete (✓) / error (✗)
- [ ] 执行耗时显示
- [ ] 默认折叠，可点击展开

## Agent 思考指示器

- [ ] 创建 `components/AgentThinkingIndicator.tsx`
- [ ] "Agent 思考中..." 文本 + 三点跳动动画
- [ ] Tailwind CSS 动画（无需额外 CSS 文件）

## ChatInput 修改

- [ ] 在 ChatInput 控件栏区域添加 AgentToggle 组件
- [ ] 添加 props: `agentMode`, `onAgentModeChange`, `agentWorkDir`, `onChangeWorkDir`
- [ ] Agent 模式激活时在开关下方显示 AgentWorkDirBar
- [ ] 保持现有 Advanced Mode 开关不受影响

## ChatPanel 修改

- [ ] 添加 agentMode 和 agentWorkDir 状态
- [ ] 从 localStorage 初始化 agentWorkDir
- [ ] 在 handleSendMessage 中添加 Agent 模式分支
- [ ] Agent 模式：获取 LLM 配置 → 构建 Agent 请求 → POST /api/agent-chat
- [ ] 使用 agentStreamParser 处理 SSE 响应
- [ ] 管理 agentToolCalls 状态：实时更新工具调用状态
- [ ] 支持停止按钮中断 Agent 执行
- [ ] 添加 AgentWorkDirDialog 弹窗控制

## ChatMessage 修改

- [ ] 识别消息中的 agentToolCalls 字段
- [ ] 在消息内容中渲染 AgentToolCallDisplay 组件
- [ ] 保持现有消息渲染逻辑不受影响

## Message 类型扩展

- [ ] 在 ChatPanel.tsx 的 Message 接口中添加 `agentToolCalls?: AgentToolCall[]`
- [ ] 定义 AgentToolCall 接口：id, toolName, toolInput, status, result, isError, startTime, endTime

## i18n 翻译

- [ ] 在 `lib/i18n/dictionaries.ts` 中添加英文 Agent 相关文案
- [ ] 在 `lib/i18n/dictionaries.ts` 中添加中文 Agent 相关文案
- [ ] 所有新组件使用 `useLanguage()` + dictionary 获取文案
