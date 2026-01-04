-- Users table
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE, -- NULL for AI agents
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT, -- NULL for AI agents
    user_type TEXT NOT NULL DEFAULT 'human', -- 'human' | 'ai'
    role TEXT NOT NULL DEFAULT 'user', -- 'user', 'admin', 'moderator'
    agent_id TEXT, -- References agent registry (e.g., 'code-builder', 'alphafold-agent')
    model_version TEXT, -- e.g., 'anthropic/claude-3.5-sonnet'
    email_verified BOOLEAN DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP,
    is_active BOOLEAN DEFAULT 1,
    profile_data TEXT -- JSON string for additional profile info
);

-- User credits table
CREATE TABLE IF NOT EXISTS user_credits (
    user_id TEXT PRIMARY KEY,
    credits INTEGER DEFAULT 0,
    total_earned INTEGER DEFAULT 0,
    total_spent INTEGER DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Credit transactions table
CREATE TABLE IF NOT EXISTS credit_transactions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    amount INTEGER NOT NULL, -- positive for earned, negative for spent
    transaction_type TEXT NOT NULL, -- 'earned', 'spent', 'admin_adjustment', 'purchase'
    description TEXT,
    related_job_id TEXT, -- Links to AlphaFold/RFdiffusion/ProteinMPNN job
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Usage history table
CREATE TABLE IF NOT EXISTS usage_history (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    action_type TEXT NOT NULL, -- 'alphafold', 'rfdiffusion', 'proteinmpnn', 'agent_chat', 'pipeline_execution'
    resource_consumed TEXT, -- JSON: credits, compute_time, etc.
    metadata TEXT, -- JSON: job_id, parameters, etc.
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- User reports table
CREATE TABLE IF NOT EXISTS user_reports (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    report_type TEXT NOT NULL, -- 'bug', 'feature_request', 'abuse', 'other'
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    status TEXT DEFAULT 'pending', -- 'pending', 'reviewing', 'resolved', 'dismissed'
    priority TEXT DEFAULT 'medium', -- 'low', 'medium', 'high', 'critical'
    admin_notes TEXT,
    assigned_admin_id TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (assigned_admin_id) REFERENCES users(id)
);

-- Email verification tokens
CREATE TABLE IF NOT EXISTS email_verification_tokens (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Password reset tokens
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    used BOOLEAN DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Refresh tokens (for JWT refresh)
CREATE TABLE IF NOT EXISTS refresh_tokens (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_id ON credit_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_created_at ON credit_transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_usage_history_user_id ON usage_history(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_history_created_at ON usage_history(created_at);
CREATE INDEX IF NOT EXISTS idx_user_reports_status ON user_reports(status);
CREATE INDEX IF NOT EXISTS idx_user_reports_user_id ON user_reports(user_id);

-- User file storage metadata (replaces JSON index)
CREATE TABLE IF NOT EXISTS user_files (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    file_type TEXT NOT NULL, -- 'upload', 'rfdiffusion', 'proteinmpnn', 'alphafold'
    original_filename TEXT,
    stored_path TEXT NOT NULL, -- Relative: storage/{user_id}/uploads/pdb/{file_id}.pdb
    size INTEGER,
    metadata TEXT, -- JSON: atoms, chains, chain_residue_counts, etc.
    job_id TEXT, -- For result files (links to job)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_user_files_user_id ON user_files(user_id);
CREATE INDEX idx_user_files_type ON user_files(file_type);
CREATE INDEX idx_user_files_job_id ON user_files(job_id);

-- Chat sessions (migrate from frontend localStorage)
-- Keep for backward compatibility during migration
CREATE TABLE IF NOT EXISTS chat_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_chat_sessions_user_id ON chat_sessions(user_id);

-- Conversations (new table, replaces chat_sessions)
CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    ai_agent_id TEXT REFERENCES users(id), -- AI participant
    title TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_conversations_user_id ON conversations(user_id);
CREATE INDEX idx_conversations_ai_agent_id ON conversations(ai_agent_id);

-- Chat messages (store actual message content)
CREATE TABLE IF NOT EXISTS chat_messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL, -- Keep for backward compatibility
    conversation_id TEXT, -- New field, references conversations
    user_id TEXT NOT NULL, -- Keep for backward compatibility
    sender_id TEXT REFERENCES users(id), -- Can be human or AI user_id
    content TEXT NOT NULL,
    message_type TEXT NOT NULL DEFAULT 'user', -- 'user', 'ai', 'text', 'tool_call', 'tool_result'
    role TEXT, -- 'user', 'assistant', 'system'
    metadata TEXT, -- JSON: jobId, jobType, thinkingProcess, results, etc.
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_chat_messages_session_id ON chat_messages(session_id);
CREATE INDEX idx_chat_messages_conversation_id ON chat_messages(conversation_id);
CREATE INDEX idx_chat_messages_user_id ON chat_messages(user_id);
CREATE INDEX idx_chat_messages_sender_id ON chat_messages(sender_id);
CREATE INDEX idx_chat_messages_created_at ON chat_messages(created_at);

-- Session-file associations (replaces session_files.json)
CREATE TABLE IF NOT EXISTS session_files (
    session_id TEXT NOT NULL,
    file_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (session_id, file_id),
    FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (file_id) REFERENCES user_files(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_session_files_session_id ON session_files(session_id);
CREATE INDEX idx_session_files_file_id ON session_files(file_id);

-- Pipeline storage (migrate from localStorage)
CREATE TABLE IF NOT EXISTS pipelines (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    message_id TEXT REFERENCES chat_messages(id), -- Links to message that created/triggered pipeline
    conversation_id TEXT REFERENCES conversations(id), -- For gallery view
    name TEXT,
    description TEXT,
    pipeline_json TEXT NOT NULL, -- Full Pipeline definition as JSON
    status TEXT DEFAULT 'draft', -- 'draft', 'running', 'completed', 'failed'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_pipelines_user_id ON pipelines(user_id);
CREATE INDEX idx_pipelines_message_id ON pipelines(message_id);
CREATE INDEX idx_pipelines_conversation_id ON pipelines(conversation_id);
CREATE INDEX idx_pipelines_status ON pipelines(status);

-- Pipeline executions
CREATE TABLE IF NOT EXISTS pipeline_executions (
    id TEXT PRIMARY KEY,
    pipeline_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    status TEXT DEFAULT 'running', -- 'running', 'completed', 'failed', 'cancelled'
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    execution_log TEXT, -- JSON array of ExecutionLogEntry
    FOREIGN KEY (pipeline_id) REFERENCES pipelines(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_pipeline_executions_user_id ON pipeline_executions(user_id);
CREATE INDEX idx_pipeline_executions_pipeline_id ON pipeline_executions(pipeline_id);

-- Session state (canvas/viewer state, model settings)
CREATE TABLE IF NOT EXISTS session_state (
    session_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    visualization_code TEXT,
    viewer_visible BOOLEAN DEFAULT 0,
    model_settings TEXT, -- JSON: {selectedAgentId, selectedModel}
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_session_state_user_id ON session_state(user_id);
CREATE INDEX idx_session_state_updated_at ON session_state(updated_at);

-- Three D Canvases (message-scoped visualization code)
CREATE TABLE IF NOT EXISTS three_d_canvases (
    id TEXT PRIMARY KEY,
    message_id TEXT REFERENCES chat_messages(id),
    conversation_id TEXT REFERENCES conversations(id),
    scene_data TEXT NOT NULL, -- JSON: {molstar_code, camera_position, objects, etc.}
    preview_url TEXT,
    version INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_three_d_canvases_message_id ON three_d_canvases(message_id);
CREATE INDEX idx_three_d_canvases_conversation_id ON three_d_canvases(conversation_id);

-- Attachments (message-scoped file attachments)
CREATE TABLE IF NOT EXISTS attachments (
    id TEXT PRIMARY KEY,
    message_id TEXT REFERENCES chat_messages(id),
    file_id TEXT REFERENCES user_files(id),
    file_name TEXT,
    file_type TEXT, -- MIME type
    file_size_kb INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_attachments_message_id ON attachments(message_id);
CREATE INDEX idx_attachments_file_id ON attachments(file_id);

-- Admin audit log table
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

-- Admin preferences table
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

