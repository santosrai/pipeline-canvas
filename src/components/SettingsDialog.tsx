import React, { useState } from 'react';
import { X, Code2, Palette, Zap, RotateCcw, Save, History, Settings } from 'lucide-react';
import { useSettingsStore } from '../stores/settingsStore';
import { useChatHistoryStore } from '../stores/chatHistoryStore';

interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsDialog: React.FC<SettingsDialogProps> = ({ isOpen, onClose }) => {
  const { settings, updateSettings, resetSettings } = useSettingsStore();
  const { getStorageStats, cleanupOldSessions, clearAllSessions, exportSessions } = useChatHistoryStore();
  const [activeTab, setActiveTab] = useState<'editor' | 'interface' | 'api' | 'chat-history' | 'advanced'>('editor');
  const [localSettings, setLocalSettings] = useState(settings);
  const [hasChanges, setHasChanges] = useState(false);

  // Sync localSettings when dialog opens or settings change
  React.useEffect(() => {
    if (isOpen) {
      // Ensure api field exists
      const settingsWithApi = {
        ...settings,
        api: settings.api || { key: '' }
      };
      setLocalSettings(settingsWithApi);
      setHasChanges(false);
    }
  }, [isOpen, settings]);
  if (!isOpen) return null;

  const handleSettingChange = (path: string, value: any) => {
    const newSettings = { ...localSettings };
    const keys = path.split('.');
    let current = newSettings as any;

    for (let i = 0; i < keys.length - 1; i++) {
      current = current[keys[i]];
    }
    current[keys[keys.length - 1]] = value;

    setLocalSettings(newSettings);
    setHasChanges(true);
  };

  const handleSave = () => {
    updateSettings(localSettings);
    setHasChanges(false);
    onClose();
  };

  const handleCancel = () => {
    setLocalSettings(settings);
    setHasChanges(false);
    onClose();
  };

  const handleReset = () => {
    if (confirm('Reset all settings to default values? This cannot be undone.')) {
      resetSettings();
      setLocalSettings(settings);
      setHasChanges(false);
    }
  };

  const Tab = ({ id, icon: Icon, label }: { id: typeof activeTab; icon: any; label: string }) => (
    <button
      onClick={() => setActiveTab(id)}
      className={`flex items-center space-x-2 px-3 sm:px-4 py-2 rounded-lg font-medium text-xs sm:text-sm transition-colors whitespace-nowrap ${activeTab === id
        ? 'bg-blue-100 text-blue-700 border border-blue-200'
        : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'
        }`}
    >
      <Icon className="w-4 h-4" />
      <span>{label}</span>
    </button>
  );

  const Switch = ({ checked, onChange, label, description }: {
    checked: boolean;
    onChange: (checked: boolean) => void;
    label: string;
    description?: string;
  }) => (
    <div className="flex items-start justify-between py-3">
      <div className="flex-1">
        <div className="font-medium text-gray-900 text-sm">{label}</div>
        {description && <div className="text-gray-500 text-xs mt-1">{description}</div>}
      </div>
      <button
        onClick={() => onChange(!checked)}

        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${checked ? 'bg-blue-600' : 'bg-gray-200'
          }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'
            }`}
        />
      </button>
    </div>
  );

  const Select = ({ value, onChange, options, label, description }: {
    value: string | number;
    onChange: (value: string | number) => void;
    options: { value: string | number; label: string }[];
    label: string;
    description?: string;
  }) => (
    <div className="py-3">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="font-medium text-gray-900 text-sm">{label}</div>
          {description && <div className="text-gray-500 text-xs mt-1">{description}</div>}
        </div>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="ml-4 px-3 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-2 sm:p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[95vh] sm:max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-200">
          <h2 className="text-lg sm:text-xl font-semibold text-gray-900">Settings</h2>
          <button
            onClick={handleCancel}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
        </div>

        <div className="flex flex-col sm:flex-row h-[calc(95vh-73px)] sm:h-[500px]">
          {/* Sidebar */}
          <div className="w-full sm:w-48 bg-gray-50 border-b sm:border-b-0 sm:border-r border-gray-200 p-3 sm:p-4">
            <div className="flex sm:flex-col space-x-2 sm:space-x-0 sm:space-y-2 overflow-x-auto sm:overflow-x-visible">
              <Tab id="editor" icon={Code2} label="Editor" />
              <Tab id="interface" icon={Palette} label="Interface" />
              <Tab id="api" icon={Zap} label="API Keys" />
              <Tab id="chat-history" icon={History} label="Chat History" />
              <Tab id="advanced" icon={Settings} label="Advanced" />
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            <div className="p-4 sm:p-6">
              {activeTab === 'editor' && (
                <div className="space-y-1">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Code Editor Settings</h3>

                  <Switch
                    checked={localSettings.codeEditor.enabled}
                    onChange={(checked) => handleSettingChange('codeEditor.enabled', checked)}
                    label="Show Code Editor"
                    description="Display the code editor panel alongside the molecular viewer"
                  />

                  <div className="border-t border-gray-200 pt-1">
                    <Switch
                      checked={localSettings.codeEditor.autoExecution}
                      onChange={(checked) => handleSettingChange('codeEditor.autoExecution', checked)}
                      label="Auto-execute Generated Code"
                      description="Automatically run code when AI generates new visualization commands"
                    />
                  </div>

                  {localSettings.codeEditor.enabled && (
                    <div className="border-t border-gray-200 pt-4">
                      <div className="font-medium text-gray-900 text-sm mb-2">Default Startup Code</div>
                      <div className="text-gray-500 text-xs mb-3">Code template shown when the editor first loads</div>
                      <textarea
                        value={localSettings.codeEditor.defaultCode}
                        onChange={(e) => handleSettingChange('codeEditor.defaultCode', e.target.value)}
                        className="w-full h-32 px-3 py-2 border border-gray-300 rounded-md text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                        placeholder="// Enter default code template..."
                      />
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'interface' && (
                <div className="space-y-1">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Interface Settings</h3>

                  <Select
                    value={localSettings.ui.theme}
                    onChange={(value) => handleSettingChange('ui.theme', value)}
                    options={[
                      { value: 'light', label: 'Light' },
                      { value: 'dark', label: 'Dark (Coming Soon)' }
                    ]}
                    label="Theme"
                    description="Choose your preferred color scheme"
                  />

                  <div className="border-t border-gray-200 pt-1">
                    <Switch
                      checked={localSettings.ui.showQuickPrompts}
                      onChange={(checked) => handleSettingChange('ui.showQuickPrompts', checked)}
                      label="Show Quick Start Prompts"
                      description="Display quick start buttons in the chat panel"
                    />
                  </div>

                  <div className="border-t border-gray-200 pt-1">
                    <Select
                      value={localSettings.ui.messageHistoryLimit}
                      onChange={(value) => handleSettingChange('ui.messageHistoryLimit', parseInt(value as string))}
                      options={[
                        { value: 25, label: '25 messages' },
                        { value: 50, label: '50 messages' },
                        { value: 100, label: '100 messages' },
                        { value: 200, label: '200 messages' }
                      ]}
                      label="Message History Limit"
                      description="Maximum number of chat messages to keep in memory"
                    />
                  </div>
                </div>
              )}

              {activeTab === 'api' && (
                <div className="space-y-1">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">API Configuration</h3>

                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                    <div className="flex items-start">
                      <div className="flex-shrink-0">
                        <Zap className="h-5 w-5 text-blue-400" aria-hidden="true" />
                      </div>
                      <div className="ml-3">
                        <h3 className="text-sm font-medium text-blue-800">Bring Your Own Key</h3>
                        <div className="mt-2 text-sm text-blue-700">
                          <p>
                            You can use your own API key to power the AI features.
                            We use <strong>OpenRouter</strong> to access AI models.
                          </p>
                          <p className="mt-1">
                            Your key is stored locally in your browser and sent directly to the server.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label htmlFor="apiKey" className="block text-sm font-medium text-gray-700">
                        API Key
                      </label>
                      <div className="mt-1">
                        <input
                          type="password"
                          name="apiKey"
                          id="apiKey"
                          className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md px-3 py-2 border"
                          placeholder="sk-or-..."
                          value={localSettings.api?.key || ''}
                          onChange={(e) => handleSettingChange('api.key', e.target.value)}
                        />
                      </div>
                      <p className="mt-2 text-xs text-gray-500">
                        Enter your OpenRouter API key (starts with sk-or-).
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'chat-history' && (
                <div className="space-y-1">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Chat History Settings</h3>

                  {/* Storage Statistics */}
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4">
                    <h4 className="font-medium text-gray-900 text-sm mb-2">Storage Statistics</h4>
                    <div className="space-y-1 text-xs text-gray-600">
                      {(() => {
                        const stats = getStorageStats();
                        return (
                          <>
                            <div>Total Sessions: {stats.totalSessions}</div>
                            <div>Total Messages: {stats.totalMessages}</div>
                            <div>Storage Used: {stats.estimatedSize}</div>
                          </>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Message History Limit */}
                  <Select
                    value={localSettings.ui.messageHistoryLimit}
                    onChange={(value) => handleSettingChange('ui.messageHistoryLimit', parseInt(value as string))}
                    options={[
                      { value: 25, label: '25 messages' },
                      { value: 50, label: '50 messages' },
                      { value: 100, label: '100 messages' },
                      { value: 200, label: '200 messages' },
                      { value: 500, label: '500 messages' }
                    ]}
                    label="Message History Limit"
                    description="Maximum number of messages to keep per session (affects memory usage)"
                  />

                  {/* Data Management Actions */}
                  <div className="border-t border-gray-200 pt-4">
                    <h4 className="font-medium text-gray-900 text-sm mb-3">Data Management</h4>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-lg">
                        <div>
                          <div className="font-medium text-blue-900 text-sm">Export All Sessions</div>
                          <div className="text-blue-700 text-xs">Download all chat history as JSON backup</div>
                        </div>
                        <button
                          onClick={() => {
                            const data = exportSessions();
                            const blob = new Blob([data], { type: 'application/json' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `novoprotein-chat-backup-${new Date().toISOString().split('T')[0]}.json`;
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                            URL.revokeObjectURL(url);
                          }}
                          className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 transition-colors"
                        >
                          Export
                        </button>
                      </div>

                      <div className="flex items-center justify-between p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                        <div>
                          <div className="font-medium text-yellow-900 text-sm">Cleanup Old Sessions</div>
                          <div className="text-yellow-700 text-xs">Remove sessions older than 30 days (starred sessions are kept)</div>
                        </div>
                        <button
                          onClick={() => {
                            const deleted = cleanupOldSessions(30);
                            alert(`Cleaned up ${deleted} old session(s)`);
                          }}
                          className="px-3 py-1 bg-yellow-600 text-white rounded text-sm hover:bg-yellow-700 transition-colors"
                        >
                          Cleanup
                        </button>
                      </div>

                      <div className="flex items-center justify-between p-3 bg-red-50 border border-red-200 rounded-lg">
                        <div>
                          <div className="font-medium text-red-900 text-sm">Clear All Chat History</div>
                          <div className="text-red-700 text-xs">Permanently delete all chat sessions and messages</div>
                        </div>
                        <button
                          onClick={() => {
                            if (confirm('Delete ALL chat history? This cannot be undone.')) {
                              clearAllSessions();
                              alert('All chat history has been cleared');
                            }
                          }}
                          className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700 transition-colors"
                        >
                          Clear All
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Auto-cleanup Settings */}
                  <div className="border-t border-gray-200 pt-4">
                    <h4 className="font-medium text-gray-900 text-sm mb-3">Auto-cleanup (Future Feature)</h4>
                    <div className="text-xs text-gray-500 italic">
                      Automatic cleanup of old sessions will be available in a future update.
                      You can manually cleanup old sessions using the button above.
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'advanced' && (
                <div className="space-y-1">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Advanced Settings</h3>

                  <Switch
                    checked={localSettings.performance.debugMode}
                    onChange={(checked) => handleSettingChange('performance.debugMode', checked)}
                    label="Debug Mode"
                    description="Enable detailed logging in browser console for troubleshooting"
                  />

                  <div className="border-t border-gray-200 pt-1">
                    <Switch
                      checked={localSettings.performance.enableAnalytics}
                      onChange={(checked) => handleSettingChange('performance.enableAnalytics', checked)}
                      label="Usage Analytics"
                      description="Help improve the app by sharing anonymous usage data (future feature)"
                    />
                  </div>

                  <div className="border-t border-gray-200 pt-4">
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                      <h4 className="font-medium text-yellow-800 text-sm">Reset Settings</h4>
                      <p className="text-yellow-700 text-xs mt-1 mb-3">
                        This will restore all settings to their default values. This cannot be undone.
                      </p>
                      <button
                        onClick={handleReset}
                        className="flex items-center space-x-2 px-3 py-1 bg-yellow-100 text-yellow-800 border border-yellow-300 rounded text-sm hover:bg-yellow-200 transition-colors"
                      >
                        <RotateCcw className="w-4 h-4" />
                        <span>Reset to Defaults</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-gray-200 bg-gray-50">
          <div className="text-sm text-gray-500">
            {hasChanges && (
              <span className="text-amber-600">• Unsaved changes</span>
            )}
          </div>
          <div className="flex space-x-3">
            <button
              onClick={handleCancel}
              className="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium text-sm transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!hasChanges}
              className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm transition-colors"
            >
              <Save className="w-4 h-4" />
              <span>Save Settings</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};