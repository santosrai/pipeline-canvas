# HTTP Request Node - Product Specification

## Overview
The HTTP Request node enables users to make HTTP/HTTPS requests to any RESTful API or web service within the pipeline workflow. It provides comprehensive request configuration, execution tracking, and detailed output visualization.

## Core Features (Inspired by n8n)

### 1. HTTP Method Support
- **Supported Methods**: GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS
- **Default**: POST
- **Configuration**: Dropdown selector in node config panel

### 2. URL Configuration
- **Absolute URLs**: Full URLs (e.g., `https://api.example.com/v1/data`)
- **Relative URLs**: Relative to backend base URL (e.g., `/api/endpoint`)
- **Template Variables**: Support for dynamic URLs using `{{config.param}}` and `{{input.data}}`
- **URL Validation**: Real-time validation with visual feedback
- **URL Builder**: Optional helper UI for constructing URLs with query parameters

### 3. Authentication
- **None**: No authentication
- **Basic Auth**: Username and password (Base64 encoded)
- **Bearer Token**: Token-based authentication
- **Custom Header**: Custom authentication header (e.g., `X-API-Key`)
- **API Key**: Standard API key in header or query parameter
- **OAuth 2.0**: (Future enhancement)

### 4. Headers Configuration
- **Default Headers**: Automatically set `Content-Type` based on body type
- **Custom Headers**: JSON editor for custom headers
- **Template Support**: Dynamic header values using `{{variables}}`
- **Header Toggle**: Option to enable/disable sending headers
- **Common Headers Preset**: Quick selection for common headers (Accept, User-Agent, etc.)

### 5. Query Parameters
- **Toggle**: Enable/disable query parameters
- **JSON Editor**: Key-value pairs as JSON object
- **Template Variables**: Dynamic query parameter values
- **URL Encoding**: Automatic encoding of special characters

### 6. Request Body
- **Body Toggle**: Enable/disable request body
- **Content Types**:
  - **JSON**: JSON formatted body
  - **Form Data**: Multipart form data (key-value pairs)
  - **Form URL Encoded**: `application/x-www-form-urlencoded`
  - **Raw**: Plain text, XML, or custom content type
  - **Binary**: File uploads (future enhancement)
- **Body Specification**:
  - **JSON**: Direct JSON input with syntax highlighting
  - **Expression**: Template expressions (e.g., `{{input.data}}`)
  - **Fixed**: Static text content
- **Template Variables**: Full support for `{{input.*}}` and `{{config.*}}` variables
- **Body Preview**: Real-time preview of resolved body before execution

### 7. Advanced Options
- **Timeout**: Request timeout in seconds (default: 30s, max: 300s)
- **Follow Redirects**: Automatically follow HTTP redirects (3xx responses)
- **SSL Verification**: Toggle SSL certificate validation
- **Response Format**: 
  - **Auto-detect**: Automatically parse JSON, XML, or text
  - **JSON**: Force JSON parsing
  - **Text**: Return as plain text
  - **Binary**: Return as binary data
- **Retry Logic**: (Future enhancement)
  - Number of retries
  - Retry delay
  - Retry on specific status codes

## Output Panel Features

### 1. Execution Status Display
- **Status Indicator**: Visual status badge (Success/Error/Running)
- **HTTP Status Code**: Color-coded status code display
  - 2xx: Green (Success)
  - 3xx: Yellow (Redirect)
  - 4xx: Red (Client Error)
  - 5xx: Red (Server Error)
- **Status Text**: Human-readable status message
- **Execution Time**: Duration of request in milliseconds

### 2. Request Details Section
- **Method & URL**: Full request details (GET https://api.example.com/endpoint)
- **Headers**: Expandable section showing all request headers
  - Mask sensitive headers (Authorization, API keys) by default
  - Toggle to show/hide masked values
- **Query Parameters**: Display all query parameters
- **Request Body**: 
  - Formatted JSON with syntax highlighting
  - Raw text view for non-JSON bodies
  - Copy to clipboard functionality
- **Request Size**: Size of request payload in bytes/KB

### 3. Response Details Section
- **Response Headers**: All response headers in expandable section
- **Response Body**: 
  - **Table View**: Auto-generated table for JSON arrays/objects
  - **JSON View**: Formatted JSON with syntax highlighting and collapsible sections
  - **Schema View**: JSON schema inference and display
  - **Raw View**: Unformatted response text
- **Response Size**: Size of response payload
- **Content Type**: Detected content type (application/json, text/html, etc.)

### 4. Error Display
- **Error Message**: Clear, user-friendly error message
- **Error Details**: 
  - Network errors (timeout, connection refused, etc.)
  - HTTP errors (4xx, 5xx) with full response body
  - Parsing errors (invalid JSON, etc.)
- **Error Response Body**: Full error response even for non-2xx status codes
- **Stack Trace**: (Optional) Developer mode stack trace
- **Retry Suggestion**: Actionable suggestions for common errors

### 5. Output Data Tabs
- **Table Tab**: 
  - Auto-detect arrays and display as table
  - Sortable columns
  - Search/filter functionality
  - Pagination for large datasets
- **JSON Tab**: 
  - Formatted JSON with syntax highlighting
  - Collapsible object/array sections
  - Copy to clipboard
  - Download as file
- **Schema Tab**: 
  - Inferred JSON schema
  - Data type information
  - Required/optional fields
  - Example values

### 6. Additional Output Features
- **Copy Response**: One-click copy of full response
- **Download Response**: Download response as file
- **Export as**: Export in different formats (JSON, CSV, etc.)
- **Pretty Print**: Toggle formatted/unformatted view
- **Search in Response**: Search functionality within response body
- **Response History**: (Future) View previous executions

## Node Configuration Schema

### Metadata
```json
{
  "metadata": {
    "type": "http_request_node",
    "label": "HTTP Request",
    "icon": "Globe",
    "color": "#3b82f6",
    "borderColor": "border-blue-500",
    "bgColor": "bg-blue-500",
    "description": "Make HTTP requests to any API endpoint"
  }
}
```

### Schema Fields
1. **method** (select, required): HTTP method
2. **url** (string, required): Request URL
3. **auth_type** (select): Authentication type (none, basic, bearer, custom)
4. **auth_basic_username** (string): Basic auth username
5. **auth_basic_password** (string, password): Basic auth password
6. **auth_bearer_token** (string, password): Bearer token
7. **auth_custom_header_name** (string): Custom auth header name
8. **auth_custom_header_value** (string, password): Custom auth header value
9. **send_headers** (boolean): Toggle custom headers
10. **custom_headers** (json): Custom headers JSON
11. **send_query_params** (boolean): Toggle query parameters
12. **query_params** (json): Query parameters JSON
13. **send_body** (boolean): Toggle request body
14. **body_content_type** (select): Body content type
15. **body_specify** (select): How to specify body
16. **body_json** (textarea): Body content (JSON/expression/raw)
17. **timeout** (number): Request timeout in seconds
18. **follow_redirects** (boolean): Follow redirects
19. **ssl_verify** (boolean): Verify SSL certificates
20. **response_format** (select): Response parsing format

### Execution Configuration
```json
{
  "execution": {
    "type": "api_call",
    "endpoint": "{{config.url}}",
    "method": "{{config.method}}",
    "queryParams": "{{config.query_params}}",
    "headers": {
      "__auth_type__": "{{config.auth_type}}",
      "__basic_auth_username__": "{{config.auth_basic_username}}",
      "__basic_auth_password__": "{{config.auth_basic_password}}",
      "__bearer_token__": "{{config.auth_bearer_token}}",
      "__custom_auth_header_name__": "{{config.auth_custom_header_name}}",
      "__custom_auth_header_value__": "{{config.auth_custom_header_value}}",
      "__custom_headers__": "{{config.custom_headers}}",
      "__send_headers__": "{{config.send_headers}}"
    },
    "payload": {
      "__send_body__": "{{config.send_body}}",
      "__body_content_type__": "{{config.body_content_type}}",
      "__body_specify__": "{{config.body_specify}}",
      "__body_json__": "{{config.body_json}}"
    },
    "options": {
      "timeout": "{{config.timeout}}",
      "followRedirects": "{{config.follow_redirects}}",
      "sslVerify": "{{config.ssl_verify}}",
      "responseFormat": "{{config.response_format}}"
    }
  }
}
```

## Integration Points

### 1. Input/Output Handles
- **Input Handles**: 
  - Generic data input (for passing data to request body/headers)
  - File input (for file uploads - future)
- **Output Handles**: 
  - Response data output (for chaining to next nodes)
  - Error output (for error handling nodes - future)

### 2. Template Variable System
- Support `{{input.*}}` for upstream node data
- Support `{{config.*}}` for node configuration values
- Support `{{node.*}}` for accessing other node outputs (future)
- Real-time validation of template variables

### 3. Execution Engine Integration
- Use existing `api_call` execution type
- Extend `executionEngine.ts` to handle new options (timeout, redirects, SSL)
- Capture full request/response details for logging

### 4. Output Panel Integration
- Extend existing output panel in `PipelineNodeConfig.tsx`
- Add new tabs (Table, Schema) if not already present
- Enhance error display with full response body

## Additional Feature Suggestions

### 1. Request Testing & Validation
- **Test Button**: Test request without executing full pipeline
- **Request Validation**: Pre-execution validation (URL format, JSON syntax, etc.)
- **Mock Response**: Option to return mock response for testing
- **Request Preview**: Preview final request before execution

### 2. Response Processing
- **Response Transformation**: JavaScript expression to transform response
- **Response Filtering**: Filter response data before passing to next node
- **Response Validation**: Validate response structure against schema
- **Response Caching**: Cache responses for repeated requests (future)

### 3. Advanced Request Features
- **Request Chaining**: Chain multiple requests (use response from one as input to next)
- **Batch Requests**: Execute multiple requests in parallel
- **Request Interceptors**: Modify requests before sending (future)
- **Response Interceptors**: Modify responses after receiving (future)

### 4. Monitoring & Debugging
- **Request Timeline**: Visual timeline of request execution
- **Network Tab**: View all network requests (similar to browser DevTools)
- **Request/Response Diff**: Compare request/response between executions
- **Performance Metrics**: Response time, payload size, etc.

### 5. Security Features
- **Secrets Management**: Secure storage of API keys and tokens
- **Header Masking**: Automatic masking of sensitive headers in logs
- **CORS Handling**: Handle CORS preflight requests
- **Rate Limiting**: Built-in rate limiting for API calls

### 6. Developer Experience
- **cURL Export**: Export request as cURL command
- **Postman Import**: Import requests from Postman collections
- **OpenAPI Integration**: Auto-generate requests from OpenAPI specs
- **Code Snippets**: Generate code snippets in various languages

### 7. Error Handling
- **Error Recovery**: Automatic retry with exponential backoff
- **Error Branching**: Route to different nodes based on error type
- **Error Notifications**: Notify on specific error conditions
- **Error Logging**: Detailed error logs for debugging

## Implementation Priority

### Phase 1 (MVP) - Core Functionality
1. ✅ HTTP method selection (GET, POST, PUT, PATCH, DELETE)
2. ✅ URL configuration with template variables
3. ✅ Basic authentication (Bearer token, API key)
4. ✅ Headers configuration
5. ✅ Query parameters
6. ✅ Request body (JSON, form data, raw)
7. ✅ Output panel with request/response display
8. ✅ Error display with full response body

### Phase 2 - Enhanced Features
1. ⏳ Advanced authentication (Basic Auth, Custom headers)
2. ⏳ Request timeout configuration
3. ⏳ Follow redirects option
4. ⏳ SSL verification toggle
5. ⏳ Response format selection
6. ⏳ Table view for array responses
7. ⏳ Schema inference and display
8. ⏳ Copy/download response functionality

### Phase 3 - Advanced Features
1. 🔮 Retry logic
2. 🔮 Request testing/validation
3. 🔮 Response transformation
4. 🔮 Performance metrics
5. 🔮 Request history
6. 🔮 cURL export
7. 🔮 Batch requests

## Testing Requirements

### Unit Tests
- URL template variable resolution
- Header construction with authentication
- Body formatting for different content types
- Query parameter encoding
- Error handling and response parsing

### Integration Tests
- End-to-end request execution
- Output panel data display
- Error display for various error types
- Template variable substitution
- Authentication flow

### Manual Testing Scenarios
1. **Successful GET request**: Verify response display in output panel
2. **POST with JSON body**: Verify request body and response
3. **Authentication**: Test Bearer token, Basic auth, Custom headers
4. **Error handling**: Test 4xx, 5xx responses, network errors, timeouts
5. **Template variables**: Test `{{input.*}}` and `{{config.*}}` substitution
6. **Large responses**: Test with large JSON responses
7. **Binary responses**: Test with binary data (images, files)
8. **Redirects**: Test with 3xx redirect responses

## Success Criteria

1. ✅ User can configure and execute HTTP requests with all common methods
2. ✅ Output panel clearly displays request details, response data, and errors
3. ✅ Full error response body is shown even for non-2xx status codes
4. ✅ Template variables work correctly in URL, headers, query params, and body
5. ✅ Multiple authentication methods are supported
6. ✅ Response data is properly formatted and viewable in multiple formats
7. ✅ Node integrates seamlessly with existing pipeline execution system

## Future Enhancements

- GraphQL support
- WebSocket connections
- Server-Sent Events (SSE)
- gRPC support
- Request/response mocking for testing
- API documentation generation
- Request templates/library
- Collaborative request sharing

