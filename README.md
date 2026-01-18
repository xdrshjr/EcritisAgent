# AIDocMaster

> AI-powered document creation, editing, and intelligent assistant

[中文文档](./README.zh-CN.md)

![202059.png](imgs/202059.png)


## Overview

AIDocMaster is a sophisticated desktop application that combines multi-agent AI architecture with professional document editing capabilities. Built with Next.js, React, and Flask, it offers three core experiences: AI Chat with MCP tool integration, intelligent document editing with AI-powered validation, and automatic document generation from natural language prompts.

The application leverages LangChain and LangGraph to orchestrate specialized AI agents that can understand user intent, create documents from scratch, or intelligently modify existing content through natural language commands.

## Features

- 🤖 **Multi-Agent AI System** - Intelligent routing between AutoWriter and DocumentModifier agents using LangGraph workflows
- 💬 **AI Chat Interface** - Multi-conversation chat with streaming responses, MCP tool integration, and web search capabilities
- ✍️ **AI Auto-Writer** - Generate complete documents from natural language prompts with customizable tone, audience, and structure
- 📝 **Smart Document Editor** - TipTap-powered WYSIWYG editor with AI-powered modification and validation
- 🔄 **Format Preservation** - Seamless Word document (.docx) import/export with formatting integrity
- 🌐 **Multi-Model Support** - Compatible with any OpenAI-compatible API (Qwen, DeepSeek, GPT-4, etc.)
- 🔌 **MCP Integration** - Extensible tool system using Model Context Protocol for external services
- 🎨 **Modern UI** - Clean, taskbar-based interface with resizable split panels and real-time streaming feedback
- 🌍 **Bilingual Support** - Full English and Chinese localization with i18next
- 🖥️ **Desktop Application** - Cross-platform Electron app with offline capability

## Technology Stack

### Frontend
- **Framework**: Next.js 16 with App Router
- **UI Library**: React 19 with hooks-based state management
- **Desktop**: Electron 28 with custom API server
- **Editor**: TipTap v3 (professional WYSIWYG)
- **Styling**: Tailwind CSS 4 with custom theme system
- **Document**: mammoth.js (Word parsing), docx (export)
- **Markdown**: marked + react-markdown with syntax highlighting
- **TypeScript**: Full type safety across codebase
- **Icons**: Lucide React

### Backend
- **Framework**: Flask 3.0 with CORS support
- **AI Framework**: LangChain + LangGraph for agent orchestration
- **LLM Integration**: OpenAI-compatible API client
- **Document Processing**: PyPDF2, pdfplumber, python-docx
- **MCP**: Model Context Protocol client for tool integration
- **Architecture**: Domain-Driven Design (DDD) with service separation
- **Logging**: Python logging with file rotation

### Build & Distribution
- **Package Manager**: npm
- **Build Tool**: Electron Builder for Windows
- **Python Bundler**: Custom bundling script for backend dependencies

## Architecture

### Multi-Agent System

AIDocMaster employs an intelligent agent routing system powered by LangGraph:

1. **AgentRouter** - LLM-based routing that analyzes user intent and selects the appropriate agent
2. **AutoWriterAgent** - Generates complete documents from scratch with multi-step workflow:
   - Intent detection and parameter extraction
   - Outline generation
   - Parallel section drafting
   - Document refinement and compilation
3. **DocumentModifierAgent** - Intelligently modifies existing documents:
   - Planning phase (analyzes user commands)
   - Execution phase (uses tools to search, modify, add, delete content)
   - Summarization phase (explains changes made)

### System Architecture

```
Frontend (Next.js/React + Electron)
    ↓ HTTP/SSE
Next.js API Routes (Proxy)
    ↓ Streaming
Flask Backend (Port 5000)
    ├── Domain Services (DDD)
    │   ├── Chat Service (LLM + MCP)
    │   ├── Agent Services (AutoWriter, Modifier)
    │   ├── Document Parser (Word, PDF)
    │   ├── Model Configuration
    │   └── Search/Image Services
    └── LangGraph Workflows
```

## Getting Started

### Prerequisites

- **Node.js** 20+ (for frontend and Electron)
- **Python** 3.8+ (for backend AI agents)
- **npm** or **yarn** package manager

### Installation

1. Clone the repository:

```bash
git clone <repository-url>
cd AIDocMaster
```

2. Install frontend dependencies:

```bash
npm install
```

3. Install Python backend dependencies:

```bash
cd backend
pip install -r requirements.txt
cd ..
```

4. Set up environment variables:

```bash
cp .env.example .env.local
```

Edit `.env.local` and configure your LLM API settings:

```env
# LLM API Configuration (OpenAI-compatible)
LLM_API_KEY=your_api_key_here
LLM_API_URL=https://api.openai.com/v1
LLM_MODEL_NAME=gpt-4
LLM_API_TIMEOUT=30000

# Optional: MCP Server Configuration
MCP_SERVER_ENABLED=true
MCP_CONFIG_PATH=./backend/mcp_config.json
```

### Development

#### Running Full Stack in Development

1. Start the Flask backend:

```bash
cd backend
python app.py
```

The backend will run on `http://localhost:5000`

2. In a separate terminal, start the Next.js frontend:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

#### Running with Electron

```bash
npm run electron:dev
```

This will launch both the development server and Electron window concurrently.

### Build

#### Web Application Build

Create a production build:

```bash
npm run build
```

Start the production server:

```bash
npm start
```

#### Desktop Application Build

Build as a Windows desktop application:

```bash
# Bundle Python backend first
npm run bundle:python

# Verify desktop setup (recommended)
npm run verify:desktop

# Build Electron desktop application
npm run build:desktop
```

Output files will be in the `dist` directory:
- `AIDocMaster-{version}-Setup.exe` - NSIS installer
- `AIDocMaster-{version}-Portable.exe` - Portable executable

For more details, see [Desktop Packaging Documentation](./docs/features/desktop-packaging.md).


## Usage Guide

### 1. AI Chat

The chat interface supports:
- **Multiple conversations** with persistent history
- **Streaming responses** from your configured LLM
- **Web search integration** (Tavily, Baidu, etc.)
- **MCP tool execution** for external services
- **Custom system prompts** per conversation
- **Stop/pause** during generation

### 2. AI Document Validation

The document editor allows you to:
- **Upload Word documents** (.docx) via drag-and-drop or file picker
- **Edit with full formatting** (bold, italic, headings, colors, alignment)
- **Send AI commands** to modify the document
- **View changes in real-time** with streaming feedback
- **Export back to Word** format

Example commands:
- "Improve the clarity of the introduction"
- "Add a conclusion paragraph summarizing the key points"
- "Make the tone more formal"
- "Fix grammar and spelling errors"

### 3. AI Auto-Writer

Generate complete documents from scratch:
- **Enter a topic or prompt** (e.g., "Write a blog post about AI ethics")
- **Configure parameters**:
  - Number of paragraphs
  - Writing tone (formal, casual, technical)
  - Target audience
  - Language (English/Chinese)
- **Watch the AI create**:
  - Outline generation
  - Section-by-section drafting (parallel)
  - Final refinement
- **Export to Word** when complete

### 4. Settings

Configure your AI experience:
- **Model Management**: Add/edit/delete LLM providers
- **MCP Servers**: Register external tool integrations
- **Image Service**: Configure image generation APIs
- **Search Service**: Set up web search providers
- **Display Settings**: UI customization

## Configuration

### LLM Model Configuration

Models are configured through the Settings UI or by editing `backend/config/models.json`:

```json
{
  "models": [
    {
      "id": "gpt-4",
      "name": "GPT-4",
      "api_url": "https://api.openai.com/v1",
      "api_key": "your-key",
      "model_name": "gpt-4",
      "temperature": 0.7,
      "max_tokens": 2000
    }
  ]
}
```

### MCP Server Configuration

Configure external tools via `backend/mcp_config.json`:

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "node",
      "args": ["/path/to/filesystem-mcp/index.js"],
      "env": {}
    }
  }
}
```

### Search Service Configuration

Edit `backend/config/search_config.json`:

```json
{
  "provider": "tavily",
  "api_key": "your-tavily-key",
  "max_results": 5
}
```

## Project Structure

```
AIDocMaster/
├── app/                     # Next.js App Router pages
│   ├── api/                 # API routes (proxy to Flask)
│   ├── page.tsx             # Main application page
│   └── globals.css          # Global styles
├── components/              # React UI components
│   ├── ui/                  # Reusable UI primitives
│   ├── TaskBar.tsx          # Multi-task interface
│   ├── ChatInterface.tsx    # AI chat component
│   ├── DocumentEditor.tsx   # TipTap-based editor
│   └── AutoWriter.tsx       # Auto-writer interface
├── backend/                 # Flask backend
│   ├── app.py               # Flask application entry
│   ├── mcp_client.py        # MCP protocol client
│   ├── agent/               # AI agents
│   │   ├── auto_writer_agent.py
│   │   ├── document_agent.py
│   │   ├── agent_router.py
│   │   └── tools.py
│   ├── domains/             # Domain services (DDD)
│   │   ├── chat/
│   │   ├── document/
│   │   ├── agent/
│   │   ├── model/
│   │   ├── mcp/
│   │   ├── image_service/
│   │   └── search_service/
│   └── config/              # Configuration files
├── electron/                # Electron main process
│   └── main.js
├── lib/                     # Shared utilities
├── types/                   # TypeScript definitions
└── docs/                    # Documentation

```

## API Endpoints

### Frontend API Routes (Next.js)

- `POST /api/chat` - Stream chat messages with LLM
- `POST /api/agent-validation` - Validate/modify documents
- `POST /api/auto-writer` - Generate documents from scratch
- `GET /api/models` - List configured LLM models
- `POST /api/models` - Add new LLM model
- `GET /api/mcp-config` - Get MCP server configuration

### Backend API (Flask - Port 5000)

- `POST /chat` - Chat with LLM (streaming SSE)
- `POST /agent/validation` - Document modification agent
- `POST /agent/auto-writer` - Document generation agent
- `POST /agent/route` - Intelligent agent routing
- `POST /document/parse` - Parse Word/PDF documents
- `POST /search` - Web search integration
- `POST /image/generate` - Image generation

## Testing

Run the test suite:

```bash
npm test
```

Run backend tests:

```bash
cd backend
pytest
```

## Browser Support

- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)

**Note**: This application is designed for desktop use. The Electron app is recommended for the best experience.

## Troubleshooting

### Backend fails to start
- Ensure Python 3.8+ is installed
- Check that all dependencies are installed: `pip install -r backend/requirements.txt`
- Verify Flask is running on port 5000

### LLM API errors
- Verify your API key is correct in Settings or `.env.local`
- Check that the API URL is accessible
- Ensure the model name matches your provider's offerings

### Desktop build fails
- Run `npm run verify:desktop` to check setup
- Ensure Python backend is bundled: `npm run bundle:python`
- Check that electron-builder is installed

### Document formatting issues
- For Word import: Ensure document uses standard Word formatting
- For export: Try disabling complex formatting before export
- Check browser console for detailed error messages

## Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines

- Follow TypeScript best practices
- Write tests for new features
- Update documentation for API changes
- Follow the existing code style
- Keep commits atomic and well-described

## License

This project is proprietary software. All rights reserved.

## Acknowledgments

- Built with [Next.js](https://nextjs.org/), [React](https://react.dev/), and [Flask](https://flask.palletsprojects.com/)
- AI orchestration powered by [LangChain](https://www.langchain.com/) and [LangGraph](https://langchain-ai.github.io/langgraph/)
- Document editing with [TipTap](https://tiptap.dev/)
- Icons from [Lucide](https://lucide.dev/)

## Support

For support, please open an issue in the GitHub repository.

Contact: xdrshjr@gmail.com

---

Built with ❤️ using Next.js, React, Flask, and AI
