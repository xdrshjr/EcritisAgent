# TODO 03: 前端设置面板 UI

> 对应 Spec: `specs/03-frontend-settings-ui.md`

## Tab 布局改造

- [x] 在 `ModelSettingsPanel.tsx` 中添加 Tab 切换机制 (标准 API / Coding Plan / 自定义)
- [x] 每个 Tab 显示对应类型的模型数量 Badge
- [x] Tab 名称使用 i18n 字典
- [x] 各 Tab 独立维护 staged 编辑状态，切换不丢失
- [x] 使用 Radix UI Tabs + Tailwind 样式实现 Tab UI

## 供应商/服务数据加载

- [x] 组件挂载时调用 `/api/providers` 获取供应商模板
- [x] 存储到 `providers` state
- [x] 处理加载失败情况 (显示错误提示)

## 标准 API Tab

- [x] 实现供应商选择器 UI (卡片/按钮网格)
- [x] 点击供应商后显示配置表单，预填 API URL
- [x] 实现模型 combobox (下拉列表 + 手动输入)
  - [x] 展开时列出供应商预定义模型
  - [x] 支持自由输入不在列表中的模型名
- [x] 显示名称自动生成逻辑: "{供应商名} - {模型名}"
- [x] API Key 密码输入框
- [x] 最大 Token 可选数字输入
- [x] 表单验证 (apiKey 非空, modelName 非空)
- [x] 保存: 创建 StandardModelConfig 对象，添加到 stagedStandardModels
- [x] 模型列表卡片展示 (显示名称、供应商标签、模型名、URL、遮蔽 Key)
- [x] 卡片操作按钮: 编辑、删除、设为默认、启用/禁用
- [x] 编辑: 预填表单，供应商不可修改
- [x] "添加标准 API 模型" 按钮 (通过供应商选择器触发)

## Coding Plan Tab

- [x] 实现服务选择器 UI (目前仅 Kimi)
- [x] 点击服务后显示简化配置表单
- [x] 表单字段: 服务名(只读)、模型名(只读)、API Key(必填)、显示名称(自动生成)
- [x] 保存: 创建 CodingPlanModelConfig 对象
- [x] 模型列表卡片展示 (简化版，无 URL)
- [x] 卡片操作按钮: 编辑、删除、设为默认、启用/禁用
- [x] "添加 Coding Plan 模型" 按钮 (通过服务选择器触发)

## 自定义 Tab

- [x] 复用现有的添加/编辑表单逻辑
- [x] 确保新建的模型携带 `type: "custom"`
- [x] 模型列表展示与现有一致，增加 type 标识

## 跨 Tab 交互

- [x] "设为默认" 操作: 清除其他所有 Tab 中模型的 isDefault
- [x] 底部操作栏: 任意 Tab 有更改时显示
- [x] "确认修改": 批量保存所有有变更的类型
- [x] "取消": 所有 Tab 回退到已保存状态

## 状态管理

- [x] 添加 `activeTab` state
- [x] 拆分现有 `models`/`stagedModels` 为三组
- [x] 实现 `hasChanges` 计算逻辑 (任一 Tab 有变更即为 true)
- [x] 加载时按类型分别获取数据 (并行 Promise.all)

## 国际化

- [x] 在 `lib/i18n/dictionaries.ts` 中添加 modelSettings 相关文案
- [x] EN: Tab names, button labels, form labels, error messages
- [x] ZH: 对应中文翻译
- [x] 组件中使用 `useLanguage()` hook 获取文案

## 删除确认

- [x] 统一使用确认对话框
- [x] 对话框显示模型名称

## 可访问性

- [x] Tab 键导航支持 (Radix UI Tabs 内置)
- [x] aria-label 给各交互元素
- [x] 供应商/服务卡片键盘可操作 (原生 button 元素)
