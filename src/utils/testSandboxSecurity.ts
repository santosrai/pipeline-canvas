/**
 * Security Test Utility for Code Executor Sandbox
 * 
 * This utility provides test functions that can be executed in the sandbox
 * to verify security restrictions are working correctly.
 * 
 * Usage: Import these test functions and execute them through CodeExecutor
 * to verify the sandbox is properly secured.
 */

export const securityTests = {
  /**
   * Test that localStorage is blocked
   */
  testLocalStorage: `
    try {
      localStorage.setItem('test', 'value');
      throw new Error('FAIL: localStorage should be blocked');
    } catch (e) {
      if (e.message.includes('not available')) {
        console.log('PASS: localStorage is blocked');
      } else {
        throw e;
      }
    }
  `,

  /**
   * Test that sessionStorage is blocked
   */
  testSessionStorage: `
    try {
      sessionStorage.setItem('test', 'value');
      throw new Error('FAIL: sessionStorage should be blocked');
    } catch (e) {
      if (e.message.includes('not available')) {
        console.log('PASS: sessionStorage is blocked');
      } else {
        throw e;
      }
    }
  `,

  /**
   * Test that indexedDB is blocked
   */
  testIndexedDB: `
    try {
      indexedDB.open('test');
      throw new Error('FAIL: indexedDB should be blocked');
    } catch (e) {
      if (e.message.includes('not available')) {
        console.log('PASS: indexedDB is blocked');
      } else {
        throw e;
      }
    }
  `,

  /**
   * Test that document is blocked
   */
  testDocument: `
    try {
      document.createElement('div');
      throw new Error('FAIL: document should be blocked');
    } catch (e) {
      if (e.message.includes('not available')) {
        console.log('PASS: document is blocked');
      } else {
        throw e;
      }
    }
  `,

  /**
   * Test that fetch is blocked
   */
  testFetch: `
    try {
      fetch('https://example.com');
      throw new Error('FAIL: fetch should be blocked');
    } catch (e) {
      if (e.message.includes('not available')) {
        console.log('PASS: fetch is blocked');
      } else {
        throw e;
      }
    }
  `,

  /**
   * Test that XMLHttpRequest is blocked
   */
  testXMLHttpRequest: `
    try {
      new XMLHttpRequest();
      throw new Error('FAIL: XMLHttpRequest should be blocked');
    } catch (e) {
      if (e.message.includes('not available')) {
        console.log('PASS: XMLHttpRequest is blocked');
      } else {
        throw e;
      }
    }
  `,

  /**
   * Test that WebSocket is blocked
   */
  testWebSocket: `
    try {
      new WebSocket('ws://example.com');
      throw new Error('FAIL: WebSocket should be blocked');
    } catch (e) {
      if (e.message.includes('not available')) {
        console.log('PASS: WebSocket is blocked');
      } else {
        throw e;
      }
    }
  `,

  /**
   * Test that parent is blocked
   */
  testParent: `
    try {
      const p = parent;
      throw new Error('FAIL: parent should be blocked');
    } catch (e) {
      if (e.message.includes('not available')) {
        console.log('PASS: parent is blocked');
      } else {
        throw e;
      }
    }
  `,

  /**
   * Test that top is blocked
   */
  testTop: `
    try {
      const t = top;
      throw new Error('FAIL: top should be blocked');
    } catch (e) {
      if (e.message.includes('not available')) {
        console.log('PASS: top is blocked');
      } else {
        throw e;
      }
    }
  `,

  /**
   * Test that builder API works correctly
   */
  testBuilderAPI: `
    try {
      await builder.loadStructure('1CBS');
      await builder.addCartoonRepresentation({ color: 'secondary-structure' });
      builder.focusView();
      console.log('PASS: Builder API works correctly');
    } catch (e) {
      console.error('FAIL: Builder API error -', e.message);
      throw e;
    }
  `,

  /**
   * Test that console API works correctly
   */
  testConsoleAPI: `
    console.log('Test log message');
    console.warn('Test warn message');
    console.error('Test error message');
    console.log('PASS: Console API works correctly');
  `,

  /**
   * Test async operations
   */
  testAsyncOperations: `
    async function testAsync() {
      await builder.loadStructure('1CBS');
      console.log('PASS: Async operations work');
    }
    await testAsync();
  `,

  /**
   * Test error handling
   */
  testErrorHandling: `
    try {
      await builder.loadStructure('INVALID_PDB_ID');
      console.log('FAIL: Should have thrown error');
    } catch (e) {
      console.log('PASS: Error handling works -', e.message);
    }
  `,

  /**
   * Run all security tests
   */
  runAll: `
    console.log('=== Running Security Tests ===');
    
    // Storage APIs
    try {
      localStorage.setItem('test', 'value');
      console.log('FAIL: localStorage accessible');
    } catch (e) {
      console.log('PASS: localStorage blocked');
    }
    
    try {
      sessionStorage.setItem('test', 'value');
      console.log('FAIL: sessionStorage accessible');
    } catch (e) {
      console.log('PASS: sessionStorage blocked');
    }
    
    try {
      indexedDB.open('test');
      console.log('FAIL: indexedDB accessible');
    } catch (e) {
      console.log('PASS: indexedDB blocked');
    }
    
    // DOM APIs
    try {
      document.createElement('div');
      console.log('FAIL: document accessible');
    } catch (e) {
      console.log('PASS: document blocked');
    }
    
    // Network APIs
    try {
      fetch('https://example.com');
      console.log('FAIL: fetch accessible');
    } catch (e) {
      console.log('PASS: fetch blocked');
    }
    
    try {
      new XMLHttpRequest();
      console.log('FAIL: XMLHttpRequest accessible');
    } catch (e) {
      console.log('PASS: XMLHttpRequest blocked');
    }
    
    try {
      new WebSocket('ws://example.com');
      console.log('FAIL: WebSocket accessible');
    } catch (e) {
      console.log('PASS: WebSocket blocked');
    }
    
    // Parent access
    try {
      const p = parent;
      console.log('FAIL: parent accessible');
    } catch (e) {
      console.log('PASS: parent blocked');
    }
    
    try {
      const t = top;
      console.log('FAIL: top accessible');
    } catch (e) {
      console.log('PASS: top blocked');
    }
    
    console.log('=== Security Tests Complete ===');
  `
};

/**
 * Helper function to run a specific security test
 */
export function getSecurityTest(testName: keyof typeof securityTests): string {
  return securityTests[testName] || '';
}

/**
 * Helper function to run all security tests
 */
export function getAllSecurityTests(): string {
  return securityTests.runAll;
}
