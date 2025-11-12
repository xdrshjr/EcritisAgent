# Build Scripts

This directory contains build and automation scripts for the AIDocMaster project.

## Available Scripts

### build-desktop.js

**Purpose:** Package the Next.js application as a Windows desktop application using Electron.

**Usage:**
```bash
npm run build:desktop
```

**What it does:**
1. Verifies all required files exist
2. Cleans previous build outputs (`out`, `dist`, `.next`)
3. Builds Next.js application in static export mode
4. Packages the application with Electron Builder for Windows
5. Creates distribution files (installer and portable)

**Requirements:**
- Node.js v18 or later
- All npm dependencies installed
- Required files:
  - `package.json`
  - `next.config.ts`
  - `electron/main.js`
  - `electron/preload.js`
  - `electron-builder.json`

**Output:**
- `dist/AIDocMaster-{version}-Setup.exe` - NSIS Installer
- `dist/AIDocMaster-{version}-Portable.exe` - Portable executable

**Logging:**
The script provides detailed, color-coded logging:
- **INFO** (Blue): General information and progress
- **SUCCESS** (Green): Successful operations
- **WARN** (Yellow): Warnings
- **ERROR** (Red): Errors and failures
- **STEP** (Cyan): Major build steps

All logs include:
- Timestamp
- Log level
- Descriptive message
- Additional context data (when applicable)

**Exit Codes:**
- `0`: Build completed successfully
- `1`: Build failed (check logs for details)

**Example Output:**
```
================================================================================
AIDocMaster Desktop Build Process
================================================================================

[INFO] [2025-11-12T...] Build process started
[INFO] [2025-11-12T...] Platform: Windows
[INFO] [2025-11-12T...] Node version: v18.x.x

[STEP 1] Verifying Required Files
================================================================================
[INFO] [2025-11-12T...] Checking file: package.json
[SUCCESS] [2025-11-12T...] ✓ File exists: package.json
...

[STEP 2] Cleaning Previous Builds
================================================================================
[INFO] [2025-11-12T...] Cleaning directory: out
[SUCCESS] [2025-11-12T...] ✓ Directory cleaned: out
...

[STEP 3] Building Next.js Application
================================================================================
[INFO] [2025-11-12T...] Starting Next.js static export build
[SUCCESS] [2025-11-12T...] ✓ Next.js application built successfully

[STEP 4] Packaging with Electron Builder
================================================================================
[INFO] [2025-11-12T...] Starting Electron packaging process
[SUCCESS] [2025-11-12T...] ✓ Electron packaging completed successfully

================================================================================
Build completed in 45s
Distribution files are in: dist
================================================================================
```

**Troubleshooting:**

| Issue | Solution |
|-------|----------|
| Missing files error | Ensure all Electron files are created |
| Build fails | Check Node.js version (v18+) |
| Permission denied | Run terminal as administrator |
| Out of disk space | Free up at least 2GB space |
| electron-builder fails | Reinstall dependencies: `npm install` |

**Performance:**
- Average build time: 30-60 seconds
- Disk space required: ~2 GB temporary space
- Output size: ~150-250 MB per executable

## Adding New Scripts

When adding new build scripts to this directory:

1. **Naming Convention**: Use kebab-case (e.g., `build-something.js`)
2. **Documentation**: Add comprehensive comments at the top
3. **Logging**: Use consistent logging format (see build-desktop.js)
4. **Error Handling**: Include try-catch blocks and meaningful errors
5. **Exit Codes**: Return 0 for success, 1 for failure
6. **Package.json**: Add corresponding npm script

**Template:**
```javascript
/**
 * Script Name
 * 
 * Brief description of what the script does
 * 
 * Usage: npm run script-name
 */

// Imports
const { execSync } = require('child_process');

// Logger implementation
class Logger {
  info(message, data = null) {
    console.log(`[INFO] ${message}`);
    if (data) console.log(JSON.stringify(data, null, 2));
  }
  
  error(message, error = null) {
    console.error(`[ERROR] ${message}`);
    if (error) console.error(error);
  }
}

const logger = new Logger();

// Main function
async function main() {
  try {
    logger.info('Script started');
    
    // Your logic here
    
    logger.info('Script completed');
  } catch (error) {
    logger.error('Script failed', error);
    process.exit(1);
  }
}

// Execute
main();
```

## Best Practices

1. **Logging**: Always include detailed logging
2. **Validation**: Verify inputs and prerequisites
3. **Error Handling**: Catch and log all errors
4. **Clean Up**: Remove temporary files
5. **Documentation**: Update this README when adding scripts
6. **Testing**: Test scripts on clean environment before committing

## Related Documentation

- [Desktop Packaging Feature](../docs/features/desktop-packaging.md) - Complete feature documentation
- [Desktop Quick Start](../docs/features/desktop-quick-start.md) - User and developer guide
- [Electron Documentation](https://www.electronjs.org/docs) - Official Electron docs
- [Electron Builder](https://www.electron.build/) - Packaging tool docs

