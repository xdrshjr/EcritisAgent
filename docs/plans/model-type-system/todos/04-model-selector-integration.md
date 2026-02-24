# TODO 04: 模型选择器与调用集成

> 对应 Spec: `specs/04-model-selector-integration.md`

## 模型选择器 UI

- [x] 修改 `ChatPanel.tsx` 中模型选择器下拉组件
- [x] 按类型分组展示: "标准 API" / "Coding Plan" / "自定义" 分组标题 (使用 `<optgroup>`)
- [x] 分组标题作为不可选的分隔行
- [x] 空分组不显示
- [x] 默认模型显示星标 (★ 前缀)
- [x] 分组名称国际化 (dict.chat.modelGroupStandard/CodingPlan/Custom)
- [x] 选中后仅显示模型名称 (不显示类型)
- [x] 单一分组时渲染为平铺列表 (无 optgroup 头)

## 数据加载改造

- [x] ChatPanel 的模型加载逻辑使用 `loadModelConfigs()` (别名 `loadAllModelConfigs()`)
- [x] Flask 后端已合并三类型文件返回 (TODO 01/02 已完成)
- [x] 按 type 字段分组过滤
- [x] 保持现有的 `docaimaster_model_configs_updated` 事件监听，重新加载时合并三类型

## Cookie 同步改造

- [x] `modelConfigSync.ts` 的 `syncModelConfigsToCookies()` 调用 `loadModelConfigs()`
- [x] `loadModelConfigs()` 调用 Flask 后端，后端已合并三类型数据返回
- [x] Cookie 名保持不变: `docaimaster_model_configs`
- [x] `getDefaultModelServer` 逻辑已适配三文件系统 (modelConfigServer.ts)

## 后端调用改造

- [x] chat 域: `build_http_request()` + `create_llm_client()` 已替换直接 ChatOpenAI (TODO 02)
- [x] agent 域 (auto_writer_agent): 已接受 `call_config` 参数 (TODO 02)
- [x] agent 域 (document_agent): 已接受 `call_config` 参数 (TODO 02)
- [x] agent 域 (agent_router): 已接受 `call_config` 参数 (TODO 02)
- [x] 全局确认无遗漏的 ChatOpenAI 直接实例化 (TODO 02)

## 流式响应验证

- [x] ChatAnthropic + astream_events — LangChain 内部统一 SSE 格式 (TODO 02)
- [x] Chat 主流式使用 `build_http_request` + `iter_anthropic_as_openai_sse` 转换 (TODO 02)
- [ ] 验证 Kimi Coding Plan 流式调用端到端正常 (需实际 API Key 验证)
- [x] 前端 SSE 处理代码无需修改

## Chatbot 兼容性

- [x] Chatbot 的 modelId 关联在迁移后仍有效 (ID 不变，后端跨文件查找)
- [x] 模型被删除时的回退逻辑 (使用默认模型) 已在 deleteModelConfig 中处理

## 端到端测试

- [ ] 标准 API (OpenAI 协议): 添加模型 → 选择 → 发送消息 → 收到回复
- [ ] 标准 API (Anthropic 协议): 添加 Anthropic 模型 → 选择 → 发送消息 → 收到回复
- [ ] Coding Plan (Kimi): 添加 Kimi → 选择 → 发送消息 → 收到回复
- [ ] 自定义模型: 添加 → 选择 → 发送消息 → 收到回复
- [ ] 切换模型: 连续切换不同类型模型，确认调用无错
- [ ] 迁移场景: 旧配置启动 → 自动迁移 → 所有模型可用
- [ ] Electron 环境: 以上场景在桌面端验证

## 边界情况

- [x] 无任何模型配置: 显示 "No models configured" 提示
- [x] 所有模型禁用: 模型选择器为空 (enabledModels 过滤)
- [x] Kimi 403 错误: 由 chat/routes.py 已有的 HTTP 错误处理覆盖
- [x] 网络超时: 各协议的超时处理由 Flask/LangChain 统一处理

## 类型安全修复

- [x] `handleModelChange` 日志: 使用 `getModelName()`/`getModelApiUrl()` 替代直接属性访问
- [x] 发送函数日志: 同上，CodingPlan 模型显示 "resolved-at-call-time"
- [x] 添加 `modelType` 到日志上下文
