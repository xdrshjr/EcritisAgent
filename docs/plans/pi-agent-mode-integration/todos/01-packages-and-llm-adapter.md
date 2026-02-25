# TODO 01: npm 依赖安装与 LLM 配置适配器

> 对应 spec: `specs/01-packages-and-llm-adapter.md`

## 依赖安装

- [ ] 运行 `npm install @mariozechner/pi-agent-core @mariozechner/pi-ai @mariozechner/pi-coding-agent` 安装 pi-mono 包
- [ ] 检查 `package.json` 确认依赖版本正确（^0.55.0）
- [ ] 运行 `npm ls @mariozechner/pi-agent-core` 验证依赖树无冲突
- [ ] 验证 TypeScript 编译通过：创建测试文件 import pi-mono 包并编译

## LLM 适配器开发

- [ ] 创建 `lib/agentLlmAdapter.ts`
- [ ] 定义 `CallConfig` 接口（与后端 `call_config` 结构对应）
- [ ] 实现 `resolveProvider(apiUrl, protocol)` 函数：根据 URL 和协议推断 pi-ai Provider 名称
- [ ] 实现 `convertToStreamOptions(callConfig)` 函数：将 CallConfig 转换为 pi-ai StreamOptions
- [ ] 处理 OpenAI 协议映射：apiUrl、apiKey、model、temperature、maxTokens
- [ ] 处理 Anthropic 协议映射：包括 extraHeaders、anthropic-version 等
- [ ] 处理 custom 模型映射：自定义 baseUrl 和 headers
- [ ] 处理超时单位转换（毫秒 ↔ 秒）
- [ ] 导出 `getAgentLLMConfig(selectedModel)` 便捷函数：获取 model → call_config → StreamOptions 一步到位

## 验证

- [ ] 编写 `lib/__tests__/agentLlmAdapter.test.ts` 单元测试
- [ ] 测试 OpenAI 标准模型转换
- [ ] 测试 Anthropic 模型转换
- [ ] 测试 custom 模型转换（自定义 URL）
- [ ] 测试缺失字段的默认值处理
