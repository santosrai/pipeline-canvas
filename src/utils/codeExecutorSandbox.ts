import { PluginUIContext } from 'molstar/lib/mol-plugin-ui/context';
import { MolstarBuilder } from './molstarBuilder';
import { ExecutionResult } from './codeExecutor';
import { createMVSBuilder } from 'molstar/lib/extensions/mvs/tree/mvs/mvs-builder';
import { loadMVS } from 'molstar/lib/extensions/mvs/load';

// PostMessage protocol types
interface SandboxMessage {
  type: 'EXECUTE' | 'RESULT' | 'ERROR' | 'API_CALL' | 'API_RESPONSE' | 'READY';
  id: string;
  payload?: any;
}

interface APICall {
  object: 'builder' | 'mvs' | 'console';
  method: string;
  args: any[];
}

// Sandbox HTML template with strict security
const SANDBOX_HTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval';">
  <title>Code Sandbox</title>
</head>
<body>
  <script>
    (function() {
      'use strict';
      
      // Block Storage APIs
      try {
        Object.defineProperty(window, 'localStorage', {
          get: function() { throw new Error('localStorage is not available'); },
          configurable: false
        });
      } catch(e) {}
      
      try {
        Object.defineProperty(window, 'sessionStorage', {
          get: function() { throw new Error('sessionStorage is not available'); },
          configurable: false
        });
      } catch(e) {}
      
      try {
        Object.defineProperty(window, 'indexedDB', {
          get: function() { throw new Error('indexedDB is not available'); },
          configurable: false
        });
      } catch(e) {}
      
      // Block DOM access
      try {
        Object.defineProperty(window, 'document', {
          get: function() { throw new Error('document is not available'); },
          configurable: false
        });
      } catch(e) {}
      
      // Store parent reference before blocking (needed for postMessage)
      const parentWindow = window.parent;
      
      // Block parent/top access (but keep reference for postMessage)
      try {
        Object.defineProperty(window, 'parent', {
          get: function() { throw new Error('parent is not available'); },
          configurable: false
        });
      } catch(e) {}
      
      try {
        Object.defineProperty(window, 'top', {
          get: function() { throw new Error('top is not available'); },
          configurable: false
        });
      } catch(e) {}
      
      // Block network APIs
      try {
        Object.defineProperty(window, 'fetch', {
          get: function() { throw new Error('fetch is not available'); },
          configurable: false
        });
      } catch(e) {}
      
      try {
        Object.defineProperty(window, 'XMLHttpRequest', {
          get: function() { throw new Error('XMLHttpRequest is not available'); },
          configurable: false
        });
      } catch(e) {}
      
      // Block WebSocket
      try {
        Object.defineProperty(window, 'WebSocket', {
          get: function() { throw new Error('WebSocket is not available'); },
          configurable: false
        });
      } catch(e) {}
      
      // Message handler
      let callIdCounter = 0;
      const pendingCalls = new Map();
      
      // Create proxy objects for builder, mvs, and console
      function createProxy(objectName) {
        return new Proxy({}, {
          get: function(target, prop) {
            if (typeof prop === 'string') {
              return function(...args) {
                return new Promise((resolve, reject) => {
                  const callId = 'call-' + (++callIdCounter);
                  pendingCalls.set(callId, { resolve, reject });
                  
                  parentWindow.postMessage({
                    type: 'API_CALL',
                    id: callId,
                    payload: {
                      object: objectName,
                      method: prop,
                      args: args
                    }
                  }, '*');
                  
                  // Timeout after 30 seconds
                  setTimeout(() => {
                    if (pendingCalls.has(callId)) {
                      pendingCalls.delete(callId);
                      reject(new Error('API call timeout'));
                    }
                  }, 30000);
                });
              };
            }
            return undefined;
          }
        });
      }
      
      // Create console proxy (synchronous, no promise)
      const consoleProxy = {
        log: function(...args) {
          parentWindow.postMessage({
            type: 'API_CALL',
            id: 'console-log-' + Date.now(),
            payload: {
              object: 'console',
              method: 'log',
              args: args
            }
          }, '*');
        },
        error: function(...args) {
          parentWindow.postMessage({
            type: 'API_CALL',
            id: 'console-error-' + Date.now(),
            payload: {
              object: 'console',
              method: 'error',
              args: args
            }
          }, '*');
        },
        warn: function(...args) {
          parentWindow.postMessage({
            type: 'API_CALL',
            id: 'console-warn-' + Date.now(),
            payload: {
              object: 'console',
              method: 'warn',
              args: args
            }
          }, '*');
        }
      };
      
      // Listen for API responses
      window.addEventListener('message', function(event) {
        if (event.data && event.data.type === 'API_RESPONSE') {
          const { id, payload } = event.data;
          const pending = pendingCalls.get(id);
          if (pending) {
            pendingCalls.delete(id);
            if (payload.success) {
              pending.resolve(payload.result);
            } else {
              pending.reject(new Error(payload.error || 'API call failed'));
            }
          }
        } else if (event.data && event.data.type === 'EXECUTE') {
          // Execute user code
          const code = event.data.payload.code;
          const executionId = event.data.id;
          
          try {
            // Create execution context
            const builder = createProxy('builder');
            const mvs = createProxy('mvs');
            const console = consoleProxy;
            
            // Wrap code in async function
            const wrappedCode = \`
              (async function() {
                \${code}
              })();
            \`;
            
            // Execute code
            const result = eval(wrappedCode);
            
            // Handle promise result
            if (result && typeof result.then === 'function') {
              result
                .then(function(value) {
                  parentWindow.postMessage({
                    type: 'RESULT',
                    id: executionId,
                    payload: { success: true, result: value }
                  }, '*');
                })
                .catch(function(error) {
                  parentWindow.postMessage({
                    type: 'ERROR',
                    id: executionId,
                    payload: { 
                      success: false, 
                      error: error.message || String(error),
                      stack: error.stack
                    }
                  }, '*');
                });
            } else {
              parentWindow.postMessage({
                type: 'RESULT',
                id: executionId,
                payload: { success: true, result: result }
              }, '*');
            }
          } catch (error) {
            parentWindow.postMessage({
              type: 'ERROR',
              id: executionId,
              payload: { 
                success: false, 
                error: error.message || String(error),
                stack: error.stack
              }
            }, '*');
          }
        }
      });
      
      // Signal ready
      parentWindow.postMessage({ type: 'READY', id: 'ready' }, '*');
    })();
  </script>
</body>
</html>
`;

export class SandboxExecutor {
  private iframe: HTMLIFrameElement | null = null;
  private messageHandlers: Map<string, { resolve: (value: any) => void; reject: (error: any) => void }> = new Map();
  private plugin: PluginUIContext;
  private builder: MolstarBuilder;
  private mvsBuilder: any = null;
  private ready: Promise<void>;
  private readyResolve: (() => void) | null = null;
  private onStructureLoaded?: (pdbIdOrUrl: string) => void;

  constructor(plugin: PluginUIContext, builder: MolstarBuilder, onStructureLoaded?: (pdbIdOrUrl: string) => void) {
    this.plugin = plugin;
    this.builder = builder;
    this.onStructureLoaded = onStructureLoaded;
    
    // Create MVS builder in parent window
    try {
      this.mvsBuilder = createMVSBuilder();
    } catch (e) {
      console.warn('[Sandbox] Failed to create MVS builder:', e);
    }
    
    // Setup ready promise
    this.ready = new Promise((resolve) => {
      this.readyResolve = resolve;
    });
    
    this.createIframe();
    this.setupMessageListener();
  }

  private createIframe(): void {
    // Remove existing iframe if present
    if (this.iframe) {
      this.iframe.remove();
      this.iframe = null;
    }

    // Create new iframe with strict sandbox
    this.iframe = document.createElement('iframe');
    this.iframe.setAttribute('sandbox', 'allow-scripts');
    this.iframe.style.display = 'none';
    this.iframe.style.width = '0';
    this.iframe.style.height = '0';
    this.iframe.style.border = 'none';
    
    // Set sandbox HTML content
    const blob = new Blob([SANDBOX_HTML], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    this.iframe.src = url;
    
    // Append to body
    document.body.appendChild(this.iframe);
    
    // Cleanup URL after load
    this.iframe.onload = () => {
      URL.revokeObjectURL(url);
    };
  }

  private setupMessageListener(): void {
    window.addEventListener('message', (event) => {
      // Security: Only accept messages from our iframe
      if (event.source !== this.iframe?.contentWindow) {
        return;
      }

      const message = event.data as SandboxMessage;
      
      if (!message || !message.type) {
        return;
      }

      switch (message.type) {
        case 'READY':
          if (this.readyResolve) {
            this.readyResolve();
            this.readyResolve = null;
          }
          break;

        case 'API_CALL':
          this.handleAPICall(message.payload as APICall, message.id);
          break;

        case 'RESULT':
        case 'ERROR':
          const handler = this.messageHandlers.get(message.id);
          if (handler) {
            this.messageHandlers.delete(message.id);
            if (message.type === 'RESULT') {
              handler.resolve(message.payload);
            } else {
              handler.reject(new Error(message.payload?.error || 'Execution failed'));
            }
          }
          break;
      }
    });
  }

  /**
   * Safely serialize a value for postMessage.
   * Removes functions, circular references, and other non-serializable values.
   */
  private serializeForPostMessage(value: any): any {
    // For builder and MVS methods, we don't need to return complex objects
    // They're fire-and-forget operations that modify the viewer state
    if (value === null || value === undefined) {
      return undefined;
    }
    
    // Primitive types are safe
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return value;
    }
    
    // Functions cannot be serialized
    if (typeof value === 'function') {
      return undefined;
    }
    
    // For complex objects (like MolStar structures), return undefined
    // The user code doesn't need these objects - operations are fire-and-forget
    if (typeof value === 'object') {
      // Check if it's a simple array of primitives
      if (Array.isArray(value)) {
        const serialized = value
          .map(item => this.serializeForPostMessage(item))
          .filter(item => item !== undefined);
        return serialized.length > 0 ? serialized : undefined;
      }
      
      // For objects, check if they have functions or complex nested structures
      try {
        // Try to serialize as JSON - this will fail for functions and circular refs
        JSON.stringify(value);
        // If it serializes, return it
        return value;
      } catch {
        // If it can't be serialized, return undefined
        return undefined;
      }
    }
    
    return undefined;
  }

  private async handleAPICall(call: APICall, callId: string): Promise<void> {
    try {
      let result: any;

      if (call.object === 'builder') {
        // Call builder method
        const method = (this.builder as any)[call.method];
        if (typeof method === 'function') {
          result = await method.apply(this.builder, call.args);
          
          // Track structure loads for AI context
          if (call.method === 'loadStructure' && call.args && call.args.length > 0) {
            const pdbIdOrUrl = call.args[0];
            if (this.onStructureLoaded) {
              try {
                this.onStructureLoaded(pdbIdOrUrl);
              } catch (e) {
                // Ignore errors in callback
                console.warn('[Sandbox] Error in onStructureLoaded callback:', e);
              }
            }
          }
          
          // Builder methods return complex objects (like structure) that can't be serialized
          // Since these are fire-and-forget operations, we return undefined
          result = undefined;
        } else {
          throw new Error(`Builder method ${call.method} not found`);
        }
      } else if (call.object === 'mvs') {
        // Handle MVS builder methods
        if (!this.mvsBuilder) {
          throw new Error('MVS builder not available');
        }

        if (call.method === 'apply') {
          // Special handling for apply - serialize state and load
          const mvsState = this.mvsBuilder.getState();
          await loadMVS(this.plugin, mvsState);
          result = undefined;
        } else {
          // Call other MVS builder methods
          const method = (this.mvsBuilder as any)[call.method];
          if (typeof method === 'function') {
            result = await method.apply(this.mvsBuilder, call.args);
            // MVS builder methods often return the builder itself for chaining
            // This can't be serialized, so return undefined
            // The proxy in the sandbox will handle chaining by returning itself
            result = undefined;
          } else {
            throw new Error(`MVS method ${call.method} not found`);
          }
        }
      } else if (call.object === 'console') {
        // Handle console methods (synchronous, no response needed)
        const method = (console as any)[call.method];
        if (typeof method === 'function') {
          method('[Molstar]', ...call.args);
        }
        // Console methods don't return values, so we don't send a response
        return;
      } else {
        throw new Error(`Unknown object: ${call.object}`);
      }

      // Send success response (skip for console)
      if (call.object !== 'console' && this.iframe?.contentWindow) {
        // Serialize result to ensure it can be sent through postMessage
        const serializedResult = this.serializeForPostMessage(result);
        
        this.iframe.contentWindow.postMessage({
          type: 'API_RESPONSE',
          id: callId,
          payload: { success: true, result: serializedResult }
        }, '*');
      }
    } catch (error) {
      // Send error response
      if (this.iframe?.contentWindow) {
        this.iframe.contentWindow.postMessage({
          type: 'API_RESPONSE',
          id: callId,
          payload: {
            success: false,
            error: error instanceof Error ? error.message : String(error)
          }
        }, '*');
      }
    }
  }

  private sendToSandbox(message: SandboxMessage): void {
    if (!this.iframe?.contentWindow) {
      throw new Error('Sandbox iframe not ready');
    }
    this.iframe.contentWindow.postMessage(message, '*');
  }

  async executeCode(code: string, timeout: number = 10000): Promise<ExecutionResult> {
    // Wait for iframe to be ready
    await this.ready;

    return new Promise((resolve, reject) => {
      const executionId = 'exec-' + Date.now() + '-' + Math.random();

      // Set up timeout
      const timer = setTimeout(() => {
        this.messageHandlers.delete(executionId);
        resolve({
          success: false,
          message: 'Execution timeout',
          error: 'Execution exceeded timeout of ' + timeout + 'ms'
        });
      }, timeout);

      // Set up result handler
      this.messageHandlers.set(executionId, {
        resolve: (payload) => {
          clearTimeout(timer);
          resolve({
            success: payload.success !== false,
            message: payload.success !== false ? 'Code executed successfully' : 'Execution failed',
            error: payload.error
          });
        },
        reject: (error) => {
          clearTimeout(timer);
          resolve({
            success: false,
            message: 'Execution failed',
            error: error instanceof Error ? error.message : String(error)
          });
        }
      });

      // Send execute message
      try {
        this.sendToSandbox({
          type: 'EXECUTE',
          id: executionId,
          payload: { code }
        });
      } catch (error) {
        clearTimeout(timer);
        this.messageHandlers.delete(executionId);
        resolve({
          success: false,
          message: 'Failed to send code to sandbox',
          error: error instanceof Error ? error.message : String(error)
        });
      }
    });
  }

  cleanup(): void {
    if (this.iframe) {
      this.iframe.remove();
      this.iframe = null;
    }
    this.messageHandlers.clear();
  }
}
