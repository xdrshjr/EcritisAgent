# Model Switching Bug Fix - Electron Packaged Mode

## Problem Description

**Bug**: After packaging the application with Electron, the model switcher in the AI Chat interface did not work properly. When users selected a different model from the dropdown, the chat continued using the default model instead of switching to the selected one.

**Scope**: This issue only affected the **packaged Electron build**, not development mode.

## Root Cause Analysis

### Architecture Overview

The application has a multi-tier architecture:
1. **Frontend (React/Next.js)**: User interface with model selector
2. **Next.js API Routes**: Proxy layer (dev) or Node.js API server (packaged)
3. **Flask Backend (Python)**: Handles LLM API calls and model configuration

### The Problem

In **packaged Electron mode**, the model configurations are stored in the file system at the Electron `userData` directory. The issue was a **path mismatch** between where Electron stored the configs and where Flask read them:

1. **Electron Main Process** writes model configs to:
   - Windows: `C:\Users\<username>\AppData\Roaming\AIDocMaster\model-configs.json`
   - Uses `app.getPath('userData')` which automatically resolves to the correct app-specific directory

2. **Flask Backend** tried to read model configs from:
   - Windows: `C:\Users\<username>\AppData\Roaming\AIDocMaster\model-configs.json`
   - Used `os.environ.get('APPDATA')` + manual path construction
   - **BUT**: Without the `ELECTRON_USER_DATA` environment variable, Flask couldn't reliably find the same path

### Why Development Mode Worked

In development mode:
- Model configs are stored in `userData/model-configs.json` (relative to project root)
- Flask backend can access this file directly
- Or, configs are synced via cookies (browser localStorage → cookies → Flask)

In packaged mode:
- Cookies don't work the same way in Electron's BrowserWindow
- Flask runs as a separate Python process without direct access to Electron's internal paths
- Without explicit path communication, Flask couldn't find the config file

## Solution Implementation

### Changes Made

#### 1. **electron/flask-launcher.js** - Pass userData Path to Flask
```javascript
// Pass Electron userData path to Flask so it reads configs from the same location
const userDataPath = this.app.getPath('userData');
const env = {
  ...process.env,
  FLASK_PORT: this.flaskPort.toString(),
  PYTHONUNBUFFERED: '1',
  PYTHONIOENCODING: 'utf-8',
  ELECTRON_USER_DATA: userDataPath,  // ← NEW: Pass userData path
};
```

**Why**: This explicitly tells Flask where to find the config files that Electron saves.

#### 2. **backend/app.py** - Use ELECTRON_USER_DATA for Config Path
```python
def _get_config_path(self):
    """Determine configuration file path based on environment"""
    # CRITICAL FIX: Check for ELECTRON_USER_DATA environment variable first
    electron_user_data = os.environ.get('ELECTRON_USER_DATA')
    
    if electron_user_data:
        # Running in Electron - use the userData path provided by Electron
        config_dir = Path(electron_user_data)
        app.logger.info(f'Using Electron userData path for model configs: {config_dir}')
    elif getattr(sys, 'frozen', False):
        # Running as packaged executable (non-Electron)
        # ... fallback logic
    else:
        # Running in development
        config_dir = Path(__file__).parent.parent / 'userData'
    
    return config_dir / self.config_file
```

**Why**: Flask now prioritizes the path provided by Electron via environment variable, ensuring both processes read/write to the same file.

#### 3. **backend/app.py** - Enhanced Logging for Model Selection

Added detailed debug logging throughout the model selection flow:
- When loading config file (with path information)
- When searching for model by ID (with available model IDs)
- When selecting a model (with full model details)
- When falling back to default model

**Why**: Helps diagnose issues and confirms the model switching is working correctly.

#### 4. **components/ChatPanel.tsx** - Enhanced Frontend Logging

Added detailed logging when user changes model:
```typescript
logger.info('[ModelSelection] Model selection changed by user', {
  selectedModelId: model.id,
  selectedModelName: model.name,
  selectedModelApiName: model.modelName,
  apiUrl: model.apiUrl,
  conversationId,
});
```

**Why**: Provides visibility into frontend model selection for debugging.

#### 5. **MCP Config Path Consistency**

Applied the same `ELECTRON_USER_DATA` environment variable approach to MCP configuration loading and saving.

**Why**: Ensures consistency and prevents similar issues with MCP configs.

## Testing Recommendations

### Before Testing
1. Ensure you have the packaged Electron application (`.exe` on Windows)
2. Configure multiple models in Settings (e.g., Qwen Max, DeepSeek V3)
3. Mark one as default

### Test Steps

1. **Open packaged application**
2. **Navigate to AI Chat**
3. **Check model selector** shows all configured models
4. **Select a non-default model** from dropdown
5. **Send a chat message**
6. **Verify in logs**:
   - Frontend log: `[ModelSelection] Model selection changed by user`
   - Frontend log: `[ModelSelection] Sending chat request with selected model`
   - Backend log: `[ModelSelection] Getting model by ID: <selected-model-id>`
   - Backend log: `[ModelSelection] Successfully found and selected model by ID`
   - Backend log: Model name should match your selection
7. **Send another message** - should continue using selected model
8. **Switch to another model** and repeat
9. **Restart application** - previously selected model should persist

### What to Check

- ✅ Model switching works immediately after selection
- ✅ Correct model is used for API calls (check logs)
- ✅ Model selection persists within conversation
- ✅ No "model not found" errors in logs
- ✅ Config file path in logs shows Electron userData directory
- ✅ Both dev and packaged modes work correctly

## Log Examples

### Successful Model Switch (Packaged Mode)

**Frontend:**
```
[ChatPanel] [ModelSelection] Model selection changed by user
  selectedModelId: model_1732636800_abc123
  selectedModelName: DeepSeek V3
  selectedModelApiName: deepseek-v3
  conversationId: conv-1732636900
```

**Backend:**
```
[Flask Backend] [ModelSelection] Getting LLM configuration for specific model: model_1732636800_abc123
  configPath: C:\Users\username\AppData\Roaming\AIDocMaster\model-configs.json
  
[Flask Backend] [ModelSelection] Loaded 2 models from config file
  availableModelIds: ['model_1732636799_xyz456', 'model_1732636800_abc123']
  availableModelNames: ['Qwen Max', 'DeepSeek V3']
  
[Flask Backend] [ModelSelection] Successfully found and selected model by ID
  modelId: model_1732636800_abc123
  modelName: DeepSeek V3
  modelApiName: deepseek-v3
```

### Before Fix (Error Pattern)

```
[Flask Backend] [ModelSelection] Model with ID model_1732636800_abc123 not found in config
  availableModelIds: []
  totalModelsInConfig: 0
  
[Flask Backend] [ModelSelection] Specified model not found, falling back to default
```

This indicated Flask couldn't find the config file at all.

## Technical Details

### Environment Variables

| Variable | Set By | Used By | Purpose |
|----------|--------|---------|---------|
| `ELECTRON_USER_DATA` | electron/flask-launcher.js | backend/app.py | Communicate Electron's userData path to Flask |
| `FLASK_PORT` | electron/flask-launcher.js | backend/app.py | Tell Flask which port to use |

### File Paths

**Development Mode:**
- Model Configs: `<project>/userData/model-configs.json`
- MCP Configs: `<project>/userData/mcp-configs.json`

**Packaged Electron (Windows):**
- Model Configs: `%APPDATA%\AIDocMaster\model-configs.json`
- MCP Configs: `%APPDATA%\AIDocMaster\mcp-configs.json`
- Both determined by `app.getPath('userData')`

**Packaged Electron (macOS/Linux):**
- Model Configs: `~/.config/AIDocMaster/model-configs.json`
- MCP Configs: `~/.config/AIDocMaster/mcp-configs.json`

## Related Files Modified

1. `electron/flask-launcher.js` - Pass ELECTRON_USER_DATA to Flask
2. `backend/app.py` - Use ELECTRON_USER_DATA for config paths
3. `components/ChatPanel.tsx` - Enhanced frontend logging
4. `docs/fixes/model-switching-electron-fix.md` - This documentation

## Future Considerations

### Potential Improvements

1. **Config Validation**: Add startup validation to ensure Flask can read config file
2. **Path Verification UI**: Show config file path in Settings dialog
3. **Error Recovery**: Better error messages when config file is inaccessible
4. **Cross-Process Sync**: Consider IPC-based config sync instead of file-based

### Related Issues

This fix also resolves any potential issues with:
- MCP configuration not persisting in packaged mode
- Settings changes not reflecting after app restart
- Model list not loading in Settings dialog

## Conclusion

The fix ensures that Electron and Flask always use the same configuration file by explicitly passing the userData path from Electron to Flask via environment variable. This resolves the model switching issue in packaged mode while maintaining backward compatibility with development mode.

The enhanced logging makes it easy to verify that model switching is working correctly and helps diagnose any future issues.

