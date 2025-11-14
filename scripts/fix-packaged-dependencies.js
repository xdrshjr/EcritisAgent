/**
 * Fix Packaged Dependencies Script
 * 
 * This script manually installs missing dependencies to an already-packaged
 * Electron application's Python environment.
 * 
 * Usage: node scripts/fix-packaged-dependencies.js
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

/**
 * Logger
 */
class Logger {
  info(message, data = null) {
    console.log(`${colors.cyan}[INFO]${colors.reset} ${message}`);
    if (data) console.log(JSON.stringify(data, null, 2));
  }

  success(message, data = null) {
    console.log(`${colors.green}[SUCCESS]${colors.reset} ✓ ${message}`);
    if (data) console.log(JSON.stringify(data, null, 2));
  }

  error(message, error = null) {
    console.error(`${colors.red}[ERROR]${colors.reset} ✗ ${message}`);
    if (error) console.error(error);
  }

  warn(message, data = null) {
    console.warn(`${colors.yellow}[WARN]${colors.reset} ⚠ ${message}`);
    if (data) console.log(JSON.stringify(data, null, 2));
  }
}

const logger = new Logger();

/**
 * Find packaged Python executable
 */
function findPackagedPython() {
  logger.info('Searching for packaged Python executable');

  const possiblePaths = [
    // Unpacked build
    path.resolve('dist', 'win-unpacked', 'resources', 'python', 'python.exe'),
    // Inside app.asar.unpacked
    path.resolve('dist', 'win-unpacked', 'resources', 'app.asar.unpacked', 'python', 'python.exe'),
  ];

  for (const pythonPath of possiblePaths) {
    logger.info(`Checking: ${pythonPath}`);
    if (fs.existsSync(pythonPath)) {
      logger.success(`Found Python at: ${pythonPath}`);
      return pythonPath;
    }
  }

  logger.error('Python executable not found in packaged app');
  logger.info('Possible locations checked:', { paths: possiblePaths });
  return null;
}

/**
 * Verify package installation
 */
function verifyPackage(pythonExe, packageName) {
  try {
    const cmd = `"${pythonExe}" -c "import ${packageName}; print('OK')"`;
    execSync(cmd, { encoding: 'utf-8', stdio: 'pipe' });
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Install missing dependencies
 */
function installDependencies(pythonExe) {
  logger.info('Installing missing dependencies');

  try {
    const requirementsPath = path.resolve('backend', 'requirements.txt');

    if (!fs.existsSync(requirementsPath)) {
      throw new Error(`requirements.txt not found at: ${requirementsPath}`);
    }

    logger.info('Using requirements.txt:', { path: requirementsPath });

    // Read and display requirements
    const requirements = fs.readFileSync(requirementsPath, 'utf-8');
    logger.info('Requirements to install:', { content: requirements });

    // Install each package with detailed output
    logger.info('Installing dependencies (this may take several minutes)...');
    const cmd = `"${pythonExe}" -m pip install -r "${requirementsPath}" --upgrade --no-warn-script-location`;
    
    console.log(`\n${colors.cyan}Running: ${cmd}${colors.reset}\n`);
    
    const output = execSync(cmd, {
      encoding: 'utf-8',
      stdio: 'inherit', // Show real-time output
    });

    logger.success('Dependencies installed successfully');
    return true;

  } catch (error) {
    logger.error('Failed to install dependencies', error);
    return false;
  }
}

/**
 * Verify critical packages
 */
function verifyCriticalPackages(pythonExe) {
  logger.info('Verifying critical packages');

  const packages = [
    'flask',
    'flask_cors',
    'requests',
    'langchain',
    'langchain_openai',
    'langchain_core',
    'langgraph',
  ];

  let allInstalled = true;

  for (const pkg of packages) {
    const installed = verifyPackage(pythonExe, pkg);
    if (installed) {
      logger.success(`✓ ${pkg} is installed`);
    } else {
      logger.error(`✗ ${pkg} is NOT installed`);
      allInstalled = false;
    }
  }

  return allInstalled;
}

/**
 * Main function
 */
async function main() {
  console.log(`\n${colors.green}${'='.repeat(80)}${colors.reset}`);
  console.log(`${colors.green}Fix Packaged Dependencies${colors.reset}`);
  console.log(`${colors.green}${'='.repeat(80)}${colors.reset}\n`);

  try {
    // Step 1: Find packaged Python
    const pythonExe = findPackagedPython();
    
    if (!pythonExe) {
      logger.error('Cannot proceed: Python executable not found');
      logger.warn('Please ensure you have built the application first using: npm run build:desktop');
      process.exit(1);
    }

    // Step 2: Verify current state
    logger.info('Checking current package installation status');
    const allInstalledBefore = verifyCriticalPackages(pythonExe);

    if (allInstalledBefore) {
      logger.success('All critical packages are already installed!');
      logger.info('No action needed.');
      return;
    }

    logger.warn('Some packages are missing or not installed correctly');

    // Step 3: Install dependencies
    logger.info('Attempting to install missing dependencies...');
    const installed = installDependencies(pythonExe);

    if (!installed) {
      throw new Error('Dependency installation failed');
    }

    // Step 4: Verify installation
    logger.info('Verifying installation after dependency installation');
    const allInstalledAfter = verifyCriticalPackages(pythonExe);

    if (allInstalledAfter) {
      logger.success('All critical packages verified successfully!');
      logger.success('The packaged application should now work correctly.');
    } else {
      logger.error('Some packages are still missing after installation');
      logger.warn('You may need to rebuild the application using: npm run build:desktop');
    }

    console.log(`\n${colors.green}${'='.repeat(80)}${colors.reset}`);
    console.log(`${colors.green}Fix completed${colors.reset}`);
    console.log(`${colors.green}${'='.repeat(80)}${colors.reset}\n`);

  } catch (error) {
    console.log(`\n${colors.red}${'='.repeat(80)}${colors.reset}`);
    logger.error('Fix failed', error);
    console.log(`${colors.red}${'='.repeat(80)}${colors.reset}\n`);
    process.exit(1);
  }
}

// Run
main();

