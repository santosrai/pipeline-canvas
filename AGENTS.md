# Repository Guidelines

## Project Structure & Module Organization
- Frontend: `src/` (React + TypeScript, Vite). Entry: `src/main.tsx`, `src/App.tsx`; components in `src/components/`; state in `src/stores/`; utilities in `src/utils/`.
- **Pipeline Canvas Library**: `src/components/pipeline-canvas/` (standalone, npm-ready). Contains visual workflow components, JSON node configs, Zustand store, and utilities.
- Backend: `server/` (FastAPI). Entrypoint: `server/app.py`; agent logic in `server/agents.py`; routing graph in `server/router_graph.py`; RFdiffusion utilities `server/rfdiffusion_*.py`.
- Tests: Python tests under `server/` (e.g., `test_rfdiffusion_*.py`) and `test_nvidia_api.py` at repo root.
- Assets/Build: `index.html` at root; Vite output in `dist/`; RFdiffusion outputs in `server/rfdiffusion_results/`.

## Build, Test, and Development Commands
- Install frontend deps: `npm install`
- Run frontend dev server: `npm run dev`
- Python env (first time): `python -m venv .venv && source .venv/bin/activate && pip install -r server/requirements.txt`
- Run backend (uvicorn): `npm run start:server` (uses `./.venv/bin/uvicorn`)
- Run both in parallel: `npm run dev:all`
- Lint TypeScript: `npm run lint`
- Python tests: `pytest -q` (from repo root or `server/`)

## Makefile Shortcuts
- Setup both stacks: `make setup`
- Run both in dev: `make dev`
- Backend only: `make server`
- Frontend only: `make client`
- Lint TS: `make lint`; Tests: `make test`

## Coding Style & Naming Conventions
- TypeScript/React: 2‑space indent; camelCase for variables/functions; PascalCase for components; filenames: `PascalCase.tsx` for components, `camelCase.ts` for utilities.
- Python: PEP 8; snake_case for functions/variables; PascalCase for classes. Keep modules cohesive (agents in `agents.py`, HTTP in `app.py`).
- Linting: ESLint with `@typescript-eslint`. Ensure `npm run lint` passes before PRs.

## Testing Guidelines
- Framework: `pytest`. Name tests `test_*.py` next to server code.
- Focus: core agent flows, routing, RFdiffusion handlers (`rfdiffusion_*.py`) and error handling.
- Run: `pytest -q`. Add regression tests for fixed bugs.

## Commit & Pull Request Guidelines
- Commits: Conventional Commits (e.g., `feat:`, `fix:`, `chore:`). Example: `feat: implement AlphaFold2 integration with NVIDIA NIMS API`.
- PRs: include description, linked issues, screenshots/GIFs for UI, commands to reproduce, and risk/rollback notes. Keep diffs scoped and request review.

## Security & Configuration Tips
- Env vars in `.env` (root) or `server/.env`. Common keys: `ANTHROPIC_API_KEY`, `NVCF_RUN_KEY`, `APP_ORIGIN`, `DEBUG_API=0|1`, plus ProteinMPNN overrides like `PROTEINMPNN_URL`, `PROTEINMPNN_POLL_INTERVAL`, `PROTEINMPNN_MAX_WAIT_SECONDS`.
- Never commit secrets. `.env` is ignored. Validate keys load at server start (FastAPI logs show masked values).

## Agent‑Specific Notes
- Add/modify agents in `server/agents.py`; update routing in `server/router_graph.py` as needed.
- Expose new capabilities via `/api/agents` endpoints consumed by the frontend.

## Architecture Overview
Client (Vite/React) → FastAPI `/api` → Agent graph → RFdiffusion/NVIDIA services.

```text
[React UI] --HTTP--> [FastAPI] --calls--> [agents/router_graph]
                                 └─> [rfdiffusion_* + external APIs]
```
State lives in `src/stores/`; server writes results to `server/rfdiffusion_results/`, `server/proteinmpnn_results/`, and caches uploads under `server/uploads/`.

## Pipeline Canvas Library
The visual pipeline workflow feature is extracted as a standalone library in `src/components/pipeline-canvas/`:

- **Components**: `PipelineCanvas`, `PipelineNodeConfig`, `PipelineNodePalette`, `PipelineExecution`, `PipelineManager`, `CustomHandle`
- **Node JSON Configs**: `nodes/{input_node,rfdiffusion_node,proteinmpnn_node,alphafold_node}/node.json`
- **Store**: `store/pipelineStore.ts` (Zustand with persistence)
- **Utils**: `utils/topologicalSort.ts`, `utils/nodeLoader.ts`
- **Types**: `types/index.ts`

Import from the library:
```typescript
import { PipelineCanvas, usePipelineStore } from './components/pipeline-canvas';
```
