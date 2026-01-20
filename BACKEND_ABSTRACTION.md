# Backend Abstraction Strategy

This document describes the backend abstraction strategy implemented for the pipeline-canvas library, allowing it to work with any backend framework or API structure.

## Overview

The pipeline-canvas library uses an **Adapter Pattern** to abstract backend operations, making it framework-agnostic while maintaining backward compatibility with the existing NovoProtein implementation.

## Architecture

### Adapter Interfaces

The library defines two main adapter interfaces:

1. **`PipelinePersistenceAdapter`** - Handles pipeline CRUD operations
2. **`NodeExecutionAdapter`** - Handles node execution (optional, uses default engine if not provided)

### Default Implementation

The library includes a default `NovoProteinAdapter` that implements the current NovoProtein API structure. This ensures backward compatibility - existing code continues to work without changes.

## Usage

### Basic Usage (Default Adapter)

If you're using the NovoProtein API structure, you don't need to do anything - the library automatically creates a default adapter:

```tsx
import { PipelineCanvasProvider, PipelineCanvas } from './components/pipeline-canvas';

<PipelineCanvasProvider
  apiClient={myApiClient}
  authState={{ user: currentUser, isAuthenticated: true }}
>
  <PipelineCanvas />
</PipelineCanvasProvider>
```

### Custom Adapter Implementation

To use a different backend API structure, implement the adapter interfaces:

```tsx
import { 
  PipelinePersistenceAdapter, 
  Pipeline,
  SaveOptions,
  ListFilters 
} from './components/pipeline-canvas';

class MyCustomAdapter implements PipelinePersistenceAdapter {
  async save(pipeline: Pipeline, options?: SaveOptions): Promise<{ id: string }> {
    // Call your API: POST /my-app/workflows
    const response = await fetch('/my-app/workflows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pipeline)
    });
    const data = await response.json();
    return { id: data.workflowId };
  }

  async load(id: string): Promise<Pipeline> {
    const response = await fetch(`/my-app/workflows/${id}`);
    const data = await response.json();
    return data.workflow;
  }

  async list(filters?: ListFilters): Promise<Pipeline[]> {
    const url = new URL('/my-app/workflows', window.location.origin);
    if (filters?.status) {
      url.searchParams.append('status', filters.status);
    }
    const response = await fetch(url.toString());
    const data = await response.json();
    return data.workflows;
  }

  async delete(id: string): Promise<void> {
    await fetch(`/my-app/workflows/${id}`, { method: 'DELETE' });
  }
}

// Use your custom adapter
<PipelineCanvasProvider
  apiClient={myApiClient}
  authState={{ user: currentUser, isAuthenticated: true }}
  persistenceAdapter={new MyCustomAdapter()}
>
  <PipelineCanvas />
</PipelineCanvasProvider>
```

### Configuration-Based Customization

You can also customize endpoints and response transformers without implementing a full adapter:

```tsx
import { PipelineConfig } from './components/pipeline-canvas';

const config: PipelineConfig = {
  endpoints: {
    pipelines: {
      save: '/my-app/workflows',
      load: '/my-app/workflows/:id',
      list: '/my-app/workflows',
      delete: '/my-app/workflows/:id',
    },
    nodes: {
      rfdiffusion: '/my-api/design-protein',
      alphafold: '/my-api/predict-structure',
      proteinmpnn: '/my-api/design-sequence',
    },
  },
  responseTransformers: {
    pipeline: (response) => {
      // Transform your API response to match Pipeline format
      return response.workflow;
    },
    list: (response) => {
      return response.workflows || [];
    },
  },
};

<PipelineCanvasProvider
  apiClient={myApiClient}
  authState={{ user: currentUser, isAuthenticated: true }}
  config={config}
>
  <PipelineCanvas />
</PipelineCanvasProvider>
```

## Adapter Interface Reference

### PipelinePersistenceAdapter

```typescript
interface PipelinePersistenceAdapter {
  save(pipeline: Pipeline, options?: SaveOptions): Promise<{ id: string }>;
  load(id: string): Promise<Pipeline>;
  list(filters?: ListFilters): Promise<Pipeline[]>;
  delete(id: string): Promise<void>;
  sync?(): Promise<Pipeline[]>; // Optional
}
```

**Methods:**

- **`save`** - Save a pipeline to the backend
  - `pipeline`: The pipeline object to save
  - `options`: Optional save options (messageId, conversationId, status, etc.)
  - Returns: Promise resolving to `{ id: string }`

- **`load`** - Load a pipeline by ID
  - `id`: Pipeline ID
  - Returns: Promise resolving to the Pipeline object

- **`list`** - List pipelines with optional filters
  - `filters`: Optional filters (status, messageId, conversationId, limit, offset)
  - Returns: Promise resolving to an array of Pipeline objects

- **`delete`** - Delete a pipeline by ID
  - `id`: Pipeline ID
  - Returns: Promise that resolves when deletion is complete

- **`sync`** (optional) - Sync all pipelines from backend
  - Returns: Promise resolving to an array of Pipeline objects
  - If not implemented, the library will use `list()` instead

### NodeExecutionAdapter

```typescript
interface NodeExecutionAdapter {
  execute(params: NodeExecutionParams): Promise<any>;
  checkStatus?(jobId: string): Promise<{ status: 'running' | 'completed' | 'failed'; result?: any; error?: string }>;
  cancel?(jobId: string): Promise<void>;
}
```

**Note:** Node execution is currently handled by the default execution engine. The `NodeExecutionAdapter` interface is provided for future extensibility. Most users won't need to implement this.

## Configuration Reference

### PipelineConfig

```typescript
interface PipelineConfig {
  endpoints?: {
    pipelines?: {
      save?: string;      // Default: '/api/pipelines'
      load?: string;      // Default: '/api/pipelines/:id'
      list?: string;      // Default: '/api/pipelines'
      delete?: string;    // Default: '/api/pipelines/:id'
    };
    nodes?: {
      rfdiffusion?: string;  // Default: '/api/rfdiffusion/design'
      alphafold?: string;     // Default: '/api/alphafold/fold'
      proteinmpnn?: string;   // Default: '/api/proteinmpnn/design'
    };
  };
  responseTransformers?: {
    pipeline?: (response: any) => Pipeline;
    list?: (response: any) => Pipeline[];
    nodeExecution?: (response: any, nodeType: string) => any;
  };
  features?: {
    autoSave?: boolean;        // Default: true
    autoSaveDelay?: number;   // Default: 1000ms
    syncOnMount?: boolean;     // Default: true
  };
}
```

## Migration Guide

### From Direct API Calls to Adapters

**Before (Direct API calls):**
```tsx
// Old code - still works, but not recommended for new code
<PipelineCanvasProvider apiClient={apiClient}>
  <PipelineCanvas />
</PipelineCanvasProvider>
```

**After (Using Adapter):**
```tsx
// New code - explicit adapter usage
import { NovoProteinAdapter } from './components/pipeline-canvas';

<PipelineCanvasProvider
  apiClient={apiClient}
  persistenceAdapter={new NovoProteinAdapter(apiClient)}
>
  <PipelineCanvas />
</PipelineCanvasProvider>
```

**Note:** The old code still works! The library automatically creates a default adapter if `apiClient` is provided but no adapter is specified.

## Examples

### FastAPI Backend

```python
# FastAPI routes
@app.post("/api/pipelines")
async def create_pipeline(pipeline: Pipeline):
    # Save to database
    pipeline_id = await db.save_pipeline(pipeline)
    return {"id": pipeline_id}

@app.get("/api/pipelines/{pipeline_id}")
async def get_pipeline(pipeline_id: str):
    pipeline = await db.get_pipeline(pipeline_id)
    return {"pipeline": pipeline}
```

```tsx
// Frontend adapter
class FastAPIAdapter implements PipelinePersistenceAdapter {
  async save(pipeline: Pipeline): Promise<{ id: string }> {
    const response = await fetch('/api/pipelines', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pipeline)
    });
    const data = await response.json();
    return { id: data.id };
  }

  async load(id: string): Promise<Pipeline> {
    const response = await fetch(`/api/pipelines/${id}`);
    const data = await response.json();
    return data.pipeline;
  }

  // ... implement other methods
}
```

### Express.js Backend

```typescript
// Express routes
app.post('/api/pipelines', async (req, res) => {
  const pipeline = req.body;
  const id = await db.savePipeline(pipeline);
  res.json({ id });
});

app.get('/api/pipelines/:id', async (req, res) => {
  const pipeline = await db.getPipeline(req.params.id);
  res.json({ pipeline });
});
```

```tsx
// Frontend adapter (same as FastAPI example)
class ExpressAdapter implements PipelinePersistenceAdapter {
  // Same implementation as FastAPIAdapter
}
```

### Firebase/Firestore

```tsx
import { collection, addDoc, getDoc, doc, getDocs, deleteDoc } from 'firebase/firestore';
import { db } from './firebase';

class FirestoreAdapter implements PipelinePersistenceAdapter {
  async save(pipeline: Pipeline): Promise<{ id: string }> {
    const docRef = await addDoc(collection(db, 'pipelines'), pipeline);
    return { id: docRef.id };
  }

  async load(id: string): Promise<Pipeline> {
    const docSnap = await getDoc(doc(db, 'pipelines', id));
    if (!docSnap.exists()) {
      throw new Error('Pipeline not found');
    }
    return { id: docSnap.id, ...docSnap.data() } as Pipeline;
  }

  async list(filters?: ListFilters): Promise<Pipeline[]> {
    const querySnapshot = await getDocs(collection(db, 'pipelines'));
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as Pipeline[];
  }

  async delete(id: string): Promise<void> {
    await deleteDoc(doc(db, 'pipelines', id));
  }
}
```

### Supabase

```tsx
import { supabase } from './supabase';

class SupabaseAdapter implements PipelinePersistenceAdapter {
  async save(pipeline: Pipeline): Promise<{ id: string }> {
    const { data, error } = await supabase
      .from('pipelines')
      .insert(pipeline)
      .select()
      .single();
    
    if (error) throw error;
    return { id: data.id };
  }

  async load(id: string): Promise<Pipeline> {
    const { data, error } = await supabase
      .from('pipelines')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) throw error;
    return data;
  }

  async list(filters?: ListFilters): Promise<Pipeline[]> {
    let query = supabase.from('pipelines').select('*');
    
    if (filters?.status) {
      query = query.eq('status', filters.status);
    }
    
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('pipelines')
      .delete()
      .eq('id', id);
    
    if (error) throw error;
  }
}
```

## Benefits

1. **Framework Agnostic** - Works with any backend (FastAPI, Express, NestJS, Firebase, Supabase, etc.)
2. **Backward Compatible** - Existing NovoProtein code continues to work
3. **Type Safe** - Full TypeScript support with interfaces
4. **Flexible** - Use adapters, configuration, or both
5. **Testable** - Easy to mock adapters for testing

## Best Practices

1. **Use Adapters for Complex Backends** - If your API structure is significantly different, implement a custom adapter
2. **Use Configuration for Simple Changes** - If you just need to change endpoints, use configuration
3. **Handle Errors Gracefully** - Adapters should throw errors that can be caught and handled by the library
4. **Transform Dates** - Ensure date strings are converted to Date objects in `load()` and `list()`
5. **Support Filtering** - Implement filtering in `list()` for better performance

## Troubleshooting

### Adapter Not Being Used

If your custom adapter isn't being used, check:

1. Is it passed to `PipelineCanvasProvider`?
2. Is `apiClient` also provided? (The default adapter might be created instead)
3. Check console logs for adapter creation messages

### Date Conversion Issues

If dates aren't working correctly:

```typescript
// In your adapter's load() method
async load(id: string): Promise<Pipeline> {
  const response = await fetch(`/api/pipelines/${id}`);
  const data = await response.json();
  
  // Convert date strings to Date objects
  if (data.createdAt && typeof data.createdAt === 'string') {
    data.createdAt = new Date(data.createdAt);
  }
  if (data.updatedAt && typeof data.updatedAt === 'string') {
    data.updatedAt = new Date(data.updatedAt);
  }
  
  return data;
}
```

### Response Format Mismatch

If your API returns a different format, use response transformers:

```typescript
const config: PipelineConfig = {
  responseTransformers: {
    pipeline: (response) => {
      // Your API returns { workflow: {...} }
      return response.workflow;
    },
    list: (response) => {
      // Your API returns { items: [...] }
      return response.items;
    },
  },
};
```

## Future Enhancements

- **Reference Server Package** - A separate npm package with ready-to-use server implementations
- **GraphQL Support** - Adapter for GraphQL backends
- **WebSocket Support** - Real-time pipeline updates
- **Offline Support** - Local-first adapters with sync

## See Also

- [README.md](./README.md) - General library documentation
- [SETUP.md](./SETUP.md) - Setup and installation guide
- [types/adapters.ts](./types/adapters.ts) - Adapter interface definitions
- [types/config.ts](./types/config.ts) - Configuration type definitions
