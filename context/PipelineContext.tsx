import React, { createContext, useContext, ReactNode, useEffect } from 'react';
import { PipelineDependencies } from '../types/dependencies';
import { PipelinePersistenceAdapter, NodeExecutionAdapter } from '../types/adapters';
import { PipelineConfig } from '../types/config';
import { setPipelineDependencies, setPipelineAdapters, setPipelineConfig } from '../store/pipelineStore';

/**
 * Pipeline Context Value
 * All dependencies are optional to allow standalone usage
 */
interface PipelineContextValue extends PipelineDependencies {
  /**
   * Optional pipeline persistence adapter
   */
  persistenceAdapter?: PipelinePersistenceAdapter;
  /**
   * Optional node execution adapter
   */
  executionAdapter?: NodeExecutionAdapter;
  /**
   * Optional pipeline configuration
   */
  config?: PipelineConfig;
}

/**
 * Pipeline Context
 * Provides dependencies to all pipeline canvas components
 */
const PipelineContext = createContext<PipelineContextValue | undefined>(undefined);

/**
 * Pipeline Provider Props
 */
export interface PipelineProviderProps {
  children: ReactNode;
  /**
   * Optional API client for backend operations
   */
  apiClient?: PipelineDependencies['apiClient'];
  /**
   * Optional authentication state
   */
  authState?: PipelineDependencies['authState'];
  /**
   * Optional session ID for execution context
   */
  sessionId?: PipelineDependencies['sessionId'];
  /**
   * Optional function to get authentication headers
   */
  getAuthHeaders?: PipelineDependencies['getAuthHeaders'];
  /**
   * Optional logger for structured logging
   */
  logger?: PipelineDependencies['logger'];
  /**
   * Optional error reporter for error tracking
   */
  errorReporter?: PipelineDependencies['errorReporter'];
  /**
   * Optional pipeline persistence adapter
   * If not provided, will use default adapter with apiClient
   */
  persistenceAdapter?: PipelinePersistenceAdapter;
  /**
   * Optional node execution adapter
   * If not provided, will use default execution engine
   */
  executionAdapter?: NodeExecutionAdapter;
  /**
   * Optional pipeline configuration
   * Allows customization of endpoints and response transformers
   */
  config?: PipelineConfig;
}

/**
 * Pipeline Provider Component
 * Wraps the pipeline canvas components and provides dependencies via context
 */
export const PipelineProvider: React.FC<PipelineProviderProps> = ({
  children,
  apiClient,
  authState,
  sessionId,
  getAuthHeaders,
  logger,
  errorReporter,
  persistenceAdapter,
  executionAdapter,
  config,
}) => {
  const value: PipelineContextValue = {
    apiClient,
    authState,
    sessionId,
    getAuthHeaders,
    logger,
    errorReporter,
    persistenceAdapter,
    executionAdapter,
    config,
  };

  // Update store dependencies when context changes
  useEffect(() => {
    setPipelineDependencies({
      apiClient,
      authState,
      sessionId,
    });
    
    // Set adapters if provided
    if (persistenceAdapter || executionAdapter) {
      setPipelineAdapters({
        persistence: persistenceAdapter,
        execution: executionAdapter,
      });
    }
    
    // Set configuration if provided
    if (config) {
      setPipelineConfig(config);
    }
    
    // Sync pipelines from backend when dependencies are available and user is authenticated
    // This ensures pipelines are loaded after login when PipelineProvider mounts
    if (apiClient && authState?.user) {
      // Use a small delay to ensure store is ready
      const syncTimer = setTimeout(async () => {
        try {
          const { usePipelineStore } = await import('../store/pipelineStore');
          const pipelineStore = usePipelineStore.getState();
          if (pipelineStore.syncPipelines) {
            console.log('[PipelineProvider] Syncing pipelines after dependencies set');
            await pipelineStore.syncPipelines({ apiClient, authState });
          }
        } catch (error) {
          console.error('[PipelineProvider] Failed to sync pipelines:', error);
        }
      }, 100);
      
      return () => clearTimeout(syncTimer);
    }
  }, [apiClient, authState, sessionId, persistenceAdapter, executionAdapter, config]);

  return (
    <PipelineContext.Provider value={value}>
      {children}
    </PipelineContext.Provider>
  );
};

/**
 * Hook to access pipeline context
 * Returns undefined if used outside of PipelineProvider
 */
export const usePipelineContext = (): PipelineContextValue => {
  const context = useContext(PipelineContext);
  
  // Return empty object if context is not available (allows standalone usage)
  if (context === undefined) {
    return {};
  }
  
  return context;
};
