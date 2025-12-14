import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { Model } from '../utils/api';
import { useAgentSettings } from '../stores/settingsStore';

interface ModelSelectorProps {
  models: Model[];
  onModelChange?: (modelId: string | null) => void;
}

// Popular models to show at the top
const popularModelIds = [
  'openai/gpt-4-turbo',
  'openai/gpt-4',
  'anthropic/claude-3.5-sonnet',
  'anthropic/claude-3-opus',
  'google/gemini-pro',
  'meta-llama/llama-3-70b-instruct',
];

export const ModelSelector: React.FC<ModelSelectorProps> = ({ models, onModelChange }) => {
  const { settings, updateSettings } = useAgentSettings();
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedModelId = settings.selectedModel;
  const selectedModel = models.find(m => m.id === selectedModelId);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchQuery('');
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Filter and organize models
  const { popularModels, modelsByProvider, allProviders } = useMemo(() => {
    // Filter by search query
    const filtered = models.filter(model => {
      if (!searchQuery) return true;
      const query = searchQuery.toLowerCase();
      return (
        model.name.toLowerCase().includes(query) ||
        model.id.toLowerCase().includes(query) ||
        model.provider.toLowerCase().includes(query) ||
        (model.description && model.description.toLowerCase().includes(query))
      );
    });

    // Separate popular models
    const popular = filtered.filter(m => popularModelIds.includes(m.id));
    const others = filtered.filter(m => !popularModelIds.includes(m.id));

    // Group by provider
    const byProvider = others.reduce((acc, model) => {
      const provider = model.provider || 'Other';
      if (!acc[provider]) {
        acc[provider] = [];
      }
      acc[provider].push(model);
      return acc;
    }, {} as Record<string, Model[]>);

    // Sort providers
    const providers = Object.keys(byProvider).sort();

    return {
      popularModels: popular,
      modelsByProvider: byProvider,
      allProviders: providers,
    };
  }, [models, searchQuery]);

  const handleSelect = (modelId: string | null) => {
    updateSettings({ selectedModel: modelId });
    onModelChange?.(modelId);
    setIsOpen(false);
    setSearchQuery('');
  };

  const displayText = selectedModel
    ? selectedModel.name.length > 20
      ? `${selectedModel.name.substring(0, 20)}...`
      : selectedModel.name
    : 'Default';

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-full text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 shrink-0"
      >
        <span className="max-w-[140px] truncate">{displayText}</span>
        <ChevronDown className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute bottom-full left-0 mb-2 w-80 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-96 overflow-hidden flex flex-col">
          {/* Search bar */}
          <div className="p-2 border-b border-gray-200">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search models..."
                className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          </div>

          {/* Models list */}
          <div className="overflow-y-auto flex-1">
            <div className="p-2">
              {/* Default option */}
              <button
                onClick={() => handleSelect(null)}
                className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                  selectedModelId === null
                    ? 'bg-blue-50 text-blue-700 font-medium'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <div className="font-medium">Default (Agent's model)</div>
                <div className="text-xs text-gray-500 mt-0.5">Use agent's default model</div>
              </button>

              {/* Popular models */}
              {popularModels.length > 0 && (
                <>
                  <div className="border-t border-gray-200 my-2" />
                  <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Recommended
                  </div>
                  {popularModels.map(model => (
                    <button
                      key={model.id}
                      onClick={() => handleSelect(model.id)}
                      className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                        selectedModelId === model.id
                          ? 'bg-blue-50 text-blue-700 font-medium'
                          : 'text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <div className="font-medium">{model.name}</div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {model.provider} • {model.context_length.toLocaleString()} context
                      </div>
                    </button>
                  ))}
                </>
              )}

              {/* Models by provider */}
              {allProviders.map(provider => {
                const providerModels = modelsByProvider[provider] || [];
                if (providerModels.length === 0) return null;

                return (
                  <div key={provider} className="mt-2">
                    <div className="border-t border-gray-200 my-2" />
                    <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      {provider}
                    </div>
                    {providerModels.map(model => (
                      <button
                        key={model.id}
                        onClick={() => handleSelect(model.id)}
                        className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                          selectedModelId === model.id
                            ? 'bg-blue-50 text-blue-700 font-medium'
                            : 'text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        <div className="font-medium">{model.name}</div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          {model.context_length.toLocaleString()} context
                        </div>
                      </button>
                    ))}
                  </div>
                );
              })}

              {/* No results */}
              {searchQuery && popularModels.length === 0 && allProviders.length === 0 && (
                <div className="px-3 py-4 text-sm text-gray-500 text-center">
                  No models found matching "{searchQuery}"
                </div>
              )}

              {/* No models available */}
              {models.length === 0 && !searchQuery && (
                <div className="px-3 py-4 text-sm text-gray-500 text-center">
                  No models available
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

