# @mesantosrai/pipeline-canvas

A React component library for building visual pipeline/workflow canvases using React Flow.

## Installation from Private GitHub Repo

### Using SSH (Recommended for Private Repos)

```bash
npm install git+ssh://git@github.com:santosrai/pipeline-canvas.git
```

### Using HTTPS with Personal Access Token

```bash
npm install git+https://YOUR_TOKEN@github.com/santosrai/pipeline-canvas.git
```

### Using Specific Branch or Tag

```bash
npm install git+ssh://git@github.com:santosrai/pipeline-canvas.git#main
npm install git+ssh://git@github.com:santosrai/pipeline-canvas.git#v1.0.0
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

### shadcn/ui Components (Required)

This library uses shadcn/ui components. You need to install the required Radix UI packages and utilities:

```bash
npm install @radix-ui/react-dialog @radix-ui/react-dropdown-menu @radix-ui/react-label @radix-ui/react-select @radix-ui/react-slot @radix-ui/react-tooltip class-variance-authority clsx tailwind-merge
```

**Note**: The library includes shadcn component implementations in `components/ui/`, but you must install the peer dependencies above for them to work.

## Usage

### Basic Example (Standalone - No Dependencies)

The library works completely standalone without any dependencies:

```tsx
import { PipelineCanvas, PipelineCanvasProvider } from '@mesantosrai/pipeline-canvas';
import '@mesantosrai/pipeline-canvas/style.css';

function App() {
  return (
    <PipelineCanvasProvider>
      <div style={{ width: '100vw', height: '100vh' }}>
        <PipelineCanvas />
      </div>
    </PipelineCanvasProvider>
  );
}
```

**Note**: Without dependencies, the library works in "offline mode":
- Pipelines are saved locally (localStorage)
- No backend sync
- No authentication required
- File uploads work if your API supports unauthenticated requests

### With Authentication and API Client

For full functionality (backend sync, authenticated operations):

```tsx
import { 
  PipelineCanvas, 
  PipelineCanvasProvider,
  type ApiClient,
  type AuthState 
} from '@mesantosrai/pipeline-canvas';
import '@mesantosrai/pipeline-canvas/style.css';

function App() {
  // Your API client (compatible with axios, fetch, or custom)
  const apiClient: ApiClient = {
    get: async (url: string) => {
      const response = await fetch(`/api${url}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      return { data: await response.json() };
    },
    post: async (url: string, data: any) => {
      const response = await fetch(`/api${url}`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(data)
      });
      return { data: await response.json() };
    },
  };

  // Your auth state
  const authState: AuthState = {
    user: { id: 'user-123', email: 'user@example.com' },
    isAuthenticated: true,
    accessToken: token,
  };

  // Session ID for execution context
  const sessionId = 'session-456';

  // Auth headers function for file uploads
  const getAuthHeaders = () => ({
    'Authorization': `Bearer ${token}`
  });

  return (
    <PipelineCanvasProvider
      apiClient={apiClient}
      authState={authState}
      sessionId={sessionId}
      getAuthHeaders={getAuthHeaders}
    >
      <div style={{ width: '100vw', height: '100vh' }}>
        <PipelineCanvas />
      </div>
    </PipelineCanvasProvider>
  );
}
```

### With Axios API Client

If you're using axios:

```tsx
import axios from 'axios';
import { PipelineCanvasProvider, type ApiClient } from '@mesantosrai/pipeline-canvas';

const apiClient: ApiClient = {
  get: (url: string, config?) => axios.get(url, config),
  post: (url: string, data?: any, config?) => axios.post(url, data, config),
  put: (url: string, data?: any, config?) => axios.put(url, data, config),
  patch: (url: string, data?: any, config?) => axios.patch(url, data, config),
  delete: (url: string, config?) => axios.delete(url, config),
};

function App() {
  return (
    <PipelineCanvasProvider apiClient={apiClient}>
      <PipelineCanvas />
    </PipelineCanvasProvider>
  );
}
```

### Partial Dependencies

You can provide only the dependencies you need:

```tsx
// Only API client (no auth)
<PipelineCanvasProvider apiClient={myApiClient}>
  <PipelineCanvas />
</PipelineCanvasProvider>

// Only auth state (local operations only)
<PipelineCanvasProvider authState={authState}>
  <PipelineCanvas />
</PipelineCanvasProvider>

// Everything optional - works standalone
<PipelineCanvasProvider>
  <PipelineCanvas />
</PipelineCanvasProvider>
```

### Using the Store

```tsx
import { usePipelineStore } from '@mesantosrai/pipeline-canvas';

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

### Using Context Directly

You can also access dependencies directly from context:

```tsx
import { usePipelineContext } from '@mesantosrai/pipeline-canvas';

function MyComponent() {
  const { apiClient, authState, sessionId, getAuthHeaders } = usePipelineContext();
  
  // Use dependencies as needed
  if (authState?.user) {
    // User is authenticated
  }
  
  return <div>...</div>;
}
```

## Dependency Injection

The library uses dependency injection to remain standalone and flexible. All dependencies are **optional**:

- **`apiClient`**: For backend operations (save, load, sync pipelines)
- **`authState`**: For user-specific features and authentication
- **`sessionId`**: For execution context and session tracking
- **`getAuthHeaders`**: For authenticated file uploads
- **`logger`**: For structured logging (optional, uses console by default)
- **`errorReporter`**: For error tracking (Sentry, LogRocket, etc.)

### Graceful Degradation

When dependencies are not provided:
- ✅ Pipelines work locally (localStorage)
- ✅ All UI features work
- ✅ Pipeline execution works (with provided apiClient or external APIs)
- ⚠️ Backend sync is skipped
- ⚠️ User-specific features are disabled
- ⚠️ File uploads may fail if API requires authentication

### Integration Examples

#### With Zustand Auth Store

```tsx
import { useAuthStore } from './stores/authStore';
import { PipelineCanvasProvider } from '@mesantosrai/pipeline-canvas';

function App() {
  const user = useAuthStore(state => state.user);
  const token = useAuthStore(state => state.accessToken);
  
  const authState = {
    user,
    isAuthenticated: !!user,
    accessToken: token,
  };
  
  return (
    <PipelineCanvasProvider authState={authState}>
      <PipelineCanvas />
    </PipelineCanvasProvider>
  );
}
```

#### With React Context Auth

```tsx
import { useContext } from 'react';
import { AuthContext } from './AuthContext';
import { PipelineCanvasProvider } from '@mesantosrai/pipeline-canvas';

function App() {
  const { user, token } = useContext(AuthContext);
  
  return (
    <PipelineCanvasProvider
      authState={{ user, isAuthenticated: !!user, accessToken: token }}
    >
      <PipelineCanvas />
    </PipelineCanvasProvider>
  );
}
```

## Logging and Error Tracking

The library supports structured logging and error tracking through dependency injection. This allows you to integrate with your own logging systems (Sentry, LogRocket, Bugsnag, etc.) or use the default console logger.

### Basic Usage (Default Logger)

By default, the library uses a console logger that only logs in development mode:

```tsx
import { PipelineCanvasProvider } from '@mesantosrai/pipeline-canvas';

// No logger needed - uses default console logger (development only)
<PipelineCanvasProvider>
  <PipelineCanvas />
</PipelineCanvasProvider>
```

### Custom Logger

Provide your own logger for structured logging:

```tsx
import { 
  PipelineCanvasProvider,
  type Logger 
} from '@mesantosrai/pipeline-canvas';

const myLogger: Logger = {
  debug: (message, data) => {
    // Your debug logging logic
    console.debug(`[Pipeline] ${message}`, data);
  },
  info: (message, data) => {
    // Your info logging logic
    console.info(`[Pipeline] ${message}`, data);
  },
  warn: (message, data) => {
    // Your warning logging logic
    console.warn(`[Pipeline] ${message}`, data);
  },
  error: (message, error, data) => {
    // Your error logging logic
    console.error(`[Pipeline] ${message}`, error, data);
  },
};

<PipelineCanvasProvider logger={myLogger}>
  <PipelineCanvas />
</PipelineCanvasProvider>
```

### Error Tracking (Sentry Example)

Integrate with error tracking services:

```tsx
import * as Sentry from '@sentry/react';
import { 
  PipelineCanvasProvider,
  type ErrorReporter 
} from '@mesantosrai/pipeline-canvas';

const errorReporter: ErrorReporter = {
  captureException: (error, context) => {
    Sentry.captureException(error, {
      extra: context,
      tags: {
        component: 'pipeline-canvas',
      },
    });
  },
  captureMessage: (message, level, context) => {
    Sentry.captureMessage(message, {
      level: level === 'error' ? 'error' : level === 'warning' ? 'warning' : 'info',
      extra: context,
      tags: {
        component: 'pipeline-canvas',
      },
    });
  },
  setUser: (user) => {
    Sentry.setUser({
      id: user.id,
      email: user.email,
    });
  },
  setContext: (key, context) => {
    Sentry.setContext(key, context);
  },
};

<PipelineCanvasProvider errorReporter={errorReporter}>
  <PipelineCanvas />
</PipelineCanvasProvider>
```

### LogRocket Example

```tsx
import LogRocket from 'logrocket';
import { PipelineCanvasProvider, type ErrorReporter } from '@mesantosrai/pipeline-canvas';

const errorReporter: ErrorReporter = {
  captureException: (error, context) => {
    LogRocket.captureException(error, {
      extra: context,
    });
  },
  captureMessage: (message, level, context) => {
    LogRocket.captureMessage(message, {
      level,
      extra: context,
    });
  },
  setUser: (user) => {
    LogRocket.identify(user.id, {
      email: user.email,
    });
  },
};

<PipelineCanvasProvider errorReporter={errorReporter}>
  <PipelineCanvas />
</PipelineCanvasProvider>
```

### Using Logger in Your Code

You can access the logger from context:

```tsx
import { usePipelineContext } from '@mesantosrai/pipeline-canvas';

function MyComponent() {
  const { logger } = usePipelineContext();
  
  const handleAction = () => {
    logger?.info('Action performed', { action: 'click' });
  };
  
  return <button onClick={handleAction}>Click me</button>;
}
```

### What Gets Logged

The library logs:
- **Pipeline execution events**: Start, completion, errors
- **Node execution**: Status changes, errors, results
- **API requests**: Request/response details (if enabled)
- **User actions**: Pipeline save, load, delete operations
- **Errors**: All errors with full context (node ID, pipeline ID, error details)

### Privacy and Security

- **No automatic data collection**: Logging is opt-in via dependency injection
- **You control what gets logged**: Provide your own logger/error reporter
- **No external calls**: Default logger only uses console (no network requests)
- **Context-aware**: All logs include relevant context (pipeline ID, node ID, etc.)

### Theming

The library uses a **scoped theming system** with CSS variables prefixed with `--pc-` to avoid conflicts with your parent application's theme. This allows you to integrate the pipeline canvas into any app regardless of its existing styling.

#### Basic Setup

1. **Import the CSS file** in your main entry:

```tsx
// main.tsx or App.tsx
import '@mesantosrai/pipeline-canvas/style.css';
```

2. **Configure Tailwind** to include the library's classes:

```js
// tailwind.config.js
module.exports = {
  content: [
    './src/**/*.{js,jsx,ts,tsx}',
    './node_modules/@mesantosrai/pipeline-canvas/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {},
  },
};
```

#### Using the Theme Wrapper

The `PipelineThemeWrapper` component provides theme isolation and supports light/dark modes:

```tsx
import { 
  PipelineCanvas, 
  PipelineThemeWrapper,
  PipelineCanvasProvider 
} from '@mesantosrai/pipeline-canvas';

// Option 1: Follow system preference (default)
<PipelineThemeWrapper>
  <PipelineCanvasProvider {...deps}>
    <PipelineCanvas />
  </PipelineCanvasProvider>
</PipelineThemeWrapper>

// Option 2: Force a specific theme
<PipelineThemeWrapper theme="dark">
  <PipelineCanvasProvider {...deps}>
    <PipelineCanvas />
  </PipelineCanvasProvider>
</PipelineThemeWrapper>

// Option 3: Sync with your app's theme state
const [appTheme, setAppTheme] = useState<'light' | 'dark'>('dark');

<PipelineThemeWrapper externalTheme={appTheme}>
  <PipelineCanvasProvider {...deps}>
    <PipelineCanvas />
  </PipelineCanvasProvider>
</PipelineThemeWrapper>
```

#### Default White Theme (Standalone Usage)

For a default light/white theme when using the pipeline canvas in any app:

```tsx
// Force light theme (default white)
<PipelineThemeWrapper theme="light">
  <PipelineCanvasProvider {...deps}>
    <PipelineCanvas />
  </PipelineCanvasProvider>
</PipelineThemeWrapper>

// Or rely on system preference (if system is light, it will be light)
<PipelineThemeWrapper theme="system">
  <PipelineCanvasProvider {...deps}>
    <PipelineCanvas />
  </PipelineCanvasProvider>
</PipelineThemeWrapper>
```

**Note:** The pipeline canvas uses CSS variables at `:root` (light) and `html.dark` (dark) for portalled components (dialogs, dropdowns, etc.). For default white in any app, the `:root` values apply automatically. If your app sets `html.dark` for dark mode, portalled pipeline UI will follow that.

#### Portalled Components and Dark Mode

Pipeline UI components that render in portals (dialogs, dropdowns, select menus) are rendered outside `.pipeline-canvas-root` and rely on CSS variables at `:root` (light) and `html.dark` (dark).

**For dark mode in portalled components:**

- **Option 1:** Use `externalTheme` prop (recommended for apps with theme management):
  ```tsx
  const { theme } = useYourAppTheme(); // Your app's theme hook
  
  <PipelineThemeWrapper externalTheme={theme}>
    <PipelineCanvas />
  </PipelineThemeWrapper>
  ```
  When your app sets `html.dark` for dark mode, portalled pipeline UI will automatically use dark theme variables.

- **Option 2:** Set `html.dark` class manually when in dark mode:
  ```tsx
  // In your app's theme provider
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);
  ```

**For default white in any app:** The `:root` CSS variables provide light theme values by default. If the host app never sets `html.dark`, portalled pipeline UI will remain light (default white).

#### Theme Toggle Button

Include a theme toggle button using the `PipelineThemeToggle` component:

```tsx
import { PipelineThemeToggle, PipelineThemeWrapper } from '@mesantosrai/pipeline-canvas';

<PipelineThemeWrapper>
  <div className="flex justify-end p-2">
    <PipelineThemeToggle />
  </div>
  <PipelineCanvasProvider {...deps}>
    <PipelineCanvas />
  </PipelineCanvasProvider>
</PipelineThemeWrapper>
```

#### Using the Theme Hook

Access the current theme programmatically:

```tsx
import { usePipelineTheme, useIsDarkTheme } from '@mesantosrai/pipeline-canvas';

function MyComponent() {
  const { theme, resolvedTheme, setTheme, toggleTheme } = usePipelineTheme();
  const isDark = useIsDarkTheme();

  return (
    <div>
      <p>Current theme: {resolvedTheme}</p>
      <button onClick={toggleTheme}>Toggle Theme</button>
    </div>
  );
}
```

#### Customizing Theme Colors

Override the CSS variables in your own stylesheet to customize colors:

```css
/* Your app's CSS file */
.pipeline-canvas-root {
  /* Light theme overrides */
  --pc-primary: 210 100% 50%;
  --pc-canvas-bg: 0 0% 98%;
}

.pipeline-canvas-root[data-theme="dark"] {
  /* Dark theme overrides */
  --pc-primary: 210 100% 60%;
  --pc-canvas-bg: 220 20% 10%;
}
```

#### Available CSS Variables

| Variable | Description |
|----------|-------------|
| `--pc-background` | Main background color |
| `--pc-foreground` | Main text color |
| `--pc-card` | Card/panel background |
| `--pc-primary` | Primary accent color |
| `--pc-secondary` | Secondary color |
| `--pc-muted` | Muted/disabled color |
| `--pc-border` | Border color |
| `--pc-canvas-bg` | Canvas background |
| `--pc-toolbar-bg` | Toolbar background |
| `--pc-sidebar-bg` | Sidebar background |
| `--pc-panel-bg` | Panel background |
| `--pc-text-primary` | Primary text |
| `--pc-text-secondary` | Secondary text |
| `--pc-text-muted` | Muted text |

#### Theme Props Reference

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `theme` | `'light' \| 'dark' \| 'system'` | `'system'` | Theme preference |
| `externalTheme` | `'light' \| 'dark'` | - | External theme override from parent app |
| `onThemeChange` | `(theme: 'light' \| 'dark') => void` | - | Callback when theme changes |
| `className` | `string` | - | Additional CSS classes |

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
│   ├── ExecutionLogsPanel.tsx
│   ├── PipelineThemeWrapper.tsx  # Theme isolation wrapper
│   └── index.ts
├── context/             # React contexts
│   ├── PipelineContext.tsx
│   └── ThemeContext.tsx          # Theme state management
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
├── style.css            # CSS styles (scoped --pc- variables)
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## Backend Abstraction

The library supports backend abstraction through adapters, allowing you to integrate with any backend framework. See [BACKEND_ABSTRACTION.md](./BACKEND_ABSTRACTION.md) for:

- Adapter pattern implementation
- Custom adapter examples (FastAPI, Express, Firebase, Supabase)
- Configuration-based customization
- Migration guide

## License

MIT

