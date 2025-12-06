# App.py DDD 重构文档

## 重构概述

本次重构旨在将 `backend/app.py` 文件按照领域驱动设计（DDD）模式进行重构，将原本集中在单个文件中的接口按照不同的业务领域进行划分和组织。

## 重构目标

1. **降低代码复杂度**：将3600+行的 `app.py` 文件拆分为多个领域模块
2. **提高可维护性**：按照业务领域组织代码，便于后续维护和扩展
3. **遵循DDD原则**：每个领域独立管理自己的业务逻辑和路由
4. **保持向后兼容**：确保重构过程中不影响现有功能

## 领域划分

根据业务功能，将接口划分为以下8个领域：

### 1. Chat Domain (聊天领域)
- **路径**: `backend/domains/chat/`
- **职责**: 处理AI聊天功能
- **接口**:
  - `POST/GET /api/chat` - AI聊天接口（支持流式响应）

### 2. Document Domain (文档领域)
- **路径**: `backend/domains/document/`
- **职责**: 处理文档验证和文本处理
- **接口**:
  - `POST/GET /api/document-validation` - 文档验证
  - `POST /api/text-processing` - 文本处理（润色、重写、检查）

### 3. Agent Domain (Agent领域)
- **路径**: `backend/domains/agent/`
- **职责**: 处理Agent路由、验证和执行
- **接口**:
  - `POST /api/agent-route` - Agent路由
  - `POST /api/agent-validation` - Agent验证
  - `GET /api/agents` - Agent列表
  - `POST /api/auto-writer-agent` - 自动写作Agent

### 4. Model Domain (模型领域)
- **路径**: `backend/domains/model/`
- **职责**: 管理LLM模型配置
- **接口**:
  - `GET/POST /api/model-configs` - 模型配置管理

### 5. MCP Domain (MCP领域)
- **路径**: `backend/domains/mcp/`
- **职责**: 管理Model Context Protocol服务器配置
- **接口**:
  - `GET/POST /api/mcp-configs` - MCP配置管理

### 6. Image Service Domain (图片服务领域)
- **路径**: `backend/domains/image_service/`
- **职责**: 管理图片服务配置和搜索
- **接口**:
  - `GET/POST /api/image-services/configs` - 图片服务配置
  - `POST /api/image-services/search` - 图片服务搜索

### 7. Search Service Domain (搜索服务领域)
- **路径**: `backend/domains/search_service/`
- **职责**: 管理搜索服务配置和搜索
- **接口**:
  - `GET/POST /api/search-services/configs` - 搜索服务配置
  - `POST /api/search-services/search` - 搜索服务搜索

### 8. System Domain (系统领域)
- **路径**: `backend/domains/system/`
- **职责**: 处理系统级操作
- **接口**:
  - `GET /health` - 健康检查
  - `GET /api/logs` - 日志查看

## 目录结构

```
backend/
├── app.py                          # 主应用入口（保留，但会简化）
├── domains/                        # 领域模块目录
│   ├── __init__.py
│   ├── chat/                       # Chat领域
│   │   ├── __init__.py
│   │   └── routes.py               # Chat领域路由
│   ├── document/                   # Document领域
│   │   ├── __init__.py
│   │   └── routes.py               # Document领域路由
│   ├── agent/                      # Agent领域
│   │   ├── __init__.py
│   │   └── routes.py               # Agent领域路由
│   ├── model/                      # Model领域
│   │   ├── __init__.py
│   │   └── routes.py               # Model领域路由
│   ├── mcp/                        # MCP领域
│   │   ├── __init__.py
│   │   └── routes.py               # MCP领域路由
│   ├── image_service/              # Image Service领域
│   │   ├── __init__.py
│   │   └── routes.py               # Image Service领域路由
│   ├── search_service/             # Search Service领域
│   │   ├── __init__.py
│   │   └── routes.py               # Search Service领域路由
│   └── system/                     # System领域
│       ├── __init__.py
│       └── routes.py               # System领域路由
└── ...
```

## 重构状态

### 阶段1: 入口文件创建 ✅ (已完成)

**完成时间**: 2024-12-XX

**完成内容**:
- ✅ 创建了所有8个领域的目录结构
- ✅ 为每个领域创建了 `__init__.py` 和 `routes.py` 文件
- ✅ 在每个 `routes.py` 中创建了对应的路由处理函数（入口）
- ✅ 使用Flask Blueprint组织各领域的路由
- ✅ 在 `app.py` 中注册了所有领域的Blueprint

**当前状态**:
- 所有领域的入口文件已创建
- 路由处理函数已定义，但实现仍保留在 `app.py` 中
- 路由处理函数目前返回 `501 Not Implemented`，表示实现待迁移

### 阶段2: 具体实现迁移 ⏳ (进行中)

**计划内容**:
- [x] 将 `app.py` 中的 `/api/chat` 实现迁移到 `domains/chat/routes.py` ✅ (已完成)
- [x] 将 `app.py` 中的 `/api/document-validation` 实现迁移到 `domains/document/routes.py` ✅ (已完成)
- [x] 将 `app.py` 中的 `/api/text-processing` 实现迁移到 `domains/document/routes.py` ✅ (已完成)
- [x] 将 `app.py` 中的 `/api/agent-route` 实现迁移到 `domains/agent/routes.py` ✅ (已完成)
- [x] 将 `app.py` 中的 `/api/agent-validation` 实现迁移到 `domains/agent/routes.py` ✅ (已完成)
- [x] 将 `app.py` 中的 `/api/agents` 实现迁移到 `domains/agent/routes.py` ✅ (已完成)
- [x] 将 `app.py` 中的 `/api/auto-writer-agent` 实现迁移到 `domains/agent/routes.py` ✅ (已完成)
- [x] 将 `app.py` 中的 `/api/model-configs` 实现迁移到 `domains/model/routes.py` ✅ (已完成)
- [x] 将 `app.py` 中的 `/api/mcp-configs` 实现迁移到 `domains/mcp/routes.py` ✅ (已完成)
- [x] 将 `app.py` 中的 `/api/image-services/configs` 实现迁移到 `domains/image_service/routes.py` ✅ (已完成)
- [x] 将 `app.py` 中的 `/api/image-services/search` 实现迁移到 `domains/image_service/routes.py` ✅ (已完成)
- [x] 将 `app.py` 中的 `/api/search-services/configs` 实现迁移到 `domains/search_service/routes.py` ✅ (已完成)
- [x] 将 `app.py` 中的 `/api/search-services/search` 实现迁移到 `domains/search_service/routes.py` ✅ (已完成)
- [ ] 将 `app.py` 中的 `/health` 实现迁移到 `domains/system/routes.py`
- [ ] 将 `app.py` 中的 `/api/logs` 实现迁移到 `domains/system/routes.py`

**迁移注意事项**:
1. 保持原有功能完全一致，不改变任何业务逻辑
2. 保持日志记录的详细程度和分级
3. 确保错误处理机制保持一致
4. 迁移后需要从 `app.py` 中删除对应的路由定义
5. 确保共享的依赖（如 `config_loader`）能够正确访问

#### Chat Domain 迁移详情 ✅

**完成时间**: 2024-12-19

**迁移内容**:
- ✅ 将 `/api/chat` 路由的完整实现（包括 GET 和 POST 方法）迁移到 `domains/chat/routes.py`
- ✅ 实现了流式响应支持（SSE）
- ✅ 支持 MCP 工具集成
- ✅ 支持网络搜索功能
- ✅ 从 `app.py` 中删除了已迁移的路由定义
- ✅ 通过 Flask `current_app.config` 访问 `config_loader`
- ✅ 使用模块级别的 logger，所有日志都添加了 `[Chat Domain]` 前缀以便识别

**技术实现**:
- 使用 Flask Blueprint 组织路由
- 通过 `current_app.config['config_loader']` 访问共享的配置加载器
- 保持了所有原有的业务逻辑和错误处理
- 日志记录保持详细，使用 `info`、`debug`、`warning`、`error` 等不同级别
- 所有日志消息都添加了 `[Chat Domain]` 前缀，便于日志过滤和追踪

**验证要点**:
- ✅ 路由已从 `app.py` 中移除
- ✅ 功能实现完整，包括流式响应、MCP 工具、网络搜索等
- ✅ 日志记录完整且分级合理
- ✅ 错误处理机制保持一致

#### Document Domain 迁移详情 ✅

**完成时间**: 2024-12-19

**迁移内容**:
- ✅ 将 `/api/document-validation` 路由的完整实现（包括 GET 和 POST 方法）迁移到 `domains/document/routes.py`
- ✅ 将 `/api/text-processing` 路由的完整实现迁移到 `domains/document/routes.py`
- ✅ 实现了流式响应支持（SSE）用于文档验证
- ✅ 支持多语言（中文/英文）验证提示
- ✅ 支持文本处理功能（润色、重写、检查）
- ✅ 实现了健壮的 JSON 解析逻辑（支持多种格式和 fallback）
- ✅ 从 `app.py` 中删除了已迁移的路由定义
- ✅ 通过 Flask `current_app.config` 访问 `config_loader`
- ✅ 使用模块级别的 logger，所有日志都添加了 `[Document Domain]` 前缀以便识别

**技术实现**:
- 使用 Flask Blueprint 组织路由
- 通过 `current_app.config['config_loader']` 访问共享的配置加载器
- 保持了所有原有的业务逻辑和错误处理
- 日志记录保持详细，使用 `info`、`debug`、`warning`、`error` 等不同级别
- 所有日志消息都添加了 `[Document Domain]` 前缀，便于日志过滤和追踪
- 对于文本检查功能，实现了多层次的 JSON 解析策略，包括：
  - 标准 JSON 解析
  - Markdown 代码块提取
  - JSON 对象边界查找
  - 文本结构化提取（fallback）
  - 最终 fallback 机制

**验证要点**:
- ✅ 路由已从 `app.py` 中移除
- ✅ 功能实现完整，包括流式响应、多语言支持、文本处理等
- ✅ 日志记录完整且分级合理
- ✅ 错误处理机制保持一致
- ✅ JSON 解析逻辑健壮，支持多种格式

#### Agent Domain 迁移详情 ✅

**完成时间**: 2024-12-19

**迁移内容**:
- ✅ 将 `/api/agent-validation` 路由的完整实现迁移到 `domains/agent/routes.py`
- ✅ 将 `/api/agents` 路由的完整实现迁移到 `domains/agent/routes.py`
- ✅ 将 `/api/agent-route` 路由的完整实现迁移到 `domains/agent/routes.py`
- ✅ 将 `/api/auto-writer-agent` 路由的完整实现迁移到 `domains/agent/routes.py`
- ✅ 实现了流式响应支持（SSE）用于所有 Agent 执行
- ✅ 支持 Agent 路由功能（自动选择 auto-writer 或 document-modifier）
- ✅ 支持 Agent 列表查询功能
- ✅ 支持文档修改 Agent 和自动写作 Agent
- ✅ 从 `app.py` 中删除了所有已迁移的路由定义
- ✅ 通过 Flask `current_app.config` 访问 `config_loader`
- ✅ 使用模块级别的 logger，所有日志都添加了 `[Agent Domain]` 前缀以便识别

**技术实现**:
- 使用 Flask Blueprint 组织路由
- 通过 `current_app.config['config_loader']` 访问共享的配置加载器
- 保持了所有原有的业务逻辑和错误处理
- 日志记录保持详细，使用 `info`、`debug`、`warning`、`error` 等不同级别
- 所有日志消息都添加了 `[Agent Domain]` 前缀，便于日志过滤和追踪
- 处理了 agent 模块的导入路径问题，确保在开发环境和打包环境中都能正常工作
- 实现了完整的错误处理和异常捕获机制

**验证要点**:
- ✅ 所有路由已从 `app.py` 中移除
- ✅ 功能实现完整，包括 Agent 路由、验证、列表查询、自动写作等
- ✅ 日志记录完整且分级合理
- ✅ 错误处理机制保持一致
- ✅ Agent 模块导入路径处理正确

#### Model Domain 迁移详情 ✅

**完成时间**: 2024-12-19

**迁移内容**:
- ✅ 将 `/api/model-configs` 路由的完整实现（包括 GET 和 POST 方法）迁移到 `domains/model/routes.py`
- ✅ 实现了模型配置的获取和保存功能
- ✅ 支持模型配置的验证（必填字段检查）
- ✅ 支持自动添加时间戳（createdAt、updatedAt）
- ✅ 从 `app.py` 中删除了已迁移的路由定义
- ✅ 通过 Flask `current_app.config` 访问 `config_loader`
- ✅ 使用模块级别的 logger，所有日志都添加了 `[Model Domain]` 前缀以便识别

**技术实现**:
- 使用 Flask Blueprint 组织路由
- 通过 `current_app.config['config_loader']` 访问共享的配置加载器
- 保持了所有原有的业务逻辑和错误处理
- 日志记录保持详细，使用 `info`、`debug`、`warning`、`error` 等不同级别
- 所有日志消息都添加了 `[Model Domain]` 前缀，便于日志过滤和追踪
- 实现了完整的模型配置验证逻辑，包括必填字段检查和数据格式验证

**验证要点**:
- ✅ 路由已从 `app.py` 中移除
- ✅ 功能实现完整，包括模型配置的获取和保存
- ✅ 日志记录完整且分级合理
- ✅ 错误处理机制保持一致
- ✅ 模型配置验证逻辑完整

#### MCP Domain 迁移详情 ✅

**完成时间**: 2024-12-19

**迁移内容**:
- ✅ 将 `/api/mcp-configs` 路由的完整实现（包括 GET 和 POST 方法）迁移到 `domains/mcp/routes.py`
- ✅ 实现了 MCP 配置的获取和保存功能
- ✅ 支持 MCP 配置的验证（必填字段检查）
- ✅ 支持自动添加时间戳（createdAt、updatedAt）
- ✅ 实现了强制禁用所有 MCP 服务器的逻辑（确保进入软件时默认关闭）
- ✅ 支持默认配置创建（包含 tavily-ai-tavily-mcp 和 caiyili-baidu-search-mcp）
- ✅ 从 `app.py` 中删除了已迁移的路由定义
- ✅ 实现了独立的配置路径处理函数 `_get_mcp_config_path()`，支持 Electron、打包和开发环境
- ✅ 使用模块级别的 logger，所有日志都添加了 `[MCP Domain]` 前缀以便识别

**技术实现**:
- 使用 Flask Blueprint 组织路由
- 实现了独立的配置路径处理逻辑，支持 Electron、打包和开发环境
- 保持了所有原有的业务逻辑和错误处理
- 日志记录保持详细，使用 `info`、`debug`、`warning`、`error` 等不同级别
- 所有日志消息都添加了 `[MCP Domain]` 前缀，便于日志过滤和追踪
- 实现了完整的 MCP 配置验证逻辑，包括必填字段检查和数据格式验证
- 实现了强制禁用所有 MCP 服务器的逻辑，确保进入软件时默认关闭

**验证要点**:
- ✅ 路由已从 `app.py` 中移除
- ✅ 功能实现完整，包括 MCP 配置的获取和保存
- ✅ 日志记录完整且分级合理
- ✅ 错误处理机制保持一致
- ✅ MCP 配置验证逻辑完整
- ✅ 强制禁用逻辑正常工作

#### Image Service Domain 迁移详情 ✅

**完成时间**: 2024-12-19

**迁移内容**:
- ✅ 将 `/api/image-services/configs` 路由的完整实现（包括 GET 和 POST 方法）迁移到 `domains/image_service/routes.py`
- ✅ 将 `/api/image-services/search` 路由的完整实现迁移到 `domains/image_service/routes.py`
- ✅ 实现了图片服务配置的获取和保存功能
- ✅ 支持图片服务配置的验证（必填字段检查）
- ✅ 支持自动添加时间戳（createdAt、updatedAt）
- ✅ 实现了图片搜索功能（支持 Unsplash API）
- ✅ 支持默认配置创建（包含 Unsplash 服务）
- ✅ 从 `app.py` 中删除了已迁移的路由定义
- ✅ 实现了独立的配置路径处理函数 `_get_image_service_config_path()`，支持 Electron、打包和开发环境
- ✅ 使用模块级别的 logger，所有日志都添加了 `[Image Service Domain]` 前缀以便识别

**技术实现**:
- 使用 Flask Blueprint 组织路由
- 实现了独立的配置路径处理逻辑，支持 Electron、打包和开发环境
- 保持了所有原有的业务逻辑和错误处理
- 日志记录保持详细，使用 `info`、`debug`、`warning`、`error` 等不同级别
- 所有日志消息都添加了 `[Image Service Domain]` 前缀，便于日志过滤和追踪
- 实现了完整的图片服务配置验证逻辑，包括必填字段检查和数据格式验证
- 支持 Unsplash API 图片搜索，包括分页、API 密钥轮换等功能

**验证要点**:
- ✅ 路由已从 `app.py` 中移除
- ✅ 功能实现完整，包括图片服务配置的获取和保存、图片搜索等
- ✅ 日志记录完整且分级合理
- ✅ 错误处理机制保持一致
- ✅ 图片服务配置验证逻辑完整
- ✅ Unsplash API 集成正常工作

#### Search Service Domain 迁移详情 ✅

**完成时间**: 2024-12-19

**迁移内容**:
- ✅ 将 `/api/search-services/configs` 路由的完整实现（包括 GET 和 POST 方法）迁移到 `domains/search_service/routes.py`
- ✅ 将 `/api/search-services/search` 路由的完整实现迁移到 `domains/search_service/routes.py`
- ✅ 实现了搜索服务配置的获取和保存功能
- ✅ 支持搜索服务配置的验证（必填字段检查）
- ✅ 支持自动添加时间戳（createdAt、updatedAt）
- ✅ 实现了搜索功能（支持 Tavily API）
- ✅ 支持默认配置创建（包含 Tavily 服务）
- ✅ 从 `app.py` 中删除了已迁移的路由定义
- ✅ 实现了独立的配置路径处理函数 `_get_search_service_config_path()`，支持 Electron、打包和开发环境
- ✅ 使用模块级别的 logger，所有日志都添加了 `[Search Service Domain]` 前缀以便识别

**技术实现**:
- 使用 Flask Blueprint 组织路由
- 实现了独立的配置路径处理逻辑，支持 Electron、打包和开发环境
- 保持了所有原有的业务逻辑和错误处理
- 日志记录保持详细，使用 `info`、`debug`、`warning`、`error` 等不同级别
- 所有日志消息都添加了 `[Search Service Domain]` 前缀，便于日志过滤和追踪
- 实现了完整的搜索服务配置验证逻辑，包括必填字段检查和数据格式验证
- 支持 Tavily API 搜索，包括 API 密钥轮换、结果格式化等功能

**验证要点**:
- ✅ 路由已从 `app.py` 中移除
- ✅ 功能实现完整，包括搜索服务配置的获取和保存、搜索功能等
- ✅ 日志记录完整且分级合理
- ✅ 错误处理机制保持一致
- ✅ 搜索服务配置验证逻辑完整
- ✅ Tavily API 集成正常工作

### 阶段3: 共享服务提取 ⏳ (待进行)

**计划内容**:
- [ ] 提取 `ConfigLoader` 类到共享服务模块
- [ ] 提取日志配置函数到共享服务模块
- [ ] 创建领域服务基类（如果需要）
- [ ] 确保各领域能够正确访问共享服务

### 阶段4: 清理和优化 ⏳ (待进行)

**计划内容**:
- [ ] 从 `app.py` 中删除所有已迁移的路由
- [ ] 清理 `app.py` 中不再需要的导入
- [ ] 优化各领域的代码结构
- [ ] 添加单元测试
- [ ] 更新文档

## 技术实现细节

### Flask Blueprint 使用

每个领域使用Flask Blueprint来组织路由：

```python
from flask import Blueprint

# 创建blueprint
domain_bp = Blueprint('domain_name', __name__, url_prefix='/api')

# 定义路由
@domain_bp.route('/endpoint', methods=['POST'])
def handler():
    # 处理逻辑
    pass
```

### 日志记录

每个领域使用独立的logger：

```python
import logging

logger = logging.getLogger(__name__)

logger.info('[Domain Name] Message')
logger.debug('[Domain Name] Debug message')
logger.error('[Domain Name] Error message', exc_info=True)
```

### 依赖注入

共享的服务（如 `ConfigLoader`）通过以下方式访问：
- 在 `app.py` 中初始化
- 通过Flask的 `current_app` 或全局变量访问
- 或者通过依赖注入的方式传递给各领域

## 重构原则

1. **渐进式重构**：分阶段进行，确保每个阶段都能正常运行
2. **向后兼容**：保持所有API接口不变
3. **单一职责**：每个领域只负责自己的业务逻辑
4. **依赖最小化**：领域之间尽量减少耦合
5. **日志完整性**：保持详细的日志记录，合理分级

## 注意事项

1. **Electron兼容性**：确保重构后的代码在Electron打包后能正常运行
2. **路径处理**：注意开发环境和打包环境的路径差异
3. **导入路径**：确保所有导入路径在打包后能正确解析
4. **配置管理**：确保配置文件的路径处理逻辑保持一致

## 下一步计划

1. 按照领域优先级，逐个迁移实现代码
2. 每个领域迁移完成后进行测试
3. 提取共享服务，减少代码重复
4. 清理 `app.py`，使其只保留应用初始化和Blueprint注册

## 更新记录

- **2024-12-19**: 创建重构文档，完成阶段1（入口文件创建）
- **2024-12-19**: 完成 Chat Domain 的迁移（阶段2的第一个领域）
- **2024-12-19**: 完成 Document Domain 的迁移（阶段2的第二个领域）
- **2024-12-19**: 完成 Agent Domain 的迁移（阶段2的第三个领域）
- **2024-12-19**: 完成 Model Domain 的迁移（阶段2的第四个领域）
- **2024-12-19**: 完成 MCP Domain 的迁移（阶段2的第五个领域）
- **2024-12-19**: 完成 Image Service Domain 的迁移（阶段2的第六个领域）
- **2024-12-19**: 完成 Search Service Domain 的迁移（阶段2的第七个领域）

