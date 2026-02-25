# Spec 03: 前端 Agent UI

## 1. 概述

本 spec 设计前端 Agent 模式的 UI 交互：ChatInput 上方的 Agent 开关、工作目录显示与快速设置、Agent 工具调用的内联展示组件。

## 2. Agent 模式开关

### 2.1 位置与外观

在 ChatInput 组件的上方区域（与现有 Advanced Mode 开关同层），添加 Agent 模式切换开关。

```
┌─────────────────────────────────────────┐
│  [MCP工具] [网络搜索]  Agent ●○  [Adv]  │  ← 控件栏
│  📂 /path/to/project  [📁]             │  ← Agent 激活时显示
├─────────────────────────────────────────┤
│  [📎] [    消息输入框    ] [➤]          │  ← ChatInput
└─────────────────────────────────────────┘
```

### 2.2 开关行为

```
状态:
- agentMode: boolean (默认 false)
- agentWorkDir: string (从设置或 localStorage 加载)

开关切换时:
  if 开启 agentMode:
    - 检查 agentWorkDir 是否已设置
    - 如果未设置 → 弹出工作目录设置弹窗
    - 如果已设置 → 显示工作目录栏
    - 现有 MCP/搜索控件保持可见但独立
  if 关闭 agentMode:
    - 隐藏工作目录栏
    - 后续消息走普通 chat 流程
```

### 2.3 工作目录栏

Agent 模式激活时，在开关下方显示当前工作目录：

```
组件: AgentWorkDirBar
  - 显示当前工作目录路径（截断长路径，hover 显示完整）
  - 📁 按钮：点击弹出工作目录选择弹窗
  - 目录状态指示：✓ 有效 / ✗ 无效
```

## 3. 工作目录选择弹窗

### 3.1 弹窗组件: AgentWorkDirDialog

```
┌─────── 设置工作目录 ──────────┐
│                                │
│  当前目录: /path/to/project    │
│                                │
│  ┌──────────────────────┐ [📁] │  ← 输入框 + 文件夹选择按钮
│  │ /path/to/project     │      │
│  └──────────────────────┘      │
│                                │
│  最近使用:                      │
│  • /path/to/project-a   [选择]  │
│  • /path/to/project-b   [选择]  │
│                                │
│         [取消]  [确定]          │
└────────────────────────────────┘
```

### 3.2 文件夹选择器集成

```
function handleSelectFolder():
  if 运行在 Electron 环境:
    调用 window.electronAPI.selectDirectory()
    → Electron 主进程 dialog.showOpenDialog({ properties: ['openDirectory'] })
    → 返回选中的目录路径
  else (Web 环境):
    尝试使用 File System Access API (showDirectoryPicker)
    → 如果浏览器支持: 获取目录路径
    → 如果不支持: 仅使用手动输入框

  更新 agentWorkDir
  保存到 localStorage: 'aidocmaster.agentWorkDir'
  保存到最近使用列表: 'aidocmaster.agentRecentDirs'
```

### 3.3 Electron IPC 扩展

需要在 Electron preload 中添加目录选择 API：

```
// electron/preload.js 新增
contextBridge.exposeInMainWorld('electronAPI', {
  ...existingAPIs,
  selectDirectory: () => ipcRenderer.invoke('select-directory')
})

// electron/main.js 新增 handler
ipcMain.handle('select-directory', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory']
  })
  return result.canceled ? null : result.filePaths[0]
})
```

## 4. 消息发送流程修改

### 4.1 ChatPanel 修改

```
在 ChatPanel 的 handleSendMessage 中:

if agentMode:
  // 获取 LLM 配置
  callConfig = getLLMConfigFromModel(selectedModel)
  streamOptions = convertToStreamOptions(callConfig)

  // 构建 Agent 请求
  agentRequest = {
    message: userMessage,
    workDir: agentWorkDir,
    history: convertMessagesToAgentHistory(currentMessages),
    llmConfig: streamOptions
  }

  // 发送到 Agent API Route
  response = await fetch('/api/agent-chat', {
    method: 'POST',
    body: JSON.stringify(agentRequest),
    signal: abortController.signal
  })

  // 处理 SSE 流
  processAgentSSEStream(response.body, {
    onThinkingStart: () => 显示思考中状态,
    onContent: (text) => 更新 streamingContent,
    onToolUse: (tool) => 添加工具调用消息块,
    onToolUpdate: (update) => 更新工具执行状态,
    onToolResult: (result) => 更新工具结果,
    onComplete: () => 完成消息,
    onError: (error) => 显示错误
  })
else:
  // 走现有 chat 流程（不变）
```

### 4.2 Agent SSE 流解析

```
function processAgentSSEStream(body, callbacks):
  reader = body.getReader()
  buffer = ''

  while true:
    { done, value } = await reader.read()
    if done: break

    buffer += decode(value)

    while buffer 包含 '\n\n':
      line = 提取到 '\n\n' 之前的内容
      if line.startsWith('data: '):
        data = JSON.parse(line.slice(6))

        switch data.type:
          case 'content':
            callbacks.onContent(data.content)
          case 'tool_use':
            callbacks.onToolUse({
              toolName: data.toolName,
              toolInput: data.toolInput,
              toolId: data.toolId
            })
          case 'tool_result':
            callbacks.onToolResult({
              toolId: data.toolId,
              content: data.content,
              isError: data.isError
            })
          case 'complete':
            callbacks.onComplete()
          case 'error':
            callbacks.onError(data.message)
```

## 5. 工具调用内联展示

### 5.1 消息类型扩展

扩展现有 Message 类型以支持 Agent 工具调用：

```
interface Message {
  ...existing fields,
  agentToolCalls?: AgentToolCall[];  // Agent 工具调用记录
}

interface AgentToolCall {
  id: string;
  toolName: string;
  toolInput: any;        // 工具输入参数
  status: 'running' | 'complete' | 'error';
  result?: string;       // 执行结果
  isError?: boolean;
  startTime?: number;
  endTime?: number;
}
```

### 5.2 工具调用展示组件: AgentToolCallDisplay

```
组件: AgentToolCallDisplay
  props:
    toolCall: AgentToolCall

  渲染逻辑:
    ┌──────────────────────────────────────┐
    │ 🔧 read_file                    [▼]  │  ← 工具名 + 展开/折叠
    │ path: "src/index.ts"                 │  ← 输入参数（折叠时隐藏）
    │ ─────────────────────────────────── │
    │ // file content here...              │  ← 执行结果（代码块）
    │ import { useState } from 'react';    │
    │ ...                                  │
    └──────────────────────────────────────┘

  状态指示:
    - running: 旋转加载图标 + "执行中..."
    - complete: ✓ 绿色 + 执行耗时
    - error: ✗ 红色 + 错误信息
```

### 5.3 在 ChatMessage 中集成

修改 ChatMessage 组件，识别 Agent 消息中的工具调用块：

```
在 ChatMessage 渲染中:

if message.agentToolCalls 存在:
  遍历 agentToolCalls:
    渲染 <AgentToolCallDisplay toolCall={call} />
  渲染 message.content (Agent 的文本回复)

else:
  走现有渲染逻辑
```

### 5.4 Agent 思考状态指示

当 Agent 在"思考"（还没产生工具调用或文本）时：

```
组件: AgentThinkingIndicator
  显示: 🤔 Agent 思考中...
  动画: 三个点跳动动画
  位置: 消息流底部，作为临时消息
```

## 6. 状态管理

### 6.1 ChatPanel 新增状态

```
// Agent 模式状态
const [agentMode, setAgentMode] = useState(false);
const [agentWorkDir, setAgentWorkDir] = useState<string>('');
const [showWorkDirDialog, setShowWorkDirDialog] = useState(false);

// 初始化时从 localStorage 加载
useEffect(() => {
  const savedWorkDir = localStorage.getItem('aidocmaster.agentWorkDir');
  if (savedWorkDir) setAgentWorkDir(savedWorkDir);
}, []);
```

### 6.2 状态传递

```
ChatPanel
  ├── agentMode, agentWorkDir → ChatInput (显示开关和目录栏)
  ├── agentToolCalls → ChatMessage → AgentToolCallDisplay
  └── showWorkDirDialog → AgentWorkDirDialog
```

## 7. i18n 支持

在 `lib/i18n/dictionaries.ts` 中添加：

```
// 英文
agentMode: 'Agent',
agentWorkDir: 'Working Directory',
agentSetWorkDir: 'Set Working Directory',
agentSelectFolder: 'Select Folder',
agentRecentDirs: 'Recent Directories',
agentThinking: 'Agent is thinking...',
agentToolRunning: 'Executing...',
agentToolComplete: 'Completed',
agentToolError: 'Error',
agentNoWorkDir: 'Please set a working directory first',

// 中文
agentMode: 'Agent',
agentWorkDir: '工作目录',
agentSetWorkDir: '设置工作目录',
agentSelectFolder: '选择文件夹',
agentRecentDirs: '最近使用',
agentThinking: 'Agent 思考中...',
agentToolRunning: '执行中...',
agentToolComplete: '已完成',
agentToolError: '错误',
agentNoWorkDir: '请先设置工作目录',
```

## 8. 文件清单

| 文件路径 | 类型 | 说明 |
|---------|------|------|
| `components/AgentToggle.tsx` | 新建 | Agent 模式开关组件 |
| `components/AgentWorkDirBar.tsx` | 新建 | 工作目录显示栏 |
| `components/AgentWorkDirDialog.tsx` | 新建 | 工作目录选择弹窗 |
| `components/AgentToolCallDisplay.tsx` | 新建 | 工具调用展示组件 |
| `components/AgentThinkingIndicator.tsx` | 新建 | 思考状态指示 |
| `components/ChatPanel.tsx` | 修改 | 集成 Agent 模式状态和消息处理 |
| `components/ChatInput.tsx` | 修改 | 添加 Agent 开关和目录栏位置 |
| `components/ChatMessage.tsx` | 修改 | 识别并渲染 Agent 工具调用 |
| `lib/i18n/dictionaries.ts` | 修改 | 添加 Agent 相关翻译 |
| `lib/agentStreamParser.ts` | 新建 | Agent SSE 流解析器 |
| `electron/preload.js` | 修改 | 添加 selectDirectory IPC |
| `electron/main.js` | 修改 | 添加 select-directory handler |

## 9. 验证标准

- [ ] Agent 开关可正常切换，切换时不影响现有功能
- [ ] 工作目录栏正确显示路径，截断长路径
- [ ] 📁 按钮在 Electron 中弹出系统文件夹选择器
- [ ] 📁 按钮在 Web 中使用 File System Access API 或手动输入
- [ ] 最近使用目录正确保存和加载
- [ ] Agent 模式下发送消息走 /api/agent-chat 路由
- [ ] 工具调用正确内联在消息流中展示
- [ ] 工具调用可展开/折叠
- [ ] 思考中状态有动画指示
- [ ] 中英文翻译完整
