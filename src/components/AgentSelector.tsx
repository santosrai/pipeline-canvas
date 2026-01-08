import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Infinity } from 'lucide-react';
import { Agent } from '../utils/api';
import { useAgentSettings } from '../stores/settingsStore';

interface AgentSelectorProps {
  agents: Agent[];
  onAgentChange?: (agentId: string | null) => void;
}

const categoryLabels: Record<string, string> = {
  ask: 'Ask',
  plan: 'Plan',
  code: 'Code',
  fold: 'Fold',
  design: 'Design',
  workflow: 'Workflow',
  other: 'Other',
};

const categoryOrder = ['ask', 'plan', 'code', 'fold', 'design', 'workflow', 'other'];

export const AgentSelector: React.FC<AgentSelectorProps> = ({ agents, onAgentChange }) => {
  const { settings, updateSettings } = useAgentSettings();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedAgentId = settings.selectedAgentId;
  const selectedAgent = agents.find(a => a.id === selectedAgentId);

  // Group agents by category
  const agentsByCategory = agents.reduce((acc, agent) => {
    const category = agent.category || 'other';
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(agent);
    return acc;
  }, {} as Record<string, Agent[]>);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const handleSelect = (agentId: string | null) => {
    updateSettings({ selectedAgentId: agentId });
    onAgentChange?.(agentId);
    setIsOpen(false);
  };

  const displayText = selectedAgent ? selectedAgent.name : 'Auto';

  return (
    <div className="relative min-w-0 flex-shrink" ref={dropdownRef} style={{ maxWidth: '140px', flexShrink: 1 }}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-full text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 w-full min-w-0"
        title={displayText}
      >
        <Infinity className="w-3 h-3 shrink-0" />
        <span className="truncate min-w-0 flex-1 text-left overflow-hidden text-ellipsis whitespace-nowrap">{displayText}</span>
        <ChevronDown className={`w-2.5 h-2.5 transition-transform shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute bottom-full left-0 mb-2 w-64 sm:w-80 bg-white border border-gray-200 rounded-lg shadow-lg z-[100] max-h-96 overflow-hidden flex flex-col">
          <div className="p-2 overflow-y-auto flex-1 min-h-0">
            {/* Auto option */}
            <button
              onClick={() => handleSelect(null)}
              className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                selectedAgentId === null
                  ? 'bg-blue-50 text-blue-700 font-medium'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <div className="flex items-center gap-2">
                <Infinity className="w-4 h-4" />
                <span>Auto (Router decides)</span>
              </div>
            </button>

            <div className="border-t border-gray-200 my-2" />

            {/* Categorized agents */}
            {categoryOrder.map(category => {
              const categoryAgents = agentsByCategory[category] || [];
              if (categoryAgents.length === 0) return null;

              return (
                <div key={category} className="mb-2">
                  <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    {categoryLabels[category] || category}
                  </div>
                  {categoryAgents.map(agent => (
                    <button
                      key={agent.id}
                      onClick={() => handleSelect(agent.id)}
                      className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                        selectedAgentId === agent.id
                          ? 'bg-blue-50 text-blue-700 font-medium'
                          : 'text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <div className="font-medium">{agent.name}</div>
                      {agent.description && (
                        <div className="text-xs text-gray-500 mt-0.5 line-clamp-1">
                          {agent.description}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};







