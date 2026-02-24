# Spec 03: 前端设置面板 UI

## 概述

将现有的 `ModelSettingsPanel` 组件改造为三 Tab 布局，每个 Tab 对应一种模型类型，提供差异化的配置表单和管理界面。

## 1. 整体布局

### Tab 结构

```
┌─────────────────────────────────────────────────┐
│  [标准 API]    [Coding Plan]    [自定义]         │
├─────────────────────────────────────────────────┤
│                                                 │
│  (根据选中 Tab 显示对应内容)                      │
│                                                 │
└─────────────────────────────────────────────────┘
```

- 三个 Tab: "标准 API" / "Coding Plan" / "自定义"
- Tab 上显示该类型的模型数量 Badge（如 "标准 API (3)"）
- 切换 Tab 时保留各 Tab 内的编辑状态
- 国际化: Tab 名称从 `dictionaries.ts` 获取

### 底部操作栏

保持现有的 "确认修改" / "取消" 操作栏，当任意 Tab 有未保存更改时显示。保存时只保存有变更的类型文件。

## 2. 标准 API Tab

### 添加模型流程

```
步骤 1: 选择供应商
┌─────────────────────────────────┐
│  选择供应商:                      │
│  ┌───────┐ ┌──────────┐        │
│  │OpenAI │ │Anthropic │ ...    │
│  └───────┘ └──────────┘        │
│  (卡片/按钮网格，带供应商 Logo)    │
└─────────────────────────────────┘

步骤 2: 填写配置
┌─────────────────────────────────┐
│  供应商: OpenAI                  │
│  API URL: [https://api.openai.. │  ← 预填，可编辑
│  API Key: [sk-...             ] │  ← 必填
│  模型:    [▼ gpt-4o           ] │  ← 下拉选择 + 可手动输入
│  显示名称: [我的 GPT-4o        ] │  ← 自动生成，可修改
│  最大 Token: [              ]   │  ← 可选
│                                 │
│  [取消]           [保存模型]     │
└─────────────────────────────────┘
```

### 供应商选择器

- 从后端 `/api/providers` 获取供应商列表
- 每个供应商显示为可点击的卡片/按钮
- 包含: 供应商名称（Logo 暂不实现，后续可加）
- 点击后进入步骤 2，预填该供应商的 `apiUrl`

### 配置表单字段

| 字段 | 类型 | 来源 | 必填 | 说明 |
|------|------|------|------|------|
| 供应商 | 只读展示 | 步骤 1 选择 | - | 显示已选供应商名称 |
| API URL | text input | 预填自模板 | 是 | 完全可编辑 |
| API Key | password input | 用户输入 | 是 | 密码输入框 |
| 模型 | combobox | 模板提供列表 | 是 | 下拉选择 + 支持手动输入 |
| 显示名称 | text input | 自动生成 | 是 | 格式: "{供应商名} - {模型名}" |
| 最大 Token | number input | 空 | 否 | 可选 |

### 模型下拉 + 手动输入

使用 combobox 模式（下拉列表 + 自由输入）:
- 展开时显示供应商模板中的预定义模型列表
- 用户也可以直接输入不在列表中的模型名（应对新模型未收录的情况）
- 选择预定义模型时自动填入 modelName

### 模型列表展示

```
┌──────────────────────────────────────────┐
│ 标准 API (3)                              │
│                                          │
│ ┌──────────────────────────────────────┐ │
│ │ ⭐ GPT-4o                    OpenAI  │ │
│ │    gpt-4o · api.openai.com           │ │
│ │    API Key: ••••••••                 │ │
│ │    [编辑] [删除] [启用/禁用]          │ │
│ └──────────────────────────────────────┘ │
│                                          │
│ ┌──────────────────────────────────────┐ │
│ │    Claude Sonnet 4        Anthropic  │ │
│ │    claude-sonnet-4... · api.anthro.. │ │
│ │    API Key: ••••••••                 │ │
│ │    [编辑] [设为默认] [删除] [启用]    │ │
│ └──────────────────────────────────────┘ │
│                                          │
│        [+ 添加标准 API 模型]              │
└──────────────────────────────────────────┘
```

每个模型卡片显示:
- 显示名称 + 供应商名称（右侧标签）
- 模型名 · API URL（截断显示）
- API Key 遮蔽显示
- 操作按钮: 编辑、删除、设为默认、启用/禁用切换

## 3. Coding Plan Tab

### 添加模型流程

```
步骤 1: 选择服务
┌─────────────────────────────────┐
│  选择 Coding Plan 服务:          │
│  ┌────────────────┐             │
│  │ Kimi Coding    │             │
│  │ Plan           │             │
│  └────────────────┘             │
│  (目前仅 Kimi 一个选项)           │
└─────────────────────────────────┘

步骤 2: 填写 Key
┌─────────────────────────────────┐
│  服务: Kimi Coding Plan          │
│  模型: kimi-k2.5 (固定)          │
│  API Key: [sk-kimi-...        ] │  ← 必填
│  显示名称: [Kimi K2.5         ]  │  ← 自动生成，可修改
│                                 │
│  [取消]           [保存模型]     │
└─────────────────────────────────┘
```

### 配置表单字段

| 字段 | 类型 | 来源 | 必填 | 说明 |
|------|------|------|------|------|
| 服务 | 只读展示 | 步骤 1 选择 | - | 显示服务名称 |
| 模型 | 只读展示 | 模板 | - | 自动显示，不可修改 |
| API Key | password input | 用户输入 | 是 | 密码输入框 |
| 显示名称 | text input | 自动生成 | 是 | 格式: "{服务名} - {模型名}" |

说明: Coding Plan 类型配置极简，用户只需填 API Key。URL、模型名、Headers、默认参数全部由模板提供。

### 模型列表展示

同标准 API 的卡片样式，但显示信息更少（无 URL 展示，因为 URL 由模板固定）。

## 4. 自定义 Tab

### 配置表单

与现有 `ModelSettingsPanel` 的添加/编辑表单完全相同:

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| 显示名称 | text input | 是 | 用户自定义 |
| API URL | text input | 是 | 用户手动输入 |
| API Key | password input | 是 | 用户输入 |
| 模型名 | text input | 是 | 用户手动输入 |
| 最大 Token | number input | 否 | 可选 |

### 模型列表展示

与现有 UI 基本一致，增加 `type: "custom"` 标识。

## 5. 交互细节

### "设为默认" 跨 Tab 操作

当在某 Tab 中设置一个模型为默认时:
1. 该模型标记 `isDefault: true`
2. 其他所有 Tab 中的模型自动取消默认（前端状态更新）
3. 保存时三个文件都需要更新 `defaultModelId`

### 编辑模式

- 点击 "编辑" 按钮，卡片展开为内联编辑表单（或弹出表单）
- 标准 API: 可修改 URL、Key、模型名、显示名称，不可修改供应商
- Coding Plan: 可修改 Key 和显示名称，不可修改服务
- 自定义: 所有字段均可修改

### 删除确认

所有类型统一使用确认对话框: "确定要删除模型 {name} 吗？"

### Tab 切换时的未保存提醒

- 切换 Tab 不丢失未保存的编辑（各 Tab 独立维护 staged 状态）
- 底部 "确认修改" 栏在任意 Tab 有更改时持续显示
- 点击 "确认修改" 保存所有 Tab 的变更

## 6. 状态管理

### 组件状态

```pseudo
// 当前激活的 Tab
activeTab: "standard" | "codingPlan" | "custom"

// 三种类型各自的模型列表（已保存）
standardModels: StandardModelConfig[]
codingPlanModels: CodingPlanModelConfig[]
customModels: CustomModelConfig[]

// 三种类型各自的暂存状态（编辑中）
stagedStandardModels: StandardModelConfig[]
stagedCodingPlanModels: CodingPlanModelConfig[]
stagedCustomModels: CustomModelConfig[]

// 供应商模板数据
providers: ProvidersConfig

// UI 状态
isFormVisible: boolean              // 添加表单是否显示
isEditMode: boolean                 // 编辑 vs 新增模式
editingModelId: string | null       // 正在编辑的模型 ID
selectedProviderId: string | null   // 标准 API: 选中的供应商
selectedServiceId: string | null    // Coding Plan: 选中的服务
hasChanges: boolean                 // 是否有未保存的变更
```

### 数据加载

组件挂载时并行加载:
1. 三种类型的模型配置（三个 API 调用或合并调用）
2. 供应商模板数据（`/api/providers`）

### 保存逻辑

```pseudo
FUNCTION handleConfirmChanges():
  changes = []
  IF stagedStandardModels != standardModels:
    changes.push(saveModelConfigsByType("standard", stagedStandardModels))
  IF stagedCodingPlanModels != codingPlanModels:
    changes.push(saveModelConfigsByType("codingPlan", stagedCodingPlanModels))
  IF stagedCustomModels != customModels:
    changes.push(saveModelConfigsByType("custom", stagedCustomModels))
  AWAIT Promise.all(changes)
  刷新模型列表
  发送更新事件
```

## 7. 国际化

在 `dictionaries.ts` 中添加:

```pseudo
modelSettings: {
  tabs: {
    standard: "标准 API" / "Standard API",
    codingPlan: "Coding Plan" / "Coding Plan",
    custom: "自定义" / "Custom"
  },
  standard: {
    selectProvider: "选择供应商" / "Select Provider",
    addModel: "添加标准 API 模型" / "Add Standard API Model",
    ...
  },
  codingPlan: {
    selectService: "选择 Coding Plan 服务" / "Select Coding Plan Service",
    addModel: "添加 Coding Plan 模型" / "Add Coding Plan Model",
    ...
  },
  custom: {
    addModel: "添加自定义模型" / "Add Custom Model",
    ...
  }
}
```
