import React, { useState, useEffect } from 'react';
import { Play, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';

export interface ThinkingStep {
  id: string;
  title: string;
  content: string;
  status: 'pending' | 'processing' | 'completed';
  timestamp?: Date;
}

export interface ThinkingProcessDisplayProps {
  thinkingSteps?: ThinkingStep[];
  isProcessing?: boolean;
  currentStep?: number;
}

export const ThinkingProcessDisplay: React.FC<ThinkingProcessDisplayProps> = ({
  thinkingSteps = [],
  isProcessing = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(!isProcessing); // Auto-expand when processing

  // Auto-expand when processing starts
  useEffect(() => {
    if (isProcessing) {
      setIsExpanded(true);
    }
  }, [isProcessing]);

  // If no thinking steps, don't render anything
  if (!thinkingSteps || thinkingSteps.length === 0) {
    return null;
  }

  // When processing, show steps directly without accordion header
  if (isProcessing) {
    return (
      <div className="mt-3 mb-2 border border-gray-200 rounded-lg bg-white overflow-hidden">
        <div className="px-4 py-3">
          <div className="relative">
            {/* Vertical Threading Line */}
            <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-300" />

            {/* Thinking Steps - Show bold headers as loading indicators */}
            <div className="space-y-4">
              {thinkingSteps.map((step, index) => {
                const isActive = step.status === 'processing';
                const isPending = step.status === 'pending';
                const isCompleted = step.status === 'completed';

                return (
                  <div
                    key={step.id}
                    className="relative pl-8"
                  >
                    {/* Step Title - Bold Header (main loading indicator) */}
                    <div className="mb-2">
                      <div className="flex items-center gap-2">
                        {isActive && (
                          <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
                        )}
                        {isPending && (
                          <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin" />
                        )}
                        {isCompleted && (
                          <div className="w-4 h-4 text-green-600">
                            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-4 h-4">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          </div>
                        )}
                        <h4 className="font-bold text-gray-900 text-base">
                          {step.title || `Step ${index + 1}`}
                        </h4>
                      </div>
                    </div>

                    {/* Step Content */}
                    {step.content && (
                      <div className="mt-1">
                        <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                          {step.content}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // When not processing, show collapsible accordion
  return (
    <div className="mt-3 mb-2 border border-gray-200 rounded-lg bg-gray-50 overflow-hidden">
      {/* Accordion Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-100 hover:bg-gray-200 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset"
        aria-expanded={isExpanded}
        aria-label="Toggle thinking process display"
      >
        <div className="flex items-center gap-2">
          <Play className="w-4 h-4 text-gray-600" />
          <span className="font-medium text-gray-900">Show thinking</span>
        </div>
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-gray-500" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-500" />
        )}
      </button>

      {/* Expandable Content */}
      {isExpanded && (
        <div className="px-4 py-3 bg-white">
          <div className="relative">
            {/* Vertical Threading Line */}
            <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-300" />

            {/* Thinking Steps */}
            <div className="space-y-4">
              {thinkingSteps.map((step, index) => {
                const isActive = step.status === 'processing';

                return (
                  <div
                    key={step.id}
                    className="relative pl-8"
                  >
                    {/* Step Title - Bold Header */}
                    <div className="mb-2">
                      <div className="flex items-center gap-2">
                        {isActive && (
                          <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
                        )}
                        <h4 className="font-bold text-gray-900 text-sm">
                          {step.title || `Step ${index + 1}`}
                        </h4>
                      </div>
                    </div>

                    {/* Step Content */}
                    {step.content && (
                      <div className="mt-1">
                        <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                          {step.content}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

