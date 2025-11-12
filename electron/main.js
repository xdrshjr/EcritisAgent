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
 * - Default size: 1024x768
 * - Minimum size: 800x600
 * - Resizable: Yes
 */

const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

// Window configuration constants
const WINDOW_CONFIG = {
  DEFAULT_WIDTH: 1024,
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

/**
 * Create the main application window
 */
function createWindow() {
  logger.info('Creating main application window');
  logger.info('Window configuration', WINDOW_CONFIG);

  try {
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
      title: 'AIDocMaster',
      icon: path.join(__dirname, '../app/favicon.ico'),
      backgroundColor: '#ffffff',
      show: false, // Don't show until ready
    });

    logger.success('Main window created successfully', {
      width: WINDOW_CONFIG.DEFAULT_WIDTH,
      height: WINDOW_CONFIG.DEFAULT_HEIGHT,
      minWidth: WINDOW_CONFIG.MIN_WIDTH,
      minHeight: WINDOW_CONFIG.MIN_HEIGHT,
    });

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
app.on('ready', () => {
  logger.info('Application ready', {
    version: app.getVersion(),
    name: app.getName(),
    userDataPath: app.getPath('userData'),
    appPath: app.getAppPath(),
  });

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
app.on('before-quit', () => {
  logger.info('Application preparing to quit');
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
 * Get model configuration file path
 */
function getModelConfigPath() {
  return path.join(app.getPath('userData'), MODEL_CONFIG_FILE);
}

/**
 * IPC Handlers
 */
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

logger.info('Electron main process initialized');

