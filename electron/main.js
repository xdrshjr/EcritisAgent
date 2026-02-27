/**
 * Electron Main Process
 * 
 * This is the main process file for the Electron application.
 * It handles:
 * - Window creation and management
 * - Application lifecycle
 * - System integration
 * 
 * Window Configuration:
 * - Default size: 1366x768
 * - Minimum size: 800x600
 * - Resizable: Yes
 * - Auto-maximize: If screen resolution is smaller than default, window will be maximized
 */

const { app, BrowserWindow, ipcMain, Menu, screen, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const ElectronAPIServer = require('./api-server');
const FlaskBackendManager = require('./flask-launcher');

// Window configuration constants
const WINDOW_CONFIG = {
  DEFAULT_WIDTH: 1366,
  DEFAULT_HEIGHT: 768,
  MIN_WIDTH: 800,
  MIN_HEIGHT: 600,
};

/**
 * Logger for Electron main process
 */
class ElectronLogger {
  constructor() {
    this.logFile = path.join(app.getPath('userData'), 'app.log');
    this.ensureLogFile();
  }

  ensureLogFile() {
    const logDir = path.dirname(this.logFile);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  }

  getTimestamp() {
    return new Date().toISOString();
  }

  writeLog(level, message, data = null) {
    const logEntry = {
      timestamp: this.getTimestamp(),
      level,
      message,
      data,
    };

    const logLine = `[${logEntry.timestamp}] [${level.toUpperCase()}] ${message}${
      data ? '\n' + JSON.stringify(data, null, 2) : ''
    }\n`;

    // Write to console
    console.log(logLine);

    // Write to file
    try {
      fs.appendFileSync(this.logFile, logLine);
    } catch (error) {
      console.error('Failed to write to log file:', error);
    }
  }

  info(message, data = null) {
    this.writeLog('info', message, data);
  }

  error(message, data = null) {
    this.writeLog('error', message, data);
  }

  warn(message, data = null) {
    this.writeLog('warn', message, data);
  }

  success(message, data = null) {
    this.writeLog('success', message, data);
  }

  debug(message, data = null) {
    if (process.env.NODE_ENV === 'development') {
      this.writeLog('debug', message, data);
    }
  }
}

const logger = new ElectronLogger();

// Keep a global reference of the window object
let mainWindow = null;

// Flask backend manager instance
let flaskBackend = null;

// API server instance (for packaged mode only)
let apiServer = null;

/**
 * Create the main application window
 */
function createWindow() {
  logger.info('Creating main application window');
  logger.info('Window configuration', WINDOW_CONFIG);

  try {
    // Determine icon path based on whether app is packaged or in development
    let iconPath;
    if (app.isPackaged) {
      // In packaged mode, try multiple possible locations
      // First, try the out directory (where Next.js copies public files)
      const outIconPath = path.join(app.getAppPath(), '../out/logoEcritis.ico');
      // Also try relative to __dirname
      const relativeIconPath = path.join(__dirname, '../out/logoEcritis.ico');
      
      if (fs.existsSync(outIconPath)) {
        iconPath = outIconPath;
        logger.debug('Using packaged icon path from app path', { iconPath, isPackaged: true });
      } else if (fs.existsSync(relativeIconPath)) {
        iconPath = relativeIconPath;
        logger.debug('Using packaged icon path from relative path', { iconPath, isPackaged: true });
      } else {
        // Fallback to app/favicon.ico
        iconPath = path.join(app.getAppPath(), '../app/favicon.ico');
        logger.debug('Using fallback icon path in packaged mode', { iconPath, isPackaged: true });
      }
    } else {
      // In development mode, use public directory
      iconPath = path.join(__dirname, '../public/logoEcritis.ico');
      logger.debug('Using development icon path', { iconPath, isPackaged: false });
    }

    // Verify icon file exists
    if (!fs.existsSync(iconPath)) {
      logger.warn('Icon file not found at expected path, using fallback', {
        iconPath,
        fallback: path.join(__dirname, '../app/favicon.ico'),
      });
      iconPath = path.join(__dirname, '../app/favicon.ico');
    } else {
      logger.info('Icon file found successfully', { iconPath });
    }

    mainWindow = new BrowserWindow({
      width: WINDOW_CONFIG.DEFAULT_WIDTH,
      height: WINDOW_CONFIG.DEFAULT_HEIGHT,
      minWidth: WINDOW_CONFIG.MIN_WIDTH,
      minHeight: WINDOW_CONFIG.MIN_HEIGHT,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        // Allow loading local resources in production
        webSecurity: true,
      },
      title: 'EcritisAgent - Where Writing Meets Intelligence',
      icon: iconPath,
      backgroundColor: '#ffffff',
      show: false, // Don't show until ready
    });

    logger.success('Main window created successfully', {
      width: WINDOW_CONFIG.DEFAULT_WIDTH,
      height: WINDOW_CONFIG.DEFAULT_HEIGHT,
      minWidth: WINDOW_CONFIG.MIN_WIDTH,
      minHeight: WINDOW_CONFIG.MIN_HEIGHT,
    });

    // Check screen resolution and maximize if smaller than default
    try {
      const primaryDisplay = screen.getPrimaryDisplay();
      const screenSize = primaryDisplay.size;
      const screenWidth = screenSize.width;
      const screenHeight = screenSize.height;

      logger.info('Screen resolution detected', {
        screenWidth,
        screenHeight,
        defaultWidth: WINDOW_CONFIG.DEFAULT_WIDTH,
        defaultHeight: WINDOW_CONFIG.DEFAULT_HEIGHT,
      });

      // If screen resolution is smaller than default, maximize the window
      if (screenWidth < WINDOW_CONFIG.DEFAULT_WIDTH || screenHeight < WINDOW_CONFIG.DEFAULT_HEIGHT) {
        logger.info('Screen resolution is smaller than default, maximizing window', {
          screenWidth,
          screenHeight,
          defaultWidth: WINDOW_CONFIG.DEFAULT_WIDTH,
          defaultHeight: WINDOW_CONFIG.DEFAULT_HEIGHT,
        });
        mainWindow.maximize();
        logger.success('Window maximized due to small screen resolution');
      } else {
        logger.debug('Screen resolution is sufficient, using default window size', {
          screenWidth,
          screenHeight,
        });
      }
    } catch (error) {
      logger.error('Failed to check screen resolution or maximize window', {
        error: error.message,
        stack: error.stack,
      });
      // Continue with default window size if screen detection fails
    }

    // Remove the default menu bar (File, Edit, etc.)
    Menu.setApplicationMenu(null);
    logger.info('Application menu bar removed');

    // Load the app
    const startUrl = app.isPackaged
      ? `file://${path.join(__dirname, '../out/index.html')}`
      : 'http://localhost:3000';

    logger.info('Loading application URL', { url: startUrl, isPackaged: app.isPackaged });

    mainWindow.loadURL(startUrl).then(() => {
      logger.success('Application loaded successfully');
      mainWindow.show();
    }).catch((error) => {
      logger.error('Failed to load application', { error: error.message, stack: error.stack });
    });

    // Window event handlers
    mainWindow.on('ready-to-show', () => {
      logger.info('Window ready to show');
      mainWindow.show();
    });

    mainWindow.on('closed', () => {
      logger.info('Main window closed');
      mainWindow = null;
    });

    mainWindow.on('resize', () => {
      const bounds = mainWindow.getBounds();
      logger.debug('Window resized', {
        width: bounds.width,
        height: bounds.height,
      });
    });

    mainWindow.on('maximize', () => {
      logger.info('Window maximized');
    });

    mainWindow.on('minimize', () => {
      logger.info('Window minimized');
    });

    mainWindow.on('restore', () => {
      logger.info('Window restored');
    });

    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
      logger.error('Failed to load web contents', {
        errorCode,
        errorDescription,
        url: validatedURL,
      });
    });

    mainWindow.webContents.on('crashed', () => {
      logger.error('Web contents crashed');
    });

    // Log resource loading for debugging
    mainWindow.webContents.session.webRequest.onBeforeRequest((details, callback) => {
      logger.debug('Resource request', {
        url: details.url,
        resourceType: details.resourceType,
      });
      callback({});
    });

    mainWindow.webContents.session.webRequest.onErrorOccurred((details) => {
      logger.error('Resource loading error', {
        url: details.url,
        error: details.error,
        resourceType: details.resourceType,
      });
    });

    // Log when DOM is ready
    mainWindow.webContents.on('dom-ready', () => {
      logger.info('DOM content loaded');
    });

    // Log when page finishes loading
    mainWindow.webContents.on('did-finish-load', () => {
      logger.success('Page finished loading');
    });

    // Open DevTools in development mode
    if (!app.isPackaged) {
      logger.info('Development mode: Opening DevTools');
      mainWindow.webContents.openDevTools();
    }

  } catch (error) {
    logger.error('Failed to create window', {
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
}

/**
 * Application lifecycle: Ready
 */
app.on('ready', async () => {
  logger.info('Application ready', {
    version: app.getVersion(),
    name: app.getName(),
    userDataPath: app.getPath('userData'),
    appPath: app.getAppPath(),
    isPackaged: app.isPackaged,
  });

  // Start Flask backend first
  logger.info('Starting Flask backend');
  try {
    flaskBackend = new FlaskBackendManager(app, logger);
    const flaskResult = await flaskBackend.start();
    
    if (flaskResult.success) {
      logger.success('Flask backend started successfully', {
        port: flaskResult.port,
        pid: flaskResult.pid,
      });
      
      // Store Flask backend port for the API server and renderer process
      global.flaskBackendPort = flaskResult.port;
    } else {
      logger.error('Failed to start Flask backend', {
        error: flaskResult.error,
      });
      
      // Continue without Flask backend - user will see errors when trying to use LLM features
      global.flaskBackendPort = null;
    }
  } catch (error) {
    logger.error('Exception starting Flask backend', {
      error: error.message,
      stack: error.stack,
    });
    global.flaskBackendPort = null;
  }

  // Start API server in packaged mode
  if (app.isPackaged) {
    logger.info('Running in packaged mode, starting Node.js API proxy server');
    
    try {
      apiServer = new ElectronAPIServer(app, logger);
      const port = await apiServer.start();
      
      logger.success('API server initialized', {
        port,
        address: `http://localhost:${port}`,
      });

      // Store the API server port for the renderer process
      global.apiServerPort = port;
    } catch (error) {
      logger.error('Failed to start API server', {
        error: error.message,
        stack: error.stack,
      });
      
      // Continue without API server - user will see errors when trying to use features
      global.apiServerPort = null;
    }
  } else {
    logger.info('Running in development mode, using Next.js dev server for API routes');
    global.apiServerPort = null;
  }

  createWindow();
});

/**
 * Application lifecycle: Window all closed
 */
app.on('window-all-closed', () => {
  logger.info('All windows closed');

  // On macOS, keep app running until user quits explicitly
  if (process.platform !== 'darwin') {
    logger.info('Quitting application (non-macOS platform)');
    app.quit();
  }
});

/**
 * Application lifecycle: Activate
 */
app.on('activate', () => {
  logger.info('Application activated');

  // On macOS, recreate window when dock icon is clicked
  if (mainWindow === null) {
    logger.info('No main window exists, creating new window');
    createWindow();
  }
});

/**
 * Application lifecycle: Before quit
 */
app.on('before-quit', async () => {
  logger.info('Application preparing to quit');

  // Stop all MCP servers
  if (mcpProcesses.size > 0) {
    logger.info('Stopping all MCP servers', {
      count: mcpProcesses.size,
    });

    for (const [id, mcpData] of mcpProcesses.entries()) {
      try {
        logger.info('Stopping MCP server', {
          id,
          name: mcpData.config.name,
        });
        mcpData.process.kill('SIGTERM');
      } catch (error) {
        logger.error('Error stopping MCP server', {
          id,
          error: error.message,
        });
      }
    }

    // Wait for graceful shutdown
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Force kill any remaining processes
    for (const [id, mcpData] of mcpProcesses.entries()) {
      if (!mcpData.process.killed) {
        logger.warn('Force killing MCP server', { id });
        mcpData.process.kill('SIGKILL');
      }
    }

    mcpProcesses.clear();
    logger.success('All MCP servers stopped');
  }

  // Stop Flask backend
  if (flaskBackend) {
    logger.info('Stopping Flask backend');
    try {
      await flaskBackend.stop();
      logger.success('Flask backend stopped successfully');
    } catch (error) {
      logger.error('Error stopping Flask backend', {
        error: error.message,
      });
    }
  }

  // Stop API server if running
  if (apiServer) {
    logger.info('Stopping API server');
    try {
      await apiServer.stop();
    } catch (error) {
      logger.error('Error stopping API server', {
        error: error.message,
      });
    }
  }
});

/**
 * Application lifecycle: Will quit
 */
app.on('will-quit', () => {
  logger.info('Application will quit');
});

/**
 * Application lifecycle: Quit
 */
app.on('quit', () => {
  logger.info('Application quit');
});

/**
 * Handle uncaught exceptions
 */
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception in main process', {
    error: error.message,
    stack: error.stack,
  });
});

/**
 * Handle unhandled promise rejections
 */
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled promise rejection in main process', {
    reason,
    promise,
  });
});

/**
 * Model Configuration File Path
 */
const MODEL_CONFIG_FILE = 'model-configs.json';

/**
 * MCP Configuration File Path
 */
const MCP_CONFIG_FILE = 'mcp-configs.json';

/**
 * AI Chat State File Path
 */
const AI_CHAT_STATE_FILE = 'ai-chat-state.json';

/**
 * Chat Bot Configuration File Path
 */
const CHAT_BOT_CONFIG_FILE = 'chat-bot-configs.json';
const IMAGE_SERVICE_CONFIG_FILE = 'image-service-configs.json';
const SEARCH_SERVICE_CONFIG_FILE = 'search-service-configs.json';
const DISPLAY_CONFIG_FILE = 'display-config.json';

/**
 * MCP Server Processes
 */
const mcpProcesses = new Map();

/**
 * Get model configuration file path
 */
function getModelConfigPath() {
  return path.join(app.getPath('userData'), MODEL_CONFIG_FILE);
}

/**
 * Get MCP configuration file path
 */
function getMCPConfigPath() {
  return path.join(app.getPath('userData'), MCP_CONFIG_FILE);
}

/**
 * Get AI Chat state file path
 */
function getAIChatStatePath() {
  return path.join(app.getPath('userData'), AI_CHAT_STATE_FILE);
}

/**
 * Get chat bot configuration file path
 */
function getChatBotConfigPath() {
  return path.join(app.getPath('userData'), CHAT_BOT_CONFIG_FILE);
}

/**
 * Get image service configuration file path
 */
function getImageServiceConfigPath() {
  return path.join(app.getPath('userData'), IMAGE_SERVICE_CONFIG_FILE);
}

/**
 * Get search service configuration file path
 */
function getSearchServiceConfigPath() {
  return path.join(app.getPath('userData'), SEARCH_SERVICE_CONFIG_FILE);
}

/**
 * Get Display configuration file path
 */
function getDisplayConfigPath() {
  return path.join(app.getPath('userData'), DISPLAY_CONFIG_FILE);
}

/**
 * IPC Handlers
 */
ipcMain.handle('select-directory', async () => {
  logger.debug('IPC: select-directory called');
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('get-home-dir', () => {
  logger.debug('IPC: get-home-dir called');
  return os.homedir();
});

ipcMain.handle('validate-directory', async (event, dirPath) => {
  logger.debug('IPC: validate-directory called', { dirPath });
  try {
    const resolved = path.isAbsolute(dirPath)
      ? dirPath
      : path.resolve(os.homedir(), dirPath);
    const stat = fs.statSync(resolved);
    if (!stat.isDirectory()) {
      return { valid: false, error: 'Path is not a directory' };
    }
    fs.readdirSync(resolved);
    return { valid: true, resolvedPath: resolved };
  } catch (error) {
    return { valid: false, error: `Path is not accessible: ${error.message}` };
  }
});

ipcMain.handle('open-directory', async (event, dirPath) => {
  logger.debug('IPC: open-directory called', { dirPath });
  return shell.openPath(dirPath);
});

ipcMain.handle('get-app-version', () => {
  logger.debug('IPC: get-app-version called');
  return app.getVersion();
});

ipcMain.handle('get-app-name', () => {
  logger.debug('IPC: get-app-name called');
  return app.getName();
});

ipcMain.handle('get-window-bounds', () => {
  if (mainWindow) {
    const bounds = mainWindow.getBounds();
    logger.debug('IPC: get-window-bounds called', bounds);
    return bounds;
  }
  return null;
});

ipcMain.handle('get-api-server-port', () => {
  logger.debug('IPC: get-api-server-port called', {
    port: global.apiServerPort,
    isPackaged: app.isPackaged,
  });
  return global.apiServerPort;
});

ipcMain.handle('get-flask-backend-port', () => {
  logger.debug('IPC: get-flask-backend-port called', {
    port: global.flaskBackendPort,
  });
  return global.flaskBackendPort;
});

ipcMain.handle('get-flask-backend-status', () => {
  logger.debug('IPC: get-flask-backend-status called');
  
  if (flaskBackend) {
    const status = flaskBackend.getStatus();
    logger.debug('Flask backend status', status);
    return status;
  }
  
  return {
    isRunning: false,
    isStarting: false,
    port: null,
    pid: null,
  };
});

/**
 * IPC Handler: Load model configurations from file system
 */
ipcMain.handle('load-model-configs', async () => {
  logger.info('IPC: load-model-configs called');
  
  try {
    const configPath = getModelConfigPath();
    logger.debug('Loading model configs from file', { path: configPath });

    // Check if file exists
    if (!fs.existsSync(configPath)) {
      logger.info('Model config file does not exist, returning empty config');
      return {
        success: true,
        data: { models: [] },
      };
    }

    // Read file
    const fileContent = fs.readFileSync(configPath, 'utf-8');
    const configs = JSON.parse(fileContent);

    logger.success('Model configurations loaded successfully', {
      count: configs.models?.length || 0,
    });

    return {
      success: true,
      data: configs,
    };
  } catch (error) {
    logger.error('Failed to load model configurations', {
      error: error.message,
      stack: error.stack,
    });

    return {
      success: false,
      error: error.message,
      data: { models: [] },
    };
  }
});

/**
 * IPC Handler: Load AI Chat state from file system
 */
ipcMain.handle('load-ai-chat-state', async () => {
  logger.info('IPC: load-ai-chat-state called');

  try {
    const statePath = getAIChatStatePath();
    logger.debug('Loading AI Chat state from file', { path: statePath });

    if (!fs.existsSync(statePath)) {
      logger.info('AI Chat state file does not exist, returning null state');
      return {
        success: true,
        data: null,
      };
    }

    const fileContent = fs.readFileSync(statePath, 'utf-8');

    if (!fileContent || fileContent.trim().length === 0) {
      logger.warn('AI Chat state file is empty, returning null state');
      return {
        success: true,
        data: null,
      };
    }

    let state;

    try {
      state = JSON.parse(fileContent);
    } catch (parseError) {
      logger.error('Failed to parse AI Chat state file', {
        error: parseError.message,
        stack: parseError.stack,
      });

      return {
        success: false,
        error: parseError.message,
        data: null,
      };
    }

    logger.success('AI Chat state loaded successfully', {
      hasState: !!state,
      conversations: Array.isArray(state?.conversations) ? state.conversations.length : 0,
      hasActiveConversation: !!state?.activeConversationId,
    });

    return {
      success: true,
      data: state,
    };
  } catch (error) {
    logger.error('Failed to load AI Chat state', {
      error: error.message,
      stack: error.stack,
    });

    return {
      success: false,
      error: error.message,
      data: null,
    };
  }
});

/**
 * IPC Handler: Save AI Chat state to file system
 */
ipcMain.handle('save-ai-chat-state', async (event, state) => {
  logger.info('IPC: save-ai-chat-state called', {
    hasState: !!state,
    conversations: Array.isArray(state?.conversations) ? state.conversations.length : 0,
  });

  try {
    const statePath = getAIChatStatePath();
    logger.debug('Saving AI Chat state to file', { path: statePath });

    const stateDir = path.dirname(statePath);
    if (!fs.existsSync(stateDir)) {
      logger.debug('Creating AI Chat state directory', { dir: stateDir });
      fs.mkdirSync(stateDir, { recursive: true });
    }

    const jsonContent = JSON.stringify(state, null, 2);
    fs.writeFileSync(statePath, jsonContent, 'utf-8');

    logger.success('AI Chat state saved successfully', {
      path: statePath,
      size: `${jsonContent.length} bytes`,
    });

    return {
      success: true,
    };
  } catch (error) {
    logger.error('Failed to save AI Chat state', {
      error: error.message,
      stack: error.stack,
    });

    return {
      success: false,
      error: error.message,
    };
  }
});

/**
 * IPC Handler: Save model configurations to file system
 */
ipcMain.handle('save-model-configs', async (event, configs) => {
  logger.info('IPC: save-model-configs called', {
    modelCount: configs.models?.length || 0,
  });

  try {
    const configPath = getModelConfigPath();
    logger.debug('Saving model configs to file', { path: configPath });

    // Ensure directory exists
    const configDir = path.dirname(configPath);
    if (!fs.existsSync(configDir)) {
      logger.debug('Creating config directory', { dir: configDir });
      fs.mkdirSync(configDir, { recursive: true });
    }

    // Write file with pretty formatting
    const jsonContent = JSON.stringify(configs, null, 2);
    fs.writeFileSync(configPath, jsonContent, 'utf-8');

    logger.success('Model configurations saved successfully', {
      path: configPath,
      count: configs.models?.length || 0,
      size: `${jsonContent.length} bytes`,
    });

    return {
      success: true,
    };
  } catch (error) {
    logger.error('Failed to save model configurations', {
      error: error.message,
      stack: error.stack,
    });

    return {
      success: false,
      error: error.message,
    };
  }
});

/**
 * IPC Handler: Load MCP configurations from file system
 */
ipcMain.handle('load-mcp-configs', async () => {
  logger.info('IPC: load-mcp-configs called');
  
  try {
    const configPath = getMCPConfigPath();
    logger.debug('Loading MCP configs from file', { path: configPath });

    // Check if file exists
    if (!fs.existsSync(configPath)) {
      logger.info('MCP config file does not exist, creating default config');
      
      // Create default MCP configuration
      const defaultConfig = {
        mcpServers: [
          {
            id: `mcp_${Date.now()}`,
            name: 'tavily-ai-tavily-mcp',
            command: 'npx',
            args: ['-y', 'tavily-mcp@latest'],
            env: {
              // TAVILY_API_KEY: 'your-api-key-here' // Example: Uncomment and set your API key
            },
            isEnabled: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            id: `mcp_${Date.now() + 1}`,
            name: 'caiyili-baidu-search-mcp',
            command: 'npx',
            args: ['baidu-search-mcp', '--max-result=5', '--fetch-content-count=2', '--max-content-length=2000'],
            env: {},
            isEnabled: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
      };

      // Ensure directory exists
      const configDir = path.dirname(configPath);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }

      // Write default config
      fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2), 'utf-8');
      
      logger.success('Default MCP configuration created', {
        count: defaultConfig.mcpServers.length,
      });

      return {
        success: true,
        data: defaultConfig,
      };
    }

    // Read file
    const fileContent = fs.readFileSync(configPath, 'utf-8');
    const configs = JSON.parse(fileContent);

    // CRITICAL: Force all MCP servers to be disabled on load
    // This ensures MCP functionality is always closed by default when entering the software
    const enabledMCPs = (configs.mcpServers || []).filter(mcp => mcp.isEnabled === true);
    
    if (enabledMCPs.length > 0) {
      logger.info('Disabling all enabled MCP servers on load (default closed state)', {
        enabledCount: enabledMCPs.length,
        enabledMCPNames: enabledMCPs.map(m => m.name),
      });

      // Stop any running MCP server processes
      for (const mcp of enabledMCPs) {
        try {
          if (mcpProcesses.has(mcp.id)) {
            logger.debug('Stopping MCP server process on load', {
              id: mcp.id,
              name: mcp.name,
            });
            
            const mcpData = mcpProcesses.get(mcp.id);
            if (mcpData && mcpData.process) {
              mcpData.process.kill();
              mcpProcesses.delete(mcp.id);
              logger.success('MCP server process stopped on load', {
                id: mcp.id,
                name: mcp.name,
              });
            }
          } else {
            logger.debug('MCP server not running, skipping stop', {
              id: mcp.id,
              name: mcp.name,
            });
          }
        } catch (error) {
          logger.warn('Exception while stopping MCP server on load', {
            id: mcp.id,
            name: mcp.name,
            error: error.message,
          });
        }
      }

      // Force all MCPs to be disabled
      const currentTime = new Date().toISOString();
      configs.mcpServers = configs.mcpServers.map(mcp => ({
        ...mcp,
        isEnabled: false,
        updatedAt: mcp.isEnabled ? currentTime : mcp.updatedAt, // Only update timestamp if state changed
      }));

      // Save the updated configuration to ensure persistence
      logger.debug('Saving MCP configurations with all servers disabled', {
        totalCount: configs.mcpServers.length,
      });
      
      try {
        // Ensure directory exists
        const configDir = path.dirname(configPath);
        if (!fs.existsSync(configDir)) {
          fs.mkdirSync(configDir, { recursive: true });
        }
        
        fs.writeFileSync(configPath, JSON.stringify(configs, null, 2), 'utf-8');
        logger.success('MCP configurations saved with all servers disabled', {
          totalCount: configs.mcpServers.length,
        });
      } catch (saveError) {
        logger.warn('Failed to save MCP configurations after disabling servers', {
          error: saveError.message,
        });
      }
    } else {
      logger.debug('All MCP servers are already disabled, no action needed', {
        totalCount: configs.mcpServers?.length || 0,
      });
    }

    logger.success('MCP configurations loaded successfully', {
      count: configs.mcpServers?.length || 0,
      allDisabled: true,
    });

    return {
      success: true,
      data: configs,
    };
  } catch (error) {
    logger.error('Failed to load MCP configurations', {
      error: error.message,
      stack: error.stack,
    });

    return {
      success: false,
      error: error.message,
      data: { mcpServers: [] },
    };
  }
});

/**
 * IPC Handler: Save MCP configurations to file system
 */
ipcMain.handle('save-mcp-configs', async (event, configs) => {
  logger.info('IPC: save-mcp-configs called', {
    mcpCount: configs.mcpServers?.length || 0,
  });

  try {
    const configPath = getMCPConfigPath();
    logger.debug('Saving MCP configs to file', { path: configPath });

    // Ensure directory exists
    const configDir = path.dirname(configPath);
    if (!fs.existsSync(configDir)) {
      logger.debug('Creating config directory', { dir: configDir });
      fs.mkdirSync(configDir, { recursive: true });
    }

    // Write file with pretty formatting
    const jsonContent = JSON.stringify(configs, null, 2);
    fs.writeFileSync(configPath, jsonContent, 'utf-8');

    logger.success('MCP configurations saved successfully', {
      path: configPath,
      count: configs.mcpServers?.length || 0,
      size: `${jsonContent.length} bytes`,
    });

    return {
      success: true,
    };
  } catch (error) {
    logger.error('Failed to save MCP configurations', {
      error: error.message,
      stack: error.stack,
    });

    return {
      success: false,
      error: error.message,
    };
  }
});

/**
 * IPC Handler: Start MCP server
 */
ipcMain.handle('start-mcp-server', async (event, id, mcpConfig) => {
  logger.info('IPC: start-mcp-server called', {
    id,
    name: mcpConfig.name,
    command: mcpConfig.command,
  });

  try {
    // Check if already running
    if (mcpProcesses.has(id)) {
      logger.warn('MCP server already running', { id });
      return {
        success: false,
        error: 'MCP server is already running',
      };
    }

    const { spawn } = require('child_process');

    // Prepare environment variables
    const processEnv = { ...process.env };
    
    // Add MCP-specific environment variables if configured
    if (mcpConfig.env && typeof mcpConfig.env === 'object') {
      Object.assign(processEnv, mcpConfig.env);
      logger.debug('Adding environment variables to MCP process', {
        id,
        envVarCount: Object.keys(mcpConfig.env).length,
        envVarKeys: Object.keys(mcpConfig.env),
      });
    }

    // Spawn MCP process
    logger.debug('Spawning MCP process', {
      id,
      command: mcpConfig.command,
      args: mcpConfig.args,
      hasCustomEnv: mcpConfig.env && Object.keys(mcpConfig.env).length > 0,
    });

    const mcpProcess = spawn(mcpConfig.command, mcpConfig.args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
      env: processEnv, // Pass environment variables to the process
    });

    // Store process
    mcpProcesses.set(id, {
      process: mcpProcess,
      config: mcpConfig,
      startedAt: new Date().toISOString(),
    });

    // Handle process output
    mcpProcess.stdout.on('data', (data) => {
      logger.debug(`MCP [${id}] stdout`, { output: data.toString() });
    });

    mcpProcess.stderr.on('data', (data) => {
      logger.warn(`MCP [${id}] stderr`, { output: data.toString() });
    });

    // Handle process exit
    mcpProcess.on('exit', (code, signal) => {
      logger.info(`MCP server exited [${id}]`, { code, signal });
      mcpProcesses.delete(id);
    });

    mcpProcess.on('error', (error) => {
      logger.error(`MCP server error [${id}]`, {
        error: error.message,
      });
      mcpProcesses.delete(id);
    });

    logger.success('MCP server started successfully', {
      id,
      name: mcpConfig.name,
      pid: mcpProcess.pid,
    });

    return {
      success: true,
      pid: mcpProcess.pid,
    };
  } catch (error) {
    logger.error('Failed to start MCP server', {
      id,
      error: error.message,
      stack: error.stack,
    });

    return {
      success: false,
      error: error.message,
    };
  }
});

/**
 * IPC Handler: Stop MCP server
 */
ipcMain.handle('stop-mcp-server', async (event, id) => {
  logger.info('IPC: stop-mcp-server called', { id });

  try {
    const mcpData = mcpProcesses.get(id);

    if (!mcpData) {
      logger.warn('MCP server not running', { id });
      return {
        success: false,
        error: 'MCP server is not running',
      };
    }

    const { process: mcpProcess, config } = mcpData;

    // Kill process
    logger.debug('Killing MCP process', {
      id,
      pid: mcpProcess.pid,
    });

    mcpProcess.kill('SIGTERM');

    // Wait a bit for graceful shutdown
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Force kill if still running
    if (!mcpProcess.killed) {
      logger.warn('MCP process did not exit gracefully, force killing', { id });
      mcpProcess.kill('SIGKILL');
    }

    // Remove from map
    mcpProcesses.delete(id);

    logger.success('MCP server stopped successfully', {
      id,
      name: config.name,
    });

    return {
      success: true,
    };
  } catch (error) {
    logger.error('Failed to stop MCP server', {
      id,
      error: error.message,
      stack: error.stack,
    });

    return {
      success: false,
      error: error.message,
    };
  }
});

/**
 * IPC Handler: Get MCP server status
 */
ipcMain.handle('get-mcp-server-status', async (event, id) => {
  const mcpData = mcpProcesses.get(id);

  if (!mcpData) {
    return {
      isRunning: false,
    };
  }

  return {
    isRunning: true,
    pid: mcpData.process.pid,
    startedAt: mcpData.startedAt,
    name: mcpData.config.name,
  };
});

/**
 * IPC Handler: Load chat bot configurations from file system
 */
ipcMain.handle('load-chat-bot-configs', async () => {
  logger.info('IPC: load-chat-bot-configs called');
  
  try {
    const configPath = getChatBotConfigPath();
    logger.debug('Loading chat bot configs from file', { path: configPath });

    // Check if file exists
    if (!fs.existsSync(configPath)) {
      logger.info('Chat bot config file does not exist, returning empty config');
      return {
        success: true,
        data: { bots: [] },
      };
    }

    // Read file
    const fileContent = fs.readFileSync(configPath, 'utf-8');
    const configs = JSON.parse(fileContent);

    logger.success('Chat bot configurations loaded successfully', {
      count: configs.bots?.length || 0,
    });

    return {
      success: true,
      data: configs,
    };
  } catch (error) {
    logger.error('Failed to load chat bot configurations', {
      error: error.message,
      stack: error.stack,
    });

    return {
      success: false,
      error: error.message,
      data: { bots: [] },
    };
  }
});

/**
 * IPC Handler: Save chat bot configurations to file system
 */
ipcMain.handle('save-chat-bot-configs', async (event, configs) => {
  logger.info('IPC: save-chat-bot-configs called', {
    botCount: configs.bots?.length || 0,
  });

  try {
    const configPath = getChatBotConfigPath();
    logger.debug('Saving chat bot configs to file', { path: configPath });

    // Ensure directory exists
    const configDir = path.dirname(configPath);
    if (!fs.existsSync(configDir)) {
      logger.debug('Creating config directory', { dir: configDir });
      fs.mkdirSync(configDir, { recursive: true });
    }

    // Write file with pretty formatting
    const jsonContent = JSON.stringify(configs, null, 2);
    fs.writeFileSync(configPath, jsonContent, 'utf-8');

    logger.success('Chat bot configurations saved successfully', {
      path: configPath,
      count: configs.bots?.length || 0,
      size: `${jsonContent.length} bytes`,
    });

    return {
      success: true,
    };
  } catch (error) {
    logger.error('Failed to save chat bot configurations', {
      error: error.message,
      stack: error.stack,
    });

    return {
      success: false,
      error: error.message,
    };
  }
});

/**
 * IPC Handler: Load image service configurations from file system
 */
ipcMain.handle('load-image-service-configs', async () => {
  logger.info('IPC: load-image-service-configs called');
  
  try {
    const configPath = getImageServiceConfigPath();
    logger.debug('Loading image service configs from file', { path: configPath });

    // Check if file exists
    if (!fs.existsSync(configPath)) {
      logger.info('Image service config file does not exist, creating default config');
      
      // Create default image service configuration with Unsplash
      const defaultApiKeys = [
        'pNt91wUHTHCzruNDxcJcP5POjKb-qV_RSIE4ZXDvMk4',
        'fKuy32Nf8HRuRyFYPyaORvdZ0hc-oeQ-xb9zPz2Baeo',
      ];
      
      const defaultServiceId = `image_service_${Date.now()}`;
      const defaultConfig = {
        imageServices: [
          {
            id: defaultServiceId,
            name: 'Unsplash',
            type: 'unsplash',
            apiKeys: defaultApiKeys,
            isDefault: true,
            isDeletable: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
        defaultServiceId: defaultServiceId,
      };

      // Ensure directory exists
      const configDir = path.dirname(configPath);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }

      // Write default config
      fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2), 'utf-8');
      
      logger.success('Default image service configuration created', {
        count: defaultConfig.imageServices.length,
      });

      return {
        success: true,
        data: defaultConfig,
      };
    }

    // Read file
    const fileContent = fs.readFileSync(configPath, 'utf-8');
    const configs = JSON.parse(fileContent);

    logger.success('Image service configurations loaded successfully', {
      count: configs.imageServices?.length || 0,
    });

    return {
      success: true,
      data: configs,
    };
  } catch (error) {
    logger.error('Failed to load image service configurations', {
      error: error.message,
      stack: error.stack,
    });

    return {
      success: false,
      error: error.message,
      data: { imageServices: [] },
    };
  }
});

/**
 * IPC Handler: Save image service configurations to file system
 */
ipcMain.handle('save-image-service-configs', async (event, configs) => {
  logger.info('IPC: save-image-service-configs called', {
    serviceCount: configs.imageServices?.length || 0,
  });

  try {
    const configPath = getImageServiceConfigPath();
    logger.debug('Saving image service configs to file', { path: configPath });

    // Ensure directory exists
    const configDir = path.dirname(configPath);
    if (!fs.existsSync(configDir)) {
      logger.debug('Creating config directory', { dir: configDir });
      fs.mkdirSync(configDir, { recursive: true });
    }

    // Write file with pretty formatting
    const jsonContent = JSON.stringify(configs, null, 2);
    fs.writeFileSync(configPath, jsonContent, 'utf-8');

    logger.success('Image service configurations saved successfully', {
      path: configPath,
      count: configs.imageServices?.length || 0,
      size: `${jsonContent.length} bytes`,
    });

    return {
      success: true,
    };
  } catch (error) {
    logger.error('Failed to save image service configurations', {
      error: error.message,
      stack: error.stack,
    });

    return {
      success: false,
      error: error.message,
    };
  }
});

/**
 * IPC Handler: Load search service configurations from file system
 */
ipcMain.handle('load-search-service-configs', async () => {
  logger.info('IPC: load-search-service-configs called');
  
  try {
    const configPath = getSearchServiceConfigPath();
    logger.debug('Loading search service configs from file', { path: configPath });

    // Check if file exists
    if (!fs.existsSync(configPath)) {
      logger.info('Search service config file does not exist, creating default config');
      
      // Create default search service configuration with Tavily
      const defaultApiKeys = [
        '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',
        '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',
      ];
      
      const defaultServiceId = `search_service_${Date.now()}`;
      const defaultConfig = {
        searchServices: [
          {
            id: defaultServiceId,
            name: 'Tavily Search',
            type: 'tavily',
            apiKeys: defaultApiKeys,
            isDefault: true,
            isDeletable: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
        defaultServiceId: defaultServiceId,
      };

      // Ensure directory exists
      const configDir = path.dirname(configPath);
      if (!fs.existsSync(configDir)) {
        logger.debug('Creating config directory', { dir: configDir });
        fs.mkdirSync(configDir, { recursive: true });
      }

      // Write default config
      const jsonContent = JSON.stringify(defaultConfig, null, 2);
      fs.writeFileSync(configPath, jsonContent, 'utf-8');

      logger.success('Default search service configuration created', {
        path: configPath,
        count: defaultConfig.searchServices.length,
      });

      return {
        success: true,
        data: defaultConfig,
      };
    }

    // Load existing config
    const jsonContent = fs.readFileSync(configPath, 'utf-8');
    const configs = JSON.parse(jsonContent);

    logger.success('Search service configurations loaded successfully', {
      path: configPath,
      count: configs.searchServices?.length || 0,
    });

    return {
      success: true,
      data: configs,
    };
  } catch (error) {
    logger.error('Failed to load search service configurations', {
      error: error.message,
      stack: error.stack,
    });

    return {
      success: false,
      error: error.message,
      data: { searchServices: [] },
    };
  }
});

/**
 * IPC Handler: Save search service configurations to file system
 */
ipcMain.handle('save-search-service-configs', async (event, configs) => {
  logger.info('IPC: save-search-service-configs called', {
    serviceCount: configs.searchServices?.length || 0,
  });

  try {
    const configPath = getSearchServiceConfigPath();
    logger.debug('Saving search service configs to file', { path: configPath });

    // Ensure directory exists
    const configDir = path.dirname(configPath);
    if (!fs.existsSync(configDir)) {
      logger.debug('Creating config directory', { dir: configDir });
      fs.mkdirSync(configDir, { recursive: true });
    }

    // Write file with pretty formatting
    const jsonContent = JSON.stringify(configs, null, 2);
    fs.writeFileSync(configPath, jsonContent, 'utf-8');

    logger.success('Search service configurations saved successfully', {
      path: configPath,
      count: configs.searchServices?.length || 0,
      size: `${jsonContent.length} bytes`,
    });

    return {
      success: true,
    };
  } catch (error) {
    logger.error('Failed to save search service configurations', {
      error: error.message,
      stack: error.stack,
    });

    return {
      success: false,
      error: error.message,
    };
  }
});

/**
 * Load display configuration from file system
 */
ipcMain.handle('load-display-config', async () => {
  logger.info('IPC: load-display-config called');
  
  try {
    const configPath = getDisplayConfigPath();
    logger.debug('Loading display config from file', { path: configPath });

    // Check if file exists
    if (!fs.existsSync(configPath)) {
      logger.info('Display config file does not exist, returning default config');
      return {
        success: true,
        data: {
          fontSize: {
            level: 'medium',
            scale: 1.0,
          },
        },
      };
    }

    // Read file
    const fileContent = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(fileContent);

    logger.success('Display configuration loaded successfully', {
      fontSizeLevel: config.fontSize?.level || 'medium',
      fontSizeScale: config.fontSize?.scale || 1.0,
    });

    return {
      success: true,
      data: config,
    };
  } catch (error) {
    logger.error('Failed to load display configuration', {
      error: error.message,
      stack: error.stack,
    });

    return {
      success: false,
      error: error.message,
      data: {
        fontSize: {
          level: 'medium',
          scale: 1.0,
        },
      },
    };
  }
});

/**
 * Save display configuration to file system
 */
ipcMain.handle('save-display-config', async (event, config) => {
  logger.info('IPC: save-display-config called', {
    fontSizeLevel: config.fontSize?.level || 'medium',
    fontSizeScale: config.fontSize?.scale || 1.0,
  });

  try {
    const configPath = getDisplayConfigPath();
    logger.debug('Saving display config to file', { path: configPath });

    // Ensure directory exists
    const configDir = path.dirname(configPath);
    if (!fs.existsSync(configDir)) {
      logger.debug('Creating config directory', { dir: configDir });
      fs.mkdirSync(configDir, { recursive: true });
    }

    // Write file with pretty formatting
    const jsonContent = JSON.stringify(config, null, 2);
    fs.writeFileSync(configPath, jsonContent, 'utf-8');

    logger.success('Display configuration saved successfully', {
      path: configPath,
      fontSizeLevel: config.fontSize?.level || 'medium',
      fontSizeScale: config.fontSize?.scale || 1.0,
      size: `${jsonContent.length} bytes`,
    });

    return {
      success: true,
    };
  } catch (error) {
    logger.error('Failed to save display configuration', {
      error: error.message,
      stack: error.stack,
    });

    return {
      success: false,
      error: error.message,
    };
  }
});

logger.info('Electron main process initialized');

