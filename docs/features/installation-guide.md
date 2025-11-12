# AI Document Validation - Installation Guide

## Prerequisites
- Node.js 20.x or higher
- npm or yarn package manager
- Modern web browser (Chrome, Firefox, Safari, or Edge)

## Installation Steps

### 1. Install Dependencies
```bash
npm install
```

This will install all required dependencies including:
- `mammoth` - For converting Word documents to HTML
- `html-docx-js` - For converting HTML back to Word format
- `@tiptap/react` and extensions - Rich text editor
- All other project dependencies

### 2. Verify Installation
Check that the following packages are installed:

```bash
npm list mammoth
npm list html-docx-js
npm list @tiptap/react
```

### 3. Start Development Server
```bash
npm run dev
```

The application will be available at `http://localhost:3000`

## Package Details

### Core Dependencies Added
```json
{
  "html-docx-js": "^0.3.1",
  "pizzip": "^3.1.7"
}
```

### Already Included Dependencies
```json
{
  "mammoth": "^1.11.0",
  "@tiptap/react": "^3.10.5",
  "@tiptap/starter-kit": "^3.10.5",
  "@tiptap/extension-underline": "^3.10.5",
  "@tiptap/extension-text-align": "^3.10.5",
  "@tiptap/extension-text-style": "^3.10.5",
  "@tiptap/extension-color": "^3.10.5"
}
```

## Build for Production

### Build Command
```bash
npm run build
```

### Start Production Server
```bash
npm start
```

## Environment Configuration

No additional environment variables are required for the AI Document Validation feature. All document processing happens client-side.

## Browser Support

### Minimum Requirements
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

### Required Browser APIs
- FileReader API
- Blob API
- URL.createObjectURL
- ArrayBuffer support

## Troubleshooting

### Installation Issues

#### Issue: `npm install` fails
**Solution**:
```bash
# Clear npm cache
npm cache clean --force

# Delete node_modules and package-lock.json
rm -rf node_modules package-lock.json

# Reinstall
npm install
```

#### Issue: Module not found errors
**Solution**:
```bash
# Ensure all dependencies are installed
npm install

# Check for missing peer dependencies
npm install --legacy-peer-deps
```

#### Issue: TypeScript errors
**Solution**:
```bash
# Ensure TypeScript is installed
npm install -D typescript

# Regenerate type definitions
npm run build
```

### Runtime Issues

#### Issue: Document upload not working
**Possible Causes**:
- Browser doesn't support FileReader API
- CORS issues (check browser console)
- File size exceeds limit

**Solution**:
- Use a modern browser
- Check browser console for specific errors
- Verify file is under 10MB

#### Issue: Export not working
**Possible Causes**:
- html-docx-js not loaded correctly
- Browser blocking downloads
- Content Security Policy restrictions

**Solution**:
```bash
# Reinstall html-docx-js
npm uninstall html-docx-js
npm install html-docx-js

# Check browser download settings
# Verify no CSP errors in console
```

#### Issue: Editor not rendering
**Possible Causes**:
- TipTap extensions not loaded
- CSS not applied correctly
- JavaScript errors

**Solution**:
```bash
# Clear Next.js cache
rm -rf .next

# Rebuild
npm run build
npm run dev
```

## Development Setup

### For Development
```bash
# Install dependencies
npm install

# Start dev server with hot reload
npm run dev
```

### For Testing
```bash
# Run linter
npm run lint

# Fix linting issues
npm run lint -- --fix
```

## Docker Setup (Optional)

If you prefer to use Docker:

```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
```

Build and run:
```bash
docker build -t aidocmaster .
docker run -p 3000:3000 aidocmaster
```

## Performance Optimization

### For Production
1. Enable compression
2. Optimize images
3. Use CDN for static assets
4. Enable caching headers

### Memory Considerations
- Monitor memory usage with large documents
- Consider implementing document size warnings
- Use Web Workers for heavy processing (future enhancement)

## Security Checklist

- ✅ File type validation
- ✅ File size limits
- ✅ Client-side processing (no server storage)
- ✅ XSS prevention in editor
- ✅ Input validation on APIs

## Next Steps

After installation:
1. Test document upload with a sample .docx file
2. Verify editing functionality works
3. Test export feature
4. Review logs in browser console
5. Check API endpoints with browser DevTools

## Support

For issues and questions:
1. Check browser console for errors
2. Review logs in development mode
3. Verify all dependencies are installed correctly
4. Ensure Node.js version meets requirements

## Updating Dependencies

To update to latest compatible versions:

```bash
# Update all dependencies
npm update

# Update specific package
npm update mammoth
npm update @tiptap/react

# Check for outdated packages
npm outdated
```

## Uninstallation

To remove the feature:

1. Remove components:
   - `components/AIDocValidationContainer.tsx`
   - `components/WordEditorPanel.tsx`
   - `components/ValidationResultPanel.tsx`

2. Remove API routes:
   - `app/api/documents/upload/route.ts`
   - `app/api/documents/export/route.ts`

3. Revert changes to:
   - `app/page.tsx`
   - `components/Header.tsx`
   - `lib/i18n/dictionaries.ts`
   - `app/globals.css`

4. Remove dependencies (optional):
```bash
npm uninstall html-docx-js pizzip
```

