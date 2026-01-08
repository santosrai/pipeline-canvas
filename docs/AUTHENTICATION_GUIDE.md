# Authentication Guide for Frontend Development

## Overview

All backend API endpoints (except auth endpoints) require JWT authentication. This guide explains how to properly include authentication in frontend API requests.

## Quick Reference

### ✅ DO: Use `api` instance for most requests
```typescript
import { api } from '../utils/api';
const response = await api.post('/endpoint', data);
```

### ✅ DO: Use `getAuthHeaders()` for `fetch()` calls
```typescript
import { getAuthHeaders } from '../utils/api';
const headers = getAuthHeaders();
const response = await fetch('/api/endpoint', { method: 'POST', headers, body });
```

### ❌ DON'T: Use `fetch()` without headers
```typescript
// This will fail with 401 Unauthorized
const response = await fetch('/api/endpoint', { method: 'POST', body });
```

## Authentication Methods

### Method 1: Using `api` Instance (Axios)

The `api` instance from `src/utils/api.ts` automatically includes authentication headers via interceptors:

```typescript
import { api } from '../utils/api';

// ✅ Automatically includes Authorization header
const response = await api.post('/upload/pdb', formData);
const data = await api.get('/files');
const result = await api.delete(`/files/${fileId}`);
```

**When to use:**
- JSON requests (POST, GET, PUT, DELETE)
- Standard API calls
- When you don't need FormData

**Limitations:**
- Axios may interfere with FormData Content-Type (browser needs to set boundary)
- For file uploads with FormData, prefer `fetch()` with manual headers

### Method 2: Using `fetch()` with `getAuthHeaders()`

For file uploads and other cases where you need direct control over headers:

```typescript
import { getAuthHeaders } from '../utils/api';

// ✅ Correct: Include auth headers
const headers = getAuthHeaders();
const response = await fetch('/api/upload/pdb', {
  method: 'POST',
  headers,  // Only includes Authorization, not Content-Type
  body: formData,
});
```

**When to use:**
- File uploads with FormData
- When you need browser to set Content-Type automatically
- Binary data uploads

**Important:** `getAuthHeaders()` only returns the `Authorization` header. It does NOT set `Content-Type`, which is correct for FormData (browser sets it with boundary).

## File Upload Pattern

File uploads are a common case that requires special handling:

```typescript
import { getAuthHeaders } from '../utils/api';

const handleFileUpload = async (file: File, sessionId?: string) => {
  const formData = new FormData();
  formData.append('file', file);
  if (sessionId) {
    formData.append('session_id', sessionId);
  }

  // Get auth headers (only Authorization, not Content-Type)
  const headers = getAuthHeaders();

  try {
    const response = await fetch('/api/upload/pdb', {
      method: 'POST',
      headers,  // ✅ Required for authentication
      body: formData,  // Browser sets Content-Type with boundary
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail || 'Upload failed');
    }

    const result = await response.json();
    return result;
  } catch (error) {
    console.error('File upload failed:', error);
    throw error;
  }
};
```

## File Download Pattern

When fetching files, also include authentication:

```typescript
import { getAuthHeaders } from '../utils/api';

const downloadFile = async (fileUrl: string) => {
  const headers = getAuthHeaders();
  
  const response = await fetch(fileUrl, { headers });
  
  if (!response.ok) {
    throw new Error('Failed to fetch file');
  }
  
  return await response.text(); // or .blob(), .json(), etc.
};
```

## Common Patterns

### Pattern 1: Standard API Call
```typescript
import { api } from '../utils/api';

// ✅ Correct - automatic auth
const response = await api.post('/chat/sessions', {
  title: 'New Session'
});
```

### Pattern 2: File Upload
```typescript
import { getAuthHeaders } from '../utils/api';

const formData = new FormData();
formData.append('file', file);

const headers = getAuthHeaders();
const response = await fetch('/api/upload/pdb', {
  method: 'POST',
  headers,
  body: formData,
});
```

### Pattern 3: File Download
```typescript
import { getAuthHeaders } from '../utils/api';

const headers = getAuthHeaders();
const response = await fetch(fileUrl, { headers });
const content = await response.text();
```

## Error Handling

### 401 Unauthorized
**Cause:** Missing or invalid authentication token

**Solutions:**
1. Check if user is logged in:
   ```typescript
   const { isAuthenticated } = useAuthStore();
   if (!isAuthenticated) {
     // Redirect to login
   }
   ```

2. Verify headers are included:
   ```typescript
   // ✅ Correct
   const headers = getAuthHeaders();
   fetch(url, { headers });
   
   // ❌ Wrong
   fetch(url); // Missing headers
   ```

3. Check token expiration:
   - Token may have expired
   - User may need to sign in again
   - Check browser console for token refresh errors

### 403 Forbidden
**Cause:** User doesn't have permission to access the resource

**Solutions:**
- Verify user has access to the resource (file ownership, role, etc.)
- Check if resource exists and belongs to the user
- Verify user role has required permissions

## Protected Endpoints

All endpoints under `/api/` require authentication except:

### Public Endpoints (No Auth Required)
- `POST /api/auth/signup` - User registration
- `POST /api/auth/signin` - User login
- `GET /api/health` - Health check

### Protected Endpoints (Auth Required)
- `POST /api/upload/pdb` - Upload PDB file
- `GET /api/upload/pdb/{file_id}` - Download uploaded file
- `GET /api/files` - List user files
- `DELETE /api/files/{file_id}` - Delete file
- `GET /api/sessions/{session_id}/files` - List session files
- `POST /api/chat/sessions` - Create chat session
- `GET /api/chat/sessions` - List chat sessions
- `POST /api/chat/sessions/{session_id}/messages` - Create message
- `GET /api/pipelines` - List pipelines
- `POST /api/pipelines` - Create pipeline
- All other `/api/*` endpoints

## Testing Authentication

### Browser Console Test
```javascript
// Check if user is authenticated
const authStorage = localStorage.getItem('novoprotein-auth-storage');
const auth = JSON.parse(authStorage);
console.log('Token:', auth.state.accessToken ? 'Present' : 'Missing');
console.log('User:', auth.state.user);
```

### cURL Test
```bash
# Without token (should fail with 401)
curl -X POST http://localhost:8787/api/upload/pdb -F "file=@test.pdb"

# With token (should succeed)
TOKEN="your-jwt-token-here"
curl -X POST http://localhost:8787/api/upload/pdb \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@test.pdb"
```

## Troubleshooting

### Issue: "Not authenticated" error on file upload

**Checklist:**
1. ✅ Is user logged in? Check `useAuthStore().isAuthenticated`
2. ✅ Are headers included? Verify `getAuthHeaders()` is called
3. ✅ Is token valid? Check browser console for token errors
4. ✅ Is endpoint correct? Verify URL is `/api/upload/pdb`

**Solution:**
```typescript
// ✅ Correct implementation
import { getAuthHeaders } from '../utils/api';

const headers = getAuthHeaders();
const response = await fetch('/api/upload/pdb', {
  method: 'POST',
  headers,  // Don't forget this!
  body: formData,
});
```

### Issue: File upload works but file download fails

**Checklist:**
1. ✅ Are headers included in fetch call?
2. ✅ Is file URL correct?
3. ✅ Does user own the file?

**Solution:**
```typescript
// ✅ Correct - include headers for file download too
const headers = getAuthHeaders();
const fileResponse = await fetch(fileUrl, { headers });
```

## Best Practices

1. **Always use `api` instance when possible** - It handles auth automatically
2. **Use `getAuthHeaders()` for `fetch()` calls** - Don't forget to include headers
3. **Check authentication before making requests** - Verify user is logged in
4. **Handle 401 errors gracefully** - Redirect to login if token is invalid
5. **Don't set Content-Type for FormData** - Let browser set it with boundary
6. **Test with curl** - Verify endpoints work with authentication

## Code Examples

### Complete File Upload Component
```typescript
import { getAuthHeaders } from '../utils/api';
import { useAuthStore } from '../stores/authStore';

const FileUploadComponent = () => {
  const { isAuthenticated } = useAuthStore();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUpload = async (file: File) => {
    if (!isAuthenticated) {
      setError('Please log in to upload files');
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const headers = getAuthHeaders();
      const response = await fetch('/api/upload/pdb', {
        method: 'POST',
        headers,
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Upload failed');
      }

      const result = await response.json();
      console.log('Upload successful:', result);
    } catch (err: any) {
      setError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    // Component JSX
  );
};
```

## Summary

- ✅ **Always include authentication** for API requests
- ✅ **Use `api` instance** for standard requests (automatic auth)
- ✅ **Use `getAuthHeaders()`** for `fetch()` calls (manual auth)
- ✅ **Don't forget headers** when using `fetch()` directly
- ❌ **Never make API calls without authentication** (except public endpoints)
