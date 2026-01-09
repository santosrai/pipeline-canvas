# Code Executor Sandbox Security Tests

This document describes how to verify that the iframe sandbox properly blocks dangerous APIs while allowing safe code execution.

## Security Requirements

The sandbox must block:
1. **Storage APIs**: `localStorage`, `sessionStorage`, `IndexedDB`
2. **DOM APIs**: `document`, `window` (restricted)
3. **Network APIs**: `fetch`, `XMLHttpRequest`, `WebSocket`
4. **Parent Access**: `parent`, `top` (blocked for user code, but available for postMessage)

## Manual Testing

### Test 1: Storage API Blocking

**Test Code:**
```javascript
try {
  localStorage.setItem('test', 'value');
  console.log('FAIL: localStorage accessible');
} catch (e) {
  console.log('PASS: localStorage blocked -', e.message);
}

try {
  sessionStorage.setItem('test', 'value');
  console.log('FAIL: sessionStorage accessible');
} catch (e) {
  console.log('PASS: sessionStorage blocked -', e.message);
}

try {
  const db = indexedDB.open('test');
  console.log('FAIL: indexedDB accessible');
} catch (e) {
  console.log('PASS: indexedDB blocked -', e.message);
}
```

**Expected Result**: All three should throw errors with messages indicating the APIs are not available.

### Test 2: DOM API Blocking

**Test Code:**
```javascript
try {
  const el = document.createElement('div');
  console.log('FAIL: document accessible');
} catch (e) {
  console.log('PASS: document blocked -', e.message);
}

try {
  const win = window.location;
  console.log('FAIL: window.location accessible');
} catch (e) {
  console.log('PASS: window.location blocked -', e.message);
}
```

**Expected Result**: Both should throw errors.

### Test 3: Network API Blocking

**Test Code:**
```javascript
try {
  fetch('https://example.com');
  console.log('FAIL: fetch accessible');
} catch (e) {
  console.log('PASS: fetch blocked -', e.message);
}

try {
  const xhr = new XMLHttpRequest();
  console.log('FAIL: XMLHttpRequest accessible');
} catch (e) {
  console.log('PASS: XMLHttpRequest blocked -', e.message);
}

try {
  const ws = new WebSocket('ws://example.com');
  console.log('FAIL: WebSocket accessible');
} catch (e) {
  console.log('PASS: WebSocket blocked -', e.message);
}
```

**Expected Result**: All three should throw errors.

### Test 4: Parent Window Access Blocking

**Test Code:**
```javascript
try {
  const p = parent;
  console.log('FAIL: parent accessible');
} catch (e) {
  console.log('PASS: parent blocked -', e.message);
}

try {
  const t = top;
  console.log('FAIL: top accessible');
} catch (e) {
  console.log('PASS: top blocked -', e.message);
}
```

**Expected Result**: Both should throw errors.

### Test 5: Builder API Functionality

**Test Code:**
```javascript
try {
  await builder.loadStructure('1CBS');
  await builder.addCartoonRepresentation({ color: 'secondary-structure' });
  builder.focusView();
  console.log('PASS: Builder API works correctly');
} catch (e) {
  console.log('FAIL: Builder API error -', e.message);
}
```

**Expected Result**: Should execute successfully and load the structure.

### Test 6: Console API Functionality

**Test Code:**
```javascript
console.log('Test log message');
console.warn('Test warn message');
console.error('Test error message');
console.log('PASS: Console API works correctly');
```

**Expected Result**: Messages should appear in parent window console with `[Molstar]` prefix.

### Test 7: MVS Builder Functionality

**Test Code:**
```javascript
try {
  if (mvs) {
    // Use MVS builder methods
    mvs.root();
    console.log('PASS: MVS builder accessible');
  } else {
    console.log('INFO: MVS builder not available');
  }
} catch (e) {
  console.log('FAIL: MVS builder error -', e.message);
}
```

**Expected Result**: Should work if MVS builder is available.

### Test 8: Async Operations

**Test Code:**
```javascript
async function testAsync() {
  await builder.loadStructure('1CBS');
  console.log('PASS: Async operations work');
}
await testAsync();
```

**Expected Result**: Should execute successfully.

### Test 9: Error Handling

**Test Code:**
```javascript
try {
  await builder.loadStructure('INVALID');
  console.log('FAIL: Should have thrown error');
} catch (e) {
  console.log('PASS: Error handling works -', e.message);
}
```

**Expected Result**: Should catch and report the error correctly.

### Test 10: Timeout Handling

**Test Code:**
```javascript
// This test requires a long-running operation
// The executor should timeout after 10 seconds
console.log('Testing timeout...');
await new Promise(resolve => setTimeout(resolve, 15000));
console.log('FAIL: Should have timed out');
```

**Expected Result**: Should timeout after 10 seconds with appropriate error message.

## Automated Testing

To create automated tests, you can:

1. **Use Playwright** to load the application and execute test code through the CodeEditor component
2. **Create a test page** that uses CodeExecutor directly and verifies security restrictions
3. **Use browser DevTools** to inspect the iframe and verify sandbox attributes

## Browser DevTools Inspection

1. Open browser DevTools (F12)
2. Navigate to the application
3. Open the Console tab
4. Execute code that tries to access blocked APIs
5. Verify errors are thrown
6. Inspect the iframe element:
   ```javascript
   // In browser console
   const iframe = document.querySelector('iframe[sandbox]');
   console.log(iframe.getAttribute('sandbox')); // Should be "allow-scripts"
   ```

## Security Checklist

- [x] Iframe uses `sandbox="allow-scripts"` (no `allow-same-origin`)
- [x] Storage APIs (`localStorage`, `sessionStorage`, `IndexedDB`) are blocked
- [x] DOM APIs (`document`, `window`) are blocked
- [x] Network APIs (`fetch`, `XMLHttpRequest`, `WebSocket`) are blocked
- [x] Parent window access (`parent`, `top`) is blocked for user code
- [x] All API calls go through postMessage proxy
- [x] Timeout mechanism works in sandbox context
- [x] Error messages don't leak sensitive information
