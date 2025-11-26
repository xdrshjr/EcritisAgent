# MCP Integration Feature Documentation

## Overview

This document describes the Model Context Protocol (MCP) integration feature implemented for the AI Chat functionality in AIDocMaster.

## Feature Description

The MCP integration allows users to enable external tools during AI chat sessions. When enabled, the AI can:
1. Analyze user queries to determine if external tools are needed
2. Call appropriate MCP tools (e.g., search engines, APIs)
3. Process tool results
4. Generate comprehensive responses based on both AI knowledge and tool data

## Architecture

### Frontend Components

#### 1. MCPToolSelector Component (`components/MCPToolSelector.tsx`)
- **Location**: Next to model selector in chat interface
- **Features**:
  - Master toggle switch with hammer icon
  - Dropdown menu showing all available MCP tools
  - Individual toggles for each tool
  - Real-time state synchronization
  - Persistent tool enablement state

#### 2. MCPToolExecutionDisplay Component (`components/MCPToolExecutionDisplay.tsx`)
- **Purpose**: Visualize MCP tool execution process
- **Displays**:
  - AI reasoning for tool selection
  - Tool call parameters
  - Execution status (pending/running/success/error)
  - Tool results
  - Final answer generation

#### 3. ChatPanel Integration (`components/ChatPanel.tsx`)
- **Enhancements**:
  - MCP state management (enabled/disabled)
  - Enabled tools tracking
  - MCP execution steps collection
  - Request body includes MCP configuration

#### 4. ChatMessage Enhancement (`components/ChatMessage.tsx`)
- **New Features**:
  - Displays MCP execution steps for assistant messages
  - Shows complete tool calling workflow
  - Beautiful, informative UI for each step

### Backend Implementation

#### 1. MCP Client (`backend/mcp_client.py`)
- **Classes**:
  - `MCPToolCall`: Represents a single tool call with parameters and results
  - `MCPClient`: Manages tool execution and result processing

- **Functions**:
  - `analyze_user_query_for_tools()`: Determines if tools are needed
  - `execute_tool()`: Executes tool calls
  - `format_tool_results_for_llm()`: Formats results for LLM context

- **Tool Simulation**:
  - Search tools (Tavily, Baidu Search)
  - Generic tool execution
  - (Production: Replace with actual MCP protocol communication)

#### 2. Flask Backend Integration (`backend/app.py`)
- **Chat Endpoint Enhancement**:
  - Accepts `mcpEnabled` and `mcpTools` parameters
  - Analyzes queries for tool requirements
  - Executes tools when needed
  - Streams tool execution events to frontend
  - Includes tool results in LLM context

- **Event Types**:
  - `mcp_reasoning`: AI's decision about tool usage
  - `mcp_tool_call`: Tool execution started
  - `mcp_tool_result`: Tool execution completed
  - `mcp_final_answer`: Generating final response

### State Management

#### Configuration Storage
- **File**: `userData/mcp-configs.json`
- **Structure**:
  ```json
  {
    "mcpServers": [
      {
        "id": "mcp_xxxxx",
        "name": "tool-name",
        "command": "npx",
        "args": ["-y", "package@latest"],
        "isEnabled": true,
        "createdAt": "ISO-8601",
        "updatedAt": "ISO-8601"
      }
    ]
  }
  ```

#### Persistence
- Uses existing `mcpConfig.ts` library
- Supports localStorage (browser)
- Supports Electron IPC (desktop app)
- Syncs to Python backend

## User Flow

### 1. Enable MCP Tools
1. User opens AI Chat
2. Clicks MCP toggle switch (hammer icon)
3. Master switch enables MCP functionality
4. Dropdown appears showing available tools

### 2. Select Tools
1. Click dropdown button
2. View list of all MCP tools
3. Toggle individual tools on/off
4. State is automatically persisted

### 3. Chat with MCP
1. User sends a message
2. If query needs external data:
   - AI analyzes query
   - Selects appropriate tools
   - Executes tools
   - Displays execution process
   - Generates answer with tool results
3. User sees complete workflow visualization

## UI Design

### MCP Selector
- **Position**: Right of model selector
- **Style**: Consistent with existing UI
- **Icon**: Hammer (🔨) symbol
- **States**:
  - Disabled (gray)
  - Enabled (primary color)
  - Dropdown open/closed

### Execution Display
- **Cards**: Each step in a card
- **Icons**:
  - ✨ Sparkles: AI reasoning
  - 🔨 Hammer: Tool call
  - ⚡ Loader: In progress
  - ✓ Check: Success
  - ⚠ Alert: Error
- **Colors**:
  - Purple: Reasoning
  - Blue: Tool calls
  - Green: Success
  - Red: Errors

### Animations
- Fade-in: New elements
- Pulse: Active operations
- Smooth transitions: All state changes

## Logging

### Frontend Logging
```typescript
logger.info('MCP state changed', {
  enabled: true,
  toolCount: 2,
  toolNames: ['tavily', 'baidu-search']
}, 'ChatPanel');
```

### Backend Logging
```python
app.logger.info('[MCP] Tool execution started', extra={
  'tool_name': 'tavily-search',
  'parameters': {'query': 'example'},
})
```

### Log Levels
- **DEBUG**: Detailed execution steps
- **INFO**: Major events (enable/disable, tool calls)
- **WARN**: Non-critical issues
- **ERROR**: Failures with stack traces

## Error Handling

### Frontend
- Graceful degradation if MCP unavailable
- Clear error messages to user
- Automatic fallback to regular chat

### Backend
- Validates tool configurations
- Handles missing tools
- Timeout protection
- Comprehensive error logging

## Performance Considerations

### Frontend
- Lazy loading of tool configurations
- Efficient state updates
- Minimal re-renders
- Smooth animations

### Backend
- Streaming responses (no blocking)
- Concurrent tool execution
- Result caching potential
- Resource cleanup

## Security

### Input Validation
- Tool names validated
- Parameters sanitized
- Command injection prevention

### Access Control
- Only enabled tools can be called
- User must explicitly enable MCP
- Per-tool enablement control

## Testing Checklist

### Manual Testing
- [ ] Toggle MCP master switch
- [ ] Open/close dropdown menu
- [ ] Enable/disable individual tools
- [ ] State persists across sessions
- [ ] Send query requiring search
- [ ] View execution visualization
- [ ] Check error handling
- [ ] Verify in Electron app

### Integration Testing
- [ ] Frontend-backend communication
- [ ] Tool execution flow
- [ ] Error propagation
- [ ] State synchronization

## Future Enhancements

### Phase 2
1. **Real MCP Protocol Implementation**
   - Replace simulation with actual MCP servers
   - Stdio/HTTP communication
   - Tool schema discovery

2. **Tool Marketplace**
   - Browse available MCP tools
   - One-click installation
   - Automatic updates

3. **Advanced Features**
   - Tool chaining (multi-step workflows)
   - Parallel tool execution
   - Result caching
   - Cost tracking

4. **UI Improvements**
   - Collapsible execution steps
   - Tool usage statistics
   - Performance metrics
   - User feedback collection

## Configuration

### Default Tools
Two tools configured by default:
1. **Tavily AI Search** (`tavily-mcp@latest`)
2. **Baidu Search** (`baidu-search-mcp`)

### Adding New Tools
1. Configure in Settings dialog (future)
2. Or manually edit `mcp-configs.json`
3. Restart application

## Troubleshooting

### MCP Not Working
1. Check if tools are enabled
2. Verify tool configurations
3. Check backend logs
4. Ensure Node.js/npx available

### Tools Not Appearing
1. Reload MCP configurations
2. Check file permissions
3. Verify JSON syntax

### Execution Failures
1. Check tool availability
2. Verify network connectivity
3. Review error messages
4. Check backend logs

## API Reference

### Frontend

#### MCPToolSelector Props
```typescript
interface MCPToolSelectorProps {
  disabled?: boolean;
  onMCPStateChange?: (enabled: boolean, tools: MCPConfig[]) => void;
}
```

#### MCPToolExecutionDisplay Props
```typescript
interface MCPToolExecutionDisplayProps {
  steps: MCPExecutionStep[];
  isComplete?: boolean;
}
```

### Backend

#### Chat Endpoint
```
POST /api/chat
Content-Type: application/json

{
  "messages": [...],
  "modelId": "model_xxx",
  "mcpEnabled": true,
  "mcpTools": [
    {
      "id": "mcp_xxx",
      "name": "tool-name",
      "command": "npx",
      "args": [...]
    }
  ]
}
```

## Conclusion

The MCP integration provides a powerful, extensible system for augmenting AI chat with external tools. The implementation follows best practices for logging, error handling, and user experience while maintaining flexibility for future enhancements.

