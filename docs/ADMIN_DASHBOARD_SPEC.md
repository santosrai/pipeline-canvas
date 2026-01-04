# Admin Dashboard Specification

## Overview

This document specifies the requirements, architecture, and implementation details for an enhanced admin dashboard that allows administrators to view comprehensive user information, chat history, and token management with advanced filtering, real-time updates, and privacy controls.

## Requirements Summary

### Core Features
1. **User Information Management**
   - View all user data with masked sensitive information
   - Display calculated metrics and usage patterns
   - Support granular privacy controls

2. **Chat History Viewing**
   - Privacy mode with opt-in content viewing
   - Advanced filtering and search capabilities
   - Cross-referencing between users, sessions, and messages

3. **Token Management**
   - View all token types (refresh, email verification, password reset)
   - Partially masked token display
   - Rich metadata view with selective revocation

## Technical Architecture

### Frontend Architecture

#### State Management
- **Approach**: Separate admin-specific Zustand stores
- **Stores**:
  - `adminUserStore.ts` - User data, pagination, filters
  - `adminChatStore.ts` - Chat history, sessions, messages
  - `adminTokenStore.ts` - Token data and management
  - `adminAuditStore.ts` - Audit logs and action history
- **Rationale**: Isolation from main app stores, better organization

#### Component Structure
```
src/
├── pages/
│   └── AdminDashboard.tsx (enhanced)
├── components/
│   └── admin/
│       ├── UserManagement/
│       │   ├── UserList.tsx
│       │   ├── UserDetail.tsx (separate route)
│       │   ├── UserFilters.tsx
│       │   └── UserMetrics.tsx
│       ├── ChatHistory/
│       │   ├── ChatHistoryView.tsx
│       │   ├── MessageThread.tsx
│       │   ├── MessageTable.tsx
│       │   ├── ChatFilters.tsx
│       │   └── PrivacyModeToggle.tsx
│       ├── TokenManagement/
│       │   ├── TokenList.tsx
│       │   ├── TokenDetail.tsx
│       │   ├── TokenFilters.tsx
│       │   └── TokenRevokeDialog.tsx
│       ├── AuditLog/
│       │   └── AuditLogView.tsx
│       └── shared/
│           ├── DataTable.tsx
│           ├── Pagination.tsx (cursor-based)
│           ├── SearchBar.tsx
│           ├── ExportDialog.tsx
│           └── PrivacyControls.tsx
```

#### Routing
- `/admin` - Main dashboard (existing)
- `/admin/users` - User list
- `/admin/users/:userId` - User detail page (separate route)
- `/admin/users/:userId/chat` - User's chat history
- `/admin/users/:userId/tokens` - User's tokens
- `/admin/chat` - Global chat history view
- `/admin/tokens` - Global token management
- `/admin/audit` - Audit log view

### Backend Architecture

#### API Endpoints

##### User Management
```
GET    /api/admin/users
  - Query params: cursor, limit, role, is_active, search, include_deleted
  - Returns: { users: [], next_cursor: string, total: number }

GET    /api/admin/users/{user_id}
  - Returns: Full user details with masked sensitive data

GET    /api/admin/users/{user_id}/metrics
  - Returns: Calculated metrics (messages/day, session duration, etc.)

GET    /api/admin/users/{user_id}/chat
  - Query params: cursor, limit, date_from, date_to, agent_id
  - Returns: User's chat sessions and messages

GET    /api/admin/users/{user_id}/tokens
  - Query params: token_type, active_only
  - Returns: User's tokens with metadata

PATCH  /api/admin/users/{user_id}/role
  - Body: { role: string }
  - Requires: Super admin for role changes

PATCH  /api/admin/users/{user_id}/status
  - Body: { is_active: boolean }

POST   /api/admin/users/{user_id}/credits
  - Body: { amount: int, description: string }

POST   /api/admin/users/bulk
  - Body: { user_ids: [], action: 'activate'|'deactivate'|'export' }
  - Requires: Super admin for bulk operations
```

##### Chat History
```
GET    /api/admin/chat/messages
  - Query params: cursor, limit, user_id, session_id, conversation_id,
                  date_from, date_to, message_type, search, include_deleted
  - Returns: Messages with privacy mode support

GET    /api/admin/chat/sessions
  - Query params: cursor, limit, user_id, date_from, date_to
  - Returns: Chat sessions list

GET    /api/admin/chat/sessions/{session_id}/messages
  - Returns: All messages in a session

GET    /api/admin/chat/search
  - Query params: q (search query), filters (JSON)
  - Returns: Search results across messages
```

##### Token Management
```
GET    /api/admin/tokens
  - Query params: cursor, limit, user_id, token_type, active_only, expired_only
  - Returns: Tokens with masked values

GET    /api/admin/tokens/{token_id}
  - Returns: Token details with metadata

DELETE /api/admin/tokens/{token_id}
  - Revoke a single token

DELETE /api/admin/tokens/user/{user_id}
  - Query params: token_type, device, ip_address
  - Revoke tokens by criteria

POST   /api/admin/tokens/bulk-revoke
  - Body: { token_ids: [] or criteria: {} }
  - Requires: Super admin
```

##### Export & Audit
```
POST   /api/admin/export/users
  - Body: { format: 'csv'|'json', filters: {}, fields: [] }
  - Returns: Export file URL (requires approval for sensitive exports)

POST   /api/admin/export/chat
  - Body: { format: 'csv'|'json', filters: {}, include_content: boolean }
  - Requires: Super admin approval

GET    /api/admin/audit/logs
  - Query params: cursor, limit, admin_id, action_type, date_from, date_to
  - Returns: Audit log entries
```

#### WebSocket Endpoints
```
WS     /api/admin/ws
  - Real-time updates for:
    - New user registrations
    - New chat messages
    - Token creation/revocation
    - Critical admin actions
  - Message format:
    {
      "type": "user_created"|"message_sent"|"token_revoked",
      "data": { ... },
      "timestamp": "ISO8601"
    }
```

#### Database Schema Extensions

##### Admin Audit Log Table
```sql
CREATE TABLE IF NOT EXISTS admin_audit_log (
    id TEXT PRIMARY KEY,
    admin_id TEXT NOT NULL,
    action_type TEXT NOT NULL, -- 'view_user', 'export_data', 'revoke_token', etc.
    target_type TEXT, -- 'user', 'message', 'token'
    target_id TEXT,
    details TEXT, -- JSON: request params, filters, etc.
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (admin_id) REFERENCES users(id)
);

CREATE INDEX idx_admin_audit_admin_id ON admin_audit_log(admin_id);
CREATE INDEX idx_admin_audit_action_type ON admin_audit_log(action_type);
CREATE INDEX idx_admin_audit_created_at ON admin_audit_log(created_at);
```

##### Admin Preferences Table
```sql
CREATE TABLE IF NOT EXISTS admin_preferences (
    admin_id TEXT PRIMARY KEY,
    privacy_mode BOOLEAN DEFAULT 0,
    masked_fields TEXT, -- JSON array of field names to mask
    default_page_size INTEGER DEFAULT 25,
    preferred_view TEXT, -- 'table'|'thread'|'both'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (admin_id) REFERENCES users(id)
);
```

## Detailed Feature Specifications

### 1. User Information Display

#### Data Fields
**Always Visible:**
- User ID
- Username (masked if privacy mode)
- Email (masked if privacy mode)
- Role
- Account Status (Active/Inactive)
- Created At
- Last Login
- Credits Balance

**Masked by Default (Privacy Mode):**
- Email (show: `u***@***.com`)
- Username (show: `u***`)
- Password hash (never shown, even to admins)

**Calculated Metrics:**
- Messages per day (last 30 days)
- Average session duration
- Most used agent
- Total sessions
- Total messages
- Credit usage rate
- Account age

#### Privacy Controls
- Toggle privacy mode (masks PII)
- Granular field-level masking preferences
- Per-field visibility controls
- Warning indicators for sensitive data access

### 2. Chat History Viewing

#### Privacy Mode
- **Structure View**: Shows message metadata (timestamp, type, agent) without content
- **Content View**: Full message content (requires explicit opt-in)
- **Warning Banner**: Displays when viewing sensitive content
- **Audit Trail**: Logs when admins view full message content

#### Views
- **Thread View**: Conversation-style chronological display
- **Table View**: Sortable columns (timestamp, user, type, agent, preview)
- **Toggle**: Switch between views
- **Highlighting**: 
  - Messages with job IDs
  - Messages with file uploads
  - Tool calls and results
  - Sensitive metadata

#### Filtering
- Date range (from/to)
- User ID
- Session/Conversation ID
- Agent type
- Message type (user, ai, tool_call, tool_result)
- Content search (full-text)
- Metadata filters (has_job_id, has_attachment, etc.)
- Include/exclude deleted messages

#### Cross-Referencing
- Link from user → their chat sessions
- Link from session → all messages
- Link from message → related user
- Search by job ID → show all related messages
- Search by agent → show all users who used it

### 3. Token Management

#### Token Types Displayed
- Refresh tokens (active sessions)
- Email verification tokens
- Password reset tokens

#### Display Format
- **Token String**: Partially masked (`abc12345...xyz78901`)
- **Metadata**:
  - Creation timestamp
  - Expiry timestamp
  - User ID
  - IP address (if available)
  - User agent (if available)
  - Device info (if available)
  - Last used timestamp

#### Management Actions
- **View Details**: Full metadata in modal/panel
- **Revoke Single**: Revoke individual token
- **Revoke by Criteria**:
  - All tokens for a user
  - Tokens by device
  - Tokens by IP address
  - Tokens by time range
  - Expired tokens
- **Bulk Revoke**: Multiple tokens (requires super admin)

### 4. Pagination & Performance

#### Cursor-Based Pagination
- **Implementation**: Use `created_at` timestamp + ID as cursor
- **Format**: `{timestamp}_{id}` base64 encoded
- **Benefits**: 
  - Works with real-time data
  - No duplicate/missing items on insertions
  - Efficient for large datasets

#### Lazy Loading Strategy
1. **Initial Load**: Summary data only (user list, session list)
2. **Detail Load**: Load full details on-demand (user detail, message content)
3. **Progressive Enhancement**: Load metrics/calculations in background

#### Database Optimization
- Ensure indexes on:
  - `users.created_at`
  - `users.email`
  - `users.username`
  - `chat_messages.user_id`
  - `chat_messages.created_at`
  - `chat_messages.conversation_id`
  - `refresh_tokens.user_id`
  - `refresh_tokens.expires_at`
- Use efficient queries with LIMIT and WHERE clauses
- Avoid N+1 queries (use JOINs or batch loading)

### 5. Real-Time Updates (WebSockets)

#### Implementation
- **Library**: `fastapi-websocket` or `python-socketio`
- **Connection**: Persistent WebSocket connection from admin dashboard
- **Authentication**: JWT token in connection handshake
- **Reconnection**: Automatic reconnection with exponential backoff

#### Events Broadcast
- `user_created` - New user registration
- `user_updated` - User role/status change
- `message_sent` - New chat message
- `token_created` - New token issued
- `token_revoked` - Token revoked
- `admin_action` - Critical admin action (for audit)

#### Client Handling
- Update relevant stores on event receipt
- Show toast notification for new events
- Refresh affected views automatically
- Maintain cursor position during updates

### 6. Search & Filtering

#### Advanced Filters
- **Date Range**: Calendar picker for from/to dates
- **Role Filter**: Multi-select dropdown
- **Status Filter**: Active/Inactive/All
- **Message Type**: Multi-select (user, ai, tool_call, etc.)
- **Agent Filter**: Multi-select agent IDs
- **Text Search**: Full-text search across content/metadata
- **Boolean Logic**: AND/OR between filters
- **Saved Filters**: Save frequently used filter combinations

#### Search Implementation
- **Backend**: SQL LIKE for simple search, full-text search for content
- **Frontend**: Debounced input (300ms delay)
- **Results**: Highlight matching terms
- **Performance**: Limit search to indexed columns, use pagination

### 7. Export Functionality

#### Export Types
- **CSV**: Tabular data (users, messages, tokens)
- **JSON**: Structured data with relationships
- **PDF**: Formatted reports (requires additional library)

#### Export Restrictions
- **Standard Exports**: Basic data (non-sensitive)
- **Sensitive Exports**: Require super admin approval
  - Full chat content
  - Token strings (even masked)
  - User PII
- **Audit Logging**: All exports logged with:
  - Admin ID
  - Export type
  - Filters applied
  - Timestamp
  - Approval status

#### Export Flow
1. Admin selects data and format
2. System checks if approval needed
3. If needed: Queue for super admin approval
4. If not: Generate export immediately
5. Provide download link (expires in 1 hour)
6. Log export action

### 8. Bulk Operations

#### Supported Operations
- **User Management**:
  - Bulk activate/deactivate
  - Bulk role assignment (requires super admin)
  - Bulk credit adjustment
- **Token Management**:
  - Bulk revoke by criteria
  - Bulk revoke expired tokens
- **Export**:
  - Bulk export selected users/sessions

#### Restrictions
- **Standard Admin**: Limited bulk operations (activate/deactivate users)
- **Super Admin**: Full bulk operations
- **Confirmation Required**: All bulk operations require confirmation dialog
- **Audit Logging**: All bulk operations logged with details

### 9. Access Control & Security

#### Role-Based Permissions
- **Admin**: 
  - View users, chat, tokens
  - Activate/deactivate users
  - Adjust credits
  - View audit logs
- **Super Admin** (additional):
  - Change user roles
  - View full chat content (bypass privacy mode)
  - Export sensitive data
  - Bulk operations
  - Revoke tokens
  - Manage other admins

#### Security Measures
- **Authentication**: JWT token required for all endpoints
- **Authorization**: Role check on every request
- **Rate Limiting**: Stricter limits for admin endpoints
- **IP Logging**: Log IP addresses for audit trail
- **Session Management**: Admin sessions timeout after 2 hours of inactivity

### 10. Audit Logging

#### Logged Actions
- View user details
- View chat history (with privacy mode status)
- View tokens
- Export data
- Revoke tokens
- Change user role/status
- Adjust credits
- Bulk operations

#### Log Format
```json
{
  "id": "audit_log_id",
  "admin_id": "admin_user_id",
  "action_type": "view_user"|"export_data"|"revoke_token",
  "target_type": "user"|"message"|"token",
  "target_id": "target_entity_id",
  "details": {
    "filters": {},
    "privacy_mode": true,
    "fields_viewed": []
  },
  "ip_address": "192.168.1.1",
  "user_agent": "Mozilla/5.0...",
  "created_at": "2024-01-01T00:00:00Z"
}
```

#### Audit Log View
- Filterable by admin, action type, date range
- Cursor-based pagination
- Export capability (for compliance)
- Search functionality

### 11. UI/UX Specifications

#### Responsive Design
- **Desktop**: Full feature set, multi-column layouts
- **Tablet**: Adapted layouts, touch-friendly controls
- **Mobile**: Stacked layouts, simplified filters, core features only

#### Error Handling
- **Toast Notifications**: All errors shown as non-blocking toasts
- **Error Types**:
  - Network errors (with retry button)
  - Permission errors (clear message)
  - Validation errors (inline in forms)
  - Server errors (generic message, log details)

#### Loading States
- Skeleton loaders for data tables
- Progress indicators for exports
- Spinner for individual actions
- Optimistic updates where appropriate

#### Accessibility
- Keyboard navigation support
- ARIA labels for screen readers
- High contrast mode support
- Focus indicators

## Implementation Phases

### Phase 1: Core User Management Enhancement
1. Enhanced user list with cursor pagination
2. User detail page (separate route)
3. Basic metrics calculation
4. Privacy mode toggle
5. Advanced filters

### Phase 2: Chat History Viewing
1. Chat history API endpoints
2. Thread and table views
3. Privacy mode for messages
4. Advanced filtering
5. Cross-referencing links

### Phase 3: Token Management
1. Token listing with metadata
2. Token detail view
3. Revocation functionality
4. Bulk operations
5. Rich metadata display

### Phase 4: Real-Time & Advanced Features
1. WebSocket implementation
2. Real-time updates
3. Export functionality
4. Audit logging
5. Bulk operations

### Phase 5: Polish & Optimization
1. Performance optimization
2. Mobile responsiveness
3. Accessibility improvements
4. Error handling refinement
5. Documentation

## Technical Considerations

### Performance
- **Database**: Use indexes, efficient queries, connection pooling
- **Frontend**: Lazy loading, virtual scrolling for large lists, memoization
- **Caching**: Consider Redis for frequently accessed data (optional)
- **Pagination**: Cursor-based for real-time compatibility

### Security
- **Authentication**: JWT tokens, refresh token rotation
- **Authorization**: Role-based access control, operation-level permissions
- **Data Privacy**: Masking, privacy mode, audit trails
- **Rate Limiting**: Stricter limits for admin endpoints
- **Input Validation**: Sanitize all inputs, prevent SQL injection

### Scalability
- **Database**: Indexes, query optimization, consider read replicas
- **API**: Pagination, filtering, efficient serialization
- **WebSocket**: Connection pooling, message queuing
- **Frontend**: Code splitting, lazy loading, efficient state management

## Testing Requirements

### Unit Tests
- Store logic (pagination, filtering, state updates)
- Utility functions (masking, formatting, validation)
- API endpoint handlers

### Integration Tests
- API endpoints with database
- WebSocket connections
- Authentication/authorization flows

### E2E Tests
- User management workflows
- Chat history viewing
- Token management
- Export functionality
- Bulk operations

## Documentation Requirements

### User Documentation
- Admin dashboard user guide
- Feature documentation
- Privacy controls guide

### Developer Documentation
- API documentation (OpenAPI/Swagger)
- Component documentation
- State management patterns
- WebSocket protocol documentation

## Success Metrics

- **Performance**: Page load < 2s, API response < 500ms
- **Usability**: Admin can find user info in < 3 clicks
- **Security**: Zero unauthorized access incidents
- **Reliability**: 99.9% uptime for admin endpoints
