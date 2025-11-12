# AI Chat API

## Endpoint
`POST /api/chat`

## Description
Handles streaming chat completions using OpenAI-compatible LLM API. Provides real-time AI assistant responses with Server-Sent Events (SSE) streaming for an interactive chat experience.

## Request

### Headers
- `Content-Type: application/json`

### Body (JSON)
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| messages | Array<ChatMessage> | Yes | Array of chat messages with role and content |

### ChatMessage Object
```typescript
interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}
```

### Example Request Body
```json
{
  "messages": [
    {
      "role": "user",
      "content": "How do I format a document?"
    }
  ]
}
```

## Response

### Success Response (200 OK)
**Content-Type**: `text/event-stream`

The API returns a streaming response using Server-Sent Events (SSE) format. Each event contains a chunk of the AI response.

#### SSE Event Format
```
data: {"choices":[{"delta":{"content":"Hello"}}]}

data: {"choices":[{"delta":{"content":" there!"}}]}

data: [DONE]
```

### Error Responses

#### 400 Bad Request - Invalid Messages
```json
{
  "error": "Messages array is required and must not be empty"
}
```

#### 500 Internal Server Error - Configuration Error
```json
{
  "error": "LLM configuration validation failed",
  "details": "LLM API key is not configured"
}
```

#### 500 Internal Server Error - LLM API Error
```json
{
  "error": "LLM API error: 500 Internal Server Error",
  "details": "Error details from LLM provider"
}
```

#### 504 Gateway Timeout
```json
{
  "error": "Request timed out"
}
```

## Health Check Endpoint

### GET /api/chat
Returns the configuration status of the chat API.

#### Success Response (200 OK)
```json
{
  "status": "ok",
  "configured": true,
  "model": "gpt-4",
  "endpoint": "https://api.openai.com/v1"
}
```

#### Error Response (500 Internal Server Error)
```json
{
  "status": "error",
  "configured": false
}
```

## Configuration

The chat API requires the following environment variables:

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| LLM_API_KEY | OpenAI-compatible API key | - | Yes |
| LLM_API_URL | LLM API endpoint URL | https://api.openai.com/v1 | No |
| LLM_MODEL_NAME | Model name to use | gpt-4 | No |
| LLM_API_TIMEOUT | Request timeout in milliseconds | 30000 | No |

### Example .env Configuration
```env
LLM_API_KEY=sk-your-api-key-here
LLM_API_URL=https://api.openai.com/v1
LLM_MODEL_NAME=gpt-4
LLM_API_TIMEOUT=30000
```

## Usage Example

### JavaScript (Fetch API with SSE)
```javascript
async function sendChatMessage(messages) {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ messages }),
  });

  if (!response.ok) {
    throw new Error('Failed to get chat response');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();

    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.trim().startsWith('data: ')) {
        const jsonStr = line.slice(6);
        if (jsonStr === '[DONE]') continue;

        try {
          const data = JSON.parse(jsonStr);
          const content = data.choices?.[0]?.delta?.content;
          if (content) {
            console.log('Received chunk:', content);
            // Update UI with streaming content
          }
        } catch (e) {
          console.error('Failed to parse chunk:', e);
        }
      }
    }
  }
}

// Usage
const messages = [
  { role: 'user', content: 'Hello, how are you?' }
];

await sendChatMessage(messages);
```

### cURL
```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {
        "role": "user",
        "content": "What is DocAIMaster?"
      }
    ]
  }' \
  --no-buffer
```

### cURL Health Check
```bash
curl http://localhost:3000/api/chat
```

## Features

### System Prompt
The API automatically adds a system message to provide context:
```
You are a helpful AI assistant for DocAIMaster, an AI-powered document 
editing and validation tool. You help users with document-related questions, 
provide guidance on using the tool, and assist with document editing tasks. 
Be concise, friendly, and professional.
```

### Streaming Support
- Real-time response streaming using SSE
- Progressive content updates for better UX
- Automatic chunking and buffering

### Error Handling
- Comprehensive error messages
- Timeout protection
- LLM API error forwarding
- Configuration validation

### Request Parameters
- **Temperature**: 0.7 (balanced creativity/consistency)
- **Max Tokens**: 2000 (reasonable response length)
- **Stream**: true (enable streaming)

## Logging

The API logs the following events:

### Request Logging
```
[API:Chat] Chat request received
[API:Chat] Processing chat request { messageCount, lastMessageRole }
[API:Chat] Sending request to LLM API { endpoint, model, messageCount }
```

### Success Logging
```
[API:Chat] Streaming chat response started { duration }
[API:Chat] Chat stream progress { chunks, chunkSize }
[API:Chat] Chat stream completed { totalChunks, duration }
```

### Error Logging
```
[API:Chat] LLM configuration validation failed { error }
[API:Chat] LLM API request failed { status, statusText, error, duration }
[API:Chat] Chat request timed out { duration }
[API:Chat] Error in chat stream { error, totalChunks, duration }
```

## Client Components

### FloatingChatButton
Circular floating button in the bottom-right corner that toggles the chat dialog.

**Features:**
- Animated pulse effect when inactive
- Smooth rotation on toggle
- Keyboard accessible (Enter/Space)
- ARIA labels for screen readers

### ChatDialog
Main chat interface with message history and streaming support.

**Features:**
- Auto-scrolling to latest message
- Real-time streaming display
- Message timestamps
- Loading indicators
- Keyboard shortcuts (Escape to close)

### ChatMessage
Individual message component with role-based styling.

**Features:**
- User/Assistant avatars
- Role-based color schemes
- Timestamp formatting
- Text wrapping and formatting

### ChatInput
Input field with send button for composing messages.

**Features:**
- Auto-resizing textarea
- Enter to send (Shift+Enter for newline)
- Send button with disabled states
- Character preservation

## Performance Considerations

### Streaming Performance
- **Initial Response**: Typically 100-500ms to first chunk
- **Chunk Processing**: Real-time, no artificial delays
- **Memory Usage**: Minimal, stream processing prevents buffering

### Request Limits
- **Timeout**: 30 seconds (configurable)
- **Max Tokens**: 2000 tokens per response
- **Concurrent Requests**: Handled by Next.js Edge Runtime

### Edge Runtime
The API uses Next.js Edge Runtime for:
- Fast cold starts
- Global distribution
- Efficient resource usage
- Better streaming performance

## Security

### API Key Protection
- Environment variable storage only
- Never exposed to client
- Server-side validation

### Input Validation
- Message array validation
- Content sanitization
- Role verification

### Rate Limiting
Consider implementing rate limiting for production:
- Per-user request limits
- API key usage tracking
- Cost management

## Troubleshooting

### Configuration Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| "LLM API key is not configured" | Missing LLM_API_KEY | Set LLM_API_KEY in .env file |
| "Request timed out" | Slow LLM response | Increase LLM_API_TIMEOUT |
| "Invalid LLM configuration" | Missing config values | Check all environment variables |

### Common Errors

#### Empty Response Stream
**Cause**: LLM API returned no content  
**Solution**: Check API key validity and model availability

#### Stream Parsing Errors
**Cause**: Malformed SSE data  
**Solution**: Verify LLM API compatibility with OpenAI format

#### CORS Errors
**Cause**: Client-side direct API calls  
**Solution**: Use server-side proxy (this API)

## Best Practices

### Message History Management
```javascript
// Keep conversation context
const messages = [
  { role: 'user', content: 'Hello' },
  { role: 'assistant', content: 'Hi! How can I help?' },
  { role: 'user', content: 'Tell me about features' },
];
```

### Error Recovery
```javascript
try {
  await sendChatMessage(messages);
} catch (error) {
  console.error('Chat error:', error);
  // Show error message to user
  displayError('Failed to get response. Please try again.');
}
```

### Streaming UI Updates
```javascript
let streamingContent = '';

// Update UI incrementally
function onChunk(chunk) {
  streamingContent += chunk;
  updateChatUI(streamingContent);
}

// Finalize on completion
function onComplete() {
  saveFinalMessage(streamingContent);
  streamingContent = '';
}
```

## Integration with DocAIMaster

The chat API is integrated into DocAIMaster through:

1. **FloatingChatButton**: Global component in layout
2. **Context Awareness**: System prompt mentions DocAIMaster
3. **Document Assistance**: AI helps with document-related tasks
4. **Seamless UX**: Non-intrusive floating UI

### Use Cases
- Document formatting guidance
- Feature explanations
- Editing suggestions
- General Q&A about the tool

## Future Enhancements

Potential improvements:
- [ ] Conversation persistence (database storage)
- [ ] User authentication integration
- [ ] Multi-language support using i18n
- [ ] File/image upload support
- [ ] Code syntax highlighting in messages
- [ ] Message editing and regeneration
- [ ] Export conversation history
- [ ] Custom system prompts per user

## Related Documentation

- [Document Upload API](./document-upload.md)
- [Document Export API](./document-export.md)
- [AI Document Validation Feature](../features/ai-doc-validation.md)

## API Version

**Version**: 1.0.0  
**Last Updated**: 2025-11-12  
**Runtime**: Next.js Edge Runtime  
**Compatible With**: OpenAI API v1

