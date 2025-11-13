/**
 * Python Bundling Script for Electron
 * 
 * This script downloads and prepares an embedded Python distribution
 * to be bundled with the Electron application, eliminating the need
 * for users to have Python installed on their system.
 * 
 * Features:
 * - Downloads Python embeddable package from official source
 * - Installs pip in embedded Python
 * - Installs all required Python dependencies
 * - Comprehensive logging throughout the process
 * 
 * Usage: node scripts/bundle-python.js
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { pipeline } = require('stream');
const { promisify } = require('util');
const streamPipeline = promisify(pipeline);

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
 * Logger utility for Python bundling process
 */
class PythonBundlerLogger {
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

  progress(message, percent) {
    const barLength = 40;
    const filled = Math.round(barLength * percent / 100);
    const bar = '█'.repeat(filled) + '░'.repeat(barLength - filled);
    process.stdout.write(`\r${colors.cyan}[PROGRESS]${colors.reset} ${message} ${bar} ${percent.toFixed(1)}%`);
  }
}

const logger = new PythonBundlerLogger();

/**
 * Python distribution configuration
 */
const PYTHON_CONFIG = {
  version: '3.11.9',
  // Python 3.11.9 embeddable package for Windows x64
  url: 'https://www.python.org/ftp/python/3.11.9/python-3.11.9-embed-amd64.zip',
  // Alternative mirror if primary fails
  alternativeUrls: [
    'https://www.python.org/ftp/python/3.11.9/python-3.11.9-embed-amd64.zip',
    // Add other mirrors if needed
  ],
  filename: 'python-embed.zip',
  extractDir: 'python-embed',
  getPipUrl: 'https://bootstrap.pypa.io/get-pip.py',
  getPipAlternativeUrl: 'https://github.com/pypa/get-pip/raw/main/public/get-pip.py',
};

/**
 * Download file with progress tracking and retry logic
 */
async function downloadFile(url, destination, retries = 3) {
  logger.info(`Downloading from: ${url}`);
  logger.info(`Saving to: ${destination}`);
  logger.info(`Retry attempts remaining: ${retries}`);

  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    
    const requestOptions = {
      timeout: 30000, // 30 seconds connection timeout
    };

    const request = protocol.get(url, requestOptions, (response) => {
      // Handle redirects
      if (response.statusCode === 301 || response.statusCode === 302) {
        logger.info('Following redirect', { location: response.headers.location });
        return downloadFile(response.headers.location, destination, retries)
          .then(resolve)
          .catch(reject);
      }

      if (response.statusCode !== 200) {
        const error = new Error(`Download failed with status code: ${response.statusCode}`);
        reject(error);
        return;
      }

      const totalSize = parseInt(response.headers['content-length'], 10);
      let downloadedSize = 0;
      let lastProgress = -1;
      let lastDataTime = Date.now();

      logger.info('Download started', {
        totalSize: totalSize ? `${(totalSize / 1024 / 1024).toFixed(2)} MB` : 'Unknown',
      });

      const fileStream = fs.createWriteStream(destination);

      // Set up inactivity timeout (15 minutes for the entire download)
      const inactivityTimeout = setTimeout(() => {
        request.destroy();
        fileStream.close();
        if (fs.existsSync(destination)) {
          fs.unlinkSync(destination);
        }
        reject(new Error('Download timeout: No data received for too long'));
      }, 900000); // 15 minutes

      response.on('data', (chunk) => {
        downloadedSize += chunk.length;
        lastDataTime = Date.now();
        
        if (totalSize) {
          const progress = (downloadedSize / totalSize) * 100;
          if (Math.floor(progress) > lastProgress) {
            lastProgress = Math.floor(progress);
            logger.progress('Downloading Python', progress);
          }
        } else {
          // If total size unknown, show downloaded size
          const downloadedMB = (downloadedSize / 1024 / 1024).toFixed(2);
          process.stdout.write(`\r${colors.cyan}[PROGRESS]${colors.reset} Downloaded: ${downloadedMB} MB`);
        }
      });

      response.pipe(fileStream);

      fileStream.on('finish', () => {
        clearTimeout(inactivityTimeout);
        fileStream.close();
        console.log(); // New line after progress bar
        logger.success('Download completed', {
          totalSize: `${(downloadedSize / 1024 / 1024).toFixed(2)} MB`,
          destination,
        });
        resolve();
      });

      fileStream.on('error', (error) => {
        clearTimeout(inactivityTimeout);
        if (fs.existsSync(destination)) {
          try {
            fs.unlinkSync(destination);
          } catch (e) {
            // Ignore cleanup errors
          }
        }
        reject(error);
      });

      response.on('error', (error) => {
        clearTimeout(inactivityTimeout);
        reject(error);
      });
    });

    request.on('error', (error) => {
      console.log(); // New line if progress was shown
      logger.error('Download request error', error);
      
      if (retries > 0) {
        logger.warn(`Retrying download... (${retries} attempts remaining)`);
        setTimeout(() => {
          downloadFile(url, destination, retries - 1)
            .then(resolve)
            .catch(reject);
        }, 2000); // Wait 2 seconds before retrying
      } else {
        reject(error);
      }
    });

    request.on('timeout', () => {
      console.log(); // New line if progress was shown
      request.destroy();
      const error = new Error('Connection timeout: Could not connect to server');
      logger.error('Request timeout', error);
      
      if (retries > 0) {
        logger.warn(`Retrying download... (${retries} attempts remaining)`);
        setTimeout(() => {
          downloadFile(url, destination, retries - 1)
            .then(resolve)
            .catch(reject);
        }, 2000); // Wait 2 seconds before retrying
      } else {
        reject(error);
      }
    });
  });
}

/**
 * Extract zip file (Windows compatible)
 */
function extractZip(zipPath, extractTo) {
  logger.info('Extracting Python package', { from: zipPath, to: extractTo });

  try {
    // Ensure extract directory exists
    if (!fs.existsSync(extractTo)) {
      fs.mkdirSync(extractTo, { recursive: true });
    }

    // Use PowerShell to extract (built-in to Windows)
    const command = `powershell -command "Expand-Archive -Path '${zipPath}' -DestinationPath '${extractTo}' -Force"`;
    
    execSync(command, {
      stdio: 'pipe',
      encoding: 'utf-8',
    });

    logger.success('Python package extracted successfully');
    
    // Verify extraction
    const files = fs.readdirSync(extractTo);
    logger.info('Extracted files', { count: files.length, files: files.slice(0, 10) });

  } catch (error) {
    logger.error('Failed to extract Python package', error);
    throw error;
  }
}

/**
 * Configure embedded Python for pip installation
 */
function configurePython(pythonDir) {
  logger.info('Configuring embedded Python for pip');

  try {
    // Path to python311._pth file (this controls import paths)
    const pthFiles = fs.readdirSync(pythonDir).filter(f => f.endsWith('._pth'));
    
    if (pthFiles.length === 0) {
      throw new Error('Could not find ._pth file in Python directory');
    }

    const pthFile = path.join(pythonDir, pthFiles[0]);
    logger.info('Found Python path configuration file', { file: pthFile });

    // Read current content
    let content = fs.readFileSync(pthFile, 'utf-8');
    logger.info('Current ._pth content', { content });

    // Uncomment import site line to enable pip
    content = content.replace(/^#\s*import site/m, 'import site');

    // Ensure Lib\site-packages is in the path
    if (!content.includes('Lib\\site-packages')) {
      content += '\nLib\\site-packages\n';
    }

    // Write updated content
    fs.writeFileSync(pthFile, content, 'utf-8');
    logger.success('Python configuration updated', { file: pthFile });

  } catch (error) {
    logger.error('Failed to configure Python', error);
    throw error;
  }
}

/**
 * Install pip in embedded Python
 */
async function installPip(pythonDir) {
  logger.info('Installing pip in embedded Python');

  try {
    const getPipPath = path.join(pythonDir, 'get-pip.py');
    
    // Download get-pip.py with retry and fallback
    try {
      await downloadFile(PYTHON_CONFIG.getPipUrl, getPipPath);
    } catch (primaryError) {
      logger.warn('Primary get-pip.py download failed, trying alternative source');
      await downloadFile(PYTHON_CONFIG.getPipAlternativeUrl, getPipPath);
    }

    // Run get-pip.py
    const pythonExe = path.join(pythonDir, 'python.exe');
    
    if (!fs.existsSync(pythonExe)) {
      throw new Error(`Python executable not found at: ${pythonExe}`);
    }

    logger.info('Running get-pip.py', { python: pythonExe });
    
    const output = execSync(`"${pythonExe}" "${getPipPath}"`, {
      cwd: pythonDir,
      encoding: 'utf-8',
      stdio: 'pipe',
    });

    logger.info('pip installation output', { output: output.trim() });
    logger.success('pip installed successfully');

    // Clean up get-pip.py
    fs.unlinkSync(getPipPath);
    logger.info('Cleaned up get-pip.py');

  } catch (error) {
    logger.error('Failed to install pip', error);
    throw error;
  }
}

/**
 * Install Python dependencies from requirements.txt
 */
function installDependencies(pythonDir) {
  logger.info('Installing Python dependencies');

  try {
    const pythonExe = path.join(pythonDir, 'python.exe');
    const requirementsPath = path.resolve('backend', 'requirements.txt');

    if (!fs.existsSync(requirementsPath)) {
      throw new Error(`requirements.txt not found at: ${requirementsPath}`);
    }

    logger.info('Installing from requirements.txt', { 
      python: pythonExe,
      requirements: requirementsPath 
    });

    // Install dependencies using pip
    const command = `"${pythonExe}" -m pip install -r "${requirementsPath}" --no-warn-script-location`;
    
    const output = execSync(command, {
      cwd: pythonDir,
      encoding: 'utf-8',
      stdio: 'pipe',
    });

    logger.info('Dependency installation output', { output: output.trim() });
    logger.success('All dependencies installed successfully');

    // Verify installation
    const sitePackages = path.join(pythonDir, 'Lib', 'site-packages');
    if (fs.existsSync(sitePackages)) {
      const packages = fs.readdirSync(sitePackages);
      logger.info('Installed packages', { 
        count: packages.length,
        location: sitePackages 
      });
    }

  } catch (error) {
    logger.error('Failed to install dependencies', error);
    throw error;
  }
}

/**
 * Clean up temporary files
 */
function cleanupTemporaryFiles() {
  logger.info('Cleaning up temporary files');

  try {
    const zipFile = path.resolve(PYTHON_CONFIG.filename);
    
    if (fs.existsSync(zipFile)) {
      fs.unlinkSync(zipFile);
      logger.success('Removed temporary zip file', { file: zipFile });
    }

  } catch (error) {
    logger.warn('Failed to clean up some temporary files', error);
  }
}

/**
 * Verify Python installation
 */
function verifyPythonInstallation(pythonDir) {
  logger.info('Verifying Python installation');

  try {
    const pythonExe = path.join(pythonDir, 'python.exe');
    
    // Check Python version
    const versionOutput = execSync(`"${pythonExe}" --version`, {
      encoding: 'utf-8',
      stdio: 'pipe',
    });
    logger.success('Python version', { version: versionOutput.trim() });

    // Check pip version
    const pipOutput = execSync(`"${pythonExe}" -m pip --version`, {
      encoding: 'utf-8',
      stdio: 'pipe',
    });
    logger.success('pip version', { version: pipOutput.trim() });

    // Check Flask installation
    const flaskOutput = execSync(`"${pythonExe}" -m flask --version`, {
      encoding: 'utf-8',
      stdio: 'pipe',
    });
    logger.success('Flask version', { version: flaskOutput.trim() });

    logger.success('Python installation verified successfully');
    return true;

  } catch (error) {
    logger.error('Python installation verification failed', error);
    return false;
  }
}

/**
 * Check if Python is already bundled and valid
 */
function checkExistingPython() {
  const pythonDir = path.resolve(PYTHON_CONFIG.extractDir);
  const pythonExe = path.join(pythonDir, 'python.exe');

  if (!fs.existsSync(pythonDir) || !fs.existsSync(pythonExe)) {
    return false;
  }

  logger.info('Found existing Python bundle, verifying...');
  return verifyPythonInstallation(pythonDir);
}

/**
 * Main bundling process
 */
async function main() {
  console.log(`\n${colors.bright}${colors.green}${'='.repeat(80)}${colors.reset}`);
  console.log(`${colors.bright}${colors.green}Python Bundling Process for AIDocMaster${colors.reset}`);
  console.log(`${colors.bright}${colors.green}${'='.repeat(80)}${colors.reset}\n`);
  
  logger.info('Python bundling process started');
  logger.info('Platform: Windows x64');
  logger.info('Python version: ' + PYTHON_CONFIG.version);
  logger.info('Working directory: ' + process.cwd());
  logger.separator();

  try {
    // Check if Python is already bundled
    if (checkExistingPython()) {
      logger.success('Python is already bundled and verified');
      logger.info('Skipping download and installation');
      logger.info('To force re-bundle, delete the python-embed directory');
      
      console.log(`\n${colors.bright}${colors.green}${'='.repeat(80)}${colors.reset}`);
      console.log(`${colors.bright}${colors.green}Python bundle is ready!${colors.reset}`);
      console.log(`${colors.bright}${colors.green}${'='.repeat(80)}${colors.reset}\n`);
      return;
    }

    // Step 1: Download Python embeddable package
    logger.step('Downloading Python Embeddable Package');
    const zipPath = path.resolve(PYTHON_CONFIG.filename);
    
    if (!fs.existsSync(zipPath)) {
      try {
        await downloadFile(PYTHON_CONFIG.url, zipPath);
      } catch (primaryError) {
        logger.error('Primary download failed', primaryError);
        logger.warn('If you are behind a firewall/proxy, you may need to:');
        logger.warn('1. Configure your proxy settings');
        logger.warn('2. Download the file manually from: ' + PYTHON_CONFIG.url);
        logger.warn('3. Place it in: ' + zipPath);
        logger.warn('4. Re-run this script');
        
        // Try alternative URL if available
        if (PYTHON_CONFIG.getPipAlternativeUrl) {
          logger.info('Attempting download from alternative source...');
          try {
            await downloadFile(PYTHON_CONFIG.url, zipPath);
          } catch (alternativeError) {
            logger.error('Alternative download also failed', alternativeError);
            throw new Error('All download attempts failed. Please download manually.');
          }
        } else {
          throw primaryError;
        }
      }
    } else {
      logger.info('Python package already downloaded, skipping download');
    }

    // Step 2: Extract Python package
    logger.step('Extracting Python Package');
    const pythonDir = path.resolve(PYTHON_CONFIG.extractDir);
    
    // Clean existing directory if it exists
    if (fs.existsSync(pythonDir)) {
      logger.info('Removing existing Python directory');
      fs.rmSync(pythonDir, { recursive: true, force: true });
    }
    
    extractZip(zipPath, pythonDir);

    // Step 3: Configure Python
    logger.step('Configuring Embedded Python');
    configurePython(pythonDir);

    // Step 4: Install pip
    logger.step('Installing pip');
    await installPip(pythonDir);

    // Step 5: Install dependencies
    logger.step('Installing Python Dependencies');
    installDependencies(pythonDir);

    // Step 6: Verify installation
    logger.step('Verifying Python Installation');
    const isValid = verifyPythonInstallation(pythonDir);
    
    if (!isValid) {
      throw new Error('Python installation verification failed');
    }

    // Step 7: Clean up
    logger.step('Cleaning Up Temporary Files');
    cleanupTemporaryFiles();

    // Success!
    logger.separator();
    logger.success('Python bundling completed successfully!', {
      totalTime: logger.getElapsedTime(),
      pythonDirectory: pythonDir,
      pythonExecutable: path.join(pythonDir, 'python.exe'),
    });

    console.log(`\n${colors.bright}${colors.green}${'='.repeat(80)}${colors.reset}`);
    console.log(`${colors.bright}${colors.green}Python bundled successfully in ${logger.getElapsedTime()}${colors.reset}`);
    console.log(`${colors.bright}${colors.green}Location: ${pythonDir}${colors.reset}`);
    console.log(`${colors.bright}${colors.green}${'='.repeat(80)}${colors.reset}\n`);

  } catch (error) {
    logger.separator();
    logger.error('Python bundling failed', error);

    console.log(`\n${colors.bright}${colors.red}${'='.repeat(80)}${colors.reset}`);
    console.log(`${colors.bright}${colors.red}Python bundling failed after ${logger.getElapsedTime()}${colors.reset}`);
    console.log(`${colors.bright}${colors.red}${'='.repeat(80)}${colors.reset}\n`);

    process.exit(1);
  }
}

// Run the bundling process
if (require.main === module) {
  main();
}

module.exports = { main, checkExistingPython, PYTHON_CONFIG };

