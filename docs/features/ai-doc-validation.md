# AI Document Validation Feature

## Overview
The AI Document Validation feature provides a comprehensive Word document editing and validation system with a split-panel interface. Users can upload Word documents, edit them online with full formatting support, and export the modified versions.

## Architecture

### Component Structure
```
app/page.tsx (Main Container)
├── Header (with Export button)
├── Taskbar (Task navigation)
├── AIDocValidationContainer (Split-panel layout)
│   ├── WordEditorPanel (Left panel - Document editor)
│   │   ├── Upload functionality
│   │   ├── TipTap rich text editor
│   │   ├── Formatting toolbar
│   │   └── Drag-and-drop support
│   └── ValidationResultPanel (Right panel - Validation results)
│       └── Placeholder for future AI validation features
└── Footer
```

### Technology Stack
- **Frontend Framework**: Next.js 16, React 19
- **Rich Text Editor**: TipTap (with extensions for formatting)
- **Document Processing**:
  - `mammoth`: Word document to HTML conversion
  - `html-docx-js`: HTML to Word document export
- **Styling**: TailwindCSS with custom theme
- **Type Safety**: TypeScript

## Features

### 1. Document Upload
- **Supported Formats**: .doc, .docx
- **Maximum Size**: 10MB
- **Upload Methods**:
  - Click to upload button
  - Drag and drop onto editor area
- **Validation**:
  - File type checking
  - Size limitation enforcement
  - Format verification

### 2. Document Editing
The editor provides comprehensive formatting capabilities:

#### Text Formatting
- Bold, Italic, Underline, Strikethrough
- Headings (H1, H2)
- Text alignment (Left, Center, Right)

#### Lists
- Bullet lists
- Numbered (ordered) lists

#### Editor Controls
- Undo/Redo functionality
- Real-time content synchronization
- Format preservation from original Word document

### 3. Split-Panel Layout
- **Left Panel**: Document editor (default 60% width)
- **Right Panel**: Validation results (default 40% width)
- **Resizable**: Drag the separator to adjust panel sizes
  - Minimum left panel: 30%
  - Maximum left panel: 70%
- **Interactive Resizer**: Visual feedback on hover and during resize

### 4. Document Export
- **Format**: .docx (Microsoft Word)
- **Export Button**: Located in the header (top-right)
- **Disabled State**: Export is disabled until a document is uploaded
- **Filename**: Auto-generated with timestamp
- **Processing**: Client-side conversion (no server upload required)

### 5. Validation Results Panel
- **Current State**: Placeholder with coming soon features
- **Future Features**:
  - Grammar and spelling checks
  - Style consistency analysis
  - Formatting validation
  - Content structure review
  - Compliance verification

## User Flow

### Typical Usage
1. User opens the AI Document Validation task
2. User uploads a Word document (click or drag-and-drop)
3. Document is converted to HTML and displayed in editor
4. User edits the document using the formatting toolbar
5. Changes are tracked in real-time
6. User clicks "Export" button when finished
7. Modified document is downloaded as .docx

## API Endpoints

### Upload Document
**Endpoint**: `POST /api/documents/upload`

**Purpose**: Validate and process uploaded Word documents

**Request**:
- Method: POST
- Content-Type: multipart/form-data
- Body: File (Word document)

**Response**:
```json
{
  "success": true,
  "data": {
    "fileName": "document.docx",
    "fileSize": 1024000,
    "fileType": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "content": "base64_encoded_content"
  }
}
```

### Export Document
**Endpoint**: `POST /api/documents/export`

**Purpose**: Prepare document for export

**Request**:
- Method: POST
- Content-Type: application/json
- Body:
```json
{
  "content": "<html>...</html>",
  "fileName": "edited-document",
  "format": "docx"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "fileName": "edited-document",
    "format": "docx",
    "content": "document_content"
  }
}
```

## Logging

### Logger Categories
All components use structured logging with the following context tags:

- `API:Upload` - Document upload operations
- `API:Export` - Document export operations
- `Home` - Main page operations
- `AIDocValidationContainer` - Container component operations
- `WordEditorPanel` - Editor panel operations
- `ValidationResultPanel` - Results panel operations
- `Header` - Header component operations

### Log Levels
- **info**: General operational information
- **debug**: Detailed debugging information (development only)
- **warn**: Warning messages for recoverable issues
- **error**: Error conditions
- **success**: Successful operation completions

### Key Logged Events
1. Document upload start/complete/failure
2. Document conversion (Word to HTML)
3. Editor content changes
4. Export ready state changes
5. Panel resizing operations
6. Export operations start/complete/failure

## Internationalization

The feature supports multiple languages through the i18n system:

### Supported Languages
- English (en)
- Chinese (zh)

### Translation Keys
```typescript
docValidation: {
  uploadDocument: string
  uploadHint: string
  uploadHintDetail: string
  validationResults: string
  validationPlaceholder: string
  editorToolbar: {
    bold, italic, underline, strike,
    heading1, heading2,
    bulletList, orderedList,
    alignLeft, alignCenter, alignRight,
    undo, redo
  }
  uploading: string
  uploadSuccess: string
  uploadError: string
  exportError: string
}
```

## Styling

### Custom CSS
TipTap editor styles are defined in `app/globals.css`:
- ProseMirror base styles
- Typography formatting (headings, paragraphs, lists)
- Code block styling
- Blockquote styling

### Theme Integration
- Uses project's design system (neobrutalism theme)
- Consistent color variables from CSS custom properties
- Border styling matches application theme
- Shadow effects align with global style

## Performance Considerations

### Client-Side Processing
- Document conversion happens entirely in browser
- No server-side storage of documents
- Base64 encoding for document transmission

### Memory Management
- File size limited to 10MB to prevent memory issues
- Editor content updated efficiently with TipTap
- Proper cleanup on component unmount

## Future Enhancements

### Phase 1 (Current)
- ✅ Document upload and editing
- ✅ Format preservation
- ✅ Export functionality
- ✅ Split-panel layout

### Phase 2 (Planned)
- AI-powered validation
- Grammar and spell checking
- Style consistency analysis
- Document comparison
- Track changes support

### Phase 3 (Future)
- Collaborative editing
- Version history
- Advanced formatting options
- Custom validation rules
- Integration with external services

## Testing Recommendations

### Unit Tests
1. Document upload validation
2. Format conversion accuracy
3. Editor content synchronization
4. Export file generation

### Integration Tests
1. Complete upload-edit-export flow
2. API endpoint functionality
3. Error handling scenarios
4. Panel resizing behavior

### E2E Tests
1. User interaction with editor
2. Drag-and-drop upload
3. Toolbar button functionality
4. Export button states
5. File download verification

## Format Preservation (Updated: 2025-11-12)

### Fully Supported Features ✅

The following Word document features are fully preserved during import:

- **Text Alignment**: Left, center, right, and justify alignment
- **Text Formatting**: Bold, italic, underline, strikethrough
- **Headings**: H1 through H6 with proper hierarchy
- **Lists**: Bulleted and numbered lists with nesting
- **Paragraph Indentation**: Left margin and text-indent preservation
- **Text Colors**: Standard RGB colors and inline color styles
- **Text Styles**: Inline styles for font properties

### Implementation Details

1. **Mammoth.js with Custom Style Map**
   - Custom style mapping for paragraph alignment
   - Heading conversion with style preservation
   - Empty paragraph preservation
   - Default style map inclusion

2. **TipTap Extensions**
   - TextStyle extension for inline formatting
   - Color extension for text colors
   - TextAlign extension for alignment control
   - StarterKit with paragraph attribute preservation

3. **CSS Enhancement**
   - Text alignment classes (.text-center, .text-right, .text-justify)
   - Indentation support via data attributes
   - Inline style preservation
   - Proper line-height and spacing

4. **HTML Post-Processing**
   - DOM manipulation to enhance formatting
   - CSS class addition for alignment
   - Data attribute preservation for indentation
   - Comprehensive logging of style conversions

### Logging for Format Preservation

Detailed logs are generated during document upload and conversion:

```
[WordEditorPanel] Converting Word document to HTML with style preservation
[WordEditorPanel] Style conversion warnings detected { count, warnings }
[WordEditorPanel] HTML formatting enhancement completed { 
  paragraphsProcessed, 
  styledElementsFound 
}
[WordEditorPanel] Document loaded into editor with formatting preserved
```

For troubleshooting format issues, check browser console for:
- Style conversion warnings
- HTML enhancement metrics
- Mammoth.js conversion messages

### Related Documentation

- [Word Formatting Preservation Fix](../fixes/word-formatting-preservation-fix.md) - Detailed technical implementation
- [Document Upload API](../apis/document-upload.md) - Format preservation details

## Known Limitations

1. **Format Preservation**: Complex Word features may have limited support
   - Comments (not supported)
   - Track changes (not supported)
   - Complex tables (basic support only)
   - Custom Word styles (limited mapping)
   - Embedded objects (limited support)
   - Headers/Footers (not supported in web editor)
   - Font families (depends on browser availability)
   - Absolute font sizes (converted to relative sizing)

2. **Browser Compatibility**: Requires modern browser with FileReader API support

3. **File Size**: 10MB limit for performance reasons

4. **Offline Support**: Requires internet connection for initial load

## Security Considerations

1. **File Validation**: Strict file type and size checking
2. **Client-Side Processing**: No server-side storage reduces security risks
3. **XSS Prevention**: HTML sanitization in editor
4. **Input Validation**: All API endpoints validate inputs

## Troubleshooting

### Common Issues

#### Document Upload Fails
- Check file type (.doc or .docx)
- Verify file size < 10MB
- Ensure file is not corrupted
- Check browser console for errors

#### Export Not Working
- Ensure document is uploaded first
- Check if Export button is enabled
- Verify browser allows downloads
- Check for JavaScript errors

#### Formatting Lost
- Some complex Word features may not convert
- Use standard formatting for best results
- Preview before export

#### Performance Issues
- Large documents may be slow
- Close other browser tabs
- Ensure adequate system memory

## Support and Maintenance

### Log Analysis
Use browser console to view detailed logs:
- Filter by context (e.g., "WordEditorPanel")
- Check for error messages
- Monitor API call status

### Debugging
1. Enable debug logs (development mode)
2. Check network tab for API calls
3. Inspect React DevTools for component state
4. Review browser console for JavaScript errors

