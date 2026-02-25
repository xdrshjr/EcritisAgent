# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Commands

### Development
```bash
# Frontend development (Next.js on port 3000)
npm run dev

# Backend development (Flask on port 5000)
cd backend && python app.py

# Full-stack Electron development
npm run electron:dev
```

### Testing
```bash
# Run all frontend tests (Vitest)
npm test

# Run specific test file
npx vitest run <test-file-path>

# Run backend tests (pytest)
cd backend && pytest

# Run specific backend test
cd backend && pytest <test-file-path>
```

### Build & Package
```bash
# Production web build
npm run build && npm start

# Desktop application workflow
npm run bundle:python     # Bundle Python backend first
npm run verify:desktop    # Verify desktop setup
npm run build:desktop     # Build Electron app (outputs to dist/)
```

### Code Quality
```bash
npm run lint              # ESLint check
```

### Prerequisites
- Node.js 20+ (frontend and Electron)
- Python 3.8+ (backend AI agents)

## Architecture Overview

### System Flow

```
User Interface (React/Next.js)
    ↓ HTTP POST
Next.js API Routes (/app/api/*)
    ↓ Proxy with streaming
Flask Backend (port 5000)
    ↓ Domain blueprints
Domain Services (DDD)
    ├── Chat Service → LLM Factory → OpenAI/Anthropic protocols
    ├── Agent Service → LangGraph workflows
    ├── Document Service → Parser (Word/PDF)
    └── Configuration Services (Model, MCP, Search, Image)
```

### Multi-Agent AI System

AIDocMaster uses LangGraph to orchestrate specialized AI agents through an intelligent routing system:

**AgentRouter** (`backend/agent/agent_router.py`)
- LLM-powered intent analysis to route requests to appropriate agents
- Returns structured routing decision with reasoning

**AutoWriterAgent** (`backend/agent/auto_writer_agent.py`)
- Creates documents from scratch using multi-step LangGraph workflow:
  1. Intent detection and parameter extraction
  2. Outline generation
  3. Parallel section drafting (concurrent execution)
  4. Document refinement and compilation

**DocumentModifierAgent** (`backend/agent/document_agent.py`)
- Modifies existing documents through three-phase workflow:
  1. Planning: Analyzes user commands and creates modification plan
  2. Execution: Uses tools to search, modify, add, delete content
  3. Summarization: Explains changes made

### Pi-Agent Coding Mode

A standalone AI coding agent built on `@mariozechner/pi-agent-core` / `@mariozechner/pi-coding-agent`. Unlike the LangGraph document agents, this mode runs an autonomous agent loop that can read/write files and execute shell commands in a user-specified working directory.

**API Routes** (`app/api/agent-chat/`)
- `POST /api/agent-chat` — Runs the pi-agent loop; streams `AgentEvent` objects back as SSE
- `GET /api/agent-chat/home-dir` — Returns the user's home directory
- `POST /api/agent-chat/validate-dir` — Validates that a path is an accessible directory
- `GET /api/agent-file` — File reading utility for the agent UI

**Agent Tools** (`lib/agentTools.ts`)
- `createAgentTools(workDir)` — Wraps `createCodingTools(workDir)` (read, bash, edit, write) plus `grep`, `find`, `ls` from pi-coding-agent; all tools are bound to the working directory

**Pi-Agent Lib Utilities:**
- `lib/agentConfig.ts` — Working directory persistence in localStorage (`aidocmaster.agentWorkDir`, `aidocmaster.agentRecentDirs`); emits `aidocmaster_agent_config_updated` custom event
- `lib/agentEventMapper.ts` — Converts pi-agent `AgentEvent` objects to SSE frames for streaming
- `lib/agentStreamParser.ts` — Frontend SSE parser for agent event streams
- `lib/agentLlmAdapter.ts` — Adapts app model configs to `pi-ai` `Model` + `StreamOptions`
- `lib/agentExecutionBlock.ts` — Execution block state tracking for the UI timeline

**New Components:**
- `AgentWorkDirDialog.tsx` — Modal for choosing the working directory (Electron native dialog → Web File System Access API → manual input fallback)
- `AgentSettingsPanel.tsx` — Settings panel for default work dir and recent dirs list

**Electron IPC** (added to `window.electronAPI`):
- `selectDirectory()` — Opens native folder picker
- `getHomeDir()` — Returns user home directory
- `validateDirectory(path)` — Checks that a path is an accessible directory

### Multi-Type Model System

The system supports three model types via a discriminated union pattern:

| Type | Description | Storage | Example |
|------|-------------|---------|---------|
| `standard` | Pre-configured API providers | `userData/standard-models.json` | OpenAI, Anthropic, Gemini, DeepSeek |
| `codingPlan` | Special protocol services | `userData/coding-plan-models.json` | Kimi K2.5 (Anthropic protocol) |
| `custom` | Fully custom/self-hosted models | `userData/custom-models.json` | Any OpenAI-compatible endpoint |

**Provider templates** are read-only definitions in `backend/config/providers.json` that supply API URLs, available models, protocol type, and default parameters for standard and codingPlan types.

**Legacy migration**: Old `userData/model-configs.json` is auto-migrated to `userData/custom-models.json` on first run (backup created as `.bak`).

### Protocol-Aware LLM Factory (`backend/llm_factory.py`)

Central factory that creates LLM clients based on the `protocol` field in model config:

- **`protocol: 'openai'`** → `ChatOpenAI` (LangChain) or OpenAI Chat Completions HTTP format
- **`protocol: 'anthropic'`** → `ChatAnthropic` (LangChain) or Anthropic Messages API HTTP format

Key functions:
- `create_llm_client(call_config)` — Creates LangChain chat model for agent workflows
- `build_http_request(call_config, messages)` — Builds raw HTTP request tuple for streaming pass-through
- `iter_anthropic_as_openai_sse(response)` — Converts Anthropic streaming responses to OpenAI-compatible SSE so the frontend doesn't need protocol-specific parsing

The `call_config` dict structure:
```python
{
    'apiKey': str,
    'apiUrl': str,
    'modelName': str,
    'protocol': 'openai' | 'anthropic',
    'extraHeaders': dict,      # Optional, for Anthropic-protocol APIs
    'defaultParams': dict,     # Optional (temperature, top_p, etc.)
    'timeout': int
}
```

### ConfigLoader (`backend/app.py`)

The `ConfigLoader` class manages multi-file model storage:
- `load_models_by_type(type)` / `save_models_by_type(type, data)` — Per-type CRUD
- `get_llm_config(model_id=None)` — Resolves full call config with protocol, merging provider template data for codingPlan models
- `set_default_model(model_id)` — Sets global default across all type files
- `load_providers()` — Returns read-only provider templates

### Backend Domain-Driven Design

Flask app (`backend/app.py`) registers domain blueprints from `backend/domains/`:
- `chat/` - Chat with LLM and streaming SSE responses (uses `llm_factory` for protocol-aware requests)
- `agent/` - Agent routing and execution
- `document/` - Document parsing (Word, PDF) and processing
- `model/` - LLM model configuration with per-type and cross-type endpoints
- `mcp/` - Model Context Protocol server management
- `image_service/` - Image generation service integration
- `search_service/` - Web search provider integration (Tavily, Baidu)
- `system/` - System health and status

### Frontend Architecture

**Component Organization:**
- `components/` - All React UI components (flat structure)
  - Taskbar-based multi-task interface (chat, document editor, auto-writer, settings)
  - TipTap v3 WYSIWYG editor with custom extensions
  - Streaming chat with SSE response handling
- `app/api/` - Next.js API routes (Flask proxies + pi-agent routes)
  - `agent-chat/` - Pi-agent coding mode routes (run agent loop, home dir, validate dir)
  - `agent-file/` - File reading for agent UI
- `lib/` - Shared utilities and configuration clients
  - `apiConfig.ts` - Builds API URLs for development vs production vs Electron
  - `logger.ts` - Custom structured logging (USE THIS, not console.log)
  - `modelConfig.ts` - Model configuration with discriminated union types and type guards
  - `agentConfig.ts` - Pi-agent working directory persistence (localStorage)
  - `agentTools.ts` - Pi-agent tool factory (read, bash, edit, write, grep, find, ls)
  - `agentEventMapper.ts` - Maps pi-agent events to SSE frames
  - `agentLlmAdapter.ts` - Adapts model configs to pi-ai protocol
  - `agentStreamParser.ts` - Frontend parser for agent SSE streams
  - `agentExecutionBlock.ts` - Execution block state for agent UI timeline

**Frontend Model Types** (`lib/modelConfig.ts`):
```typescript
type ModelType = 'standard' | 'codingPlan' | 'custom';
type ModelConfig = StandardModelConfig | CodingPlanModelConfig | CustomModelConfig;

// Type guards
isStandardModel(m)  / isCodingPlanModel(m) / isCustomModel(m)
// Field accessors (handle type differences)
getModelApiUrl(m)   / getModelName(m)
// Per-type API
loadModelConfigsByType(type) / saveModelConfigsByType(type, data)
loadProviders()              / getLLMConfigFromModel(m)
```

**State Management:**
- React hooks (useState, useEffect, useCallback, useRef)
- No global state library; component-local state with prop drilling
- Persistent storage via localStorage for chat history and settings
- Model config emits `docaimaster_model_configs_updated` event on changes

**Styling:**
- Tailwind CSS 4 exclusively (NO CSS files or inline styles)
- Use `cn()` utility from `@/lib/utils` for conditional classes
- Custom theme system with CSS variables

**Internationalization (i18n):**
- Custom dictionary-based system in `lib/i18n/dictionaries.ts` (EN/ZH)
- `LanguageProvider` context (`lib/i18n/LanguageContext.tsx`) wraps the app
- Use `useLanguage()` hook to get current locale, then look up strings from dictionaries

### Electron Desktop Packaging

The app packages as a Windows desktop application with embedded Python:
- `electron/main.js` - Main process that spawns Flask subprocess
- `python-embed/` - Embedded Python runtime (bundled via `scripts/bundle-python.js`)
- Flask runs as subprocess on dynamic port (communicated via IPC)

## Frontend Code Standards

### TypeScript & Imports
- Strict mode enabled - all code must be fully typed
- Use interfaces for object shapes, type for unions/primitives
- Import order: React → External libs → Internal (@/lib, @/components) → Relative → Type imports

### Component Structure
```tsx
'use client';
import { useState, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { logger } from '@/lib/logger';

interface ComponentProps {
  prop: string;
}

const Component = ({ prop }: ComponentProps) => {
  const [state, setState] = useState('');

  const handleClick = useCallback(() => {
    logger.info('Button clicked', { prop }, 'Component');
  }, [prop]);

  return <div className={cn('base', state && 'active')}>{prop}</div>;
};

export default Component;
```

### Naming & Style
- Event handlers: "handle" prefix (handleClick, handleSubmit, handleKeyDown)
- Variables: descriptive names (isLoading, streamingContent, not l, sc)
- Use early returns to reduce nesting
- Prefer `const` arrow functions over function declarations
- Add accessibility: tabIndex, aria-label, onClick, onKeyDown on interactive elements

### Error Handling
```tsx
try {
  const response = await fetch(url);
} catch (error) {
  logger.error('API request failed', {
    error: error instanceof Error ? error.message : 'Unknown error',
    url
  }, 'ComponentName');
  setError('User-facing error message');
}
```

### Testing (Vitest)
- Tests in `components/__tests__/`
- Setup file: `vitest.setup.ts` (imports `@testing-library/jest-dom/vitest`)
- Environment: jsdom with `@` path alias resolved to project root
- Mock logger: `vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn() } }))`
- Use `@testing-library/react` for component tests

## Backend Code Standards

### Python Structure
- Type hints required (function signatures, return types)
- Use logging module, not print (except for critical startup messages)
- Structured logging with context: `logger.info(msg, extra={'key': value})`

### LangChain/LangGraph Patterns
- Define state with TypedDict for LangGraph workflows
- Use StateGraph with clear node definitions
- Streaming with `astream_events()` for real-time UI updates
- Tool definitions use `@tool` decorator from langchain-core
- Use `llm_factory.create_llm_client()` to get LangChain chat models (not direct ChatOpenAI/ChatAnthropic)

### Configuration Files
- `backend/config/providers.json` - Read-only provider/service templates (API URLs, models, protocols)
- `backend/mcp_config.json` - MCP server definitions
- `backend/config/search_config.json` - Search provider settings
- `backend/config/image_config.json` - Image service settings
- `userData/standard-models.json` - Standard API provider model configs
- `userData/coding-plan-models.json` - Coding Plan service model configs
- `userData/custom-models.json` - Custom/self-hosted model configs

## Key Integration Points

### API Routes Pattern
Next.js API routes (`/app/api/chat/route.ts`, etc.) act as proxies:
1. Accept request from frontend
2. Forward to Flask backend via `buildApiUrl()` from `@/lib/apiConfig`
3. Stream SSE responses back to client
4. Handle CORS and error transformation

### Model API Endpoints
- `GET/POST /api/model-configs` — All models (merged view across types)
- `GET/POST /api/model-configs/<type>` — Per-type model CRUD (`standard`, `codingPlan`, `custom`)
- `POST /api/model-configs/default` — Set global default model (cross-file)
- `GET /api/providers` — Read-only provider templates

### Streaming Responses
- Backend uses Flask SSE: `data: {...}\n\n` format
- Anthropic-protocol responses are converted to OpenAI SSE format via `iter_anthropic_as_openai_sse()`
- Frontend uses `ReadableStream` with TextDecoder (protocol-agnostic)
- Message types: `content` (chunks), `complete` (done), `error`, `tool_use`, `citation`
- Chat requests accept optional `modelId` parameter to select a specific model

### MCP Tool Integration
- Backend MCP client (`backend/mcp_client.py`) connects to external servers
- Frontend selects tools via `MCPToolSelector` component
- Tools passed to LLM as available functions in chat context

### Document Processing
- Import: Word files parsed via mammoth.js (frontend) or python-docx (backend)
- Export: docx library generates Word files from HTML/TipTap JSON
- Format preservation: TipTap JSON → HTML → DOCX with style mapping

## Environment & Configuration

### Development Environment Variables
Create `.env.local`:
```env
LLM_API_KEY=your_api_key
LLM_API_URL=https://api.openai.com/v1
LLM_MODEL_NAME=gpt-4
LLM_API_TIMEOUT=30000
```

### Production/Electron
- Model configs stored in `userData/*.json` (per-type files)
- Other settings in `backend/config/*.json`
- Managed via Settings UI (React) → API routes → Flask domain services
- Electron uses app data directory for config persistence

## Important Notes

1. **API URL Construction**: Always use `buildApiUrl()` from `@/lib/apiConfig` - handles dev/prod/Electron environment differences
2. **Logging**: Use custom logger (`@/lib/logger` or Python logging), never console.log/print
3. **No CSS Files**: All styling via Tailwind classes; use `cn()` for conditionals
4. **Agent Selection**: User requests automatically routed via AgentRouter; don't hardcode agent selection
5. **Streaming**: All LLM interactions use streaming for real-time feedback
6. **Desktop Builds**: Must run `npm run bundle:python` before `build:desktop`
7. **Type Safety**: TypeScript strict mode - all function signatures and props must be typed
8. **LLM Clients**: Always use `llm_factory` to create LLM clients — never instantiate `ChatOpenAI`/`ChatAnthropic` directly
9. **Model Types**: When working with model configs, use the discriminated union type guards (`isStandardModel`, etc.) rather than checking fields manually
10. **Pi-Agent Tools**: Never instantiate pi-agent tools directly — always use `createAgentTools(workDir)` from `lib/agentTools.ts` to get the full tool set bound to the correct directory

## Project Index

This project has a pre-generated index for quick codebase understanding.

- **Location:** `.claude-index/index.md`
- **Last Updated:** 2026-02-25
- **Contents:** Project overview, feature map, file index, exported symbols, module dependencies

**Usage:** Read `.claude-index/index.md` to quickly understand the project structure before making changes. The index provides a navigation map of the codebase without needing to explore every file.

**Regenerate:** Say "regenerate index" or "更新索引" to update the index after major changes.
