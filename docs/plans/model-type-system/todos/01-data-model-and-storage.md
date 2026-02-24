# TODO 01: 数据模型与存储

> 对应 Spec: `specs/01-data-model-and-storage.md`

## TypeScript 类型定义

- [ ] 在 `lib/modelConfig.ts` 中定义 `ModelType` 类型: `"standard" | "codingPlan" | "custom"`
- [ ] 定义 `BaseModelConfig` 接口 (id, type, name, isDefault, isEnabled, createdAt, updatedAt)
- [ ] 定义 `StandardModelConfig` 接口 (extends BaseModelConfig + providerId, apiUrl, apiKey, modelName, maxToken?)
- [ ] 定义 `CodingPlanModelConfig` 接口 (extends BaseModelConfig + serviceId, apiKey)
- [ ] 定义 `CustomModelConfig` 接口 (extends BaseModelConfig + apiUrl, apiKey, modelName, maxToken?)
- [ ] 定义联合类型 `ModelConfig = StandardModelConfig | CodingPlanModelConfig | CustomModelConfig`
- [ ] 定义 `StandardProvider` 接口
- [ ] 定义 `CodingPlanService` 接口
- [ ] 定义 `ProvidersConfig` 接口
- [ ] 移除或标记弃用旧的 `ModelConfig` 接口

## 后端供应商模板文件

- [ ] 创建 `backend/config/providers.json`，填入 4 个标准供应商 (OpenAI, Anthropic, Gemini, DeepSeek) 和 1 个 Coding Plan 服务 (Kimi)
- [ ] 确认各供应商的 API URL 和模型列表准确

## 后端存储改造

- [ ] 修改 `ConfigLoader` 类，新增 `load_models_by_type(type)` 方法
- [ ] 新增 `save_models_by_type(type, data)` 方法
- [ ] 新增 `load_all_models()` 方法（合并三文件）
- [ ] 新增 `load_providers()` 方法（读取 providers.json）
- [ ] 处理 `defaultModelId` 跨三文件的一致性逻辑

## 数据迁移

- [ ] 实现 `check_and_migrate()` 方法
- [ ] 迁移逻辑: 检测 model-configs.json 存在 + custom-models.json 不存在
- [ ] 迁移操作: 为每条记录添加 `type: "custom"`，写入 custom-models.json
- [ ] 创建空的 standard-models.json 和 coding-plan-models.json
- [ ] 将旧文件重命名为 model-configs.json.bak
- [ ] 在 Flask app 启动时调用 check_and_migrate()
- [ ] 添加迁移日志
- [ ] 测试: 迁移后所有现有模型功能正常

## 前端存储适配

- [ ] 重构 `loadModelConfigs()` 为 `loadAllModelConfigs()`，合并三个来源
- [ ] 新增 `loadModelConfigsByType(type)` 函数
- [ ] 新增 `saveModelConfigsByType(type, models)` 函数
- [ ] 修改 `addModelConfig()` 根据 type 路由到对应文件
- [ ] 修改 `updateModelConfig()` 根据模型所在文件操作
- [ ] 修改 `deleteModelConfig()` 根据模型所在文件操作
- [ ] 修改 `setDefaultModel()` 实现跨文件清除
- [ ] 修改 `getDefaultModel()` 实现跨文件查找
- [ ] 更新 localStorage 键名 (三个独立键)
- [ ] 更新 Cookie 同步逻辑 (合并三个键写入 Cookie)
- [ ] 验证 Electron 环境下的文件路径兼容性

## 验证规则

- [ ] 实现 `StandardModelConfig` 验证 (providerId 存在性、apiKey 非空、modelName 非空、URL 格式)
- [ ] 实现 `CodingPlanModelConfig` 验证 (serviceId 存在性、apiKey 非空)
- [ ] 实现 `CustomModelConfig` 验证 (与现有逻辑一致)
