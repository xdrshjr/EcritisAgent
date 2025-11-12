# AI Chat Feature - Quick Start Guide

## Overview
This guide will help you set up and use the AI chat assistant feature in DocAIMaster.

## Prerequisites
- OpenAI API key or compatible LLM API
- Node.js 18+ installed
- DocAIMaster project setup complete

## Setup Instructions

### Step 1: Create Environment Configuration

Create a `.env` file in the project root directory:

```bash
# Windows PowerShell
New-Item -Path ".env" -ItemType File

# Linux/macOS
touch .env
```

### Step 2: Add LLM Configuration

Open `.env` and add the following configuration:

```env
# Required: Your OpenAI API Key
LLM_API_KEY=sk-your-actual-api-key-here

# Optional: API Endpoint (default shown)
LLM_API_URL=https://api.openai.com/v1

# Optional: Model Name (default shown)
LLM_MODEL_NAME=gpt-4

# Optional: Timeout in milliseconds (default shown)
LLM_API_TIMEOUT=30000
```

**Important**: 
- Replace `sk-your-actual-api-key-here` with your actual OpenAI API key
- Get your API key from: https://platform.openai.com/api-keys
- Never commit the `.env` file to version control

### Step 3: Install Dependencies (if not already installed)

```bash
npm install
```

### Step 4: Start the Development Server

```bash
npm run dev
```

### Step 5: Verify the Feature

1. Open your browser to `http://localhost:3000`
2. Look for a circular chat button in the bottom-right corner
3. The button should have a message icon with a subtle pulse animation
4. Click the button to open the chat dialog

## Using the Chat Feature

### Opening the Chat
- **Click**: Click the floating chat button in the bottom-right corner
- **Keyboard**: Tab to the button and press Enter or Space

### Sending Messages
- **Type**: Enter your message in the input field at the bottom
- **Send**: Click the send button or press Enter
- **Newline**: Use Shift+Enter to add a new line without sending

### Closing the Chat
- **Click**: Click the X button in the dialog header
- **Click Button**: Click the floating button again
- **Keyboard**: Press Escape key

### Features
- ✨ Real-time streaming responses
- ✨ Message history within session
- ✨ Auto-scroll to latest message
- ✨ Timestamps on messages
- ✨ Loading indicators
- ✨ Error handling with friendly messages

## Configuration Options

### Using Different LLM Providers

#### Azure OpenAI
```env
LLM_API_KEY=your-azure-api-key
LLM_API_URL=https://your-resource.openai.azure.com/openai/deployments/your-deployment-name
LLM_MODEL_NAME=gpt-4
```

#### Local LLM (e.g., LM Studio)
```env
LLM_API_KEY=dummy-key
LLM_API_URL=http://localhost:1234/v1
LLM_MODEL_NAME=local-model
```

#### Other OpenAI-Compatible APIs
```env
LLM_API_KEY=your-api-key
LLM_API_URL=https://api.your-provider.com/v1
LLM_MODEL_NAME=provider-model-name
```

### Adjusting Timeout
If you experience timeout errors with slower models:

```env
LLM_API_TIMEOUT=60000  # 60 seconds
```

### Choosing Different Models
OpenAI models you can use:
```env
LLM_MODEL_NAME=gpt-4              # Most capable
LLM_MODEL_NAME=gpt-4-turbo        # Faster, cheaper
LLM_MODEL_NAME=gpt-3.5-turbo      # Fastest, cheapest
```

## Verifying Configuration

### Check API Health
Navigate to: `http://localhost:3000/api/chat`

**Expected Response** (if configured correctly):
```json
{
  "status": "ok",
  "configured": true,
  "model": "gpt-4",
  "endpoint": "https://api.openai.com/v1"
}
```

**Error Response** (if not configured):
```json
{
  "status": "error",
  "configured": false
}
```

### Check Browser Console
Open browser DevTools (F12) and look for:
```
[INFO] Chat dialog opened/closed
[INFO] Sending chat message
[SUCCESS] Chat response received
```

## Troubleshooting

### Problem: Chat button not visible
**Solutions**:
1. Clear browser cache (Ctrl+Shift+R or Cmd+Shift+R)
2. Check browser console for errors
3. Verify `FloatingChatButton` is in `app/layout.tsx`

### Problem: "Chat is not configured" error
**Solutions**:
1. Verify `.env` file exists in project root
2. Check `LLM_API_KEY` is set correctly
3. Restart development server after changing `.env`
4. Ensure no spaces around `=` in `.env`

### Problem: "Request timed out" error
**Solutions**:
1. Increase timeout: `LLM_API_TIMEOUT=60000`
2. Check internet connection
3. Verify API endpoint is accessible
4. Try a faster model (e.g., gpt-3.5-turbo)

### Problem: "LLM API error: 401"
**Solutions**:
1. Verify API key is correct and active
2. Check API key hasn't expired
3. Ensure correct API endpoint format
4. For Azure, check deployment name in URL

### Problem: "LLM API error: 429"
**Solutions**:
1. You've hit rate limits - wait a few minutes
2. Check your API account quota
3. Consider upgrading your API plan
4. Implement rate limiting in your app

### Problem: No streaming, entire message appears at once
**Possible Cause**: LLM provider doesn't support streaming
**Solution**: Use OpenAI or compatible provider that supports SSE

### Problem: Messages not appearing
**Solutions**:
1. Check browser console for errors
2. Verify API response in Network tab
3. Check `parseSSEStream` is handling chunks correctly

## Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `LLM_API_KEY` | **Yes** | - | API key for authentication |
| `LLM_API_URL` | No | `https://api.openai.com/v1` | API endpoint URL |
| `LLM_MODEL_NAME` | No | `gpt-4` | Model identifier |
| `LLM_API_TIMEOUT` | No | `30000` | Timeout in milliseconds |

## Best Practices

### Security
1. ⚠️ Never commit `.env` file to Git
2. 🔒 Keep API keys secure and private
3. 🔄 Rotate API keys periodically
4. 👥 Use separate keys for dev/prod

### Performance
1. 🚀 Use faster models (gpt-3.5-turbo) for development
2. ⏱️ Adjust timeout based on model speed
3. 📊 Monitor API usage and costs
4. 💾 Consider caching for repeated queries

### User Experience
1. 💬 Keep messages concise and clear
2. 🔄 Handle errors gracefully
3. ⌛ Show loading states during processing
4. 📱 Test on different screen sizes

## Sample Conversations

### Example 1: Feature Help
**User**: "How do I upload a document?"  
**Assistant**: "To upload a document in DocAIMaster, click the 'Upload Document' button in the editor panel..."

### Example 2: Formatting Assistance
**User**: "How can I center align text?"  
**Assistant**: "To center align text, select the text and click the center align button in the toolbar..."

### Example 3: General Q&A
**User**: "What file formats are supported?"  
**Assistant**: "DocAIMaster supports Word documents in .doc and .docx formats, up to 10MB in size..."

## Advanced Usage

### Custom System Prompt
To customize the AI's behavior, edit `app/api/chat/route.ts`:

```typescript
const systemMessage: ChatMessage = {
  role: 'system',
  content: 'Your custom system prompt here...',
};
```

### Integrating with Document Context
You can enhance the chat with document-specific context by modifying the system message to include information about the current document.

### Multi-Language Support
The UI already supports English and Chinese. To use Chinese:
- Modify `app/page.tsx` to use `getDictionary('zh')`
- The chat interface will automatically use Chinese translations

## API Endpoints

### POST /api/chat
Send chat messages and receive streaming responses

**Request**:
```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Hello"}]}'
```

### GET /api/chat
Check configuration status

**Request**:
```bash
curl http://localhost:3000/api/chat
```

## Next Steps

1. ✅ Set up environment variables
2. ✅ Test the chat feature
3. ✅ Customize the system prompt (optional)
4. 📚 Read the full [API Documentation](../apis/ai-chat.md)
5. 🔍 Review [Implementation Details](./ai-chat-implementation.md)

## Getting Help

### Documentation
- [API Documentation](../apis/ai-chat.md)
- [Implementation Summary](./ai-chat-implementation.md)
- [Main README](../../README.md)

### Common Issues
Check the troubleshooting section above for common problems and solutions.

### Support
For additional help:
1. Check browser console for error messages
2. Review server logs for API errors
3. Verify environment configuration
4. Test API endpoint directly

## Limitations

Current version limitations:
- No conversation persistence (history lost on refresh)
- No user authentication
- No rate limiting (use API provider's limits)
- No cost tracking
- English-only system prompt

See [Implementation Summary](./ai-chat-implementation.md#known-limitations) for details and planned enhancements.

## Credits

**Implementation Date**: November 12, 2025  
**Version**: 1.0.0  
**Compatible With**: OpenAI API v1

---

**Ready to chat?** Open DocAIMaster and click the floating chat button! 💬

