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
 * Clean directory
 */
function cleanDirectory(dirPath) {
  const fullPath = path.resolve(dirPath);
  logger.info(`Cleaning directory: ${fullPath}`);
  
  if (fs.existsSync(fullPath)) {
    try {
      fs.rmSync(fullPath, { recursive: true, force: true });
      logger.success(`Directory cleaned: ${fullPath}`);
    } catch (error) {
      logger.error(`Failed to clean directory: ${fullPath}`, error);
      throw error;
    }
  } else {
    logger.info(`Directory does not exist, skipping clean: ${fullPath}`);
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
    if (fs.existsSync(apiDir)) {
      logger.info('Temporarily moving API routes folder');
      fs.renameSync(apiDir, apiBackupDir);
      apiMoved = true;
      logger.success('API routes folder moved temporarily');
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
      fs.renameSync(apiBackupDir, apiDir);
      logger.success('API routes folder restored');
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
    cleanDirectory('out');
    cleanDirectory('dist');
    cleanDirectory('.next');
    
    // Step 3: Build Next.js app
    buildNextApp();
    
    // Step 4: Fix Electron paths
    fixElectronPaths();
    
    // Step 5: Package with Electron
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

