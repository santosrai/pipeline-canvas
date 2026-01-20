// Main export file for pipeline-canvas library

// Export components
export {
  PipelineCanvas,
  PipelineNodeConfig,
  PipelineNodePalette,
  PipelineExecution,
  PipelineManager,
  CustomHandle,
  ExecutionLogsPanel,
  PipelineThemeWrapper,
  PipelineThemeToggle,
} from './components/index';
export type { PipelineThemeWrapperProps } from './components/index';

// Export provider and context
export { PipelineCanvasProvider } from './components/PipelineCanvasProvider';
export { PipelineProvider, usePipelineContext } from './context/PipelineContext';
export type { PipelineCanvasProviderProps } from './components/PipelineCanvasProvider';
export type { PipelineProviderProps } from './context/PipelineContext';

// Export theme context
export { 
  PipelineThemeProvider, 
  usePipelineTheme, 
  useIsDarkTheme 
} from './context/ThemeContext';
export type { 
  PipelineTheme, 
  ResolvedTheme, 
  PipelineThemeProviderProps 
} from './context/ThemeContext';

// Export types
export * from './types/index';
export * from './types/dependencies';
export * from './types/logger';
export * from './types/adapters';
export * from './types/config';

// Export store and store types
export { usePipelineStore, setPipelineDependencies } from './store/pipelineStore';
export type { ExecutionLogEntry, ExecutionSession } from './store/pipelineStore';

// Export utilities
export * from './utils/index';

