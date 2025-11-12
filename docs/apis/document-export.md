# Document Export API

## Endpoint
`POST /api/documents/export`

## Description
Handles exporting edited Word documents. The API processes the document content and prepares it for download in the requested format.

## Request

### Headers
- `Content-Type: application/json`

### Body (JSON)
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| content | string | Yes | HTML or base64-encoded document content |
| fileName | string | Yes | Desired output file name (without extension) |
| format | string | No | Export format: 'docx' or 'html' (default: 'docx') |

### Request Example
```json
{
  "content": "<html>...</html>",
  "fileName": "edited-document",
  "format": "docx"
}
```

## Response

### Success Response (200 OK)
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

### Error Responses

#### 400 Bad Request - No Content Provided
```json
{
  "success": false,
  "error": "No content provided"
}
```

#### 400 Bad Request - No File Name Provided
```json
{
  "success": false,
  "error": "No fileName provided"
}
```

#### 400 Bad Request - Invalid Format
```json
{
  "success": false,
  "error": "Invalid export format"
}
```

#### 500 Internal Server Error
```json
{
  "success": false,
  "error": "Failed to export document"
}
```

## Usage Example

### JavaScript (Fetch API)
```javascript
const exportDocument = async (content, fileName) => {
  const response = await fetch('/api/documents/export', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      content: content,
      fileName: fileName,
      format: 'docx',
    }),
  });

  const result = await response.json();
  if (result.success) {
    console.log('Document exported:', result.data.fileName);
    return result.data;
  }
};
```

### cURL
```bash
curl -X POST http://localhost:3000/api/documents/export \
  -H "Content-Type: application/json" \
  -d '{
    "content": "<html><body><p>Document content</p></body></html>",
    "fileName": "my-document",
    "format": "docx"
  }'
```

## Supported Formats

### DOCX (Microsoft Word)
- Default export format
- Maintains rich text formatting
- Compatible with Microsoft Word, Google Docs, LibreOffice

### HTML
- Web-compatible format
- Preserves basic styling
- Suitable for email or web display

## Client-Side Processing
The actual document conversion from HTML to DOCX is performed on the client-side using the `html-docx-js` library. The API serves as a validation and coordination layer.

## Logging
The API logs the following events:
- Export request received
- Content validation results
- Export processing details (file name, format, content length)
- Export success/failure with metadata
- Error details for troubleshooting

## Notes
- The export process maintains document formatting as much as possible
- Complex Word features (comments, tracked changes) may have limited support
- The API validates content and metadata before processing
- No server-side storage is used; all processing is stateless

