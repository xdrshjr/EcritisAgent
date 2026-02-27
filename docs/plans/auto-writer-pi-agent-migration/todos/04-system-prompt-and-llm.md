# TODO 04: 系统提示与 LLM 配置实现

> 对应 Spec: `specs/04-system-prompt-and-llm.md`

## 系统提示

- [x] 创建 `lib/docAgentPrompt.ts`
  - [x] 定义 `DOC_AGENT_SYSTEM_PROMPT` 常量
    - 包含角色定位（文档写作专家）
    - 包含工具使用指南（5 个工具的使用场景和注意事项）
    - 包含创建文档流程说明
    - 包含修改文档流程说明
    - 包含写作规范（内容质量、格式规范、引用规范）
    - 包含重要注意事项（section 粒度、HTML 格式等）
  - [x] 实现 `buildDocAgentSystemPrompt(): string` 导出函数
    - 当前直接返回固定提示
    - 预留未来扩展接口（如动态添加语言偏好）

## LLM 适配

- [x] 验证 `lib/agentLlmAdapter.ts` 可以直接复用
  - [x] 测试 `getAgentLLMConfig` 与文档 Agent 的兼容性
  - [ ] 确认 OpenAI 协议模型正常工作（需手动测试）
  - [ ] 确认 Anthropic 协议模型正常工作（需手动测试）
  - [ ] 确认 codingPlan 类型模型正常工作（需手动测试）
  - [ ] 确认 custom 类型模型正常工作（需手动测试）

## 模型选择集成

- [x] 在 DocAgentPanel 中集成模型选择
  - [x] 接收 selectedModelId prop
  - [x] 发送消息时使用选中模型的配置
  - [x] 处理模型不可用的情况（配置缺失、API Key 未设置）

## 对话历史处理

- [x] 实现历史消息准备函数
  - [x] 过滤 error 类型消息
  - [x] 只保留 role 和 content（不包含工具调用详情）
  - [x] 确保格式符合 pi-agent 的 AgentMessage 接口
  - 实现方式：前端 `prepareDocAgentHistory()` 产出 `SimplifiedHistoryMessage[]`，
    API 路由 `convertSimplifiedHistory()` 转换为 pi-ai `AgentMessage[]`（含 stub 元数据）

## 测试

- [ ] 测试系统提示有效性（需手动测试）
  - Agent 能正确理解创建文档的指令
  - Agent 能正确理解修改文档的指令
  - Agent 自主选择使用哪些工具
  - Agent 遵循 section 粒度操作规范
- [ ] 测试多轮对话（需手动测试）
  - 第一轮创建文档 → 第二轮修改特定章节
  - 验证历史上下文正确传递
- [ ] 测试不同模型（需手动测试）
  - 至少测试一个 OpenAI 协议模型
  - 至少测试一个 Anthropic 协议模型（如有配置）
