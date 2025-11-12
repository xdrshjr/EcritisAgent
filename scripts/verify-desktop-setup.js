/**
 * Desktop Setup Verification Script
 * 
 * This script verifies that all required files and configurations are in place
 * for building the desktop application.
 * 
 * Usage: node scripts/verify-desktop-setup.js
 */

const fs = require('fs');
const path = require('path');

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bright: '\x1b[1m',
};

class VerificationLogger {
  constructor() {
    this.checks = [];
    this.warnings = [];
    this.errors = [];
  }

  pass(message) {
    console.log(`${colors.green}✓${colors.reset} ${message}`);
    this.checks.push({ status: 'pass', message });
  }

  fail(message) {
    console.log(`${colors.red}✗${colors.reset} ${message}`);
    this.errors.push(message);
    this.checks.push({ status: 'fail', message });
  }

  warn(message) {
    console.log(`${colors.yellow}⚠${colors.reset} ${message}`);
    this.warnings.push(message);
    this.checks.push({ status: 'warn', message });
  }

  info(message) {
    console.log(`${colors.cyan}ℹ${colors.reset} ${message}`);
  }

  section(title) {
    console.log(`\n${colors.bright}${colors.cyan}${title}${colors.reset}`);
    console.log(`${colors.cyan}${'─'.repeat(60)}${colors.reset}`);
  }

  summary() {
    const passed = this.checks.filter(c => c.status === 'pass').length;
    const failed = this.checks.filter(c => c.status === 'fail').length;
    const warned = this.checks.filter(c => c.status === 'warn').length;

    console.log(`\n${colors.bright}${colors.cyan}${'═'.repeat(60)}${colors.reset}`);
    console.log(`${colors.bright}Verification Summary${colors.reset}`);
    console.log(`${colors.cyan}${'═'.repeat(60)}${colors.reset}`);
    console.log(`${colors.green}Passed:${colors.reset}  ${passed}`);
    console.log(`${colors.yellow}Warnings:${colors.reset} ${warned}`);
    console.log(`${colors.red}Failed:${colors.reset}  ${failed}`);
    console.log(`${colors.cyan}${'═'.repeat(60)}${colors.reset}\n`);

    return failed === 0;
  }
}

const logger = new VerificationLogger();

/**
 * Check if file exists
 */
function checkFile(filePath, description) {
  const fullPath = path.resolve(filePath);
  if (fs.existsSync(fullPath)) {
    logger.pass(`${description}: ${filePath}`);
    return true;
  } else {
    logger.fail(`${description} missing: ${filePath}`);
    return false;
  }
}

/**
 * Check if directory exists
 */
function checkDirectory(dirPath, description) {
  const fullPath = path.resolve(dirPath);
  if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
    logger.pass(`${description}: ${dirPath}`);
    return true;
  } else {
    logger.fail(`${description} missing: ${dirPath}`);
    return false;
  }
}

/**
 * Check package.json configuration
 */
function checkPackageJson() {
  logger.section('Checking package.json Configuration');

  try {
    const packagePath = path.resolve('package.json');
    const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));

    // Check main field
    if (packageJson.main === 'electron/main.js') {
      logger.pass('Main field is set to electron/main.js');
    } else {
      logger.fail(`Main field incorrect: ${packageJson.main || 'not set'}`);
    }

    // Check scripts
    const requiredScripts = {
      'build:desktop': 'Build desktop script',
      'build:electron': 'Electron builder script',
    };

    Object.entries(requiredScripts).forEach(([script, description]) => {
      if (packageJson.scripts && packageJson.scripts[script]) {
        logger.pass(`${description} script exists: ${script}`);
      } else {
        logger.fail(`${description} script missing: ${script}`);
      }
    });

    // Check dependencies
    const requiredDevDeps = ['electron', 'electron-builder'];
    requiredDevDeps.forEach(dep => {
      if (packageJson.devDependencies && packageJson.devDependencies[dep]) {
        logger.pass(`Dependency installed: ${dep} (${packageJson.devDependencies[dep]})`);
      } else {
        logger.fail(`Dependency missing: ${dep}`);
      }
    });

  } catch (error) {
    logger.fail(`Failed to read package.json: ${error.message}`);
  }
}

/**
 * Check Next.js configuration
 */
function checkNextConfig() {
  logger.section('Checking Next.js Configuration');

  try {
    const configPath = path.resolve('next.config.ts');
    const configContent = fs.readFileSync(configPath, 'utf-8');

    // Check for static export
    if (configContent.includes("output: 'export'") || configContent.includes('output: "export"')) {
      logger.pass('Static export enabled');
    } else {
      logger.fail('Static export not configured');
      logger.info('Add: output: "export" to next.config.ts');
    }

    // Check for unoptimized images
    if (configContent.includes('unoptimized: true')) {
      logger.pass('Image optimization disabled for Electron');
    } else {
      logger.warn('Image optimization should be disabled for Electron');
    }

  } catch (error) {
    logger.fail(`Failed to read next.config.ts: ${error.message}`);
  }
}

/**
 * Check Electron files
 */
function checkElectronFiles() {
  logger.section('Checking Electron Files');

  const electronFiles = [
    { path: 'electron/main.js', description: 'Electron main process' },
    { path: 'electron/preload.js', description: 'Electron preload script' },
  ];

  electronFiles.forEach(({ path: filePath, description }) => {
    if (checkFile(filePath, description)) {
      // Check file content for basic validation
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        
        if (filePath === 'electron/main.js') {
          if (content.includes('WINDOW_CONFIG')) {
            logger.pass('Window configuration found in main.js');
          } else {
            logger.warn('Window configuration not found in main.js');
          }

          if (content.includes('1024') && content.includes('768')) {
            logger.pass('Default window size configured (1024×768)');
          } else {
            logger.warn('Default window size may not be configured correctly');
          }

          if (content.includes('800') && content.includes('600')) {
            logger.pass('Minimum window size configured (800×600)');
          } else {
            logger.warn('Minimum window size may not be configured correctly');
          }
        }

        if (filePath === 'electron/preload.js') {
          if (content.includes('contextBridge')) {
            logger.pass('Context bridge found in preload.js');
          } else {
            logger.warn('Context bridge not found in preload.js');
          }
        }
      } catch (error) {
        logger.warn(`Could not validate ${filePath}: ${error.message}`);
      }
    }
  });
}

/**
 * Check build configuration
 */
function checkBuildConfig() {
  logger.section('Checking Build Configuration');

  checkFile('electron-builder.json', 'Electron Builder config');

  if (fs.existsSync('electron-builder.json')) {
    try {
      const config = JSON.parse(fs.readFileSync('electron-builder.json', 'utf-8'));

      if (config.appId) {
        logger.pass(`App ID configured: ${config.appId}`);
      } else {
        logger.warn('App ID not configured');
      }

      if (config.win) {
        logger.pass('Windows configuration found');
      } else {
        logger.fail('Windows configuration missing');
      }

      if (config.win && config.win.target) {
        logger.pass(`Windows targets: ${config.win.target.map(t => t.target || t).join(', ')}`);
      } else {
        logger.warn('Windows targets not configured');
      }

    } catch (error) {
      logger.fail(`Failed to parse electron-builder.json: ${error.message}`);
    }
  }
}

/**
 * Check scripts directory
 */
function checkScripts() {
  logger.section('Checking Build Scripts');

  checkDirectory('scripts', 'Scripts directory');
  checkFile('scripts/build-desktop.js', 'Desktop build script');

  if (fs.existsSync('scripts/build-desktop.js')) {
    try {
      const content = fs.readFileSync('scripts/build-desktop.js', 'utf-8');
      
      if (content.includes('BuildLogger')) {
        logger.pass('Build logging system found');
      } else {
        logger.warn('Build logging system may not be implemented');
      }

      if (content.includes('verifyRequiredFiles')) {
        logger.pass('File verification function found');
      } else {
        logger.warn('File verification may not be implemented');
      }

    } catch (error) {
      logger.warn(`Could not validate build-desktop.js: ${error.message}`);
    }
  }
}

/**
 * Check documentation
 */
function checkDocumentation() {
  logger.section('Checking Documentation');

  const docs = [
    { path: 'docs/features/desktop-packaging.md', description: 'Desktop packaging guide' },
    { path: 'docs/features/desktop-quick-start.md', description: 'Quick start guide' },
    { path: 'scripts/README.md', description: 'Scripts documentation' },
  ];

  docs.forEach(({ path: docPath, description }) => {
    checkFile(docPath, description);
  });
}

/**
 * Check Node.js and npm versions
 */
function checkEnvironment() {
  logger.section('Checking Environment');

  const nodeVersion = process.version;
  const major = parseInt(nodeVersion.slice(1).split('.')[0]);

  logger.info(`Node.js version: ${nodeVersion}`);

  if (major >= 18) {
    logger.pass('Node.js version is compatible (18.0.0+)');
  } else {
    logger.fail(`Node.js version too old: ${nodeVersion} (requires 18.0.0+)`);
  }

  try {
    const { execSync } = require('child_process');
    const npmVersion = execSync('npm --version', { encoding: 'utf-8' }).trim();
    logger.info(`npm version: ${npmVersion}`);
    logger.pass('npm is installed');
  } catch (error) {
    logger.fail('npm is not installed or not in PATH');
  }
}

/**
 * Check node_modules
 */
function checkDependencies() {
  logger.section('Checking Dependencies');

  if (checkDirectory('node_modules', 'Dependencies directory')) {
    const requiredModules = [
      'electron',
      'electron-builder',
      'next',
      'react',
    ];

    requiredModules.forEach(module => {
      const modulePath = path.join('node_modules', module);
      if (fs.existsSync(modulePath)) {
        logger.pass(`Module installed: ${module}`);
      } else {
        logger.fail(`Module missing: ${module}`);
      }
    });
  } else {
    logger.fail('Dependencies not installed - run: npm install');
  }
}

/**
 * Provide recommendations
 */
function provideRecommendations(logger) {
  if (logger.errors.length > 0) {
    console.log(`\n${colors.bright}${colors.red}Action Required:${colors.reset}`);
    console.log(`${colors.red}${'─'.repeat(60)}${colors.reset}`);
    logger.errors.forEach((error, index) => {
      console.log(`${colors.red}${index + 1}.${colors.reset} ${error}`);
    });
  }

  if (logger.warnings.length > 0) {
    console.log(`\n${colors.bright}${colors.yellow}Recommendations:${colors.reset}`);
    console.log(`${colors.yellow}${'─'.repeat(60)}${colors.reset}`);
    logger.warnings.forEach((warning, index) => {
      console.log(`${colors.yellow}${index + 1}.${colors.reset} ${warning}`);
    });
  }

  if (logger.errors.length === 0 && logger.warnings.length === 0) {
    console.log(`${colors.bright}${colors.green}✓ All checks passed! Ready to build.${colors.reset}\n`);
    console.log(`${colors.cyan}Run the following command to build:${colors.reset}`);
    console.log(`${colors.bright}npm run build:desktop${colors.reset}\n`);
  }
}

/**
 * Main verification function
 */
async function main() {
  console.log(`\n${colors.bright}${colors.cyan}${'═'.repeat(60)}${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}Desktop Setup Verification${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}${'═'.repeat(60)}${colors.reset}\n`);

  logger.info('Starting verification...');
  logger.info(`Working directory: ${process.cwd()}`);

  try {
    // Run all checks
    checkEnvironment();
    checkPackageJson();
    checkNextConfig();
    checkElectronFiles();
    checkBuildConfig();
    checkScripts();
    checkDocumentation();
    checkDependencies();

    // Show summary
    const success = logger.summary();

    // Provide recommendations
    provideRecommendations(logger);

    // Exit with appropriate code
    process.exit(success ? 0 : 1);

  } catch (error) {
    console.error(`\n${colors.red}Verification failed with error:${colors.reset}`);
    console.error(error);
    process.exit(1);
  }
}

// Run verification
main();

