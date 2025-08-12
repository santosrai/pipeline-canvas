# MVS RAG System Setup Guide

## Phase 2: RAG Integration - COMPLETED ✅

This guide covers the setup of the Pinecone-based RAG system for enhanced MVS code generation.

## Required Environment Variables

Add these to your `.env` file in the server directory:

```bash
# Existing (required)
ANTHROPIC_API_KEY=your_anthropic_api_key_here

# New for RAG (required)
PINECONE_API_KEY=your_pinecone_api_key_here
OPENAI_API_KEY=your_openai_api_key_here

# Optional
PINECONE_INDEX_NAME=mvs-examples  # defaults to "mvs-examples"
```

## How It Works

### 1. User Query Analysis
- Extracts intent keywords (ligand, color, label, etc.)
- Builds semantic search query

### 2. Pinecone Retrieval
- Searches your Phase 1 knowledge base
- Finds most relevant MVS examples
- Ranks by semantic similarity

### 3. Prompt Enhancement
- Injects retrieved examples into agent prompt
- Provides proven working patterns
- Ensures correct method chaining

### 4. Code Generation
- LLM generates code using enhanced prompt
- Follows patterns from retrieved examples
- Maintains high success rate

## Testing the RAG System

### 1. Start the Server
```bash
cd server
python3 app.py
```

### 2. Test MVS Agent Routing
Send this prompt: `"Label the ligand as Active Site with red color"`

**Expected behavior:**
- Routes to `mvs-builder` agent
- Triggers RAG retrieval
- Console shows: `[RAG] Enhanced prompt with X examples`
- Generates high-quality MVS code

### 3. Monitor RAG Logs
Look for these console messages:
```
[RAG] Connected to Pinecone index: mvs-examples
[RAG] Searching for: MVS molecular visualization label ligand color red
[RAG] Found 3 relevant examples
[RAG] Enhanced prompt with 3 examples
```

## RAG System Features

### ✅ Intelligent Retrieval
- Semantic search finds relevant patterns
- Intent keyword extraction
- Relevance scoring (threshold: 0.7)

### ✅ Graceful Fallback
- Falls back to base prompt if RAG fails
- Logs errors for debugging
- No service interruption

### ✅ Context-Aware Enhancement
- Injects working code examples
- Emphasizes critical rules
- Provides feature-specific patterns

## Troubleshooting

### RAG Not Working?
1. Check environment variables are set
2. Verify Pinecone index exists and has data
3. Check console logs for error messages
4. Ensure OpenAI API key has embedding permissions

### No Examples Retrieved?
1. Check if your Phase 1 index has data
2. Verify namespace is "mvs-examples"
3. Try simpler queries first
4. Check Pinecone index stats

### Generated Code Still Has Errors?
1. RAG provides examples but doesn't guarantee perfection
2. Check if retrieved examples are relevant
3. Consider adding more examples to Phase 1 index
4. Review and improve example quality

## Next Steps (Phase 3)

- **Feedback Loop**: Track successful/failed generations
- **Self-Improvement**: Add successful patterns to knowledge base
- **Analytics**: Monitor RAG effectiveness
- **Optimization**: Improve retrieval relevance

## Files Modified

- `server/mvs_rag.py` - RAG retrieval system
- `server/runner.py` - RAG integration in agent execution
- `server/agents.py` - Enhanced MVS agent prompt structure
- `server/requirements.txt` - Added pinecone-client dependency

## Status: Ready for Testing! 🚀