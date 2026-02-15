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

## Architecture Overview

### Multi-Agent AI System

AIDocMaster uses LangGraph to orchestrate specialized AI agents through an intelligent routing system:

**AgentRouter** (`backend/agent/agent_router.py`)
- LLM-powered intent analysis to route requests to appropriate agents
- Analyzes user intent and document context
- Returns structured routing decision with reasoning

**AutoWriterAgent** (`backend/agent/auto_writer_agent.py`)
- Creates documents from scratch using multi-step LangGraph workflow:
  1. Intent detection and parameter extraction
  2. Outline generation
  3. Parallel section drafting (concurrent execution)
  4. Document refinement and compilation
- Uses custom state management with typed LangGraph StateGraph

**DocumentModifierAgent** (`backend/agent/document_agent.py`)
- Modifies existing documents through three-phase workflow:
  1. Planning: Analyzes user commands and creates modification plan
  2. Execution: Uses tools to search, modify, add, delete content
  3. Summarization: Explains changes made
- Operates on HTML-based document representation

### System Flow

```
User Interface (React/Next.js)
    ↓ HTTP POST
Next.js API Routes (/app/api/*)
    ↓ Proxy with streaming
Flask Backend (port 5000)
    ↓ Domain blueprints
Domain Services (DDD)
    ├── Chat Service → LLM + MCP tools
    ├── Agent Service → LangGraph workflows
    ├── Document Service → Parser (Word/PDF)
    └── Configuration Services (Model, MCP, Search, Image)
```

### Backend Domain-Driven Design

Flask app (`backend/app.py`) registers domain blueprints from `backend/domains/`:
- `chat/` - Chat with LLM and streaming SSE responses
- `agent/` - Agent routing and execution
- `document/` - Document parsing (Word, PDF) and processing
- `model/` - LLM model configuration (stored in `backend/config/models.json`)
- `mcp/` - Model Context Protocol server management
- `image_service/` - Image generation service integration
- `search_service/` - Web search provider integration (Tavily, Baidu)
- `system/` - System health and status

Each domain has its own `routes.py` with Flask blueprint registration.

### Frontend Architecture

**Component Organization:**
- `components/` - All React UI components (flat structure)
  - Taskbar-based multi-task interface (chat, document editor, auto-writer, settings)
  - TipTap v3 WYSIWYG editor with custom extensions
  - Streaming chat with SSE response handling
- `app/api/` - Next.js API routes that proxy to Flask backend
- `lib/` - Shared utilities and configuration clients
  - `apiConfig.ts` - Builds API URLs for development vs production vs Electron
  - `logger.ts` - Custom structured logging (USE THIS, not console.log)
  - Configuration clients for models, MCP, search, image services

**State Management:**
- React hooks (useState, useEffect, useCallback, useRef)
- No global state library; component-local state with prop drilling
- Persistent storage via localStorage for chat history and settings

**Styling:**
- Tailwind CSS 4 exclusively (NO CSS files or inline styles)
- Use `cn()` utility from `@/lib/utils` for conditional classes
- Custom theme system with CSS variables

### Electron Desktop Packaging

The app packages as a Windows desktop application with embedded Python:
- `electron/main.js` - Main process that spawns Flask subprocess
- `python-embed/` - Embedded Python runtime (bundled via `scripts/bundle-python.js`)
- `backend/` - Copied into `resources/backend` in packaged app
- Flask runs as subprocess on dynamic port (communicated via IPC)

**Key packaging scripts:**
- `scripts/bundle-python.js` - Creates python-embed directory with dependencies
- `scripts/build-desktop.js` - Orchestrates Next.js build + Electron Builder
- `scripts/verify-desktop-setup.js` - Pre-build validation

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

### Naming & Style (from .cursor/rules)
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

### Configuration Files
- `backend/config/models.json` - LLM model configurations
- `backend/mcp_config.json` - MCP server definitions
- `backend/config/search_config.json` - Search provider settings
- `backend/config/image_config.json` - Image service settings

## Key Integration Points

### API Routes Pattern
Next.js API routes (`/app/api/chat/route.ts`, etc.) act as proxies:
1. Accept request from frontend
2. Forward to Flask backend via `buildApiUrl()` from `@/lib/apiConfig`
3. Stream SSE responses back to client
4. Handle CORS and error transformation

### Streaming Responses
- Backend uses Flask SSE: `data: {...}\n\n` format
- Frontend uses `ReadableStream` with TextDecoder
- Message types: `content` (chunks), `complete` (done), `error`, `tool_use`, `citation`

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
```

### Production/Electron
- Settings stored in `backend/config/*.json`
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

## Project Index

This project has a pre-generated index for quick codebase understanding.

- **Location:** `.claude-index/index.md`
- **Last Updated:** 2026-02-16
- **Contents:** Project overview, feature map, file index, exported symbols, module dependencies

**Usage:** Read `.claude-index/index.md` to quickly understand the project structure before making changes. The index provides a navigation map of the codebase without needing to explore every file.

**Regenerate:** Say "regenerate index" or "更新索引" to update the index after major changes.
