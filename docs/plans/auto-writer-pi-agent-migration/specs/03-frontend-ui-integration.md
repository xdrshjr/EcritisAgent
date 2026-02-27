# Spec 03: 前端 UI 集成设计

## 概述

本文档定义前端 UI 的改造方案。核心变化：AIAutoWriterContainer 的右侧面板从 ChatDialog（auto-writer 变体）切换为类似编码 Agent 的 ChatPanel 模式，增加 AgentExecutionTimeline 展示 Agent 执行过程，同时通过 `doc_update` SSE 事件实现编辑器的实时更新。

## UI 布局变化

### 当前布局

```
┌────────────────────────────────────────────────────────┐
│ AIAutoWriterContainer                                  │
│ ┌──────────────────────┬───────────────────────────────┐│
│ │                      │                               ││
│ │   WordEditorPanel    │    ChatDialog                 ││
│ │   (TipTap 编辑器)    │    (auto-writer 变体)          ││
│ │                      │    - 消息气泡                  ││
│ │                      │    - 输入框                    ││
│ │                      │    - 网络搜索开关              ││
│ │                      │                               ││
│ │      58%             │         42%                   ││
│ └──────────────────────┴───────────────────────────────┘│
└────────────────────────────────────────────────────────┘
```

### 目标布局

```
┌────────────────────────────────────────────────────────┐
│ AIAutoWriterContainer                                  │
│ ┌──────────────────────┬───────────────────────────────┐│
│ │                      │  DocAgentPanel                ││
│ │   WordEditorPanel    │  ┌───────────────────────────┐││
│ │   (TipTap 编辑器)    │  │ 消息列表                   │││
│ │                      │  │  ├─ 用户消息气泡           │││
│ │                      │  │  ├─ AgentExecutionTimeline │││
│ │                      │  │  │   ├─ thinking block    │││
│ │                      │  │  │   ├─ tool_use block    │││
│ │                      │  │  │   ├─ doc_update block  │││
│ │                      │  │  │   └─ content block     │││
│ │                      │  │  └─ 助手回复气泡           │││
│ │                      │  ├───────────────────────────┤││
│ │                      │  │ 输入框 + 发送按钮          │││
│ │      58%             │  └───────────────────────────┘││
│ │                      │         42%                   ││
│ └──────────────────────┴───────────────────────────────┘│
└────────────────────────────────────────────────────────┘
```

### 关键变化

1. **右侧面板**：从 ChatDialog 组件替换为新的 DocAgentPanel 组件
2. **消息渲染**：增加 AgentExecutionTimeline 展示工具调用过程
3. **doc_update 展示**：在 Timeline 中增加文档更新指示块
4. **移除**：网络搜索开关（由 Agent 自主决定是否搜索）
5. **保持**：分面板布局、可拖拽分隔线、WordEditorPanel 不变

## 组件设计

### DocAgentPanel（新组件）

**职责**：文档 Agent 的交互面板，管理消息列表、Agent 执行和编辑器同步

**Props**：
```typescript
interface DocAgentPanelProps {
  // 编辑器交互回调
  getDocumentContent: () => string;
  updateSectionContent: (operation: string, sectionIndex: number, title?: string, content?: string) => void;
  insertImageAfterSection: (sectionIndex: number, imageUrl: string, imageDescription: string) => boolean;

  // 模型配置
  selectedModelId: string | null;

  // 国际化
  locale: string;
}
```

**内部状态**：
```typescript
// 消息管理
const [messages, setMessages] = useState<DocAgentMessage[]>([]);
const [streamingContent, setStreamingContent] = useState('');
const [streamingBlocks, setStreamingBlocks] = useState<AgentExecutionBlock[]>([]);
const [isStreaming, setIsStreaming] = useState(false);

// 对话管理
const [conversationId, setConversationId] = useState<string>(generateId());
```

**核心方法**：

```pseudo
handleSend(message: string):
    // 1. 添加用户消息
    addUserMessage(message)

    // 2. 获取当前编辑器内容
    documentContent = getDocumentContent()

    // 3. 获取 LLM 配置
    llmConfig = getAgentLLMConfig(selectedModel)

    // 4. 构建请求
    request = {
        message,
        documentContent,
        history: getConversationHistory(),
        llmConfig
    }

    // 5. 发送请求并处理 SSE 流
    response = await fetch('/api/doc-agent-chat', {
        method: 'POST',
        body: JSON.stringify(request),
        signal: abortController.signal
    })

    // 6. 处理 SSE 流
    processDocAgentSSEStream(response.body, {
        onContent: (text) => {
            setStreamingContent(prev => prev + text)
        },
        onToolUse: (tool) => {
            addToolUseBlock(tool)
        },
        onToolResult: (result) => {
            updateToolResultBlock(result)
        },
        onDocUpdate: (update) => {
            // 关键：接收 doc_update 事件并更新编辑器
            handleDocUpdate(update)
            addDocUpdateBlock(update)
        },
        onThinking: (text) => {
            addThinkingBlock(text)
        },
        onComplete: () => {
            finalizeAssistantMessage()
        },
        onError: (error) => {
            addErrorMessage(error)
        }
    })

handleDocUpdate(update: DocUpdateEvent):
    switch update.operation:
        case 'replace':
        case 'append':
        case 'insert':
        case 'delete':
            updateSectionContent(
                update.operation,
                update.sectionIndex,
                update.title,
                update.content
            )
        case 'insert_image':
            insertImageAfterSection(
                update.sectionIndex,
                update.imageUrl,
                update.imageDescription
            )

handleClearHistory():
    setMessages([])
    setConversationId(generateId())
```

### DocUpdateBlock（新的执行块类型）

在 AgentExecutionTimeline 中增加一种新的块类型来展示文档更新操作：

```typescript
interface DocUpdateBlock {
  type: 'doc_update';
  operation: 'replace' | 'append' | 'insert' | 'delete' | 'insert_image';
  sectionIndex: number;
  title?: string;
  imageUrl?: string;
  timestamp: number;
}
```

**渲染方式**：

```
┌─────────────────────────────────────┐
│ 📝 文档更新                          │
│ 操作: 替换章节                       │
│ Section 2: "第二章 技术方案"          │
│ ─────────────────────────────────── │
│ ✅ 已同步到编辑器                     │
└─────────────────────────────────────┘
```

```
┌─────────────────────────────────────┐
│ 🖼️ 插入图片                         │
│ Section 1 之后                       │
│ "城市天际线的照片"                    │
│ ─────────────────────────────────── │
│ ✅ 已同步到编辑器                     │
└─────────────────────────────────────┘
```

### AgentExecutionBlock 类型扩展

在现有的 `AgentExecutionBlock` 联合类型中增加 `DocUpdateBlock`：

```typescript
// lib/agentExecutionBlock.ts 扩展
type AgentExecutionBlock =
  | AgentContentBlock
  | AgentToolUseBlock
  | AgentFileOutputBlock
  | AgentThinkingBlock
  | AgentTurnSeparatorBlock
  | DocUpdateBlock           // 新增
```

## AIAutoWriterContainer 改造

### 当前实现

```typescript
// 当前：使用 ChatDialog 组件
<ChatDialog
  variant="embedded"
  agentVariant="auto-writer"
  getDocumentContent={getEditorContent}
  updateDocumentContent={updateEditorContent}
  insertImageAfterSection={insertImageAfterSection}
/>
```

### 改造后

```typescript
// 改造后：使用 DocAgentPanel 组件
<DocAgentPanel
  getDocumentContent={getEditorContent}
  updateSectionContent={handleSectionUpdate}
  insertImageAfterSection={handleImageInsert}
  selectedModelId={selectedModelId}
  locale={locale}
/>
```

### 新增编辑器回调

AIAutoWriterContainer 需要向 DocAgentPanel 暴露 Section 级别操作：

```typescript
// 新增：Section 级别更新回调
const handleSectionUpdate = useCallback((
  operation: string,
  sectionIndex: number,
  title?: string,
  content?: string
) => {
  const editor = wordEditorRef.current?.getEditor();
  if (!editor) return;

  switch (operation) {
    case 'replace':
      replaceSectionInEditor(editor, sectionIndex, title, content);
      break;
    case 'append':
      appendSectionToEditor(editor, title, content);
      break;
    case 'insert':
      insertSectionInEditor(editor, sectionIndex, title, content);
      break;
    case 'delete':
      deleteSectionFromEditor(editor, sectionIndex);
      break;
  }
}, []);
```

### 编辑器 Section 操作实现

需要在 WordEditorPanel 或独立的 utility 中实现以下 ProseMirror 操作：

```pseudo
function replaceSectionInEditor(editor, sectionIndex, title, content):
    // 1. 找到第 sectionIndex 个 h2 节点的位置
    // 2. 找到该 h2 到下一个 h2 之间的范围
    // 3. 用新的 title(h2) + content 替换该范围
    doc = editor.state.doc
    h2Positions = findAllH2Positions(doc)

    if sectionIndex == 0:
        // 替换 h1 区域（从文档开头到第一个 h2）
        start = 0
        end = h2Positions[0] or doc.content.size
        newContent = `<h1>${title}</h1>${content}`
    else:
        start = h2Positions[sectionIndex - 1]
        end = h2Positions[sectionIndex] or doc.content.size
        newContent = `<h2>${title}</h2>${content}`

    editor.chain()
        .deleteRange({ from: start, to: end })
        .insertContentAt(start, newContent)
        .run()

function appendSectionToEditor(editor, title, content):
    // 在文档末尾追加
    html = `<h2>${title}</h2>${content}`
    editor.commands.insertContentAt(editor.state.doc.content.size, html)

function insertSectionInEditor(editor, sectionIndex, title, content):
    // 在指定位置前插入
    doc = editor.state.doc
    h2Positions = findAllH2Positions(doc)
    insertPos = h2Positions[sectionIndex - 1] or doc.content.size
    html = `<h2>${title}</h2>${content}`
    editor.commands.insertContentAt(insertPos, html)

function deleteSectionFromEditor(editor, sectionIndex):
    // 删除指定 section
    doc = editor.state.doc
    h2Positions = findAllH2Positions(doc)
    start = h2Positions[sectionIndex - 1]
    end = h2Positions[sectionIndex] or doc.content.size
    editor.chain().deleteRange({ from: start, to: end }).run()
```

## SSE 流处理

### 扩展 Stream Parser

在现有 `agentStreamParser.ts` 基础上创建文档版本或扩展：

```typescript
// lib/docAgentStreamParser.ts

interface DocAgentStreamCallbacks {
  // 复用标准 Agent 回调
  onAgentStart?: () => void;
  onThinkingStart?: () => void;
  onThinkingEnd?: () => void;
  onThinking?: (content: string) => void;
  onContent?: (content: string) => void;
  onToolUse?: (tool: ToolUsePayload) => void;
  onToolUpdate?: (update: ToolUpdatePayload) => void;
  onToolResult?: (result: ToolResultPayload) => void;
  onTurnEnd?: () => void;
  onComplete?: () => void;
  onError?: (error: string) => void;

  // 新增：文档更新回调
  onDocUpdate?: (update: DocUpdatePayload) => void;
}

interface DocUpdatePayload {
  operation: 'replace' | 'append' | 'insert' | 'delete' | 'insert_image';
  sectionIndex: number;
  title?: string;
  content?: string;
  imageUrl?: string;
  imageDescription?: string;
}
```

**解析逻辑**：

```pseudo
function processDocAgentSSEStream(body, callbacks):
    // 复用 processAgentSSEStream 的核心解析逻辑
    // 在 switch(payload.type) 中增加 'doc_update' 分支

    // ... 标准解析代码 ...

    switch payload.type:
        case 'doc_update':
            callbacks.onDocUpdate?.(payload as DocUpdatePayload)
            break
        // ... 其他标准 case ...
```

## 消息模型

### DocAgentMessage

```typescript
interface DocAgentMessage {
  id: string;
  role: 'user' | 'assistant' | 'error';
  content: string;
  timestamp: number;

  // Agent 执行信息（assistant 消息专用）
  agentExecutionBlocks?: AgentExecutionBlock[];

  // 文档更新记录（assistant 消息专用）
  docUpdates?: DocUpdatePayload[];
}
```

## 对话历史持久化

### 存储策略

复用现有 ChatPanel 的 localStorage 持久化方案：

```typescript
const STORAGE_KEY = 'aidocmaster.docAgentMessages';

function saveDocAgentMessages(messages: DocAgentMessage[]):
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages))

function loadDocAgentMessages(): DocAgentMessage[]:
    data = localStorage.getItem(STORAGE_KEY)
    return data ? JSON.parse(data) : []
```

### 清除历史

在 DocAgentPanel 的输入区域或顶部添加"清除对话"按钮：

```
┌──────────────────────────────────────┐
│ 文档助手        [清除对话] [模型选择] │
├──────────────────────────────────────┤
│ 消息列表...                          │
├──────────────────────────────────────┤
│ [输入框]                    [发送]   │
└──────────────────────────────────────┘
```

## 与 page.tsx 的集成

### 任务系统

保持现有任务 ID 不变（`ai-auto-writer`），只是内部组件替换：

```typescript
// app/page.tsx 中不需要改变任务定义
{
  id: 'ai-auto-writer',
  title: dict.taskAutoWriter || 'AI Auto-Writer',
  icon: <PenSquare size={20} />
}
```

### Props 传递

AIAutoWriterContainer 的 props 接口保持兼容：

```typescript
interface AIAutoWriterContainerProps {
  selectedModelId: string | null;
  // 移除: onDocumentFunctionsReady（不再需要外部回调）
}
```

## 文件结构

```
components/
  DocAgentPanel.tsx                # 新组件：文档 Agent 交互面板
  DocUpdateBlockDisplay.tsx        # 新组件：文档更新块的 Timeline 渲染

lib/
  docAgentStreamParser.ts          # 新增：文档 Agent SSE 流解析器
  docEditorOperations.ts           # 新增：编辑器 Section 级别操作函数

// 修改的文件：
components/AIAutoWriterContainer.tsx  # 右侧面板从 ChatDialog 改为 DocAgentPanel
lib/agentExecutionBlock.ts            # 增加 DocUpdateBlock 类型
```

## 交互流程示例

### 场景 1：从零创建文档

```
用户: "写一篇关于 AI 在医疗领域应用的文章，3个章节"

Agent 思考: 我需要创建一篇结构化的文章...

[Timeline]
├─ 🔧 search_web("AI 医疗应用 最新进展")
│   → 返回 5 条参考结果
├─ 📝 update_section(append, title="AI在医疗领域的应用", content="<p>引言...</p>")
│   → ✅ 编辑器: 出现 h1 标题和引言段落
├─ 📝 update_section(append, title="智能诊断", content="<p>内容...</p>")
│   → ✅ 编辑器: 出现第一章
├─ 🖼️ search_image("AI 医疗诊断 技术")
│   → 返回 3 张图片
├─ 🖼️ insert_image(sectionIndex=1, url="...", desc="AI辅助诊断示意图")
│   → ✅ 编辑器: 第一章后出现图片
├─ 📝 update_section(append, title="药物研发", content="<p>内容...</p>")
│   → ✅ 编辑器: 出现第二章
├─ 📝 update_section(append, title="未来展望", content="<p>内容...</p>")
│   → ✅ 编辑器: 出现第三章
└─ 💬 "文章已完成，包含3个章节和1张配图..."
```

### 场景 2：修改现有文档

```
用户: "把第二章的内容扩展一下，加入更多数据支撑"

Agent 思考: 先看看当前文档内容...

[Timeline]
├─ 🔧 get_document()
│   → 返回 4 个 sections
├─ 🔧 search_web("药物研发 AI 数据统计 2024")
│   → 返回参考资料
├─ 📝 update_section(replace, sectionIndex=2, content="<p>扩展后的内容...</p>")
│   → ✅ 编辑器: 第二章内容已更新
└─ 💬 "已扩展第二章内容，加入了最新的数据..."
```
