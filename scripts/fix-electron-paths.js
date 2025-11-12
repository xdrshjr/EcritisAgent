/**
 * Fix Electron Static Asset Paths
 * 
 * This script processes the built Next.js static export to ensure all asset paths
 * are compatible with Electron's file:// protocol.
 * 
 * Features:
 * - Converts absolute paths to relative paths
 * - Ensures CSS and JS files can be loaded properly
 * - Validates all critical resources exist
 * 
 * Usage: node scripts/fix-electron-paths.js
 */

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
 * Logger utility
 */
class PathFixLogger {
  constructor() {
    this.startTime = Date.now();
  }

  getTimestamp() {
    return new Date().toISOString();
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

  debug(message, data = null) {
    if (process.env.DEBUG) {
      console.log(`${colors.cyan}[DEBUG]${colors.reset} [${this.getTimestamp()}] ${message}`);
      if (data) {
        console.log(`${colors.cyan}${JSON.stringify(data, null, 2)}${colors.reset}`);
      }
    }
  }
}

const logger = new PathFixLogger();

/**
 * Recursively find files by extension
 */
function findFiles(dir, ext, fileList = []) {
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      findFiles(filePath, ext, fileList);
    } else if (file.endsWith(ext)) {
      fileList.push(path.relative(dir, filePath));
    }
  });
  
  return fileList;
}

/**
 * Fix paths in HTML files
 */
function fixHtmlPaths(outDir) {
  logger.info('Fixing paths in HTML files');
  
  const htmlFiles = findFiles(outDir, '.html');
  let totalFixed = 0;
  
  logger.info(`Found ${htmlFiles.length} HTML files to process`);
  
  htmlFiles.forEach(file => {
    const filePath = path.join(outDir, file);
    logger.debug(`Processing: ${file}`);
    
    let content = fs.readFileSync(filePath, 'utf-8');
    let modified = false;
    
    // Fix absolute paths to _next
    const originalContent = content;
    
    // Replace absolute paths with relative paths
    // /_next/... -> ./_next/...
    content = content.replace(/href="\/_next\//g, 'href="./_next/');
    content = content.replace(/src="\/_next\//g, 'src="./_next/');
    
    // Fix other absolute paths
    content = content.replace(/href="\/([^\/"])/g, 'href="./$1');
    content = content.replace(/src="\/([^\/"])/g, 'src="./$1');
    
    if (content !== originalContent) {
      fs.writeFileSync(filePath, content, 'utf-8');
      modified = true;
      totalFixed++;
      logger.debug(`Fixed paths in: ${file}`);
    } else {
      logger.debug(`No changes needed for: ${file}`);
    }
  });
  
  logger.success(`Fixed paths in ${totalFixed} HTML files`);
  return totalFixed;
}

/**
 * Verify critical resources exist
 */
function verifyCriticalResources(outDir) {
  logger.info('Verifying critical resources');
  
  const criticalPaths = [
    'index.html',
    '_next',
  ];
  
  const missing = [];
  
  criticalPaths.forEach(resource => {
    const resourcePath = path.join(outDir, resource);
    logger.debug(`Checking: ${resource}`);
    
    if (fs.existsSync(resourcePath)) {
      logger.debug(`✓ Found: ${resource}`);
    } else {
      logger.error(`✗ Missing: ${resource}`);
      missing.push(resource);
    }
  });
  
  if (missing.length > 0) {
    throw new Error(`Missing critical resources: ${missing.join(', ')}`);
  }
  
  logger.success('All critical resources verified');
}

/**
 * Count files by extension
 */
function countFilesByExtension(dir, extensions) {
  const counts = {};
  extensions.forEach(ext => {
    counts[ext] = findFiles(dir, ext).length;
  });
  return counts;
}

/**
 * Generate resource manifest
 */
function generateResourceManifest(outDir) {
  logger.info('Generating resource manifest');
  
  const counts = countFilesByExtension(outDir, ['.html', '.css', '.js']);
  
  const manifest = {
    generated: new Date().toISOString(),
    html: counts['.html'],
    css: counts['.css'],
    js: counts['.js'],
  };
  
  const manifestPath = path.join(outDir, '_resource-manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
  
  logger.success('Resource manifest generated', manifest);
  logger.info(`Manifest location: ${manifestPath}`);
}

/**
 * Main function
 */
async function main() {
  console.log(`\n${colors.bright}${colors.cyan}${'='.repeat(80)}${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}Electron Path Fix Script${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}${'='.repeat(80)}${colors.reset}\n`);
  
  const outDir = path.resolve('out');
  
  logger.info('Starting path fix process');
  logger.info(`Output directory: ${outDir}`);
  
  try {
    // Verify output directory exists
    if (!fs.existsSync(outDir)) {
      throw new Error(`Output directory does not exist: ${outDir}`);
    }
    
    // Verify critical resources
    verifyCriticalResources(outDir);
    
    // Fix HTML paths
    const fixedCount = fixHtmlPaths(outDir);
    
    // Generate manifest
    generateResourceManifest(outDir);
    
    logger.success('Path fix process completed successfully', {
      filesFixed: fixedCount,
      outputDirectory: outDir,
    });
    
    console.log(`\n${colors.bright}${colors.green}${'='.repeat(80)}${colors.reset}`);
    console.log(`${colors.bright}${colors.green}Path fix completed successfully${colors.reset}`);
    console.log(`${colors.bright}${colors.green}${'='.repeat(80)}${colors.reset}\n`);
    
  } catch (error) {
    logger.error('Path fix process failed', error);
    
    console.log(`\n${colors.bright}${colors.red}${'='.repeat(80)}${colors.reset}`);
    console.log(`${colors.bright}${colors.red}Path fix failed${colors.reset}`);
    console.log(`${colors.bright}${colors.red}${'='.repeat(80)}${colors.reset}\n`);
    
    process.exit(1);
  }
}

// Run the script
main();

