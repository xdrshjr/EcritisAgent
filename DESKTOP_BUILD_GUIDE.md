# Desktop Application Build Guide

## Quick Start

### For First-Time Build

```bash
# 1. Install dependencies
npm install

# 2. Verify setup
npm run verify:desktop

# 3. Build desktop application
npm run build:desktop
```

### Output

After successful build, you'll find in the `dist` directory:
- `AIDocMaster-0.1.0-Setup.exe` - Windows installer (~150 MB)
- `AIDocMaster-0.1.0-Portable.exe` - Portable version (~200 MB)

## Available Commands

| Command | Description |
|---------|-------------|
| `npm run verify:desktop` | Verify setup is complete |
| `npm run build:desktop` | Build desktop application |
| `npm run electron:dev` | Run in development mode |
| `npm run build:electron` | Run Electron Builder only |

## Build Process

The build process consists of these steps:

1. **Verification** (automatic)
   - Checks all required files exist
   - Validates configuration

2. **Cleaning** (automatic)
   - Removes previous builds
   - Cleans cache directories

3. **Next.js Build** (automatic)
   - Builds application in static export mode
   - Outputs to `out` directory

4. **Electron Packaging** (automatic)
   - Packages with Electron Builder
   - Creates installers
   - Outputs to `dist` directory

**Total Time:** ~30-60 seconds

## Requirements

- **Node.js**: 18.0.0 or later
- **npm**: 9.0.0 or later
- **Windows**: 10 or later
- **Disk Space**: 2 GB free space
- **RAM**: 4 GB minimum

## Window Configuration

- **Default Size**: 1024×768 pixels ✓
- **Minimum Size**: 800×600 pixels ✓
- **Resizable**: Yes ✓
- **Maximize/Minimize**: Yes ✓

## Troubleshooting

### Build Fails

```bash
# Clean everything and retry
rm -rf node_modules dist out .next
npm install
npm run build:desktop
```

### Missing Dependencies

```bash
# Install Electron dependencies
npm install electron electron-builder --save-dev
```

### Verification Fails

```bash
# Run verification to see what's missing
npm run verify:desktop
```

## Logging

Build logs are displayed in the console with:
- Color-coded output
- Timestamps
- Detailed progress information

Application logs (runtime) are stored at:
- `%APPDATA%\AIDocMaster\app.log` (Windows)

## Documentation

- **[Desktop Packaging Guide](./docs/features/desktop-packaging.md)** - Complete technical documentation
- **[Quick Start Guide](./docs/features/desktop-quick-start.md)** - User and developer guide
- **[Installation Guide](./docs/features/desktop-installation-guide.md)** - Installation instructions
- **[Implementation Summary](./docs/features/DESKTOP_IMPLEMENTATION_SUMMARY.md)** - Implementation details
- **[Scripts README](./scripts/README.md)** - Build scripts documentation

## Support

If you encounter issues:
1. Check the logs
2. Run `npm run verify:desktop`
3. Review the documentation above
4. Check for error messages in console

## Quick Reference

### File Structure
```
electron/
├── main.js          # Main process
└── preload.js       # Preload script

scripts/
├── build-desktop.js          # Build script
└── verify-desktop-setup.js   # Verification script

electron-builder.json   # Build configuration
next.config.ts         # Next.js configuration (static export)
package.json          # Dependencies and scripts
```

### Configuration Files

**Window Size** (`electron/main.js`):
```javascript
const WINDOW_CONFIG = {
  DEFAULT_WIDTH: 1024,
  DEFAULT_HEIGHT: 768,
  MIN_WIDTH: 800,
  MIN_HEIGHT: 600,
};
```

**Build Settings** (`electron-builder.json`):
```json
{
  "win": {
    "target": ["nsis", "portable"]
  }
}
```

**Export Mode** (`next.config.ts`):
```typescript
{
  output: 'export',
  distDir: 'out'
}
```

## Notes

- First build may take longer (downloading Electron binaries)
- Subsequent builds are faster (cached binaries)
- Build requires active internet connection (first time)
- Output files are ready for distribution
- No code signing included (Windows will show warning)

---

**Version:** 0.1.0  
**Last Updated:** November 12, 2025  
**Platform:** Windows x64

