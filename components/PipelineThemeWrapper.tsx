import React from 'react';
import { 
  PipelineThemeProvider, 
  usePipelineTheme, 
  PipelineTheme, 
  ResolvedTheme,
  PipelineThemeProviderProps 
} from '../context/ThemeContext';

interface ThemeContainerProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Internal component that applies the theme class to the container.
 */
const ThemeContainer: React.FC<ThemeContainerProps> = ({ children, className }) => {
  const { resolvedTheme } = usePipelineTheme();

  return (
    <div
      className={`pipeline-canvas-root ${className || ''}`}
      data-theme={resolvedTheme}
    >
      {children}
    </div>
  );
};

export interface PipelineThemeWrapperProps {
  children: React.ReactNode;
  /** 
   * Theme setting for the pipeline canvas.
   * - 'light': Always use light theme
   * - 'dark': Always use dark theme  
   * - 'system': Follow system preference (default)
   */
  theme?: PipelineTheme;
  /** 
   * External theme override from parent application.
   * When provided, this takes precedence over the `theme` prop.
   * Use this to sync pipeline canvas theme with your app's theme state.
   * 
   * @example
   * // In your app component
   * const [appTheme, setAppTheme] = useState<'light' | 'dark'>('dark');
   * return (
   *   <PipelineThemeWrapper externalTheme={appTheme}>
   *     <PipelineCanvas />
   *   </PipelineThemeWrapper>
   * );
   */
  externalTheme?: ResolvedTheme;
  /**
   * Callback fired when the resolved theme changes.
   * Useful for syncing pipeline canvas theme back to parent app.
   */
  onThemeChange?: (theme: ResolvedTheme) => void;
  /** Additional CSS classes for the container */
  className?: string;
}

/**
 * Theme wrapper component for Pipeline Canvas.
 * 
 * This component provides theme isolation for the pipeline canvas library,
 * ensuring its styles don't conflict with parent application themes.
 * 
 * @example
 * // Option 1: Follow system preference (default)
 * <PipelineThemeWrapper>
 *   <PipelineCanvas />
 * </PipelineThemeWrapper>
 * 
 * @example
 * // Option 2: Force dark theme
 * <PipelineThemeWrapper theme="dark">
 *   <PipelineCanvas />
 * </PipelineThemeWrapper>
 * 
 * @example
 * // Option 3: Sync with parent app theme
 * const [appTheme] = useYourAppTheme(); // Your app's theme hook
 * <PipelineThemeWrapper externalTheme={appTheme}>
 *   <PipelineCanvas />
 * </PipelineThemeWrapper>
 */
export const PipelineThemeWrapper: React.FC<PipelineThemeWrapperProps> = ({
  children,
  theme = 'system',
  externalTheme,
  onThemeChange,
  className,
}) => {
  return (
    <PipelineThemeProvider 
      defaultTheme={theme} 
      externalTheme={externalTheme}
      onThemeChange={onThemeChange}
    >
      <ThemeContainer className={className}>
        {children}
      </ThemeContainer>
    </PipelineThemeProvider>
  );
};

/**
 * Theme toggle button component for Pipeline Canvas.
 * Use this inside a PipelineThemeWrapper to allow users to toggle themes.
 */
export const PipelineThemeToggle: React.FC<{ className?: string }> = ({ className }) => {
  const { resolvedTheme, toggleTheme } = usePipelineTheme();

  return (
    <button
      onClick={toggleTheme}
      className={`pc-theme-toggle ${className || ''}`}
      aria-label={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} theme`}
      title={`Current: ${resolvedTheme} theme`}
    >
      {resolvedTheme === 'dark' ? (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ) : (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
        </svg>
      )}
    </button>
  );
};

export default PipelineThemeWrapper;
