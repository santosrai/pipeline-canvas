# NovoProtein AI - Project Memory

## Project Overview
A molecular visualization application integrating MolStar viewer with AI-powered protein analysis. Features chat-based interaction, code execution, and 3D protein structure visualization.

## Recent Development Progress (Current Branch: feature/molstar-spec-integration)

### Latest Changes (Last 2 Commits)
**Commit c57d0e7**: feat: implement proper residue/chain selector syntax for MolStar integration
**Commit 673c8b5**: Enhance ChatPanel to render JSON and table formats for messages; improve CodeExecutor to reuse MolstarBuilder instance for better performance; update clearStructure method in molstarBuilder to ensure all existing structures are removed before loading new ones.

### Key Files Modified Recently:
- `src/components/ChatPanel.tsx` - Enhanced message rendering for JSON/table formats
- `src/components/MolstarViewer.tsx` - MolStar integration improvements
- `src/utils/codeExecutor.ts` - Performance optimizations with MolstarBuilder reuse
- `src/utils/molstarBuilder.ts` - Improved structure clearing and residue/chain selection
- `src/utils/api.ts` - API utilities
- `src/utils/examples.ts` - Example data/code
- `server/` files - Backend agent system with RAG capabilities
  - `app.py` - FastAPI server with all endpoints
  - `agents.py` - AI agent implementations including AlphaFold agent
  - `mvs_rag.py` - Retrieval-augmented generation for molecular data
  - `router_graph.py` - Request routing logic
  - `runner.py` - Main execution runner
  - `alphafold_handler.py` - AlphaFold request processing
  - `nims_client.py` - NVIDIA NIMS API client
  - `sequence_utils.py` - Sequence extraction utilities

### Current Architecture:
- **Frontend**: React + TypeScript + Vite + TailwindCSS
- **Backend**: Python FastAPI server with AI agents (unified architecture)
- **Molecular Viewer**: MolStar integration
- **AI Features**: Chat interface with code execution capabilities
- **Data**: PDB structure handling, UniProt integration
- **AlphaFold2**: NVIDIA NIMS API integration for protein structure prediction

### Key Features Implemented:
1. **MolStar Integration**: 3D protein structure visualization
2. **Chat Interface**: AI-powered conversation with structured message rendering
3. **Code Execution**: Dynamic code execution with molecular data
4. **Residue/Chain Selection**: Proper syntax for MolStar structure manipulation
5. **Performance Optimizations**: Efficient MolstarBuilder instance reuse
6. **RAG System**: Retrieval-augmented generation for protein data queries
7. **AlphaFold2 Integration**: AI-powered protein structure prediction via NVIDIA NIMS API

### Working Tree Status:
- Clean working directory (no uncommitted changes)
- All recent work committed and pushed to feature branch
- Ready for continued development or merge to main

### Development Environment:
- Node.js project with package.json configuration (frontend only)
- Python FastAPI backend (server/app.py) with requirements.txt
- **IMPORTANT**: Always use Python virtual environment for server operations: `cd server && source venv/bin/activate` before running Python commands
- Unified development: `npm run dev:all` starts both Python server and Vite dev server
- Git repository with feature branch workflow
- NVIDIA NIMS API integration for AlphaFold2 predictions

### AlphaFold2 Configuration:
- **REQUIRED**: Set `NVCF_RUN_KEY` environment variable with NVIDIA API key
- **Setup**: `export NVCF_RUN_KEY="your-nvidia-api-key"`
- **Error**: If missing, users get "AlphaFold service not available" message
- **Get API Key**: Visit https://build.nvidia.com/explore/discover

### Architecture Changes (Latest):
- **REMOVED**: Redundant Node.js server (`server.mjs`) 
- **UNIFIED**: Single Python FastAPI backend handles all API endpoints
- **UPDATED**: package.json scripts now reference Python server only
- **ENHANCED**: FastAPI includes all AlphaFold endpoints for frontend compatibility

### AlphaFold2 Integration Details:
**Branch**: `feature/alphafold2-integration`

**New Components Added**:
- `AlphaFoldDialog.tsx`: User interface for folding parameter configuration
- `ProgressTracker.tsx`: Real-time progress tracking for folding jobs
- `alphafoldUtils.ts`: Utility functions for sequence validation and result handling
- `nims_client.py`: Python client for NVIDIA NIMS API integration
- `sequence_utils.py`: Sequence extraction from PDB IDs, files, and text input
- `alphafold_handler.py`: Server-side request processing and job management

**Agent System**:
- New `alphafold-agent` added to routing system
- Detects fold/dock keywords: "fold", "dock", "predict structure", "alphafold"
- Smart sequence extraction from PDB IDs, chains, residue ranges
- Parameter configuration for MSA algorithms, databases, iterations

**API Endpoints**:
- `POST /api/alphafold/fold`: Submit folding requests
- `GET /api/alphafold/status/:jobId`: Check job progress
- `POST /api/alphafold/cancel/:jobId`: Cancel running jobs

**Features**:
- **Smart Input Processing**: Handles "fold PDB:1ABC", "fold chain A", "fold residues 50-100"
- **Parameter Customization**: MSA algorithms (mmseqs2/jackhmmer), databases, iterations
- **Progress Tracking**: Real-time updates with cancellation support
- **Result Integration**: Direct PDB download and MolStar viewer loading
- **Validation**: Sequence format checking and length constraints

**Usage Examples**:
- `fold PDB:1HHO` → Extract and fold entire structure
- `fold chain A from PDB:1ABC` → Fold specific chain
- `fold residues 100-200 from chain A` → Fold subsequence
- `fold MVLSEGEWQL...` → Fold user-provided sequence

### RFdiffusion Integration Details:
**Branch**: `feature/rf-diffusion`

**New Components Added**:
- `RFdiffusionDialog.tsx`: User interface for protein design parameter configuration
- `rfdiffusion_client.py`: NVIDIA NIMS API client for RFdiffusion protein design
- `rfdiffusion_handler.py`: Server-side request processing and job management
- `RFdiffusionErrorHandler`: Comprehensive error handling for design workflows

**Agent System**:
- New `rfdiffusion-agent` added to routing system
- Detects design keywords: "design", "create", "generate", "scaffold", "rfdiffusion"
- Smart parameter parsing from natural language requests
- Design modes: unconditional, motif scaffolding, partial diffusion

**API Endpoints**:
- `POST /api/rfdiffusion/design`: Submit design requests
- `GET /api/rfdiffusion/status/:jobId`: Check job progress
- `POST /api/rfdiffusion/cancel/:jobId`: Cancel running jobs

**Features**:
- **Smart Input Processing**: Handles "design protein", "create 100-150 residue protein", "scaffold around hotspots"
- **Design Modes**: Unconditional design, motif scaffolding, partial diffusion
- **Parameter Customization**: Contigs specification, hotspot residues, diffusion steps
- **Template Support**: Use existing PDB structures as templates
- **Result Integration**: Direct PDB download and MolStar viewer loading

**Usage Examples**:
- `design a protein` → Unconditional design with default parameters
- `design protein using PDB:1R42` → Motif scaffolding with template
- `create 100-150 residue protein` → Length-specific design
- `scaffold around hotspots A50,A51,A52` → Hotspot preservation design

### Pipeline Canvas Library (Visual Workflow):
**Branch**: `main`

**Library Location**: `src/components/pipeline-canvas/`

A standalone, reusable library for visual DAG workflow design, extracted for independent development.

**Library Structure**:
```
src/components/pipeline-canvas/
├── package.json              # npm package configuration
├── tsconfig.json             # TypeScript config
├── index.ts                  # Main exports
├── components/               # UI components
│   ├── PipelineCanvas.tsx    # Main React Flow canvas
│   ├── PipelineNodeConfig.tsx
│   ├── PipelineNodePalette.tsx
│   ├── PipelineExecution.tsx
│   ├── PipelineManager.tsx
│   └── CustomHandle.tsx      # n8n-style handles
├── nodes/                    # JSON node configurations
│   ├── input_node/node.json
│   ├── rfdiffusion_node/node.json
│   ├── proteinmpnn_node/node.json
│   └── alphafold_node/node.json
├── types/index.ts            # TypeScript types
├── store/pipelineStore.ts    # Zustand store
└── utils/
    ├── topologicalSort.ts    # Graph execution order
    └── nodeLoader.ts         # JSON config loader
```

**Key Features**:
- **React Flow Integration**: Visual node-based workflow design
- **n8n-style Handles**: Input/output connection points with plus icons
- **JSON Configuration**: Node types defined in JSON files for easy extension
- **Ghost Blueprints**: Agent-generated pipelines shown as drafts before approval
- **Topological Execution**: Automatic dependency-based execution order
- **Pipeline Persistence**: Save/load workflows to localStorage

**Node Types**:
- `input_node`: PDB file input
- `rfdiffusion_node`: De novo backbone design
- `proteinmpnn_node`: Sequence design
- `alphafold_node`: Structure prediction

**Usage**:
```typescript
import { PipelineCanvas, usePipelineStore } from './components/pipeline-canvas';
```

### Enhanced Error Handling System:
**New Components Added**:
- `ErrorDisplay.tsx`: Rich error presentation with expandable details
- `ErrorDashboard.tsx`: Comprehensive error monitoring and analytics dashboard
- `errorHandler.ts`: Structured error classification and user-friendly messaging (AlphaFold & RFdiffusion)
- `errorLogger.ts`: Advanced error logging, metrics, and monitoring

**Error Architecture Features**:
- **Layered Error System**: Detection → Processing → Display → Logging
- **Error Categories**: Validation, Network, API, Processing, System, Auth, Timeout, Quota
- **Severity Levels**: Low, Medium, High, Critical with appropriate UI treatment
- **Progressive Disclosure**: Simple summary with expandable technical details
- **Actionable Suggestions**: Context-aware recovery options and next steps
- **Comprehensive Logging**: Structured error tracking with metrics and analytics

**User Experience Enhancements**:
- **Friendly Error Messages**: Clear, non-technical explanations for users
- **Smart Recovery Options**: Contextual suggestions like "Try different parameters"
- **Expandable Details**: Technical information available on demand
- **Error Dashboard**: Developer tool accessible via Ctrl+Shift+E
- **Progress Integration**: Errors seamlessly integrated with progress tracking
- **Retry Functionality**: One-click retry for appropriate error types

**Developer Features**:
- **Error Analytics**: Track error patterns, frequency, and user impact
- **Export Functionality**: CSV export of error logs for analysis
- **Real-time Monitoring**: Error rate tracking and alerting
- **Context Preservation**: Full error context including sequence, parameters, stack traces
- **Error Insights**: Most common errors, trends, and user impact metrics