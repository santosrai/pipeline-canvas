# NovoProtein AI - Molecular Visualization Platform

A modern web-based molecular visualization platform that combines natural language interaction with powerful 3D protein structure visualization using Molstar.

## Features

- **Natural Language Interface**: Describe what you want to visualize in plain English
- **Real-time 3D Visualization**: Powered by Molstar for high-performance molecular graphics
- **Interactive Code Editor**: Monaco editor with syntax highlighting and auto-completion
- **Protein Sequence Redesign**: Run NVIDIA ProteinMPNN against RFdiffusion results or uploaded PDB backbones
- **PDB Structure Loading**: Automatic resolution of protein names to PDB structures
- **Example Templates**: Pre-built visualization examples for common use cases
- **Responsive Design**: Works on desktop, tablet, and mobile devices

## Quick Start

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Start Development Server**
   ```bash
   npm run dev
   ```

3. **Build for Production**
   ```bash
   npm run build
   ```

## Usage

### Natural Language Commands
- "Show insulin" - Load and display insulin structure
- "Display hemoglobin with heme groups" - Hemoglobin with ligand highlighting
- "Visualize DNA double helix" - DNA structure with nucleotide coloring
- "Show antibody structure" - Multi-chain antibody visualization

### Code Editor
The Monaco editor provides a full IDE experience with:
- Syntax highlighting for JavaScript/TypeScript
- Auto-completion for Molstar API
- Error detection and inline help
- Code execution with safety sandboxing

### 3D Viewer Controls
- **Mouse**: Rotate, zoom, and pan
- **Screenshot**: Save current view as PNG
- **Reset**: Return to default camera position
- **Fullscreen**: Toggle immersive viewing mode

### ProteinMPNN Sequence Design
- Ask the assistant to "redesign this backbone with ProteinMPNN" or request sequence design for a specific RFdiffusion job.
- Review the confirmation dialog: pick an existing RFdiffusion result or upload a PDB file, then adjust design parameters (number of sequences, temperature, chain filters, fixed residues).
- Track progress in the chat sidebar; completed jobs provide download links for JSON, FASTA, and raw ProteinMPNN outputs alongside the designed sequences.

## Architecture

### Frontend Stack
- **React 18** with TypeScript for type safety
- **Vite** for fast development and building
- **Tailwind CSS** for responsive styling
- **Zustand** for state management
- **Monaco Editor** for code editing
- **Molstar** for 3D molecular visualization

### Key Components
- `App.tsx` - Main application layout
- `ChatPanel.tsx` - AI chat interface
- `CodeEditor.tsx` - Monaco code editor integration
- `MolstarViewer.tsx` - 3D molecular viewer
- `utils/molstarBuilder.ts` - Molstar API wrapper
- `utils/codeExecutor.ts` - Safe code execution environment
- `components/pipeline-canvas/` - Visual pipeline workflow library (React Flow based)

### Pipeline Canvas Library
The pipeline canvas is a standalone library located at `src/components/pipeline-canvas/` that provides:
- **Visual DAG Workflow**: Design and execute protein engineering pipelines
- **Node Types**: Input, RFdiffusion, ProteinMPNN, and AlphaFold nodes
- **JSON Configuration**: Each node type has configurable schema in `nodes/*/node.json`
- **Reusable**: Can be imported as an npm package for use in other projects

## Supported Structures

The application can load structures from:
- **PDB codes**: 4-character identifiers (e.g., "1CBS", "6M0J")
- **Common proteins**: insulin, hemoglobin, antibody, DNA, etc.
- **RCSB PDB Search**: Automatic name resolution

## Development

### AI Code Generation (Claude)

This app can generate Mol* builder code from natural language via a lightweight server that calls the Claude SDK.

1. Create a `.env` file in the project root and set `ANTHROPIC_API_KEY=your_key_here`.
2. Run both the API server and Vite dev server together:
   ```bash
   npm run dev:all
   ```
3. The client calls `POST /api/generate` (proxied to `http://localhost:8787`).

### Persistence

Generated code and UI state persist across reloads via localStorage using Zustand's persist middleware. The editor toolbar also includes a button to save timestamped code snapshots.

### Project Structure
```
src/
├── components/                    # React components
│   ├── pipeline-canvas/           # Pipeline canvas library (standalone)
│   │   ├── components/            # Canvas UI components
│   │   ├── nodes/                 # Node type JSON configurations
│   │   │   ├── input_node/
│   │   │   ├── rfdiffusion_node/
│   │   │   ├── proteinmpnn_node/
│   │   │   └── alphafold_node/
│   │   ├── store/                 # Pipeline Zustand store
│   │   ├── types/                 # Pipeline TypeScript types
│   │   ├── utils/                 # Pipeline utilities
│   │   └── index.ts               # Library exports
│   └── ...                        # Other components
├── stores/                        # Zustand state stores
├── types/                         # TypeScript type definitions
├── utils/                         # Utility functions
└── index.css                      # Global styles
```

### Available Scripts
- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint

### Environment Variables
Configure backend behaviour by setting the following keys in `.env` (project root) or `server/.env`:

| Variable | Description | Default |
| --- | --- | --- |
| `NVCF_RUN_KEY` | NVIDIA Cloud API key shared by AlphaFold, RFdiffusion, and ProteinMPNN clients | — |
| `PROTEINMPNN_API_KEY` | Optional override for the ProteinMPNN client if you want a dedicated key | falls back to `NVCF_RUN_KEY` |
| `PROTEINMPNN_URL` | ProteinMPNN inference endpoint | `https://health.api.nvidia.com/v1/biology/ipd/proteinmpnn/predict` |
| `PROTEINMPNN_POLL_INTERVAL` | Seconds between status checks | `10` |
| `PROTEINMPNN_MAX_WAIT_SECONDS` | Hard timeout for polling (0 = unlimited) | `1800` |
| `PROTEINMPNN_POST_RETRIES` | Retries for initial submission on transient errors | `3` |

Uploaded PDB files are stored under `server/uploads/`, and ProteinMPNN job artefacts (JSON, FASTA, logs) are written to `server/proteinmpnn_results/`.

### Adding New Features
1. Create components in `src/components/`
2. Add utility functions in `src/utils/`
3. Update state management in `src/stores/`
4. Add example templates in `src/utils/examples.ts`

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Acknowledgments

- **Molstar Team** - For the amazing molecular visualization library
- **RCSB PDB** - For providing structural data
- **React Team** - For the excellent frontend framework
