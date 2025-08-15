import { Header } from './components/Header';
import { ChatPanel } from './components/ChatPanel';
import { CodeEditor } from './components/CodeEditor';
import { MolstarViewer } from './components/MolstarViewer';
import { SettingsDialog } from './components/SettingsDialog';
import { ChatHistoryPanel } from './components/ChatHistoryPanel';
import { ResizablePanel } from './components/ResizablePanel';
import { Eye, Code2, Settings } from 'lucide-react';
import { useAppStore } from './stores/appStore';
import { useSettingsStore } from './stores/settingsStore';
import { useChatHistoryStore } from './stores/chatHistoryStore';
import { useEffect } from 'react';

function App() {
  const { activePane, setActivePane, chatPanelWidth, setChatPanelWidth } = useAppStore();
  const { settings, isSettingsDialogOpen, setSettingsDialogOpen } = useSettingsStore();
  const { isHistoryPanelOpen, setHistoryPanelOpen } = useChatHistoryStore();
  
  // Auto-switch to viewer when editor gets disabled
  useEffect(() => {
    if (!settings.codeEditor.enabled && activePane === 'editor') {
      setActivePane('viewer');
    }
  }, [settings.codeEditor.enabled, activePane, setActivePane]);

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <Header />
      
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Resizable Chat */}
        <ResizablePanel
          defaultWidth={chatPanelWidth}
          minWidth={280}
          maxWidth={800}
          position="left"
          onWidthChange={setChatPanelWidth}
          className="bg-white"
        >
          <ChatPanel />
        </ResizablePanel>
        
        {/* Right Panel - Toolbar + Pane */}
        <div className="flex-1 flex flex-col">
          {/* Toolbar */}
          <div className="h-10 flex items-center justify-between px-3 border-b border-gray-200 bg-gray-900">
            {/* Editor disabled message */}
            {!settings.codeEditor.enabled && (
              <div className="text-xs text-gray-400 flex items-center space-x-2">
                <Settings className="w-3 h-3" />
                <span>Code editor hidden - enable in Settings</span>
              </div>
            )}
            
            <div className="inline-flex rounded-full overflow-hidden ml-auto">
              <button
                onClick={() => setActivePane('viewer')}
                className={`px-3 h-8 flex items-center gap-1 text-xs ${activePane === 'viewer' ? 'bg-gray-800 text-white' : 'bg-gray-700 text-gray-200 hover:bg-gray-600'}`}
                title="Show viewer"
              >
                <Eye className="w-4 h-4" />
              </button>
              {settings.codeEditor.enabled && (
                <button
                  onClick={() => setActivePane('editor')}
                  className={`px-3 h-8 flex items-center gap-1 text-xs ${activePane === 'editor' ? 'bg-gray-800 text-white' : 'bg-gray-700 text-gray-200 hover:bg-gray-600'}`}
                  title="Show editor"
                >
                  <Code2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Content Pane with fixed, responsive height */}
          <div className="flex-1 min-h-0">
            {activePane === 'editor' && settings.codeEditor.enabled ? (
              <div className="h-full">
                <CodeEditor />
              </div>
            ) : (
              <div className="h-full bg-gray-900">
                <MolstarViewer />
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Settings Dialog */}
      <SettingsDialog 
        isOpen={isSettingsDialogOpen}
        onClose={() => setSettingsDialogOpen(false)}
      />
      
      {/* Chat History Panel */}
      <ChatHistoryPanel 
        isOpen={isHistoryPanelOpen}
        onClose={() => setHistoryPanelOpen(false)}
      />
    </div>
  );
}

export default App;