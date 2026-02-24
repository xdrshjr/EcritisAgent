# Spec 02: 后端 API 与协议适配

## 概述

扩展 Flask 后端以支持三种模型类型的配置管理、供应商模板提供、以及根据模型类型选择正确的 API 协议进行调用。

## 1. 新增/修改 API 路由

### 供应商模板路由 (新增)

**GET /api/providers**

返回 `providers.json` 中的供应商模板数据。

```pseudo
响应:
{
  "success": true,
  "data": {
    "standard": [
      { "id": "openai", "name": "OpenAI", "apiUrl": "...", "models": [...], "protocol": "openai" },
      ...
    ],
    "codingPlan": [
      { "id": "kimi", "name": "Kimi Coding Plan", "apiUrl": "...", ... }
    ]
  }
}
```

只读接口，从 `backend/config/providers.json` 读取，不支持修改。

### 模型配置路由 (修改)

现有的 `/api/model-configs` 需要扩展为按类型操作。

**GET /api/model-configs?type={standard|codingPlan|custom|all}**

- `type=all`（默认）: 合并三个文件返回所有模型
- `type=standard`: 仅返回标准 API 模型
- `type=codingPlan`: 仅返回 Coding Plan 模型
- `type=custom`: 仅返回自定义模型

```pseudo
响应:
{
  "success": true,
  "data": {
    "models": [...],
    "defaultModelId": "..."
  },
  "count": N,
  "type": "all"
}
```

**POST /api/model-configs**

请求体新增 `type` 字段，用于指定保存目标文件:

```pseudo
请求:
{
  "type": "standard",       // 必填: 指定保存到哪个文件
  "models": [...],
  "defaultModelId": "..."   // 可选
}

响应:
{
  "success": true,
  "message": "Standard model configurations saved successfully",
  "count": N
}
```

**POST /api/model-configs/default**  (新增)

设置全局默认模型，自动处理跨文件清除:

```pseudo
请求:
{
  "modelId": "model_xxx"
}

响应:
{
  "success": true,
  "message": "Default model set to model_xxx"
}
```

后端逻辑: 遍历三个文件，找到目标模型所在文件设置 `defaultModelId`，清除其他文件的 `defaultModelId`。

## 2. ConfigLoader 扩展

### 新增方法

```pseudo
class ConfigLoader:
    # 现有方法保留

    # 新增: 按类型加载
    def load_models_by_type(self, model_type: str) -> dict:
        FILE_MAP = {
            "standard": "standard-models.json",
            "codingPlan": "coding-plan-models.json",
            "custom": "custom-models.json"
        }
        filename = FILE_MAP[model_type]
        return self._read_json(filename)

    # 新增: 加载全部 (合并)
    def load_all_models(self) -> dict:
        all_models = []
        default_id = None
        for model_type in ["standard", "codingPlan", "custom"]:
            data = self.load_models_by_type(model_type)
            all_models.extend(data.get("models", []))
            if data.get("defaultModelId") and not default_id:
                default_id = data["defaultModelId"]
        return {"models": all_models, "defaultModelId": default_id}

    # 新增: 按类型保存
    def save_models_by_type(self, model_type: str, data: dict) -> None:
        ...

    # 新增: 加载供应商模板
    def load_providers(self) -> dict:
        return self._read_json("config/providers.json", readonly=True)

    # 新增: 获取模型的完整调用配置 (合并模板信息)
    def get_model_call_config(self, model_id: str) -> dict:
        """
        返回:
        {
            "apiUrl": "...",
            "apiKey": "...",
            "modelName": "...",
            "protocol": "openai" | "anthropic",
            "extraHeaders": {...} | None,
            "defaultParams": {...} | None
        }
        """
        ...

    # 修改: 迁移检查
    def check_and_migrate(self) -> None:
        """启动时调用，检测旧配置并迁移"""
        ...
```

### get_model_call_config 逻辑

```pseudo
FUNCTION get_model_call_config(model_id):
  model = 在三个文件中查找 model_id
  IF model.type == "standard":
    provider = 从 providers.json 查找 model.providerId
    RETURN {
      apiUrl: model.apiUrl,          // 用户可能修改过
      apiKey: model.apiKey,
      modelName: model.modelName,
      protocol: provider.protocol,   // 从模板获取协议
      extraHeaders: null,
      defaultParams: null
    }
  ELSE IF model.type == "codingPlan":
    service = 从 providers.json 查找 model.serviceId
    RETURN {
      apiUrl: service.apiUrl,        // 从模板获取
      apiKey: model.apiKey,
      modelName: service.model,      // 从模板获取
      protocol: service.protocol,
      extraHeaders: service.extraHeaders,
      defaultParams: service.defaultParams
    }
  ELSE IF model.type == "custom":
    RETURN {
      apiUrl: model.apiUrl,
      apiKey: model.apiKey,
      modelName: model.modelName,
      protocol: "openai",            // 自定义默认 OpenAI 协议
      extraHeaders: null,
      defaultParams: null
    }
```

## 3. 协议适配层

### 当前状态

后端 chat 和 agent 服务目前使用 LangChain 的 `ChatOpenAI` 类统一调用，假设所有模型都兼容 OpenAI API。

### 改造方案

新增协议判断逻辑，根据 `protocol` 字段选择不同的调用方式:

```pseudo
FUNCTION create_llm_client(call_config):
  IF call_config.protocol == "openai":
    RETURN ChatOpenAI(
      api_key = call_config.apiKey,
      base_url = call_config.apiUrl,
      model = call_config.modelName,
      max_tokens = call_config.maxToken
    )
  ELSE IF call_config.protocol == "anthropic":
    headers = call_config.extraHeaders OR {}
    RETURN ChatAnthropic(
      api_key = call_config.apiKey,
      base_url = call_config.apiUrl,
      model = call_config.modelName,
      default_headers = headers,
      **call_config.defaultParams
    )
```

### Anthropic 协议特殊处理

对于 Anthropic 协议（包括 Anthropic 标准 API 和 Kimi Coding Plan）:

1. **认证方式**: 使用 `x-api-key` 头而非 `Authorization: Bearer`
2. **请求格式**: Anthropic Messages API (`/v1/messages`) 而非 OpenAI Chat Completions (`/v1/chat/completions`)
3. **额外 Headers**: Kimi 需要 `User-Agent: claude-code/1.0` 和 `anthropic-version: 2023-06-01`
4. **流式格式**: Anthropic SSE 格式（事件类型不同于 OpenAI）

LangChain 的 `ChatAnthropic` 类已处理前三点，只需传入正确参数。流式响应的格式转换需要在 chat 服务中适配。

### Chat 服务改造

```pseudo
// 现有: chat 路由中
llm_config = config_loader.get_llm_config(model_id)
llm = ChatOpenAI(...)

// 改造后:
call_config = config_loader.get_model_call_config(model_id)
llm = create_llm_client(call_config)
```

### Agent 服务改造

Agent 系统（auto_writer_agent, document_agent）同样需要使用 `create_llm_client`，而非直接创建 `ChatOpenAI`。

## 4. providers.json 完整内容

```pseudo
{
  "standard": [
    {
      "id": "openai",
      "name": "OpenAI",
      "apiUrl": "https://api.openai.com/v1",
      "models": [
        "gpt-4o",
        "gpt-4o-mini",
        "gpt-4-turbo",
        "gpt-3.5-turbo",
        "o1",
        "o1-mini",
        "o3",
        "o3-mini",
        "o4-mini"
      ],
      "protocol": "openai"
    },
    {
      "id": "anthropic",
      "name": "Anthropic",
      "apiUrl": "https://api.anthropic.com",
      "models": [
        "claude-opus-4-20250514",
        "claude-sonnet-4-20250514",
        "claude-haiku-4-20250414",
        "claude-3-5-sonnet-20241022",
        "claude-3-5-haiku-20241022"
      ],
      "protocol": "anthropic"
    },
    {
      "id": "gemini",
      "name": "Google Gemini",
      "apiUrl": "https://generativelanguage.googleapis.com/v1beta/openai",
      "models": [
        "gemini-2.5-flash",
        "gemini-2.5-pro",
        "gemini-2.0-flash",
        "gemini-2.0-flash-lite"
      ],
      "protocol": "openai"
    },
    {
      "id": "deepseek",
      "name": "DeepSeek",
      "apiUrl": "https://api.deepseek.com",
      "models": [
        "deepseek-chat",
        "deepseek-reasoner"
      ],
      "protocol": "openai"
    }
  ],
  "codingPlan": [
    {
      "id": "kimi",
      "name": "Kimi Coding Plan",
      "apiUrl": "https://api.kimi.com/coding",
      "model": "kimi-k2.5",
      "protocol": "anthropic",
      "extraHeaders": {
        "anthropic-version": "2023-06-01",
        "User-Agent": "claude-code/1.0"
      },
      "defaultParams": {
        "temperature": 1.0,
        "top_p": 0.95
      }
    }
  ]
}
```

## 5. Flask 蓝图注册

### 新增 providers 域

```
backend/domains/providers/
├── __init__.py
└── routes.py          # GET /api/providers
```

或者简化方案: 在现有 `model` 域中新增 `/api/providers` 路由，无需新域。

推荐简化方案 — 在 `backend/domains/model/routes.py` 中添加供应商模板路由，保持路由集中。

## 6. 错误处理

### 供应商模板找不到

当 `StandardModelConfig.providerId` 在 `providers.json` 中不存在时:
- 后端: 回退为 OpenAI 协议，使用模型自身的 `apiUrl` 和 `modelName`
- 前端: 设置面板中标记该模型为 "供应商模板已失效"

### Coding Plan 服务找不到

当 `CodingPlanModelConfig.serviceId` 在 `providers.json` 中不存在时:
- 后端: 返回错误，无法调用（缺少端点信息）
- 前端: 设置面板中禁用该模型并提示 "服务配置已失效"

### 迁移失败

- 记录详细日志
- 不删除原文件
- 使用旧的 `model-configs.json` 继续运行（兼容模式）
