import React, { useEffect } from 'react';
import { Atom, Settings, HelpCircle, Box, Workflow } from 'lucide-react';
import { useSettingsStore } from '../stores/settingsStore';
import { useAppStore } from '../stores/appStore';
import { useChatHistoryStore } from '../stores/chatHistoryStore';

export const Header: React.FC = () => {
  const { setSettingsDialogOpen } = useSettingsStore();
  const { isViewerVisible, setViewerVisible, setActivePane } = useAppStore();
  const { activeSessionId, saveViewerVisibility } = useChatHistoryStore();
  
  const handleOpenPipeline = () => {
    if (setActivePane) {
      setActivePane('pipeline' as any);
    }
    if (!isViewerVisible) {
      setViewerVisible(true);
    }
  };
  
  const handleOpenPipelineManager = () => {
    // Open pipeline manager - will be handled by App component
    window.dispatchEvent(new CustomEvent('open-pipeline-manager'));
  };
  
  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault();
        setSettingsDialogOpen(true);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setSettingsDialogOpen]);
  
  const handleToggleViewer = () => {
    const newVisibility = !isViewerVisible;
    setViewerVisible(newVisibility);
    // Save to active session
    if (activeSessionId) {
      saveViewerVisibility(activeSessionId, newVisibility);
    }
  };
  
  return (
    <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
      <div className="flex items-center space-x-2">
        <Atom className="w-8 h-8 text-blue-600" />
        <h1 className="text-xl font-bold text-gray-900">NovoProtein AI</h1>
        <span className="text-sm text-gray-500">Molecular Visualization Platform</span>
      </div>
      
      <div className="flex items-center space-x-4">
        {/* Toggle Switch */}
        <div className="flex items-center space-x-2">
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={isViewerVisible}
              onChange={handleToggleViewer}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
          </label>
        </div>
        
        {/* 3D Visual Editor Button */}
        <button
          onClick={handleToggleViewer}
          className="flex items-center space-x-1 px-3 py-1 text-sm text-gray-600 hover:text-gray-900 transition-colors"
          title="Toggle 3D Visual Editor"
        >
          <Box className="w-4 h-4" />
          <span>3D Visual Editor</span>
        </button>
        
        {/* Pipeline Canvas Button */}
        <button
          onClick={handleOpenPipeline}
          className="flex items-center space-x-1 px-3 py-1 text-sm text-gray-600 hover:text-gray-900 transition-colors"
          title="Open Pipeline Canvas"
        >
          <Workflow className="w-4 h-4" />
          <span>Pipeline Canvas</span>
        </button>
        
        {/* Pipeline Manager Button */}
        <button
          onClick={handleOpenPipelineManager}
          className="flex items-center space-x-1 px-3 py-1 text-sm text-blue-600 hover:text-blue-800 transition-colors border border-blue-300 rounded-md"
          title="Open Pipeline Manager"
        >
          <Workflow className="w-4 h-4" />
          <span>Pipelines</span>
        </button>
        
        <button className="flex items-center space-x-1 px-3 py-1 text-sm text-gray-600 hover:text-gray-900">
          <HelpCircle className="w-4 h-4" />
          <span>Help</span>
        </button>
        <button 
          onClick={() => setSettingsDialogOpen(true)}
          className="flex items-center space-x-1 px-3 py-1 text-sm text-gray-600 hover:text-gray-900 transition-colors"
          title="Open Settings (Ctrl+,)"
        >
          <Settings className="w-4 h-4" />
          <span>Settings</span>
        </button>
      </div>
    </header>
  );
};