# Agent Logging Guide

## How to See Which Agent is Triggered

### Frontend Logs (Browser Console)

Open **Developer Tools → Console** and look for these messages:

#### 1. Agent Selection
```
🎯 [AGENT SELECTED] mvs-builder (code) - Reason: rule:mvs-keywords
🧠 [RAG AGENT] MVS agent will use Pinecone RAG enhancement
```

#### 2. Agent Switching
```
[Agent Switch] code-builder → mvs-builder, clearing viewer
[Agent Switch] Viewer cleared successfully
```

### Server Logs (Terminal)

In your server terminal, look for these messages:

#### 1. Router Decision
```
{"event": "router", "agentId": "mvs-builder", "reason": "rule:mvs-keywords"}
```

#### 2. RAG Enhancement
```
🧠 [RAG] MVS agent triggered, enhancing prompt with Pinecone examples...
[RAG] Searching for: MVS molecular visualization label ligand...
[RAG] Found 3 relevant examples
[RAG] Enhanced prompt with 3 examples
✅ [RAG] Successfully enhanced MVS prompt
```

#### 3. Agent Execution
```
{"event": "agent:mvs:rag", "enhanced": true, "userText": "label the ligand"}
{"event": "agent:code:req", "model": "claude-3-5-sonnet", "agentId": "mvs-builder"}
```

## Test Commands

### Test 1: MVS Agent (Should use RAG)
**Input:** `"Label the ligand as Active Site"`

**Expected Frontend Logs:**
```
🎯 [AGENT SELECTED] mvs-builder (code) - Reason: rule:mvs-keywords
🧠 [RAG AGENT] MVS agent will use Pinecone RAG enhancement
```

**Expected Server Logs:**
```
🧠 [RAG] MVS agent triggered, enhancing prompt with Pinecone examples...
✅ [RAG] Successfully enhanced MVS prompt
```

### Test 2: Simple Agent (No RAG)
**Input:** `"Show protein 1CBS"`

**Expected Frontend Logs:**
```
🎯 [AGENT SELECTED] code-builder (code) - Reason: rule:simple-keywords
⚡ [SIMPLE AGENT] Basic Molstar builder agent
```

**Expected Server Logs:**
```
(No RAG messages - goes straight to LLM)
```

### Test 3: Chat Agent
**Input:** `"What is this protein?"`

**Expected Frontend Logs:**
```
🎯 [AGENT SELECTED] bio-chat (text) - Reason: semantic:best=bio-chat
💬 [CHAT AGENT] Bioinformatics Q&A agent
```

## Troubleshooting

### No Agent Selected?
Look for:
```
{"error": "router_no_decision", "reason": "..."}
```

### RAG Not Working?
Look for:
```
❌ [RAG] Failed to enhance prompt: [error details]
```

### Agent Switching Not Working?
Look for:
```
[Agent Switch] old-agent → new-agent, clearing viewer
```

## Log Locations

- **Frontend:** Browser Developer Tools → Console
- **Server:** Terminal where you ran `python3 app.py`
- **Detailed Logs:** Look for `{"event": "..."}` JSON logs in server terminal