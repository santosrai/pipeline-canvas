import React, { useState } from 'react';
import { ChevronDown, ChevronRight, AlertCircle, RefreshCw, ExternalLink, MessageCircle, Wrench } from 'lucide-react';
import { ErrorDetails, ErrorSeverity, AlphaFoldErrorHandler, RFdiffusionErrorHandler } from '../utils/errorHandler';

interface ErrorDisplayProps {
  error: ErrorDetails;
  onRetry?: () => void;
  onDismiss?: () => void;
  className?: string;
}

export const ErrorDisplay: React.FC<ErrorDisplayProps> = ({
  error,
  onRetry,
  onDismiss,
  className = ''
}) => {
  const [showDetails, setShowDetails] = useState(false);
  const [showTechnical, setShowTechnical] = useState(false);

  // Determine error type from error code or context
  const getErrorType = (): { name: string; handler: typeof AlphaFoldErrorHandler | typeof RFdiffusionErrorHandler } => {
    // Check error code prefix
    if (error.code.startsWith('RFDIFFUSION_')) {
      return { name: 'RFdiffusion Error', handler: RFdiffusionErrorHandler };
    }
    
    // Check context feature field
    if (error.context?.feature === 'RFdiffusion') {
      return { name: 'RFdiffusion Error', handler: RFdiffusionErrorHandler };
    }
    
    if (error.context?.feature === 'AlphaFold' || error.context?.feature === 'AlphaFold2') {
      return { name: 'AlphaFold Error', handler: AlphaFoldErrorHandler };
    }
    
    // Check job ID prefix (rf_ for RFdiffusion, af_ for AlphaFold)
    if (error.context?.jobId?.startsWith('rf_')) {
      return { name: 'RFdiffusion Error', handler: RFdiffusionErrorHandler };
    }
    
    if (error.context?.jobId?.startsWith('af_')) {
      return { name: 'AlphaFold Error', handler: AlphaFoldErrorHandler };
    }
    
    // Default to AlphaFold for backward compatibility
    return { name: 'AlphaFold Error', handler: AlphaFoldErrorHandler };
  };

  const errorType = getErrorType();

  const getSeverityColor = (severity: ErrorSeverity) => {
    switch (severity) {
      case ErrorSeverity.LOW: return 'border-yellow-200 bg-yellow-50';
      case ErrorSeverity.MEDIUM: return 'border-orange-200 bg-orange-50';
      case ErrorSeverity.HIGH: return 'border-red-200 bg-red-50';
      case ErrorSeverity.CRITICAL: return 'border-red-300 bg-red-100';
      default: return 'border-gray-200 bg-gray-50';
    }
  };

  const getSeverityTextColor = (severity: ErrorSeverity) => {
    switch (severity) {
      case ErrorSeverity.LOW: return 'text-yellow-800';
      case ErrorSeverity.MEDIUM: return 'text-orange-800';
      case ErrorSeverity.HIGH: return 'text-red-800';
      case ErrorSeverity.CRITICAL: return 'text-red-900';
      default: return 'text-gray-800';
    }
  };

  const getSeverityBadgeColor = (severity: ErrorSeverity) => {
    switch (severity) {
      case ErrorSeverity.LOW: return 'bg-yellow-100 text-yellow-800';
      case ErrorSeverity.MEDIUM: return 'bg-orange-100 text-orange-800';
      case ErrorSeverity.HIGH: return 'bg-red-100 text-red-800';
      case ErrorSeverity.CRITICAL: return 'bg-red-200 text-red-900';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getActionIcon = (type: string) => {
    switch (type) {
      case 'retry': return <RefreshCw className="w-4 h-4" />;
      case 'fix': return <Wrench className="w-4 h-4" />;
      case 'alternative': return <ExternalLink className="w-4 h-4" />;
      case 'contact': return <MessageCircle className="w-4 h-4" />;
      default: return <AlertCircle className="w-4 h-4" />;
    }
  };

  const getActionButtonColor = (type: string) => {
    switch (type) {
      case 'retry': return 'bg-blue-600 hover:bg-blue-700 text-white';
      case 'fix': return 'bg-green-600 hover:bg-green-700 text-white';
      case 'alternative': return 'bg-purple-600 hover:bg-purple-700 text-white';
      case 'contact': return 'bg-gray-600 hover:bg-gray-700 text-white';
      default: return 'bg-gray-500 hover:bg-gray-600 text-white';
    }
  };

  const handleSuggestionAction = (suggestion: any) => {
    if (suggestion.type === 'retry' && onRetry) {
      onRetry();
    } else if (suggestion.type === 'contact') {
      // Could open a support modal or email client
      window.open('mailto:support@example.com?subject=' + encodeURIComponent(`${errorType.name} Report`) + '&body=' + encodeURIComponent(
        `Error Code: ${error.code}\nTimestamp: ${error.timestamp}\nDetails: ${error.technicalMessage}`
      ));
    }
    // Other actions would be handled by parent components
  };

  return (
    <div className={`rounded-lg border p-4 ${getSeverityColor(error.severity)} ${className}`}>
      {/* Error Header */}
      <div className="flex items-start space-x-3">
        <div className="flex-shrink-0 mt-0.5">
          <AlertCircle className={`w-5 h-5 ${getSeverityTextColor(error.severity)}`} />
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-2">
              <h4 className={`font-medium ${getSeverityTextColor(error.severity)}`}>
                {errorType.name}
              </h4>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getSeverityBadgeColor(error.severity)}`}>
                {errorType.handler.getSeverityIcon(error.severity)} {error.severity.toUpperCase()}
              </span>
            </div>
            
            {onDismiss && (
              <button
                onClick={onDismiss}
                className="text-gray-400 hover:text-gray-600 text-sm"
              >
                ✕
              </button>
            )}
          </div>
          
          <p className={`text-sm mb-3 ${getSeverityTextColor(error.severity)}`}>
            {error.userMessage}
          </p>

          {/* Primary Suggestions */}
          {error.suggestions.length > 0 && (
            <div className="mb-3">
              <div className="flex flex-wrap gap-2">
                {error.suggestions.slice(0, 2).map((suggestion, index) => (
                  <button
                    key={index}
                    onClick={() => handleSuggestionAction(suggestion)}
                    className={`inline-flex items-center space-x-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${getActionButtonColor(suggestion.type)}`}
                  >
                    {getActionIcon(suggestion.type)}
                    <span>{suggestion.action}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Show Details Toggle */}
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="inline-flex items-center space-x-1 text-xs text-gray-600 hover:text-gray-800"
          >
            {showDetails ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            <span>{showDetails ? 'Hide' : 'Show'} Details</span>
          </button>
        </div>
      </div>

      {/* Expandable Details Section */}
      {showDetails && (
        <div className="mt-4 border-t border-gray-200 pt-4 space-y-4">
          {/* All Suggestions */}
          {error.suggestions.length > 2 && (
            <div>
              <h5 className="text-xs font-medium text-gray-700 mb-2">Additional Solutions</h5>
              <div className="space-y-2">
                {error.suggestions.slice(2).map((suggestion, index) => (
                  <div key={index} className="flex items-start space-x-2 text-xs">
                    <div className="flex-shrink-0 mt-0.5">
                      {getActionIcon(suggestion.type)}
                    </div>
                    <div>
                      <button
                        onClick={() => handleSuggestionAction(suggestion)}
                        className="font-medium text-gray-800 hover:text-gray-900 underline"
                      >
                        {suggestion.action}
                      </button>
                      <p className="text-gray-600 mt-1">{suggestion.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Context Information */}
          {Object.keys(error.context).length > 0 && (
            <div>
              <h5 className="text-xs font-medium text-gray-700 mb-2">Context Information</h5>
              <div className="bg-white bg-opacity-50 rounded p-2 text-xs">
                {Object.entries(error.context).map(([key, value]) => (
                  <div key={key} className="flex justify-between py-1">
                    <span className="font-medium text-gray-600 capitalize">
                      {key.replace(/([A-Z])/g, ' $1').toLowerCase()}:
                    </span>
                    <span className="text-gray-800 ml-2 font-mono">
                      {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Technical Details Toggle */}
          <div>
            <button
              onClick={() => setShowTechnical(!showTechnical)}
              className="inline-flex items-center space-x-1 text-xs text-gray-500 hover:text-gray-700"
            >
              {showTechnical ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              <span>Technical Details</span>
            </button>
            
            {showTechnical && (
              <div className="mt-2 bg-white bg-opacity-50 rounded p-3 text-xs">
                <div className="space-y-2">
                  <div>
                    <span className="font-medium text-gray-600">Error Code:</span>
                    <span className="ml-2 font-mono text-gray-800">{error.code}</span>
                  </div>
                  
                  <div>
                    <span className="font-medium text-gray-600">Category:</span>
                    <span className="ml-2 text-gray-800">{error.category}</span>
                  </div>
                  
                  <div>
                    <span className="font-medium text-gray-600">Timestamp:</span>
                    <span className="ml-2 text-gray-800">{error.timestamp.toLocaleString()}</span>
                  </div>
                  
                  {error.requestId && (
                    <div>
                      <span className="font-medium text-gray-600">Request ID:</span>
                      <span className="ml-2 font-mono text-gray-800">{error.requestId}</span>
                    </div>
                  )}
                  
                  <div>
                    <span className="font-medium text-gray-600">Technical Message:</span>
                    <div className="mt-1 p-2 bg-gray-100 rounded text-gray-800 font-mono text-xs">
                      {error.technicalMessage}
                    </div>
                  </div>
                  
                  {error.stack && (
                    <div>
                      <span className="font-medium text-gray-600">Stack Trace:</span>
                      <div className="mt-1 p-2 bg-gray-100 rounded text-gray-700 font-mono text-xs max-h-32 overflow-y-auto">
                        <pre>{error.stack}</pre>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// Compact version for inline display
export const ErrorSummary: React.FC<{ error: ErrorDetails; onClick?: () => void }> = ({ 
  error, 
  onClick 
}) => {
  return (
    <div 
      className={`inline-flex items-center space-x-2 px-3 py-2 rounded-md cursor-pointer transition-colors ${
        error.severity === ErrorSeverity.HIGH || error.severity === ErrorSeverity.CRITICAL 
          ? 'bg-red-100 hover:bg-red-200 text-red-800' 
          : 'bg-yellow-100 hover:bg-yellow-200 text-yellow-800'
      }`}
      onClick={onClick}
    >
      <AlertCircle className="w-4 h-4" />
      <span className="text-sm font-medium">{error.userMessage}</span>
      <span className="text-xs opacity-75">Click for details</span>
    </div>
  );
};