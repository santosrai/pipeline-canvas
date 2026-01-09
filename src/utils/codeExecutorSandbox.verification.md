# Code Executor Sandbox Verification Guide

This guide provides step-by-step instructions to verify that the secure code executor sandbox is working correctly.

## Prerequisites

1. Application is running (`npm run dev`)
2. Browser DevTools are open (F12)
3. Access to the Code Editor or Chat Panel where code can be executed

## Verification Steps

### Step 1: Verify Builder API Methods

Execute the following code to test all MolstarBuilder methods:

```javascript
// Test loadStructure
await builder.loadStructure('1CBS');
console.log('✓ loadStructure works');

// Test addCartoonRepresentation
await builder.addCartoonRepresentation({ color: 'secondary-structure' });
console.log('✓ addCartoonRepresentation works');

// Test addBallAndStickRepresentation
await builder.addBallAndStickRepresentation({ color: 'element' });
console.log('✓ addBallAndStickRepresentation works');

// Test addSurfaceRepresentation
await builder.addSurfaceRepresentation({ color: 'hydrophobicity' });
console.log('✓ addSurfaceRepresentation works');

// Test addWaterRepresentation
await builder.addWaterRepresentation();
console.log('✓ addWaterRepresentation works');

// Test highlightLigands
await builder.highlightLigands();
console.log('✓ highlightLigands works');

// Test focusView
builder.focusView();
console.log('✓ focusView works');

// Test clearStructure
await builder.clearStructure();
console.log('✓ clearStructure works');

// Test highlightResidue
await builder.highlightResidue({ label_asym_id: 'A', label_seq_id: 50 }, { color: 'red' });
console.log('✓ highlightResidue works');

// Test labelResidue
await builder.labelResidue({ label_asym_id: 'A', label_seq_id: 50 }, 'Test Label');
console.log('✓ labelResidue works');

// Test focusResidue
await builder.focusResidue({ label_asym_id: 'A', label_seq_id: 50 });
console.log('✓ focusResidue works');

console.log('All builder methods verified!');
```

**Expected Result**: All methods should execute successfully and the structure should be visible in the MolStar viewer.

### Step 2: Verify Console API

Execute the following code:

```javascript
console.log('Test log message');
console.warn('Test warn message');
console.error('Test error message');
```

**Expected Result**: 
- Messages should appear in the browser console
- Messages should be prefixed with `[Molstar]`
- All three log levels should work

### Step 3: Verify MVS Builder (if available)

Execute the following code:

```javascript
if (mvs) {
  mvs.root();
  console.log('✓ MVS builder is available');
  // Test apply method
  await mvs.apply();
  console.log('✓ MVS apply works');
} else {
  console.log('INFO: MVS builder not available');
}
```

**Expected Result**: 
- If MVS builder is available, it should work correctly
- The `apply()` method should load the MVS specification into MolStar

### Step 4: Verify Async Operations

Execute the following code:

```javascript
async function testAsync() {
  await builder.loadStructure('1HHO');
  await builder.addCartoonRepresentation();
  builder.focusView();
  console.log('✓ Async operations work correctly');
}

await testAsync();
```

**Expected Result**: Should execute successfully with proper async/await handling.

### Step 5: Verify Error Handling

Execute the following code:

```javascript
try {
  await builder.loadStructure('INVALID_PDB_ID_XYZ');
  console.log('FAIL: Should have thrown error');
} catch (e) {
  console.log('✓ Error handling works:', e.message);
}

try {
  await builder.addCartoonRepresentation(); // No structure loaded
  console.log('FAIL: Should have thrown error');
} catch (e) {
  console.log('✓ Error handling works:', e.message);
}
```

**Expected Result**: 
- Both should catch errors correctly
- Error messages should be clear and helpful

### Step 6: Verify Timeout Handling

Execute the following code (this will timeout):

```javascript
console.log('Starting timeout test...');
await new Promise(resolve => setTimeout(resolve, 15000));
console.log('FAIL: Should have timed out');
```

**Expected Result**: 
- Should timeout after 10 seconds
- Should return an error message about execution timeout
- Should not hang indefinitely

### Step 7: Verify Security Restrictions

Execute the security test code from `testSandboxSecurity.ts`:

```javascript
// Import and run all security tests
// (See testSandboxSecurity.ts for the full test code)
```

Or manually test each restriction:

```javascript
// Test localStorage
try {
  localStorage.setItem('test', 'value');
  console.log('FAIL: localStorage accessible');
} catch (e) {
  console.log('✓ localStorage blocked:', e.message);
}

// Test sessionStorage
try {
  sessionStorage.setItem('test', 'value');
  console.log('FAIL: sessionStorage accessible');
} catch (e) {
  console.log('✓ sessionStorage blocked:', e.message);
}

// Test indexedDB
try {
  indexedDB.open('test');
  console.log('FAIL: indexedDB accessible');
} catch (e) {
  console.log('✓ indexedDB blocked:', e.message);
}

// Test document
try {
  document.createElement('div');
  console.log('FAIL: document accessible');
} catch (e) {
  console.log('✓ document blocked:', e.message);
}

// Test fetch
try {
  fetch('https://example.com');
  console.log('FAIL: fetch accessible');
} catch (e) {
  console.log('✓ fetch blocked:', e.message);
}

// Test XMLHttpRequest
try {
  new XMLHttpRequest();
  console.log('FAIL: XMLHttpRequest accessible');
} catch (e) {
  console.log('✓ XMLHttpRequest blocked:', e.message);
}

// Test WebSocket
try {
  new WebSocket('ws://example.com');
  console.log('FAIL: WebSocket accessible');
} catch (e) {
  console.log('✓ WebSocket blocked:', e.message);
}

// Test parent
try {
  const p = parent;
  console.log('FAIL: parent accessible');
} catch (e) {
  console.log('✓ parent blocked:', e.message);
}

// Test top
try {
  const t = top;
  console.log('FAIL: top accessible');
} catch (e) {
  console.log('✓ top blocked:', e.message);
}
```

**Expected Result**: All security restrictions should be in place and throw appropriate errors.

## Browser DevTools Inspection

1. Open DevTools (F12)
2. Go to the Elements tab
3. Search for `iframe[sandbox]`
4. Verify the iframe has `sandbox="allow-scripts"` attribute
5. Verify the iframe is hidden (display: none, width: 0, height: 0)

## Network Tab Inspection

1. Open DevTools (F12)
2. Go to the Network tab
3. Execute code that tries to use `fetch` or `XMLHttpRequest`
4. Verify no network requests are made

## Console Tab Inspection

1. Open DevTools (F12)
2. Go to the Console tab
3. Execute code through the CodeExecutor
4. Verify:
   - Console messages appear with `[Molstar]` prefix
   - Errors are properly caught and displayed
   - No security-related errors leak sensitive information

## Performance Considerations

- Code execution should complete within reasonable time (< 1 second for simple operations)
- Multiple executions should not cause memory leaks
- Iframe should be reused across executions (not recreated each time)

## Troubleshooting

### Issue: Builder methods not working

**Solution**: 
- Verify the MolStar plugin is initialized
- Check browser console for errors
- Ensure the iframe sandbox is ready before execution

### Issue: Security restrictions not working

**Solution**:
- Verify iframe has correct `sandbox` attribute
- Check that sandbox HTML is properly loaded
- Ensure postMessage communication is working

### Issue: Timeout not working

**Solution**:
- Verify timeout is set correctly (10 seconds default)
- Check that promise handling is working correctly
- Ensure cleanup happens on timeout

### Issue: MVS builder not available

**Solution**:
- This is expected if MVS extension is not loaded
- Check that MolStar MVS extension is properly imported
- Verify MVS builder creation in SandboxExecutor

## Success Criteria

All of the following should pass:

- [x] All MolstarBuilder methods work correctly
- [x] Console API works correctly
- [x] MVS builder works (if available)
- [x] Async operations work correctly
- [x] Error handling works correctly
- [x] Timeout handling works correctly
- [x] All security restrictions are in place
- [x] No memory leaks after multiple executions
- [x] Performance is acceptable
