import React, { createContext, useContext, ReactNode, useEffect } from 'react';
import { PipelineDependencies } from '../types/dependencies';
import { setPipelineDependencies } from '../store/pipelineStore';

/**
 * Pipeline Context Value
 * All dependencies are optional to allow standalone usage
 */
interface PipelineContextValue extends PipelineDependencies {}

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
}) => {
  const value: PipelineContextValue = {
    apiClient,
    authState,
    sessionId,
    getAuthHeaders,
    logger,
    errorReporter,
  };

  // Update store dependencies when context changes
  useEffect(() => {
    setPipelineDependencies({
      apiClient,
      authState,
      sessionId,
    });
    
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
  }, [apiClient, authState, sessionId]);

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
