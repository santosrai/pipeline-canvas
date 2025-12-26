# Pipeline Node Development Guide

This guide covers best practices and common pitfalls when creating new pipeline nodes. It's based on lessons learned from real-world issues encountered during development.

## Table of Contents

1. [Node Initialization](#node-initialization)
2. [Execution State Management](#execution-state-management)
3. [Output Display](#output-display)
4. [User Experience](#user-experience)
5. [State Lifecycle](#state-lifecycle)
6. [Common Pitfalls](#common-pitfalls)

---

## Node Initialization

### ✅ Always Initialize with Default Config

**Problem:** When nodes are created, they start with an empty `config: {}` object, causing execution failures when required fields are missing.

**Solution:** Always load and apply default config when creating new nodes.

**Example:**

```typescript
// ❌ BAD - Empty config
const node: PipelineNode = {
  id: `node_${Date.now()}`,
  type: nodeType,
  config: {}, // Missing default values!
  // ...
};

// ✅ GOOD - Load default config
const handleAddNode = async (nodeType: NodeType) => {
  const defaultConfig = await getDefaultNodeConfig(nodeType);
  
  const node: PipelineNode = {
    id: `node_${Date.now()}`,
    type: nodeType,
    config: { ...defaultConfig }, // Apply defaults
    // ...
  };
  
  addNode(node);
};
```

**Location:** `src/components/pipeline-canvas/components/PipelineNodePalette.tsx`

**Key Points:**
- Use `getDefaultNodeConfig(nodeType)` from `nodeLoader.ts`
- Always spread default config: `{ ...defaultConfig }`
- Make the handler function `async` to await config loading

---

## Execution State Management

### ✅ Keep Execution Logs Accessible After Completion

**Problem:** Execution logs were cleared immediately after execution completed (`currentExecution: null`), preventing users from viewing results.

**Solution:** Keep `currentExecution` after completion, only clear it when a new execution starts.

**Example:**

```typescript
// ❌ BAD - Clears execution state
stopExecution: () => {
  if (currentExecution) {
    set({
      executionHistory: [completedExecution, ...executionHistory],
      currentExecution: null, // ❌ Logs lost!
    });
  }
}

// ✅ GOOD - Keep execution state for viewing
stopExecution: () => {
  if (currentExecution) {
    const completedExecution = {
      ...currentExecution,
      completedAt: new Date(),
      status: 'completed',
    };
    set({
      executionHistory: [completedExecution, ...executionHistory],
      currentExecution: completedExecution, // ✅ Keep for viewing
    });
  }
}
```

**Location:** `src/components/pipeline-canvas/store/pipelineStore.ts`

**Key Points:**
- Mark execution as `'completed'` instead of clearing it
- Only clear `currentExecution` when a new execution starts
- This allows users to view results after execution finishes

---

## Output Display

### ✅ Handle Multiple Data Structures

**Problem:** Output extraction logic failed when response data was in different structures (response.data, output.data, or output directly).

**Solution:** Implement multiple fallback strategies with proper null checks.

**Example:**

```typescript
// ✅ GOOD - Multiple fallback strategies
let outputData: any = null;

if (nodeLog?.response?.data !== undefined && nodeLog?.response?.data !== null) {
  // Priority 1: HTTP response data
  outputData = nodeLog.response.data;
} else if (nodeLog?.output !== undefined && nodeLog?.output !== null) {
  if (typeof nodeLog.output === 'object' && 'data' in nodeLog.output) {
    // Priority 2: Nested output.data
    outputData = nodeLog.output.data;
  } else {
    // Priority 3: Output directly
    outputData = nodeLog.output;
  }
}
```

**Location:** `src/components/pipeline-canvas/components/PipelineNodeConfig.tsx`

**Key Points:**
- Always check for `undefined` and `null` explicitly
- Use optional chaining (`?.`) to safely access nested properties
- Provide multiple fallback paths
- Handle both object and primitive data types

---

## User Experience

### ✅ Don't Force Navigation

**Problem:** Execution automatically switched to the executions panel, interrupting users who wanted to view results in the editor.

**Solution:** Keep users in their current view mode.

**Example:**

```typescript
// ❌ BAD - Forces navigation
startExecution: () => {
  set({
    isExecuting: true,
    currentExecution: newExecution,
    viewMode: 'executions', // ❌ Forces switch
  });
}

// ✅ GOOD - Preserves current view
startExecution: () => {
  set({
    isExecuting: true,
    currentExecution: newExecution,
    // ✅ Don't change viewMode - let users stay where they are
  });
}
```

**Location:** `src/components/pipeline-canvas/store/pipelineStore.ts`

**Key Points:**
- Never auto-switch view modes during execution
- Let users manually navigate if they want to see execution logs
- Keep execution status visible in the current view (canvas nodes show status)

---

## State Lifecycle

### ✅ Separate Execution Completion from State Clearing

**Problem:** Execution completion logic was mixed with state clearing, causing premature data loss.

**Solution:** Keep execution state until explicitly needed elsewhere.

**Example:**

```typescript
// ✅ GOOD - Separate concerns
// In PipelineExecution.tsx - when execution completes normally
if (!cancelled) {
  const state = usePipelineStore.getState();
  if (state.currentExecution) {
    const completedExecution = {
      ...state.currentExecution,
      completedAt: new Date(),
      status: 'completed' as const,
    };
    // Keep currentExecution for viewing, add to history
    usePipelineStore.setState({
      executionHistory: [completedExecution, ...state.executionHistory],
      currentExecution: completedExecution, // ✅ Keep accessible
      isExecuting: false,
    });
  }
}
```

**Key Points:**
- Execution completion ≠ State clearing
- Keep logs accessible until new execution starts
- Add to history but don't remove from current

---

## Common Pitfalls

### 1. Missing Default Config

**Symptom:** Node execution fails with "no endpoint specified" or similar errors.

**Fix:** Always load and apply `defaultConfig` when creating nodes.

```typescript
const defaultConfig = await getDefaultNodeConfig(nodeType);
config: { ...defaultConfig }
```

### 2. Execution Logs Disappear

**Symptom:** Output panel shows "Execute this node to view data" after successful execution.

**Fix:** Keep `currentExecution` after completion, don't set it to `null`.

```typescript
currentExecution: completedExecution // ✅ Keep it
// NOT: currentExecution: null // ❌ Don't clear
```

### 3. Forced Navigation

**Symptom:** Users are automatically redirected away from their current view.

**Fix:** Don't change `viewMode` in `startExecution()`.

```typescript
// Don't include: viewMode: 'executions'
```

### 4. Output Not Displaying

**Symptom:** Execution succeeds but output panel is empty.

**Fix:** Implement multiple fallback strategies for data extraction.

```typescript
// Check: response.data → output.data → output
```

### 5. Missing React Hooks

**Symptom:** `useEffect is not defined` error.

**Fix:** Always import hooks from React.

```typescript
import React, { useState, useRef, useEffect } from 'react';
```

---

## Checklist for New Nodes

When creating a new node type, ensure:

- [ ] Node JSON has `defaultConfig` section with all required fields
- [ ] `PipelineNodePalette.tsx` loads default config when creating nodes
- [ ] Execution engine handles the node's execution type
- [ ] Output extraction handles the node's response structure
- [ ] Node appears in the node palette
- [ ] Node has proper icon and color in metadata
- [ ] Required fields are marked in schema
- [ ] Execution config matches the node's behavior

---

## Testing Checklist

Before considering a node complete:

- [ ] Node can be added from palette
- [ ] Node initializes with default config
- [ ] Node can be configured via config panel
- [ ] Node executes successfully
- [ ] Output displays correctly after execution
- [ ] Execution logs persist after completion
- [ ] User stays in current view (no forced navigation)
- [ ] Error states display properly
- [ ] Node status updates correctly (idle → running → success/error)

---

## Related Files

- **Node Creation:** `src/components/pipeline-canvas/components/PipelineNodePalette.tsx`
- **Node Config:** `src/components/pipeline-canvas/components/PipelineNodeConfig.tsx`
- **Execution Engine:** `src/components/pipeline-canvas/utils/executionEngine.ts`
- **Store:** `src/components/pipeline-canvas/store/pipelineStore.ts`
- **Node Loader:** `src/components/pipeline-canvas/utils/nodeLoader.ts`
- **Execution:** `src/components/pipeline-canvas/components/PipelineExecution.tsx`

---

## Additional Resources

- [HTTP Request Node Spec](./http-request-node-spec.md) - Example of a complete node specification
- [Pipeline PRD](../PIPELINEPRD.md) - Overall pipeline architecture
- [Node JSON Schema](../PIPELINEPRD.md#node-json-configuration-schema) - Node configuration format

---

## Summary

**Key Principles:**

1. **Always initialize with defaults** - Never create nodes with empty config
2. **Preserve execution state** - Keep logs accessible after completion
3. **Don't force navigation** - Respect user's current view
4. **Handle edge cases** - Multiple fallback strategies for data extraction
5. **Separate concerns** - Execution completion ≠ State clearing

Following these principles will prevent common issues and ensure a smooth user experience.

