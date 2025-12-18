# Technical PRD: Pipeline Agent & Visual Canvas Integration

**Project:** NovoProtein AI  
**Version:** 1.0  
**Status:** Draft  
**Target:** Hybrid Chat + Visual DAG Workflow

## 1\. Executive Summary

The goal is to transition NovoProtein AI from a purely linear chat interface to a **Hybrid Chat-DAG (Directed Acyclic Graph) System**. A new backend "Pipeline Agent" will act as an *architect*, analyzing user requests to generate visual workflow blueprints (Graph JSON) without executing them. The frontend will render these as interactive "Ghost Nodes" on a canvas, allowing users to review, configure, and execute scientific pipelines (RFdiffusion → ProteinMPNN → AlphaFold) with "Human-in-the-Loop" safety.

## 2\. Problem Statement

  * **Context Loss:** Complex bio-engineering requires multiple dependent steps (Backbone → Sequence → Folding). Chat history buries these relationships.
  * **Opaque Execution:** Users cannot easily see parameters or status of intermediate steps in a long chat thread.
  * **Reproducibility:** Chat logs are hard to rerun. A visual graph provides a saved state that can be re-executed or branched.

## 3\. User Stories

| ID | As a... | I want to... | So that... |
| :--- | :--- | :--- | :--- |
| **US-1** | Protein Engineer | Ask "Design a binder for `target.pdb`" | The system automatically sets up the correct 3-stage pipeline (RF-\>MPNN-\>AF) on the canvas. |
| **US-2** | User | See the proposed pipeline *before* it runs | I can tweak parameters (e.g., change contig length) to avoid wasting GPU credits. |
| **US-3** | Researcher | Have the system prompt me for missing files | I don't get obscure error messages later in the process. |
| **US-4** | User | Click "Run All" on the canvas | The system executes the nodes in dependency order, updating status visuals in real-time. |

-----

## 4\. Technical Architecture

### 4.1 System Diagram

```mermaid
graph TD
    User[User Input] --> ChatUI[Chat Interface]
    ChatUI --> Router[Backend Router]
    
    subgraph "Backend (FastAPI)"
        Router -- "Intent: Pipeline" --> PipelineAgent[Pipeline Architect Agent]
        PipelineAgent -->|Returns JSON Blueprint| ChatUI
    end
    
    subgraph "Frontend (React)"
        ChatUI -->|Dispatch| PipelineStore[Zustand Pipeline Store]
        PipelineStore -->|Render| Canvas[React Flow Canvas]
        Canvas -- "User Clicks Run" --> Orchestrator[Frontend Orchestrator]
    end
    
    Orchestrator -->|API Calls| Workers[Job Handlers (NVIDIA NIMS)]
```

### 4.2 Data Models

#### Backend Schema (`server/schemas.py`)

This defines the contract between the Agent and the Frontend.

```python
from pydantic import BaseModel
from typing import List, Dict, Any, Literal, Optional

class PipelineNodeBlueprint(BaseModel):
    id: str
    type: Literal["input_node", "rfdiffusion_node", "proteinmpnn_node", "alphafold_node"]
    label: str
    config: Dict[str, Any]  # Initial params (e.g., {"contigs": "50"})
    inputs: Dict[str, str]  # Data contracts (e.g., {"pdb": "previous_node_id"})

class PipelineBlueprint(BaseModel):
    rationale: str          # Message to user: "I've drafted a binder design..."
    nodes: List[PipelineNodeBlueprint]
    edges: List[Dict[str, str]] # [{"source": "A", "target": "B"}]
    missing_resources: List[str] # ["target_pdb"] - if input is missing
```

#### Database Schema (`server/database.py`)

Persisting the graph state (SQLite/SQLModel).

```python
class WorkflowNode(SQLModel, table=True):
    id: str = Field(primary_key=True)
    workflow_id: str
    type: str
    status: str = "idle" # idle, running, success, error
    config_json: str
    result_metadata_json: str
    parent_node_ids: str # JSON list
```

-----

## 5\. Functional Requirements

### 5.1 The Pipeline Agent (`server/agents/pipeline_architect.py`)

  * **Role:** Strictly a planner. **NEVER** executes code or calls the GPU APIs.
  * **Trigger:** Activated when Router detects intents like "create pipeline", "design workflow", "fold this", or "binder for...".
  * **Logic:**
    1.  **Context Check:** Look at recent chat history for uploaded PDB files.
    2.  **Validation:** If user asks for "binder design" but no PDB is present, return `missing_resources: ["target_pdb"]` and a text prompt.
    3.  **Drafting:** If valid, construct the JSON Blueprint connecting the standard toolchain.
  * **Safety:** Must adhere to data types (e.g., ProteinMPNN *must* follow RFdiffusion or an uploaded backbone).

### 5.2 Frontend Canvas (`src/components/PipelineCanvas.tsx`)

  * **Library:** React Flow (Pro or standard).
  * **Ghost State:** When a blueprint arrives, nodes render with `opacity-50` and a dashed border.
  * **User Action:**
      * **"Approve":** Turns nodes solid, saves them to `pipelineStore`.
      * **"Reject":** Clears the ghost nodes.
  * **Orchestration Logic:**
      * The frontend iterates through the topological sort of the graph.
      * Step 1: Check Input Node (File exists?).
      * Step 2: Trigger RFdiffusion API. Poll until status = `success`.
      * Step 3: Pass Output PDB path from Step 2 to Step 4 (ProteinMPNN).

### 5.3 UI Components

  * **Node Library:**
      * `InputNode`: Dropzone for files.
      * `RFdiffusionNode`: Displays "Contig" input field and "Run" button.
      * `ProteinMPNNNode`: Displays "Num Sequences" slider.
      * `AlphaFoldNode`: Displays "Recycle Count" input.
  * **Status Badges:** Small icons on nodes (Spinner, Checkmark, Red X).

-----

## 6\. API Interface Contracts

### POST `/api/agent/pipeline`

**Request:**

```json
{
  "user_prompt": "Generate a binder for target.pdb with 50aa length",
  "chat_history": [...],
  "available_files": ["target.pdb"]
}
```

**Response (Success):**

```json
{
  "type": "blueprint",
  "rationale": "I have set up a motif scaffolding pipeline. Please review the contig settings.",
  "blueprint": {
    "nodes": [
      { "id": "n1", "type": "input_node", "config": { "filename": "target.pdb" } },
      { "id": "n2", "type": "rfdiffusion_node", "config": { "contigs": "50" } },
      { "id": "n3", "type": "proteinmpnn_node", "config": { "seqs": 8 } }
    ],
    "edges": [
      { "source": "n1", "target": "n2" },
      { "source": "n2", "target": "n3" }
    ],
    "missing_resources": []
  }
}
```

**Response (Missing Info):**

```json
{
  "type": "text",
  "content": "To design a binder, I first need a target structure. Please upload a PDB file."
}
```

-----

## 7\. Implementation Roadmap

### Phase 1: The "Ghost" (Visualization Only) ✅ COMPLETED

  * [x] Install `reactflow`.
  * [x] Create the `PipelineStore` in Zustand.
  * [x] Implement `PipelineAgent` in backend (Mocked response initially).
  * [x] Build the Canvas UI that renders JSON blueprints as read-only nodes.
  * [x] Extract pipeline canvas as standalone library (`src/components/pipeline-canvas/`)
  * [x] Add n8n-style input/output handles to nodes
  * [x] Create JSON configuration files for each node type

### Phase 1.5: Library Extraction ✅ COMPLETED

  * [x] Create `pipeline-canvas/` library structure with:
    - `package.json` for npm package configuration
    - `tsconfig.json` for TypeScript compilation
    - `index.ts` for main exports
  * [x] Move components to `components/` subfolder:
    - PipelineCanvas, PipelineNodeConfig, PipelineNodePalette
    - PipelineExecution, PipelineManager, CustomHandle
  * [x] Create JSON node definitions in `nodes/*/node.json`:
    - input_node, rfdiffusion_node, proteinmpnn_node, alphafold_node
    - Each includes: metadata, schema, handles, execution config, defaults
  * [x] Create utilities:
    - `topologicalSort.ts` for execution order
    - `nodeLoader.ts` for dynamic JSON configuration loading
  * [x] Update main project imports for backwards compatibility

### Phase 2: The "Architect" (Agent Logic)

  * [ ] Implement full Prompt Engineering for `PipelineAgent`.
  * [ ] Add logic to parse PDB file presence from chat history.
  * [ ] Connect Chat UI to trigger the Ghost view.

### Phase 3: The "Builder" (Execution)

  * [ ] Implement "Run" button logic in frontend.
  * [ ] Update existing API handlers (`alphafold_handler.py`, etc.) to return consistent JSON status updates suitable for polling.
  * [ ] Add "View Result" button on nodes to load PDBs into the existing Molstar Viewer.

---

## 9\. Pipeline Canvas Library Structure

The pipeline canvas has been extracted as a standalone library for reusability:

```
src/components/pipeline-canvas/
├── package.json                    # npm package configuration
├── tsconfig.json                   # TypeScript config
├── index.ts                        # Main exports
├── components/
│   ├── PipelineCanvas.tsx          # Main canvas (React Flow)
│   ├── PipelineNodeConfig.tsx      # Node configuration panel
│   ├── PipelineNodePalette.tsx     # Node palette sidebar
│   ├── PipelineExecution.tsx       # Execution orchestrator
│   ├── PipelineManager.tsx         # Pipeline management modal
│   ├── CustomHandle.tsx            # n8n-style connection handles
│   └── index.ts                    # Component exports
├── nodes/
│   ├── input_node/node.json        # Input node configuration
│   ├── rfdiffusion_node/node.json  # RFdiffusion configuration
│   ├── proteinmpnn_node/node.json  # ProteinMPNN configuration
│   └── alphafold_node/node.json    # AlphaFold configuration
├── types/
│   └── index.ts                    # TypeScript type definitions
├── store/
│   └── pipelineStore.ts            # Zustand pipeline store
└── utils/
    ├── index.ts                    # Utility exports
    ├── topologicalSort.ts          # Graph sorting for execution
    └── nodeLoader.ts               # JSON config loader
```

### Node JSON Configuration Schema

Each node type is defined in a JSON file with the following structure:

```json
{
  "metadata": {
    "type": "node_type",
    "label": "Display Name",
    "icon": "LucideIconName",
    "color": "#hexcolor",
    "description": "Node description"
  },
  "schema": {
    "field_name": {
      "type": "string|number|boolean",
      "required": false,
      "default": "value",
      "label": "Field Label",
      "min": 0, "max": 100
    }
  },
  "handles": {
    "inputs": [{"id": "target", "type": "target", "position": "left"}],
    "outputs": [{"id": "source", "type": "source", "position": "right"}]
  },
  "execution": {
    "type": "api_call",
    "endpoint": "/api/endpoint",
    "method": "POST"
  },
  "defaultConfig": {}
}
```

### Library Usage

```typescript
// Import from the library
import { 
  PipelineCanvas, 
  PipelineManager,
  PipelineExecution,
  usePipelineStore,
  type PipelineNode,
  type Pipeline
} from './components/pipeline-canvas';

// Use in your React app
<PipelineCanvas />
<PipelineExecution apiClient={myApiClient} />
```

-----

## 8\. Success Metrics

  * **Safety:** Zero crashes of the main app during pipeline generation.
  * **Accuracy:** Agent correctly identifies when a PDB file is missing 100% of the time.
  * **Usability:** Users can successfully run a 3-step pipeline (RF-\>MPNN-\>AF) with \< 3 clicks after the chat request.