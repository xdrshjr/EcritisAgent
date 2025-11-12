# Document Upload API

## Endpoint
`POST /api/documents/upload`

## Description
Handles uploading Word documents (.doc, .docx) for AI document validation. The API validates file type, size, and processes the document content for further editing.

## Request

### Headers
- `Content-Type: multipart/form-data`

### Body (FormData)
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| file | File | Yes | Word document file (.doc or .docx) |

### File Constraints
- **Allowed Types**: 
  - `application/vnd.openxmlformats-officedocument.wordprocessingml.document` (.docx)
  - `application/msword` (.doc)
- **Maximum Size**: 10MB
- **Encoding**: Binary

## Response

### Success Response (200 OK)
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

### Error Responses

#### 400 Bad Request - No File Provided
```json
{
  "success": false,
  "error": "No file provided"
}
```

#### 400 Bad Request - Invalid File Type
```json
{
  "success": false,
  "error": "Invalid file type. Only Word documents (.doc, .docx) are allowed"
}
```

#### 400 Bad Request - File Size Exceeded
```json
{
  "success": false,
  "error": "File size exceeds 10MB limit"
}
```

#### 500 Internal Server Error
```json
{
  "success": false,
  "error": "Failed to upload document"
}
```

## Usage Example

### JavaScript (Fetch API)
```javascript
const formData = new FormData();
formData.append('file', fileInput.files[0]);

const response = await fetch('/api/documents/upload', {
  method: 'POST',
  body: formData,
});

const result = await response.json();
if (result.success) {
  console.log('File uploaded:', result.data.fileName);
  // Use result.data.content (base64) for further processing
}
```

### cURL
```bash
curl -X POST http://localhost:3000/api/documents/upload \
  -F "file=@/path/to/document.docx"
```

## Logging
The API logs the following events:
- Request received
- File validation results
- Upload success/failure with file metadata
- Error details for troubleshooting

## Document Processing

### Client-Side Processing (Word Editor Panel)

After the upload API returns the document content, the client-side Word Editor Panel processes the document using:

1. **Mammoth.js Conversion**
   - Converts Word document binary to HTML
   - Applies custom style mapping to preserve formatting
   - Extracts text alignment, indentation, and inline styles

2. **Format Preservation**
   - Text alignment (left, center, right, justify)
   - Paragraph indentation (margin-left, text-indent)
   - Text formatting (bold, italic, underline, strikethrough)
   - Headings (H1-H6)
   - Lists (bulleted and numbered)
   - Text colors and styles

3. **HTML Enhancement**
   - Post-processes converted HTML to add CSS classes
   - Preserves inline styles as data attributes
   - Adds proper alignment classes for TipTap editor

### Format Preservation Details

The following Word formatting is preserved during upload and conversion:

| Word Feature | Preservation Status | Implementation |
|--------------|-------------------|----------------|
| Text alignment (center, right, justify) | ✅ Fully supported | Custom style map + CSS classes |
| Bold, italic, underline | ✅ Fully supported | Native HTML tags |
| Headings (H1-H6) | ✅ Fully supported | Style map conversion |
| Bulleted/Numbered lists | ✅ Fully supported | Native HTML lists |
| Paragraph indentation | ✅ Supported | Inline styles + data attributes |
| Text color | ✅ Supported | Inline color styles |
| Font family | ⚠️ Limited support | Browser font availability |
| Font size | ⚠️ Limited support | Relative sizing |
| Tables | ⚠️ Basic support | Simple structure only |
| Images | ⚠️ Limited support | Embedded images only |
| Track changes | ❌ Not supported | Mammoth.js limitation |
| Comments | ❌ Not supported | Mammoth.js limitation |
| Headers/Footers | ❌ Not supported | Web editor limitation |

### Logging Details

The document upload and conversion process generates detailed logs:

#### API Level (Server-Side)
```
[API:Upload] Document upload request received
[API:Upload] File uploaded successfully { fileName, fileSize, fileType }
[API:Upload] Document upload completed { duration }
```

#### Client Level (Word Editor Panel)
```
[WordEditorPanel] Starting file upload { fileName, fileSize }
[WordEditorPanel] Converting Word document to HTML with style preservation
[WordEditorPanel] Document converted successfully { htmlLength, messagesCount }
[WordEditorPanel] Style conversion warnings detected { count, warnings }
[WordEditorPanel] HTML formatting enhancement completed { paragraphsProcessed, styledElementsFound }
[WordEditorPanel] Document loaded into editor with formatting preserved { fileName }
```

## Notes
- The API returns the document content as base64-encoded string for client-side processing
- File content is temporarily stored in memory and not persisted on the server
- All uploaded files are validated for type and size before processing
- Document conversion to HTML happens client-side using mammoth.js library
- Format preservation is best-effort; complex Word features may not convert perfectly
- Console logs provide detailed information about style conversion and warnings

## Troubleshooting

### Format Not Preserved

If document formatting is not preserved correctly:

1. **Check Console Logs**: Look for style conversion warnings in browser console
2. **Verify Word Document**: Ensure the Word document uses standard styles, not custom formatting
3. **Test Incrementally**: Try uploading a simpler document to isolate the issue
4. **Review Warnings**: Mammoth.js logs warnings for unsupported styles

### Common Issues

| Issue | Possible Cause | Solution |
|-------|---------------|----------|
| Alignment lost | Custom Word styles | Use standard "Center", "Right" alignment in Word |
| Indentation missing | Complex indentation rules | Use simple left margin/indent in Word |
| Colors not showing | Theme colors in Word | Use standard RGB colors in Word |
| Font size wrong | Absolute font sizes | Relative sizing in web editor |

## Performance Considerations

- **Upload Speed**: Depends on file size and network conditions
- **Conversion Time**: Client-side conversion takes 100-500ms for typical documents
- **Memory Usage**: Large documents (>5MB) may use significant browser memory
- **Browser Performance**: Complex documents with many styles may slow down editor

## Security

- File type validation prevents non-Word documents
- File size limit prevents memory exhaustion attacks
- No server-side storage reduces data breach risks
- Client-side processing keeps documents private

