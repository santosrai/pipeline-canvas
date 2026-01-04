import React, { useRef } from 'react';
import Editor from '@monaco-editor/react';
import { Play, RotateCcw, Copy, FileText, Save } from 'lucide-react';
import { useAppStore } from '../stores/appStore';
import { useChatHistoryStore } from '../stores/chatHistoryStore';
import { CodeExecutor } from '../utils/codeExecutor';

const defaultCode = `// Molstar Code Editor
// Your code will appear here when you interact with the viewer
// Example: await builder.loadStructure('1ABC');`;

export const CodeEditor: React.FC = () => {
  const { plugin, currentCode, setCurrentCode, isExecuting, setIsExecuting } = useAppStore();
  const { activeSessionId, saveVisualizationCode } = useChatHistoryStore();
  const editorRef = useRef<any>(null);

  // Removed automatic default code setting - editor starts empty
  // useEffect(() => {
  //   if (!currentCode) setCurrentCode(defaultCode);
  // }, [currentCode, setCurrentCode]);

  const handleEditorDidMount = (editor: any) => {
    editorRef.current = editor;
  };

  const executeCode = async () => {
    if (!currentCode.trim()) return;
    if (!plugin) {
      console.warn('[Molstar] Plugin not ready yet');
      return;
    }
    setIsExecuting(true);
    try {
      const exec = new CodeExecutor(plugin);
      const res = await exec.executeCode(currentCode);
      console.log('[Molstar] execute result:', res);
      
      // Save code to active session after successful execution (message-scoped if possible)
      if (activeSessionId && currentCode.trim()) {
        // Try to find the last AI message to link the canvas
        const chatStore = useChatHistoryStore.getState();
        const activeSession = chatStore.sessions.find(s => s.id === activeSessionId);
        const lastAiMessage = activeSession?.messages
          .filter(m => m.type === 'ai')
          .sort((a, b) => {
            const aTime = a.timestamp instanceof Date ? a.timestamp.getTime() : new Date(a.timestamp).getTime();
            const bTime = b.timestamp instanceof Date ? b.timestamp.getTime() : new Date(b.timestamp).getTime();
            return bTime - aTime;
          })[0];
        
        if (lastAiMessage?.id) {
          saveVisualizationCode(activeSessionId, currentCode, lastAiMessage.id);
          console.log('[CodeEditor] Saved visualization code to message-scoped canvas:', lastAiMessage.id);
        } else {
          // Fallback to session-scoped (deprecated)
          saveVisualizationCode(activeSessionId, currentCode);
          console.log('[CodeEditor] Saved visualization code to session (deprecated):', activeSessionId);
        }
      }
    } catch (e) {
      console.error('[Molstar] execute failed', e);
    } finally {
      setIsExecuting(false);
    }
  };

  const resetCode = () => {
    setCurrentCode(defaultCode);
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(currentCode);
      console.log('Code copied to clipboard');
    } catch (err) {
      console.error('Failed to copy code:', err);
    }
  };

  const loadExample = () => {
    const exampleCode = `// Example: DNA (1BNA)
try {
  await builder.loadStructure('1BNA');
  await builder.addCartoonRepresentation({ color: 'nucleotide' });
  builder.focusView();
} catch (e) { console.error(e); }`;
    setCurrentCode(exampleCode);
  };

  const saveSnapshot = () => {
    // currentCode already persisted via store; force write a timestamped key too
    try {
      const key = `novoprotein-code-snapshot-${Date.now()}`;
      localStorage.setItem(key, currentCode);
      console.log('Saved code snapshot to localStorage with key:', key);
    } catch (e) {
      console.error('Failed to save snapshot', e);
    }
  };

  return (
    <div className="h-full flex flex-col bg-white">
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center space-x-2">
          <FileText className="w-4 h-4 text-gray-600" />
          <span className="text-sm font-medium text-gray-700">Molstar Code</span>
        </div>
        
        <div className="flex items-center space-x-2">
          <button
            onClick={loadExample}
            className="px-3 py-1 text-xs bg-gray-200 hover:bg-gray-300 text-gray-700 rounded"
          >
            Example
          </button>
          <button
            onClick={saveSnapshot}
            className="p-1 text-gray-600 hover:text-gray-800"
            title="Save snapshot"
          >
            <Save className="w-4 h-4" />
          </button>
          <button
            onClick={copyCode}
            className="p-1 text-gray-600 hover:text-gray-800"
            title="Copy code"
          >
            <Copy className="w-4 h-4" />
          </button>
          <button
            onClick={resetCode}
            className="p-1 text-gray-600 hover:text-gray-800"
            title="Reset code"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <button
            onClick={executeCode}
            disabled={isExecuting}
            className="flex items-center space-x-1 px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-sm disabled:opacity-50"
          >
            <Play className="w-3 h-3" />
            <span>{isExecuting ? 'Running...' : 'Run'}</span>
          </button>
        </div>
      </div>

      <div className="flex-1">
        <Editor
          height="100%"
          defaultLanguage="javascript"
          value={currentCode}
          onChange={(value) => setCurrentCode(value || '')}
          onMount={handleEditorDidMount}
          theme="vs-light"
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            lineNumbers: 'on',
            wordWrap: 'on',
            automaticLayout: true,
            scrollBeyondLastLine: false,
            tabSize: 2,
            insertSpaces: true,
          }}
        />
      </div>
    </div>
  );
};