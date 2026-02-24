# TODO 02: 后端 API 与协议适配

> 对应 Spec: `specs/02-backend-api-and-protocol.md`

## 供应商模板 API

- [x] 在 `backend/domains/model/routes.py` 新增 `GET /api/providers` 路由
- [x] 读取 `backend/config/providers.json` 并返回
- [x] 添加错误处理 (文件不存在时返回空模板)

## 模型配置 API 改造

- [x] 修改 `GET /api/model-configs` 支持 `?type=` 查询参数
- [x] `type=all` (默认): 调用 `load_all_models()` 返回合并结果
- [x] `type=standard|codingPlan|custom`: 调用 `load_models_by_type(type)` 返回单类型
- [x] 修改 `POST /api/model-configs` 要求请求体包含 `type` 字段
- [x] 根据 `type` 字段调用对应的 `save_models_by_type()` 保存
- [x] 新增 `POST /api/model-configs/default` 路由 (设置跨文件全局默认)
- [x] 实现跨文件 defaultModelId 清除逻辑
- [x] 更新后端验证逻辑，根据 type 校验不同的必填字段

## 前端 API 路由

- [x] 前端直接通过 `buildFlaskApiUrl` 调用 Flask，无需 Next.js 代理
- [x] `loadProviders()` 已直接调用 Flask `/api/providers`
- [x] `loadModelConfigsByType(type)` 已直接调用 Flask `/api/model-configs/<type>`
- [x] `setDefaultModel()` 更新为调用 Flask `/api/model-configs/default`

## get_model_call_config 实现

- [x] 在 ConfigLoader 中实现 `get_llm_config(model_id)` 方法 (即 get_model_call_config)
- [x] 标准 API: 从 providers.json 获取 protocol，合并模型自身的 apiUrl/apiKey/modelName
- [x] Coding Plan: 从 providers.json 获取 apiUrl/model/protocol/extraHeaders/defaultParams，合并模型的 apiKey
- [x] 自定义: 直接使用模型自身字段，默认 protocol="openai"
- [x] 处理 providerId/serviceId 在 providers.json 中找不到的回退逻辑

## 协议适配层

- [x] 创建 `backend/llm_factory.py` 文件
- [x] 实现 `create_llm_client(call_config)` 函数
- [x] OpenAI 协议: 使用 `ChatOpenAI` 创建
- [x] Anthropic 协议: 使用 `ChatAnthropic` 创建，注入 extraHeaders 和 defaultParams
- [x] 未知协议回退为 OpenAI + 日志警告
- [x] 确认 `langchain-anthropic` 包已在 requirements.txt 中

## 调用点改造

- [x] 修改 `backend/domains/chat/` 中的 LLM 创建逻辑，使用 `create_llm_client`
- [x] 修改 `backend/agent/auto_writer_agent.py` 中的 LLM 创建逻辑
- [x] 修改 `backend/agent/document_agent.py` 中的 LLM 创建逻辑
- [x] 修改 `backend/agent/agent_router.py` 中的 LLM 创建逻辑
- [x] 全局搜索所有 `ChatOpenAI(` 调用点，确保无遗漏

## 流式响应验证

- [x] Chat MCP 分析使用 `create_llm_client` — LangChain 内部统一 SSE 格式
- [x] Chat 主流式使用 `build_http_request` + `iter_anthropic_as_openai_sse` 转换 Anthropic SSE → OpenAI SSE
- [ ] 测试 Kimi Coding Plan 的流式输出能正确传递到前端 (需实际 API Key 验证)

## 错误处理

- [x] 供应商模板找不到: 标准 API 回退 OpenAI 协议 (ConfigLoader.get_llm_config)
- [x] 服务模板找不到: Coding Plan 返回 None + 错误日志
- [x] Kimi 403 错误: 由 chat/routes.py 已有的 HTTP 错误处理覆盖
- [x] 添加协议相关的日志记录 (llm_factory + chat routes)
