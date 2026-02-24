# Spec 01: 数据模型与存储

## 概述

定义三种模型类型的 TypeScript 接口和 Python 数据结构，设计存储方案，并制定从现有配置到新结构的迁移策略。

## 1. TypeScript 接口定义

### 基础接口

```pseudo
// 模型类型枚举
type ModelType = "standard" | "codingPlan" | "custom"

// 所有类型共享的基础字段
interface BaseModelConfig {
  id: string                    // 格式: model_{timestamp}_{random}
  type: ModelType               // 模型类型标识
  name: string                  // 用户可见的显示名称
  isDefault: boolean            // 是否为全局默认模型
  isEnabled: boolean            // 是否启用
  createdAt: string             // ISO 8601 时间戳
  updatedAt: string             // ISO 8601 时间戳
}
```

### 标准 API 类型

```pseudo
interface StandardModelConfig extends BaseModelConfig {
  type: "standard"
  providerId: string            // 关联供应商模板 ID (如 "openai", "anthropic")
  apiUrl: string                // API 端点 (预填自模板，用户可修改)
  apiKey: string                // API 密钥
  modelName: string             // 模型标识符 (从供应商模型列表选择或手动输入)
  maxToken?: number             // 可选: 最大 token 数
}
```

### Coding Plan 类型

```pseudo
interface CodingPlanModelConfig extends BaseModelConfig {
  type: "codingPlan"
  serviceId: string             // 关联服务模板 ID (如 "kimi")
  apiKey: string                // API 密钥 / Token
}
```

说明: Coding Plan 类型不需要 `apiUrl` 和 `modelName` 字段，这些由 `serviceId` 关联的模板自动提供。

### 自定义类型

```pseudo
interface CustomModelConfig extends BaseModelConfig {
  type: "custom"
  apiUrl: string                // 用户手动填写的 API 端点
  apiKey: string                // API 密钥
  modelName: string             // 模型标识符
  maxToken?: number             // 可选: 最大 token 数
}
```

说明: 与现有 `ModelConfig` 接口基本一致，新增 `type: "custom"` 字段。

### 联合类型

```pseudo
type ModelConfig = StandardModelConfig | CodingPlanModelConfig | CustomModelConfig

interface ModelConfigList {
  models: ModelConfig[]
  defaultModelId?: string
}
```

### 供应商模板类型

```pseudo
interface StandardProvider {
  id: string                    // 如 "openai"
  name: string                  // 如 "OpenAI"
  apiUrl: string                // 默认 API 端点
  models: string[]              // 可用模型列表
  protocol: "openai" | "anthropic"  // API 协议类型
}

interface CodingPlanService {
  id: string                    // 如 "kimi"
  name: string                  // 如 "Kimi Coding Plan"
  apiUrl: string                // API 端点
  model: string                 // 固定模型名
  protocol: "openai" | "anthropic"
  extraHeaders: Record<string, string>  // 额外请求头
  defaultParams: Record<string, number> // 默认调用参数
}

interface ProvidersConfig {
  standard: StandardProvider[]
  codingPlan: CodingPlanService[]
}
```

## 2. 存储文件结构

### 文件分布

```
backend/userData/                     (用户可变数据)
├── standard-models.json              # 标准 API 模型配置
├── coding-plan-models.json           # Coding Plan 模型配置
├── custom-models.json                # 自定义模型配置
└── model-configs.json.bak            # 迁移后的旧文件备份

backend/config/                       (只读模板)
└── providers.json                    # 供应商预置模板
```

### 各文件 JSON 结构

**standard-models.json**
```pseudo
{
  "models": [
    {
      "id": "model_170867..._abc",
      "type": "standard",
      "name": "GPT-4o",
      "providerId": "openai",
      "apiUrl": "https://api.openai.com/v1",
      "apiKey": "sk-...",
      "modelName": "gpt-4o",
      "isDefault": true,
      "isEnabled": true,
      "createdAt": "...",
      "updatedAt": "..."
    }
  ],
  "defaultModelId": "model_170867..._abc"
}
```

**coding-plan-models.json**
```pseudo
{
  "models": [
    {
      "id": "model_170867..._xyz",
      "type": "codingPlan",
      "name": "Kimi K2.5",
      "serviceId": "kimi",
      "apiKey": "sk-kimi-...",
      "isDefault": false,
      "isEnabled": true,
      "createdAt": "...",
      "updatedAt": "..."
    }
  ],
  "defaultModelId": null
}
```

**custom-models.json** — 与迁移前的 `model-configs.json` 结构基本相同，每条记录增加 `"type": "custom"`。

### defaultModelId 跨文件管理

全局默认模型同一时间只有一个，可能在任意一个文件中。规则:

1. 三个文件各自维护 `defaultModelId`，但同一时间只有一个文件的 `defaultModelId` 非空
2. 设置某模型为默认时，清除其他两个文件的 `defaultModelId`
3. 查找默认模型时，依次扫描三个文件，找到第一个非空的 `defaultModelId`
4. 若全部为空，取第一个启用的模型（按 standard → codingPlan → custom 优先级）

## 3. 数据迁移策略

### 触发条件

应用启动时（后端 Flask app 初始化），检测:
- 旧文件 `model-configs.json` 存在
- 新文件 `custom-models.json` 不存在

两个条件同时满足时执行迁移。

### 迁移步骤

```pseudo
FUNCTION migrateModelConfigs():
  1. 读取 model-configs.json
  2. 对每条模型记录:
     a. 添加字段 type = "custom"
     b. 保留所有其他字段不变
  3. 写入 custom-models.json
  4. 创建空的 standard-models.json 和 coding-plan-models.json
  5. 将 model-configs.json 重命名为 model-configs.json.bak
  6. 记录日志: "Model configs migrated successfully"
```

### 回退方案

- 备份文件 `.bak` 保留，用户可手动恢复
- 迁移过程中任何异常，不删除原文件，保持原样运行

### Electron 环境适配

Electron 环境使用 `ELECTRON_USER_DATA` 路径，迁移逻辑同样适用，只是文件路径不同。`ConfigLoader` 已有路径解析逻辑，迁移复用该路径。

## 4. 前端存储层适配

### 新的 modelConfig.ts 函数签名

```pseudo
// 按类型加载
loadModelConfigsByType(type: ModelType): Promise<ModelConfig[]>

// 加载全部（合并三个文件）
loadAllModelConfigs(): Promise<ModelConfigList>

// 按类型保存
saveModelConfigsByType(type: ModelType, models: ModelConfig[]): Promise<void>

// 获取默认模型（跨三文件查找）
getDefaultModel(): Promise<ModelConfig | null>

// 设置默认模型（清除其他文件的 default）
setDefaultModel(id: string): Promise<void>

// 添加模型（根据 type 路由到对应文件）
addModelConfig(config: Partial<ModelConfig>): Promise<Result>

// 更新模型
updateModelConfig(id: string, updates: Partial<ModelConfig>): Promise<Result>

// 删除模型
deleteModelConfig(id: string): Promise<Result>
```

### localStorage 键名变更

```pseudo
旧: "docaimaster_model_configs"
新: "docaimaster_standard_models"
    "docaimaster_coding_plan_models"
    "docaimaster_custom_models"
```

### Cookie 同步

Cookie 继续保存所有模型的合并列表（不分文件），供 Next.js API 路由使用。Cookie 名不变: `docaimaster_model_configs`。

## 5. 验证规则

### 标准 API 类型

- `providerId` 必须存在于 `providers.json` 的 standard 列表中
- `apiKey` 非空
- `modelName` 非空
- `apiUrl` 格式为合法 URL

### Coding Plan 类型

- `serviceId` 必须存在于 `providers.json` 的 codingPlan 列表中
- `apiKey` 非空

### 自定义类型

- `apiUrl` 非空且为合法 URL
- `apiKey` 非空
- `modelName` 非空
