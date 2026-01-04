import React, { useState } from 'react';
import { Atom, Box, Workflow, Menu, X } from 'lucide-react';
import { useAppStore } from '../stores/appStore';
import { useChatHistoryStore } from '../stores/chatHistoryStore';
import { ProfileMenu } from './auth/ProfileMenu';

export const Header: React.FC = () => {
  const { isViewerVisible, setViewerVisible, setActivePane } = useAppStore();
  const { activeSessionId, saveViewerVisibility } = useChatHistoryStore();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  const handleOpenPipeline = () => {
    if (setActivePane) {
      setActivePane('pipeline' as any);
    }
    if (!isViewerVisible) {
      setViewerVisible(true);
    }
    setIsMobileMenuOpen(false);
  };
  
  const handleOpenPipelineManager = () => {
    // Open pipeline manager - will be handled by App component
    window.dispatchEvent(new CustomEvent('open-pipeline-manager'));
    setIsMobileMenuOpen(false);
  };
  
  const handleToggleViewer = () => {
    const newVisibility = !isViewerVisible;
    setViewerVisible(newVisibility);
    // Save to active session
    if (activeSessionId) {
      saveViewerVisibility(activeSessionId, newVisibility);
    }
    setIsMobileMenuOpen(false);
  };
  
  return (
    <header className="bg-white border-b border-gray-200 px-3 sm:px-4 py-2 sm:py-3 flex items-center justify-between relative">
      <div className="flex items-center space-x-2 min-w-0 flex-shrink">
        <Atom className="w-6 h-6 sm:w-8 sm:h-8 text-blue-600 flex-shrink-0" />
        <h1 className="text-lg sm:text-xl font-bold text-gray-900 truncate">NovoProtein AI</h1>
        <span className="hidden sm:inline text-sm text-gray-500">Molecular Visualization Platform</span>
      </div>
      
      {/* Desktop Menu */}
      <div className="hidden md:flex items-center space-x-2 lg:space-x-4">
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
          className="flex items-center space-x-1 px-2 lg:px-3 py-1 text-xs lg:text-sm text-gray-600 hover:text-gray-900 transition-colors"
          title="Toggle 3D Visual Editor"
        >
          <Box className="w-4 h-4" />
          <span className="hidden lg:inline">3D Visual Editor</span>
        </button>
        
        {/* Pipeline Canvas Button */}
        <button
          onClick={handleOpenPipeline}
          className="flex items-center space-x-1 px-2 lg:px-3 py-1 text-xs lg:text-sm text-gray-600 hover:text-gray-900 transition-colors"
          title="Open Pipeline Canvas"
        >
          <Workflow className="w-4 h-4" />
          <span className="hidden lg:inline">Pipeline Canvas</span>
        </button>
        
        {/* Pipeline Manager Button */}
        <button
          onClick={handleOpenPipelineManager}
          className="flex items-center space-x-1 px-2 lg:px-3 py-1 text-xs lg:text-sm text-blue-600 hover:text-blue-800 transition-colors border border-blue-300 rounded-md"
          title="Open Pipeline Manager"
        >
          <Workflow className="w-4 h-4" />
          <span className="hidden lg:inline">Pipelines</span>
        </button>
        
        <ProfileMenu />
      </div>

      {/* Mobile Menu Button */}
      <div className="md:hidden flex items-center space-x-2">
        <ProfileMenu />
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"
          aria-label="Toggle menu"
        >
          {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile Menu Dropdown */}
      {isMobileMenuOpen && (
        <>
          <div 
            className="fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden"
            onClick={() => setIsMobileMenuOpen(false)}
          />
          <div className="absolute top-full left-0 right-0 bg-white border-b border-gray-200 shadow-lg z-50 md:hidden">
            <div className="px-4 py-3 space-y-3">
              {/* Toggle Switch */}
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">3D Visual Editor</span>
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
                className="w-full flex items-center space-x-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded transition-colors"
              >
                <Box className="w-4 h-4" />
                <span>3D Visual Editor</span>
              </button>
              
              {/* Pipeline Canvas Button */}
              <button
                onClick={handleOpenPipeline}
                className="w-full flex items-center space-x-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded transition-colors"
              >
                <Workflow className="w-4 h-4" />
                <span>Pipeline Canvas</span>
              </button>
              
              {/* Pipeline Manager Button */}
              <button
                onClick={handleOpenPipelineManager}
                className="w-full flex items-center space-x-2 px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded transition-colors border border-blue-300"
              >
                <Workflow className="w-4 h-4" />
                <span>Pipelines</span>
              </button>
            </div>
          </div>
        </>
      )}
    </header>
  );
};