/**
 * Desktop Build Script
 * 
 * This script handles the complete build process for packaging the Next.js application
 * as a Windows desktop application using Electron.
 * 
 * Features:
 * - Builds Next.js app in static export mode
 * - Packages the app with Electron
 * - Creates Windows installer
 * - Comprehensive logging throughout the process
 * 
 * Usage: node scripts/build-desktop.js
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { main: bundlePython, checkExistingPython } = require('./bundle-python');

// ANSI color codes for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

/**
 * Logger utility for build process
 */
class BuildLogger {
  constructor() {
    this.startTime = Date.now();
    this.stepNumber = 0;
  }

  getTimestamp() {
    return new Date().toISOString();
  }

  getElapsedTime() {
    const elapsed = Date.now() - this.startTime;
    const seconds = Math.floor(elapsed / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return minutes > 0 
      ? `${minutes}m ${remainingSeconds}s` 
      : `${remainingSeconds}s`;
  }

  info(message, data = null) {
    console.log(`${colors.blue}[INFO]${colors.reset} [${this.getTimestamp()}] ${message}`);
    if (data) {
      console.log(`${colors.cyan}${JSON.stringify(data, null, 2)}${colors.reset}`);
    }
  }

  success(message, data = null) {
    console.log(`${colors.green}[SUCCESS]${colors.reset} [${this.getTimestamp()}] ✓ ${message}`);
    if (data) {
      console.log(`${colors.cyan}${JSON.stringify(data, null, 2)}${colors.reset}`);
    }
  }

  error(message, error = null) {
    console.error(`${colors.red}[ERROR]${colors.reset} [${this.getTimestamp()}] ✗ ${message}`);
    if (error) {
      console.error(`${colors.red}${error.stack || error}${colors.reset}`);
    }
  }

  warn(message, data = null) {
    console.warn(`${colors.yellow}[WARN]${colors.reset} [${this.getTimestamp()}] ⚠ ${message}`);
    if (data) {
      console.log(`${colors.cyan}${JSON.stringify(data, null, 2)}${colors.reset}`);
    }
  }

  step(message) {
    this.stepNumber++;
    console.log(`\n${colors.bright}${colors.cyan}[STEP ${this.stepNumber}]${colors.reset} ${message}`);
    console.log(`${colors.cyan}${'='.repeat(80)}${colors.reset}`);
  }

  separator() {
    console.log(`${colors.cyan}${'-'.repeat(80)}${colors.reset}`);
  }
}

const logger = new BuildLogger();

/**
 * Execute command with detailed logging
 */
function executeCommand(command, description) {
  logger.info(`Executing: ${description}`);
  logger.info(`Command: ${command}`);
  
  try {
    const output = execSync(command, { 
      encoding: 'utf-8',
      stdio: 'pipe',
      env: { ...process.env }
    });
    
    if (output && output.trim()) {
      logger.info('Command output:', { output: output.trim() });
    }
    
    logger.success(`Completed: ${description}`);
    return output;
  } catch (error) {
    logger.error(`Failed: ${description}`, error);
    throw error;
  }
}

/**
 * Check if directory exists, create if not
 */
function ensureDirectory(dirPath) {
  const fullPath = path.resolve(dirPath);
  logger.info(`Checking directory: ${fullPath}`);
  
  if (!fs.existsSync(fullPath)) {
    logger.warn(`Directory does not exist, creating: ${fullPath}`);
    fs.mkdirSync(fullPath, { recursive: true });
    logger.success(`Directory created: ${fullPath}`);
  } else {
    logger.info(`Directory exists: ${fullPath}`);
  }
  
  return fullPath;
}

/**
 * Clean directory with retry logic for locked files
 */
function cleanDirectory(dirPath, retries = 3, delay = 1000) {
  const fullPath = path.resolve(dirPath);
  logger.info(`Cleaning directory: ${fullPath}`);
  
  if (!fs.existsSync(fullPath)) {
    logger.info(`Directory does not exist, skipping clean: ${fullPath}`);
    return;
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      fs.rmSync(fullPath, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
      logger.success(`Directory cleaned: ${fullPath}`);
      return;
    } catch (error) {
      if (error.code === 'EBUSY' || error.code === 'ENOTEMPTY' || error.code === 'EPERM') {
        if (attempt < retries) {
          logger.warn(`Directory is locked (attempt ${attempt}/${retries}), retrying in ${delay}ms...`);
          logger.info('💡 Tip: Close the application if it\'s running');
          
          // Wait before retry
          const start = Date.now();
          while (Date.now() - start < delay) {
            // Busy wait
          }
        } else {
          logger.error(`Failed to clean directory after ${retries} attempts: ${fullPath}`, error);
          logger.warn('⚠️  The application may be running. Please close it and try again.');
          throw error;
        }
      } else {
        // Other errors, throw immediately
        logger.error(`Failed to clean directory: ${fullPath}`, error);
        throw error;
      }
    }
  }
}

/**
 * Verify required files exist
 */
function verifyRequiredFiles() {
  logger.step('Verifying Required Files');
  
  const requiredFiles = [
    'package.json',
    'next.config.ts',
    'electron/main.js',
    'electron/preload.js',
    'electron-builder.json'
  ];
  
  const missingFiles = [];
  
  requiredFiles.forEach(file => {
    const filePath = path.resolve(file);
    logger.info(`Checking file: ${filePath}`);
    
    if (fs.existsSync(filePath)) {
      logger.success(`File exists: ${file}`);
    } else {
      logger.error(`File missing: ${file}`);
      missingFiles.push(file);
    }
  });
  
  // Verify build directory and icon file
  const buildDir = path.resolve('build');
  const iconFile = path.join(buildDir, 'icon.ico');
  const sourceIcon = path.resolve('public/logoEcritis.ico');
  
  logger.info('Checking build directory and icon file');
  
  if (!fs.existsSync(buildDir)) {
    logger.warn('Build directory does not exist, creating it');
    fs.mkdirSync(buildDir, { recursive: true });
    logger.success('Build directory created');
  }
  
  if (!fs.existsSync(iconFile)) {
    logger.warn('Icon file not found in build directory');
    
    if (fs.existsSync(sourceIcon)) {
      logger.info('Copying icon file from public directory to build directory');
      fs.copyFileSync(sourceIcon, iconFile);
      logger.success('Icon file copied to build directory');
    } else {
      logger.error(`Source icon file not found: ${sourceIcon}`);
      missingFiles.push('build/icon.ico');
    }
  } else {
    logger.success('Icon file exists in build directory');
  }
  
  if (missingFiles.length > 0) {
    throw new Error(`Missing required files: ${missingFiles.join(', ')}`);
  }
  
  logger.success('All required files verified');
}

/**
 * Build Next.js application
 */
function buildNextApp() {
  logger.step('Building Next.js Application');
  
  logger.info('Starting Next.js static export build');
  logger.info('Build configuration: Static export mode for Electron');
  
  // Temporarily move API folder outside app directory to exclude it from static export
  const apiDir = path.resolve('app/api');
  const apiBackupDir = path.resolve('.api_backup_temp');
  let apiMoved = false;
  
  try {
    // Clean up any existing backup directory first
    if (fs.existsSync(apiBackupDir)) {
      logger.info('Removing existing backup directory');
      fs.rmSync(apiBackupDir, { recursive: true, force: true });
    }
    
    if (fs.existsSync(apiDir)) {
      logger.info('Temporarily moving API routes folder');
      
      // Use a more robust method for Windows
      try {
        fs.renameSync(apiDir, apiBackupDir);
        apiMoved = true;
        logger.success('API routes folder moved temporarily');
      } catch (renameError) {
        // Fallback: copy and delete if rename fails (Windows file lock issue)
        logger.warn('Rename failed, attempting copy and delete', {
          error: renameError.message
        });
        
        // Copy recursively
        fs.cpSync(apiDir, apiBackupDir, { recursive: true });
        
        // Delete original
        fs.rmSync(apiDir, { recursive: true, force: true });
        
        apiMoved = true;
        logger.success('API routes folder moved temporarily (via copy)');
      }
    }
    
    // Set environment variable for desktop build mode
    process.env.BUILD_MODE = 'desktop';
    logger.info('Environment: BUILD_MODE=desktop');
    
    // Use the environment variable already set in process.env
    executeCommand(
      'npm run build',
      'Next.js build process'
    );
    
    // Verify out directory was created
    const outDir = path.resolve('out');
    if (!fs.existsSync(outDir)) {
      throw new Error('Next.js build failed: "out" directory not created');
    }
    
    // Check for critical files
    const indexPath = path.join(outDir, 'index.html');
    if (!fs.existsSync(indexPath)) {
      throw new Error('Next.js build failed: index.html not found in output');
    }
    
    logger.success('Next.js application built successfully', {
      outputDirectory: outDir,
      indexFile: indexPath
    });
    
  } finally {
    // Restore API folder
    if (apiMoved && fs.existsSync(apiBackupDir)) {
      logger.info('Restoring API routes folder');
      
      try {
        fs.renameSync(apiBackupDir, apiDir);
        logger.success('API routes folder restored');
      } catch (restoreError) {
        // Fallback: copy and delete if rename fails
        logger.warn('Rename failed during restore, attempting copy and delete', {
          error: restoreError.message
        });
        
        // Copy recursively
        fs.cpSync(apiBackupDir, apiDir, { recursive: true });
        
        // Delete backup
        fs.rmSync(apiBackupDir, { recursive: true, force: true });
        
        logger.success('API routes folder restored (via copy)');
      }
    }
  }
}

/**
 * Fix Electron paths in output
 */
function fixElectronPaths() {
  logger.step('Fixing Electron Paths');
  
  logger.info('Running path fix script to ensure Electron compatibility');
  logger.info('This ensures CSS and JS files load correctly via file:// protocol');
  
  executeCommand(
    'node scripts/fix-electron-paths.js',
    'Electron path fix process'
  );
  
  logger.success('Electron paths fixed successfully');
}

/**
 * Bundle Python runtime
 */
async function bundlePythonRuntime() {
  logger.step('Bundling Python Runtime');
  
  logger.info('Checking if Python runtime needs to be bundled');
  
  try {
    // Check if Python is already bundled
    if (checkExistingPython()) {
      logger.success('Python runtime is already bundled and verified');
      logger.info('Skipping Python bundling step');
      return;
    }
    
    logger.info('Python runtime not found or invalid, starting bundling process');
    
    // Run Python bundling process
    await bundlePython();
    
    // Verify Python was bundled successfully
    const pythonDir = path.resolve('python-embed');
    const pythonExe = path.join(pythonDir, 'python.exe');
    
    if (!fs.existsSync(pythonExe)) {
      throw new Error('Python bundling completed but python.exe not found');
    }
    
    logger.success('Python runtime bundled successfully', {
      pythonDirectory: pythonDir,
      pythonExecutable: pythonExe,
    });
    
  } catch (error) {
    logger.error('Failed to bundle Python runtime', error);
    throw error;
  }
}

/**
 * Package with Electron
 */
function packageElectron() {
  logger.step('Packaging with Electron Builder');
  
  logger.info('Starting Electron packaging process');
  logger.info('Target platform: Windows (win32)');
  logger.info('Target architecture: x64');
  
  // Use inherit stdio for real-time output
  logger.info('Executing: Electron packaging process');
  logger.info('Command: npm run build:electron');
  
  try {
    execSync('npm run build:electron', {
      encoding: 'utf-8',
      stdio: 'inherit',
      env: { ...process.env }
    });
    
    logger.success('Completed: Electron packaging process');
  } catch (error) {
    logger.error('Failed: Electron packaging process', error);
    throw error;
  }
  
  // Verify dist directory was created
  const distDir = path.resolve('dist');
  if (!fs.existsSync(distDir)) {
    throw new Error('Electron packaging failed: "dist" directory not created');
  }
  
  logger.success('Electron packaging completed successfully', {
    distributionDirectory: distDir
  });
  
  // List generated files
  try {
    const files = fs.readdirSync(distDir);
    logger.info('Generated distribution files:', {
      files: files,
      location: distDir
    });
  } catch (error) {
    logger.warn('Could not list distribution files', error);
  }
}

/**
 * Main build process
 */
async function main() {
  console.log(`\n${colors.bright}${colors.green}${'='.repeat(80)}${colors.reset}`);
  console.log(`${colors.bright}${colors.green}AIDocMaster Desktop Build Process${colors.reset}`);
  console.log(`${colors.bright}${colors.green}${'='.repeat(80)}${colors.reset}\n`);
  
  logger.info('Build process started');
  logger.info('Platform: Windows');
  logger.info('Node version: ' + process.version);
  logger.info('Working directory: ' + process.cwd());
  logger.separator();
  
  try {
    // Step 1: Verify required files
    verifyRequiredFiles();
    
    // Step 2: Clean previous builds
    logger.step('Cleaning Previous Builds');
    
    try {
      cleanDirectory('out');
      cleanDirectory('dist');
      cleanDirectory('.next');
    } catch (error) {
      if (error.code === 'EBUSY' || error.code === 'ENOTEMPTY' || error.code === 'EPERM') {
        logger.error('❌ Cannot clean build directories - files are locked');
        logger.info('');
        logger.info('📋 Please follow these steps:');
        logger.info('   1. Close the AIDocMaster application if it\'s running');
        logger.info('   2. Close any file explorer windows in the dist/ directory');
        logger.info('   3. Wait a few seconds for processes to fully exit');
        logger.info('   4. Run the build command again');
        logger.info('');
        logger.info('💡 Tip: Check Task Manager for any running "AIDocMaster" or "electron" processes');
        throw error;
      } else {
        throw error;
      }
    }
    
    // Step 3: Bundle Python runtime
    await bundlePythonRuntime();
    
    // Step 4: Build Next.js app
    buildNextApp();
    
    // Step 5: Fix Electron paths
    fixElectronPaths();
    
    // Step 6: Package with Electron
    packageElectron();
    
    // Build complete
    logger.separator();
    logger.success('Build process completed successfully!', {
      totalTime: logger.getElapsedTime(),
      outputDirectory: path.resolve('dist')
    });
    
    console.log(`\n${colors.bright}${colors.green}${'='.repeat(80)}${colors.reset}`);
    console.log(`${colors.bright}${colors.green}Build completed in ${logger.getElapsedTime()}${colors.reset}`);
    console.log(`${colors.bright}${colors.green}Distribution files are in: ${path.resolve('dist')}${colors.reset}`);
    console.log(`${colors.bright}${colors.green}${'='.repeat(80)}${colors.reset}\n`);
    
  } catch (error) {
    logger.separator();
    logger.error('Build process failed', error);
    
    console.log(`\n${colors.bright}${colors.red}${'='.repeat(80)}${colors.reset}`);
    console.log(`${colors.bright}${colors.red}Build failed after ${logger.getElapsedTime()}${colors.reset}`);
    console.log(`${colors.bright}${colors.red}${'='.repeat(80)}${colors.reset}\n`);
    
    process.exit(1);
  }
}

// Run the build process
main();

