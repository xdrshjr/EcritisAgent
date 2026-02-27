# Spec 01: 文档 Agent 工具集设计

## 概述

本文档定义文档 Agent 的 5 个专用工具。这些工具是"虚拟工具"——它们操作的是前端 TipTap 编辑器的内存内容，而非文件系统。工具通过 SSE 事件流与前端编辑器实时通信。

## 文档结构模型（Section Model）

文档以 `<h2>` 标签为分隔符，划分为多个 Section：

```
Section 0: <h1> 标题 + 介绍段落（h1 之前和第一个 h2 之前的内容）
Section 1: 第一个 <h2> 标题 + 其后的段落内容
Section 2: 第二个 <h2> 标题 + 其后的段落内容
...
Section N: 最后一个 <h2> 标题 + 其后的段落内容
```

每个 Section 包含：
- `index`: 从 0 开始的序号
- `title`: Section 标题文本（Section 0 为 h1 文本，其余为 h2 文本）
- `content`: Section 的 HTML 内容（不包含标题标签本身）

## 工具定义

### 1. `get_document`

**用途**：读取编辑器当前的完整文档内容

**参数**：无

**返回值**：
```json
{
  "sections": [
    {
      "index": 0,
      "title": "文档标题",
      "content": "<p>介绍段落...</p>"
    },
    {
      "index": 1,
      "title": "第一章 背景",
      "content": "<p>背景内容...</p><p>详细说明...</p>"
    }
  ],
  "totalSections": 2,
  "rawHtml": "<h1>文档标题</h1><p>介绍段落...</p><h2>第一章 背景</h2>..."
}
```

**行为**：
- 从请求上下文中读取前端在发送消息时附带的编辑器内容
- 将 HTML 解析为 Section 列表
- 如果编辑器为空，返回 `{ sections: [], totalSections: 0, rawHtml: "" }`

**SSE 事件**：无（只读操作）

**实现要点**：
- 前端每次发送消息时，将当前编辑器的 HTML 内容附带在请求体的 `documentContent` 字段中
- 工具函数通过闭包访问这个内容
- HTML → Section 解析逻辑：使用正则或 DOM 解析按 `<h2>` 分割

---

### 2. `update_section`

**用途**：对文档进行 Section 粒度的增删改操作

**参数**：
```json
{
  "operation": "replace | append | insert | delete",
  "sectionIndex": 0,
  "title": "新的章节标题",
  "content": "<p>新的章节内容...</p>"
}
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `operation` | string | 是 | 操作类型：`replace`（替换）、`append`（追加到末尾）、`insert`（在指定位置插入）、`delete`（删除） |
| `sectionIndex` | number | replace/insert/delete 时必填 | 目标 Section 的索引 |
| `title` | string | replace/append/insert 时可选 | Section 标题（h1 或 h2） |
| `content` | string | replace/append/insert 时必填 | Section 的 HTML 内容 |

**操作详解**：

**`replace`** — 替换指定索引的 Section 内容
- 如果提供了 `title`，同时替换标题
- 如果 `sectionIndex` 为 0，替换 h1 标题区域
- 如果 `sectionIndex` 超出范围，返回错误

**`append`** — 在文档末尾追加新 Section
- `sectionIndex` 可不填（自动追加到最后）
- 必须提供 `title` 和 `content`
- 标题会自动包装为 `<h2>` 标签

**`insert`** — 在指定位置之前插入新 Section
- `sectionIndex` 指定插入位置（新 Section 将出现在此索引处）
- 后续 Section 的索引自动后移
- 必须提供 `title` 和 `content`

**`delete`** — 删除指定索引的 Section
- 不能删除 Section 0（文档标题区域）
- 后续 Section 的索引自动前移

**返回值**：
```json
{
  "success": true,
  "operation": "replace",
  "sectionIndex": 1,
  "message": "Section 1 '第一章 背景' 已更新"
}
```

**SSE 事件**：
```json
{
  "type": "doc_update",
  "operation": "replace",
  "sectionIndex": 1,
  "title": "第一章 背景",
  "content": "<p>新的背景内容...</p>"
}
```

**前端处理 `doc_update` 事件**：
- `replace`：找到编辑器中对应 Section 的 h2 标签，替换其后的内容直到下一个 h2
- `append`：在编辑器内容末尾追加 h2 + content
- `insert`：在指定位置的 h2 之前插入新的 h2 + content
- `delete`：移除对应的 h2 及其后的内容

---

### 3. `insert_image`

**用途**：在指定 Section 之后插入图片

**参数**：
```json
{
  "sectionIndex": 1,
  "imageUrl": "https://images.unsplash.com/...",
  "imageDescription": "一个城市天际线的照片",
  "position": "after_section"
}
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `sectionIndex` | number | 是 | 在哪个 Section 之后插入图片 |
| `imageUrl` | string | 是 | 图片 URL |
| `imageDescription` | string | 是 | 图片描述（用作 alt 文本） |
| `position` | string | 否 | 插入位置，默认 `after_section`，可选 `before_section` |

**返回值**：
```json
{
  "success": true,
  "message": "图片已插入到 Section 1 之后",
  "imageUrl": "https://...",
  "imageDescription": "一个城市天际线的照片"
}
```

**SSE 事件**：
```json
{
  "type": "doc_update",
  "operation": "insert_image",
  "sectionIndex": 1,
  "imageUrl": "https://...",
  "imageDescription": "一个城市天际线的照片",
  "position": "after_section"
}
```

**前端处理**：
- 复用现有 `insertImageAfterSection(sectionIndex, imageUrl, imageDescription)` 方法
- 已有 ProseMirror API 实现，直接调用

---

### 4. `search_web`

**用途**：搜索网络参考资料，获取相关内容供写作参考

**参数**：
```json
{
  "query": "人工智能在医疗领域的应用",
  "maxResults": 5
}
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `query` | string | 是 | 搜索关键词 |
| `maxResults` | number | 否 | 最大返回结果数，默认 5，范围 1-10 |

**返回值**：
```json
{
  "results": [
    {
      "title": "AI in Healthcare: Current Applications",
      "url": "https://example.com/article",
      "content": "摘要内容...",
      "score": 0.95
    }
  ],
  "totalResults": 5,
  "query": "人工智能在医疗领域的应用"
}
```

**SSE 事件**：无（搜索结果只返回给 Agent，Agent 决定如何引用）

**实现方式**：
- **方案 A**（推荐）：直接在 Next.js 中调用 Tavily API
  - 读取搜索服务配置（API Key）：通过 Flask `/api/search-service-configs` 端点获取，或直接读取配置文件
  - 调用 Tavily Search API: `POST https://api.tavily.com/search`
- **方案 B**：通过 Flask 代理
  - 调用 Flask 已有的搜索端点

---

### 5. `search_image`

**用途**：搜索图片素材，供 Agent 决定是否插入到文档中

**参数**：
```json
{
  "keywords": "城市 天际线 现代建筑",
  "count": 3
}
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `keywords` | string | 是 | 搜索关键词（空格分隔） |
| `count` | number | 否 | 返回图片数量，默认 3，范围 1-5 |

**返回值**：
```json
{
  "images": [
    {
      "url": "https://images.unsplash.com/photo-xxx",
      "thumbnailUrl": "https://images.unsplash.com/photo-xxx?w=400",
      "description": "Modern city skyline at dusk",
      "author": "John Doe",
      "authorUrl": "https://unsplash.com/@johndoe"
    }
  ],
  "totalImages": 3,
  "keywords": "城市 天际线 现代建筑"
}
```

**SSE 事件**：无（搜索结果返回给 Agent，Agent 调用 `insert_image` 工具来实际插入）

**实现方式**：
- **方案 A**（推荐）：直接在 Next.js 中调用 Unsplash API
  - 读取图片服务配置（API Key）
  - 调用 Unsplash Search API: `GET https://api.unsplash.com/search/photos`
- **方案 B**：通过 Flask 代理

---

## 工具注册与 Pi-Agent 集成

### 工具创建函数

```pseudo
function createDocAgentTools(documentContent: string, sseController: StreamController):
    // documentContent: 前端发送的编辑器当前内容
    // sseController: SSE 流控制器，用于发送 doc_update 事件

    parsedSections = parseHtmlToSections(documentContent)

    tools = [
        Tool(
            name: "get_document",
            description: "读取当前文档的完整内容，返回按章节(section)分组的结构化数据。每个section包含index、title和content。用于了解文档当前状态。",
            parameters: {},  // 无参数
            execute: () => {
                return { sections: parsedSections, totalSections: len(parsedSections), rawHtml: documentContent }
            }
        ),
        Tool(
            name: "update_section",
            description: "对文档进行章节级别的编辑操作。支持四种操作：replace(替换指定章节内容)、append(在文档末尾追加新章节)、insert(在指定位置插入新章节)、delete(删除指定章节)。",
            parameters: { operation, sectionIndex?, title?, content? },
            execute: (params) => {
                validate(params)
                result = applyOperation(params)
                sseController.enqueue(buildDocUpdateEvent(params))
                // 更新内部 section 状态
                updateParsedSections(params)
                return result
            }
        ),
        Tool(
            name: "insert_image",
            description: "在指定章节之后插入一张图片。需要提供图片URL和描述文字。通常在调用search_image获取图片后使用。",
            parameters: { sectionIndex, imageUrl, imageDescription, position? },
            execute: (params) => {
                validate(params)
                sseController.enqueue(buildDocUpdateEvent({
                    operation: "insert_image", ...params
                }))
                return { success: true, message: `图片已插入到 Section ${params.sectionIndex} 之后` }
            }
        ),
        Tool(
            name: "search_web",
            description: "搜索网络获取参考资料和相关信息。返回搜索结果列表，包含标题、URL和内容摘要。用于丰富文档内容、添加引用依据。",
            parameters: { query, maxResults? },
            execute: async (params) => {
                config = await loadSearchServiceConfig()
                results = await callTavilyAPI(params.query, params.maxResults, config)
                return results
            }
        ),
        Tool(
            name: "search_image",
            description: "根据关键词搜索图片素材。返回图片URL、缩略图、描述和作者信息。搜索到合适的图片后，可使用insert_image工具将其插入文档。",
            parameters: { keywords, count? },
            execute: async (params) => {
                config = await loadImageServiceConfig()
                images = await callUnsplashAPI(params.keywords, params.count, config)
                return images
            }
        )
    ]

    return tools
```

### 工具与 pi-agent-core 的集成

Pi-agent-core 的 `Agent` 类需要接收符合 `Tool` 接口的工具数组。关键适配点：

1. **工具描述**：每个工具需要有清晰的 `description`，引导 LLM 正确使用
2. **参数 Schema**：每个工具需要 JSON Schema 格式的参数定义
3. **异步执行**：search_web 和 search_image 是异步的（网络请求）
4. **SSE 通道访问**：update_section 和 insert_image 需要访问 SSE 流控制器

### 与编码 Agent 工具的对比

| 特性 | 编码 Agent 工具 | 文档 Agent 工具 |
|------|----------------|----------------|
| 操作目标 | 文件系统 | TipTap 编辑器内存 |
| 工具来源 | `@mariozechner/pi-coding-agent` | 自定义实现 |
| 安全约束 | 限制在 workDir 内 | 无文件系统访问 |
| 副作用通知 | tool_result 事件 | doc_update 事件 |
| 状态管理 | 文件系统即状态 | 内存中的 Section 列表 |

---

## Section 解析算法

```pseudo
function parseHtmlToSections(html: string) -> Section[]:
    if html is empty:
        return []

    // 使用正则分割 HTML，以 <h2> 标签为分隔符
    // 保留 h2 标签本身
    parts = html.split(/(?=<h2[^>]*>)/i)

    sections = []
    for i, part in enumerate(parts):
        if i == 0:
            // 第一部分：可能包含 h1 标题和介绍段落
            title = extractH1Title(part) or ""
            content = removeH1Tag(part)
            sections.push({ index: 0, title, content })
        else:
            // 后续部分：h2 标题 + 内容
            title = extractH2Title(part)
            content = removeH2Tag(part)
            sections.push({ index: i, title, content })

    return sections
```

## 服务配置获取

search_web 和 search_image 工具需要 API Key。获取方式：

```pseudo
async function loadSearchServiceConfig():
    // 方案1：直接读取配置文件
    config = readFile('backend/config/search-service-configs.json')
    defaultService = config.searchServices.find(s => s.id === config.defaultServiceId)
    return { apiKey: defaultService.apiKeys[0], type: defaultService.type }

    // 方案2：调用 Flask API
    response = await fetch(buildFlaskApiUrl('/api/search-service-configs'))
    return response.json()
```

## 错误处理

| 工具 | 可能的错误 | 处理方式 |
|------|-----------|---------|
| get_document | 文档内容为空 | 返回空 sections 列表 |
| update_section | sectionIndex 越界 | 返回错误，说明有效范围 |
| update_section | 缺少必要参数 | 返回参数验证错误 |
| insert_image | 图片 URL 无效 | 返回错误，建议先用 search_image |
| search_web | API Key 未配置 | 返回错误，提示需要配置搜索服务 |
| search_web | 网络请求失败 | 返回错误，包含失败原因 |
| search_image | API Key 未配置 | 返回错误，提示需要配置图片服务 |
| search_image | 无匹配结果 | 返回空 images 列表 |

## 文件结构

```
lib/
  docAgentTools.ts        # 文档工具创建函数 createDocAgentTools()
  docSectionParser.ts     # HTML → Section 解析逻辑
```
