# NovoProtein AI - Architecture Framework

## Overview

NovoProtein AI is a web-based molecular visualization and protein design platform that combines:
- **Natural Language Interface**: Users interact via chat to control protein visualization and design
- **3D Molecular Visualization**: Powered by Molstar for interactive protein structure viewing
- **AI-Powered Code Generation**: Claude/Anthropic models generate visualization code from natural language
- **Protein Design Workflows**: AlphaFold2 (structure prediction), RFdiffusion (de novo design), and ProteinMPNN (sequence design) via NVIDIA NIMS API

## High-Level Architecture

```markdown:/Users/alizabista/Downloads/Dev-Folder/novoprotien-ai/ARCHITECTURE.md
<code_block_to_apply_changes_from>
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (React/TypeScript)               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │  ChatPanel   │  │ MolstarViewer│  │  CodeEditor   │     │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘     │
│         │                 │                  │              │
│  ┌──────┴─────────────────┴─────────────────┴──────┐      │
│  │         Zustand State Stores (appStore, etc)      │      │
│  └──────────────────────┬───────────────────────────┘      │
└─────────────────────────┼───────────────────────────────────┘
                          │ HTTP/REST API
                          │
┌─────────────────────────┴───────────────────────────────────┐
│              Backend (FastAPI/Python)                        │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  FastAPI App (app.py) - HTTP Endpoints              │   │
│  └──────────────┬──────────────────────────────────────┘   │
│                 │                                            │
│  ┌──────────────┼──────────────┐                           │
│  │              │              │                           │
│  │  ┌───────────▼──────────┐  │  ┌───────────▼──────────┐│
│  │  │  Router Graph        │  │  │  Agent Runner        ││
│  │  │  (router_graph.py)   │  │  │  (runner.py)         ││
│  │  └───────────┬──────────┘  │  └───────────┬──────────┘│
│  │              │              │              │           │
│  └──────────────┼──────────────┴──────────────┼───────────┘
│                 │                             │
│  ┌──────────────▼──────────────┐  ┌──────────▼──────────┐
│  │  Specialized Handlers        │  │  External Services  │
│  │  - alphafold_handler.py      │  │  - Claude API       │
│  │  - rfdiffusion_handler.py    │  │  - NVIDIA NIMS      │
│  │  - proteinmpnn_handler.py    │  │  - UniProt          │
│  └──────────────────────────────┘  └─────────────────────┘
└──────────────────────────────────────────────────────────────┘
```

---

## Frontend Architecture

### Technology Stack
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite
- **State Management**: Zustand (with persistence middleware)
- **Styling**: Tailwind CSS
- **Code Editor**: Monaco Editor
- **3D Visualization**: Molstar (Mol*)

### Entry Points
- **`src/main.tsx`**: React application entry point
- **`src/App.tsx`**: Main application component and layout

### Core Components

#### 1. **ChatPanel** (`src/components/ChatPanel.tsx`)
- **Purpose**: Main chat interface for user interaction
- **Key Features**:
  - Sends user messages to backend `/api/agents/route` or `/api/agents/route-stream` (for streaming)
  - Receives agent responses (code, text, or structured data)
  - Supports streaming responses with thinking process display
  - Handles AlphaFold, RFdiffusion, and ProteinMPNN workflows
  - Manages chat history via `chatHistoryStore`
  - Displays progress tracking for long-running jobs
  - Error handling and display
  - Agent and model selection via `AgentSelector` and `ModelSelector`

#### 2. **MolstarViewer** (`src/components/MolstarViewer.tsx`)
- **Purpose**: 3D molecular structure visualization
- **Key Features**:
  - Initializes Molstar plugin on mount
  - Executes generated code via `CodeExecutor`
  - Handles double-click residue selection
  - Updates app store with selection context
  - Supports MVS (MolViewSpec) for complex visualizations

#### 3. **CodeEditor** (`src/components/CodeEditor.tsx`)
- **Purpose**: Monaco-based code editor for viewing/editing generated code
- **Features**: Syntax highlighting, auto-completion, execution buttons

#### 4. **Specialized Dialogs**
- **AlphaFoldDialog**: Confirmation and parameter input for folding jobs
- **RFdiffusionDialog**: Design request confirmation and parameters
- **ProteinMPNNDialog**: Sequence design configuration
- **ProgressTracker**: Job status polling and display
- **SettingsDialog**: Application settings and configuration

#### 5. **Pipeline Canvas Library** (`src/components/pipeline-canvas/`)
A standalone, reusable library for visual DAG workflow design:

**Components:**
- **PipelineCanvas**: Main React Flow canvas with custom nodes
- **PipelineNodeConfig**: Node configuration panel
- **PipelineNodePalette**: Drag-and-drop node palette
- **PipelineExecution**: Workflow execution orchestrator
- **PipelineManager**: Saved pipeline management
- **CustomHandle**: n8n-style node connection handles

**Node Types (JSON-configured in `nodes/*/node.json`):**
- **input_node**: PDB file input
- **rfdiffusion_node**: De novo backbone design
- **proteinmpnn_node**: Sequence design
- **alphafold_node**: Structure prediction

**Store:**
- **pipelineStore**: Zustand store for pipeline state, ghost blueprints, and execution

**Utilities:**
- **topologicalSort**: Graph traversal for execution order
- **nodeLoader**: Dynamic JSON configuration loader

#### 5. **UI Control Components**
- **AgentSelector**: Dropdown for manually selecting which agent to use
- **ModelSelector**: Dropdown for selecting AI model (Claude variants, etc.)
- **ThinkingProcessDisplay**: Visualizes thinking steps for thinking models (streaming)
- **JobLoadingPill**: Compact loading indicator for background jobs
- **ErrorDisplay**: Rich error presentation with expandable details
- **ErrorDashboard**: Comprehensive error monitoring dashboard (Ctrl+Shift+E)

### State Management (Zustand Stores)

#### **appStore** (`src/stores/appStore.ts`)
- **State**:
  - `activePane`: 'viewer' | 'editor'
  - `plugin`: Molstar PluginUIContext instance
  - `currentCode`: Generated/edited code string
  - `isExecuting`: Code execution status
  - `lastLoadedPdb`: Last loaded PDB ID
  - `selections`: Array of selected residues
  - `chatPanelWidth`: Resizable panel width
- **Persistence**: Active pane, code, PDB ID, panel width saved to localStorage

#### **chatHistoryStore** (`src/stores/chatHistoryStore.ts`)
- **State**:
  - `sessions`: Array of chat sessions
  - `activeSessionId`: Currently active session
  - `isHistoryPanelOpen`: UI state
- **Features**: Session management, search, export/import, cleanup

#### **settingsStore** (`src/stores/settingsStore.ts`)
- **State**:
  - Code editor settings (enabled, auto-execution)
  - UI preferences (theme, message limits)
  - API key configuration
  - Performance settings (debug mode)

#### **pipelineStore** (`src/components/pipeline-canvas/store/pipelineStore.ts`)
- **State**:
  - `currentPipeline`: Active pipeline with nodes and edges
  - `savedPipelines`: Array of saved pipeline configurations
  - `ghostBlueprint`: Agent-generated blueprint awaiting approval
  - `isExecuting`: Pipeline execution status
  - `executionOrder`: Topologically sorted node execution order
- **Actions**: Add/update/delete nodes and edges, approve/reject blueprints, save/load pipelines
- **Persistence**: Saved pipelines persisted to localStorage

### Utilities

#### **api.ts** (`src/utils/api.ts`)
- Axios instance configured with base URL (`http://localhost:8787/api`)
- Request interceptor injects API key from settings store
- Centralized API communication

#### **codeExecutor.ts** (`src/utils/codeExecutor.ts`)
- **Purpose**: Safe execution of generated JavaScript code
- **Features**:
  - Sandboxed execution environment
  - Provides `builder` API for Molstar operations
  - Supports both Molstar builder and MVS (MolViewSpec) APIs
  - Error handling and reporting

#### **molstarBuilder.ts** (`src/utils/molstarBuilder.ts`)
- Wrapper around Molstar plugin providing simplified builder API
- Methods: `loadStructure()`, `addCartoonRepresentation()`, `highlightResidue()`, etc.

#### **errorHandler.ts** (`src/utils/errorHandler.ts`)
- Standardized error handling for AlphaFold, RFdiffusion, and ProteinMPNN
- Error categorization, severity levels, user-friendly messages

#### **errorLogger.ts** (`src/utils/errorLogger.ts`)
- Advanced error logging and metrics collection
- Error analytics and monitoring
- Export functionality for error logs
- Real-time error rate tracking

#### **alphafoldUtils.ts** (`src/utils/alphafoldUtils.ts`)
- Sequence validation utilities
- AlphaFold result processing helpers

#### **pdbUtils.ts** (`src/utils/pdbUtils.ts`)
- PDB file parsing and manipulation utilities

### Data Flow: User Interaction → Visualization

1. **User types message** in ChatPanel
2. **ChatPanel** calls `api.post('/api/agents/route')` or `streamAgentRoute('/api/agents/route-stream')` with:
   - `input`: user message
   - `currentCode`: existing code (if any)
   - `history`: chat history
   - `selection`: selected residue (singular)
   - `selections`: array of selected residues (plural)
   - `agentId`: optional manual agent override
   - `model`: optional model override
3. **Backend routes** to appropriate agent via router graph (or uses manual override)
4. **Agent returns** response:
   - **Streaming mode**: Yields incremental updates with thinking process steps
   - **Standard mode**: Returns complete response
   - `type: "code"` → code string executed in viewer
   - `type: "text"` → displayed as chat message
   - JSON with `action` field → triggers specialized dialog
   - `thinkingProcess` → displayed in ThinkingProcessDisplay component
5. **CodeExecutor** executes code in Molstar viewer
6. **Viewer updates** with new visualization

---

## Backend Architecture

### Technology Stack
- **Framework**: FastAPI (Python)
- **Server**: Uvicorn (ASGI server)
- **AI Models**: Anthropic Claude (via SDK or OpenRouter), configurable via `models_config.json`
- **Embeddings**: OpenAI embeddings (for semantic routing)
- **External APIs**: NVIDIA NIMS (AlphaFold, RFdiffusion, ProteinMPNN)
- **Model Configuration**: JSON-based model registry with provider, name, and capabilities

### Entry Point
**`server/app.py`**: FastAPI application with all HTTP endpoints

### Core Modules

#### 1. **Agent System** (`server/agents.py`)
- **Purpose**: Defines available agents and their system prompts
- **Agents**:
  - `code-builder`: Generates simple Molstar builder code
  - `mvs-builder`: Generates MolViewSpec code (complex visualizations)
  - `bio-chat`: Answers protein/structure questions
  - `alphafold-agent`: Handles structure prediction requests
  - `rfdiffusion-agent`: Handles protein design requests
  - `proteinmpnn-agent`: Handles sequence design requests
  - `uniprot-search`: Searches UniProt database

#### 2. **Router Graph** (`server/router_graph.py`)
- **Purpose**: Routes user input to appropriate agent
- **Strategy**:
  1. **Rule-based shortcuts**: Explicit keywords (e.g., "fold" → alphafold-agent)
  2. **Semantic routing**: Embedding similarity (if OpenAI API key available)
  3. **Fallback heuristics**: Keyword matching if embeddings unavailable
- **Returns**: `routedAgentId` and routing reason

#### 3. **Agent Runner** (`server/runner.py`)
- **Purpose**: Executes agent logic
- **Flow**:
  1. Gets agent definition from `agents.py`
  2. Special handling for deterministic agents (alphafold, uniprot)
  3. For code agents: Calls Claude with system prompt + context
  4. For text agents: Includes selection context and code context
  5. Supports streaming mode via `run_agent_stream()` for thinking models
  6. Returns structured response: `{type: "code"|"text", code/text: ..., thinkingProcess?: ...}`
- **Streaming Support**: Yields incremental updates for thinking models with step-by-step reasoning

#### 4. **Specialized Handlers**

##### **alphafold_handler.py**
- **Purpose**: Processes AlphaFold2 structure prediction requests
- **Flow**:
  1. Extracts sequence from user input (PDB ID, uploaded file, or direct sequence)
  2. Validates parameters
  3. Submits job to NVIDIA NIMS via `nims_client.py`
  4. Polls status until completion
  5. Returns PDB content for visualization
- **Status Management**: Tracks active jobs in `active_jobs` dict

##### **rfdiffusion_handler.py**
- **Purpose**: Handles RFdiffusion protein design requests
- **Flow**:
  1. Parses design mode (unconditional, motif scaffolding, partial diffusion)
  2. Extracts parameters (contigs, hotspots, diffusion steps)
  3. Submits to NVIDIA NIMS via `rfdiffusion_client.py`
  4. Polls for completion
  5. Returns designed PDB structure
- **Output**: PDB files stored in `server/rfdiffusion_results/`

##### **proteinmpnn_handler.py**
- **Purpose**: Handles ProteinMPNN inverse folding (sequence design)
- **Flow**:
  1. Validates PDB source (RFdiffusion job, upload, or inline)
  2. Resolves PDB file path
  3. Submits to NVIDIA NIMS via `proteinmpnn_client.py`
  4. Polls for completion
  5. Processes results (sequences, FASTA, metadata)
- **Output**: JSON, FASTA, and raw data in `server/proteinmpnn_results/{job_id}/`

##### **NIMS Clients**
- **`nims_client.py`**: Base client for NVIDIA NIMS API (AlphaFold)
- **`rfdiffusion_client.py`**: RFdiffusion-specific NIMS client
- **`proteinmpnn_client.py`**: ProteinMPNN-specific NIMS client
- **Configuration**: All use `NVCF_RUN_KEY` from environment

### API Endpoints

#### Agent Endpoints
- `POST /api/agents/route`: Routes user input and executes agent (standard response)
- `POST /api/agents/route-stream`: Routes user input and streams agent response (for thinking models)
- `POST /api/agents/invoke`: Directly invoke specific agent
- `GET /api/agents`: List available agents
- `GET /api/models`: Get available AI models from configuration

#### AlphaFold Endpoints
- `POST /api/alphafold/fold`: Submit folding job (returns 202 Accepted)
- `GET /api/alphafold/status/{job_id}`: Poll job status
- `POST /api/alphafold/cancel/{job_id}`: Cancel job

#### RFdiffusion Endpoints
- `POST /api/rfdiffusion/design`: Submit design job
- `GET /api/rfdiffusion/status/{job_id}`: Poll job status
- `POST /api/rfdiffusion/cancel/{job_id}`: Cancel job

#### ProteinMPNN Endpoints
- `POST /api/proteinmpnn/design`: Submit sequence design job
- `GET /api/proteinmpnn/status/{job_id}`: Poll job status
- `GET /api/proteinmpnn/result/{job_id}?fmt=json|fasta|raw`: Get results
- `GET /api/proteinmpnn/sources`: List available PDB sources

#### File Upload
- `POST /api/upload/pdb`: Upload PDB file
- `GET /api/upload/pdb/{file_id}`: Download uploaded file

#### Utility
- `GET /api/health`: Health check
- `POST /api/logs/error`: Frontend error logging
- `POST /api/chat/generate-title`: Generate AI-powered title for chat session based on messages
- `POST /api/generate`: Backward compatibility endpoint for code generation
- `POST /api/chat`: Backward compatibility endpoint for chat

### Data Flow: Request → Response

1. **User sends message** → Frontend `POST /api/agents/route` or `/api/agents/route-stream`
2. **Router Graph** analyzes input → selects agent (or uses manual override)
3. **Runner** executes agent:
   - **Streaming mode**: Yields incremental updates with thinking steps
   - **Standard mode**: Returns complete response
   - For code agents: Calls Claude → generates code
   - For specialized agents: Handler processes request
4. **Response** returned to frontend:
   - **Streaming**: Incremental updates with `thinkingProcess` steps
   - Code → executed in viewer
   - Text → displayed in chat
   - Structured JSON → triggers dialog
5. **Long-running jobs** (AlphaFold, etc.) return 202 Accepted
6. **Frontend polls** `/api/{service}/status/{job_id}` until complete
7. **Results** fetched and displayed

### File Storage

- **`server/uploads/pdb/`**: User-uploaded PDB files
- **`server/rfdiffusion_results/`**: RFdiffusion output PDBs
- **`server/proteinmpnn_results/{job_id}/`**: ProteinMPNN outputs (JSON, FASTA, raw)
- **`server/pdb_index.json`**: Index of uploaded files

### Utilities

#### **utils.py**
- `log_line()`: Structured logging
- `spell_fix()`: Input text correction
- `get_text_from_completion()`: Extract text from Claude response
- `strip_code_fences()`: Remove markdown code blocks

#### **safety.py**
- Code whitelist validation
- Ensures `clearStructure()` called when changing PDB

#### **sequence_utils.py**
- `SequenceExtractor`: Extracts sequences from PDB IDs, files, or text

#### **pdb_storage.py**
- Manages uploaded PDB file storage and retrieval
- Metadata tracking (chains, atoms, file size)

#### **mvs_rag.py**
- RAG (Retrieval-Augmented Generation) for MVS agent
- Enhances system prompt with Pinecone examples

#### **models_config.json**
- JSON configuration file for available AI models
- Defines model providers, names, capabilities, and default selections
- Used by `/api/models` endpoint to serve model list to frontend

---

## Key Design Patterns

### 1. **Agent-Based Architecture**
- Each capability is an "agent" with:
  - System prompt (instructions for LLM)
  - Model configuration
  - Kind (code, text, or specialized)
- Routing layer selects appropriate agent

### 2. **Asynchronous Job Processing**
- Long-running jobs (AlphaFold, RFdiffusion, ProteinMPNN) return 202 Accepted
- Frontend polls status endpoints
- Results stored in filesystem for retrieval

### 3. **State Management**
- Frontend: Zustand with localStorage persistence
- Backend: In-memory job tracking (`active_jobs` dicts)
- File-based results storage

### 4. **Code Generation → Execution Pipeline**
- User request → Router → Agent → Code generation → Sandbox execution → Visualization

### 5. **Context-Aware Responses**
- Agents receive:
  - Current code context
  - Chat history
  - Selected residues (singular `selection` or plural `selections`)
  - PDB ID from loaded structure

### 6. **Streaming & Thinking Process**
- Support for streaming responses via `/api/agents/route-stream`
- Thinking models yield incremental reasoning steps
- Frontend displays thinking process in real-time via `ThinkingProcessDisplay`
- Enables transparency in AI decision-making

### 7. **Model Configuration System**
- Centralized model registry in `models_config.json`
- Frontend can query available models via `/api/models`
- Supports model override per request
- Enables switching between different Claude variants and providers

---

## Environment Configuration

### Frontend (`VITE_API_BASE`)
- Default: `http://localhost:8787/api`
- Can be overridden via environment variable

### Backend (`.env` or `server/.env`)
- `ANTHROPIC_API_KEY`: Claude API key (or OpenRouter key)
- `OPENROUTER_API_KEY`: Alternative to Anthropic
- `OPENAI_API_KEY`: For semantic routing embeddings
- `NVCF_RUN_KEY`: NVIDIA NIMS API key (shared by AlphaFold, RFdiffusion, ProteinMPNN)
- `CLAUDE_CODE_MODEL`: Model for code generation agents (default: "claude-3-5-sonnet-20241022")
- `CLAUDE_CHAT_MODEL`: Model for chat/text agents (default: "claude-3-5-sonnet-20241022")
- `PROTEINMPNN_URL`: Override ProteinMPNN endpoint
- `PROTEINMPNN_POLL_INTERVAL`: Polling interval (default: 10s)
- `PROTEINMPNN_MAX_WAIT_SECONDS`: Timeout (default: 1800s)
- `APP_ORIGIN`: CORS allowed origins (default: "*")
- `DEBUG_API`: Enable detailed error messages (0|1)

---

## Development Workflow

### Frontend Development
```bash
npm install              # Install dependencies
npm run dev              # Start Vite dev server (port 5173)
npm run lint             # Lint TypeScript
```

### Backend Development
```bash
python -m venv .venv
source .venv/bin/activate
pip install -r server/requirements.txt
npm run start:server     # Start FastAPI server (port 8787)
```

### Full Stack
```bash
npm run dev:all          # Runs both frontend and backend
```

---

## Extension Points

### Adding a New Pipeline Node
1. Create node JSON config in `src/components/pipeline-canvas/nodes/{node_type}/node.json`
   - Include `metadata`, `schema`, `handles`, `execution`, and `defaultConfig`
2. Add node type to `NodeType` union in `src/components/pipeline-canvas/types/index.ts`
3. Add node to palette in `src/components/pipeline-canvas/components/PipelineNodePalette.tsx`
4. Add node component in `src/components/pipeline-canvas/components/PipelineCanvas.tsx`
5. Implement execution logic in `src/components/pipeline-canvas/utils/executionEngine.ts`
6. **⚠️ IMPORTANT:** See [Node Development Guide](./docs/node-development-guide.md) for critical best practices and common pitfalls

### Adding a New Agent
1. Define agent in `server/agents.py` with:
   - System prompt
   - Model configuration
   - Kind (code/text/specialized)
2. Add routing rules in `server/router_graph.py`
3. If specialized: Create handler in `server/{agent}_handler.py`
4. Add API endpoints in `server/app.py` if needed

### Adding a New Visualization API
1. Extend `molstarBuilder.ts` with new builder methods
2. Update agent system prompts with new API
3. Update `CodeExecutor` if needed

### Adding a New Protein Design Service
1. Create client in `server/{service}_client.py`
2. Create handler in `server/{service}_handler.py`
3. Add endpoints in `server/app.py`
4. Create frontend dialog component
5. Integrate into ChatPanel workflow

---

## Security Considerations

- **Code Execution**: Sandboxed in browser (no server-side execution)
- **API Keys**: Stored in localStorage (frontend) or environment (backend)
- **File Uploads**: Validated and sanitized before storage
- **Rate Limiting**: SlowAPI middleware on endpoints
- **CORS**: Configurable via `APP_ORIGIN`

---

## Performance Optimizations

- **Code Caching**: Builder instance cached per plugin
- **State Persistence**: Selective localStorage (excludes transient state)
- **Async Operations**: All long-running jobs are asynchronous
- **Polling Intervals**: Configurable per service (default: 10s)

---

## Testing Strategy

- **Backend**: pytest for Python modules
- **Frontend**: Component tests (if added)
- **Integration**: Manual testing of agent workflows
- **Error Handling**: Comprehensive error logging and user-friendly messages

---

This framework provides a comprehensive understanding of the codebase architecture for LLM-assisted development and debugging.
```

Save this as `ARCHITECTURE.md` in your project root. It covers:

1. **High-level architecture diagram**
2. **Frontend structure** (components, stores, utilities)
3. **Backend structure** (agents, handlers, API endpoints)
4. **Data flow** for both user interactions and API requests
5. **Design patterns** used throughout
6. **Configuration** and environment variables
7. **Extension points** for adding new features

This should help LLMs understand the codebase structure and relationships.

