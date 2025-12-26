# @novoprotein/pipeline-canvas

A React component library for building visual pipeline/workflow canvases using React Flow.

## Installation from Private GitHub Repo

### Using SSH (Recommended for Private Repos)

```bash
npm install git+ssh://git@github.com:YOUR_USERNAME/pipeline-canvas.git
```

### Using HTTPS with Personal Access Token

```bash
npm install git+https://YOUR_TOKEN@github.com/YOUR_USERNAME/pipeline-canvas.git
```

### Using Specific Branch or Tag

```bash
npm install git+ssh://git@github.com:YOUR_USERNAME/pipeline-canvas.git#main
npm install git+ssh://git@github.com:YOUR_USERNAME/pipeline-canvas.git#v1.0.0
```

## Setup

1. Install dependencies:
```bash
npm install
```

2. Build the library:
```bash
npm run build
```

## Peer Dependencies

Make sure you have these installed in your consuming project:

```bash
npm install react react-dom reactflow zustand lucide-react
```

## Usage

### Basic Example

```tsx
import { PipelineCanvas, PipelineManager } from '@novoprotein/pipeline-canvas';
import '@novoprotein/pipeline-canvas/style.css';

function App() {
  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <PipelineCanvas />
      <PipelineManager />
    </div>
  );
}
```

### With Custom API Client

```tsx
import { PipelineExecution } from '@novoprotein/pipeline-canvas';
import { usePipelineStore } from '@novoprotein/pipeline-canvas/store';

function MyApp() {
  const apiClient = {
    post: async (url: string, data: any) => {
      return fetch(url, { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data) 
      });
    },
  };

  return <PipelineExecution apiClient={apiClient} />;
}
```

### Using the Store

```tsx
import { usePipelineStore } from '@novoprotein/pipeline-canvas';

function MyComponent() {
  const { nodes, edges, addNode } = usePipelineStore();
  
  return (
    <div>
      <p>Nodes: {nodes.length}</p>
      <button onClick={() => addNode({ id: '1', type: 'input', data: {} })}>
        Add Node
      </button>
    </div>
  );
}
```

### Styling

The library uses Tailwind CSS classes. Make sure Tailwind is configured in your project:

```js
// tailwind.config.js
module.exports = {
  content: [
    './src/**/*.{js,jsx,ts,tsx}',
    './node_modules/@novoprotein/pipeline-canvas/**/*.{js,jsx,ts,tsx}',
  ],
  // ... rest of config
};
```

Also import the CSS file in your main entry:

```tsx
// main.tsx or App.tsx
import '@novoprotein/pipeline-canvas/style.css';
```

## Development

```bash
# Type check
npm run type-check

# Build
npm run build
```

### Creating New Node Types

When creating a new node type, **please read the [Node Development Guide](../../docs/node-development-guide.md)** first. It covers critical best practices and common pitfalls, including:

- ✅ Always initialize nodes with default config
- ✅ Keep execution logs accessible after completion
- ✅ Don't force navigation during execution
- ✅ Handle multiple data structures in output extraction
- ✅ Common pitfalls and how to avoid them

This guide will save you time and prevent common issues!

## Project Structure

```
pipeline-canvas/
├── components/          # React components
│   ├── PipelineCanvas.tsx
│   ├── PipelineNodeConfig.tsx
│   ├── PipelineNodePalette.tsx
│   ├── PipelineExecution.tsx
│   ├── PipelineManager.tsx
│   ├── CustomHandle.tsx
│   └── ExecutionLogsPanel.tsx
├── nodes/               # Node type configurations (JSON)
│   ├── input_node/
│   ├── rfdiffusion_node/
│   ├── proteinmpnn_node/
│   └── alphafold_node/
├── store/               # Zustand store
│   └── pipelineStore.ts
├── types/               # TypeScript types
│   └── index.ts
├── utils/               # Utility functions
│   ├── topologicalSort.ts
│   └── nodeLoader.ts
├── dist/                # Build output (generated)
├── index.ts             # Main export file
├── style.css            # CSS styles
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## License

MIT

