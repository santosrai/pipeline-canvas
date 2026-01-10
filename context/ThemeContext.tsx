import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

export type PipelineTheme = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

interface ThemeContextValue {
  /** The current theme setting (light, dark, or system) */
  theme: PipelineTheme;
  /** The resolved theme after system preference resolution */
  resolvedTheme: ResolvedTheme;
  /** Function to change the theme */
  setTheme: (theme: PipelineTheme) => void;
  /** Toggle between light and dark */
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export interface PipelineThemeProviderProps {
  children: React.ReactNode;
  /** Default theme setting. Defaults to 'system' */
  defaultTheme?: PipelineTheme;
  /** 
   * External theme override from parent application.
   * When provided, this takes precedence over internal theme state.
   * Use this to sync pipeline canvas theme with your app's theme.
   */
  externalTheme?: ResolvedTheme;
  /**
   * Callback when theme changes. Useful for syncing with parent app.
   */
  onThemeChange?: (theme: ResolvedTheme) => void;
}

export const PipelineThemeProvider: React.FC<PipelineThemeProviderProps> = ({
  children,
  defaultTheme = 'system',
  externalTheme,
  onThemeChange,
}) => {
  const [theme, setThemeState] = useState<PipelineTheme>(defaultTheme);
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => {
    // Initial resolution
    if (externalTheme) return externalTheme;
    if (defaultTheme === 'system') {
      if (typeof window !== 'undefined') {
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      }
      return 'light';
    }
    return defaultTheme;
  });

  // Handle system preference changes
  useEffect(() => {
    // If external theme is provided, always use it
    if (externalTheme) {
      if (resolvedTheme !== externalTheme) {
        setResolvedTheme(externalTheme);
        onThemeChange?.(externalTheme);
      }
      return;
    }

    // Resolve based on internal theme setting
    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = (e: MediaQueryListEvent | MediaQueryList) => {
        const newTheme = e.matches ? 'dark' : 'light';
        setResolvedTheme(newTheme);
        onThemeChange?.(newTheme);
      };

      // Set initial value
      handleChange(mediaQuery);

      // Listen for changes
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    } else {
      if (resolvedTheme !== theme) {
        setResolvedTheme(theme);
        onThemeChange?.(theme);
      }
    }
  }, [theme, externalTheme, onThemeChange]);

  const setTheme = useCallback((newTheme: PipelineTheme) => {
    setThemeState(newTheme);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      if (prev === 'system') {
        // If system, toggle to opposite of current resolved
        return resolvedTheme === 'dark' ? 'light' : 'dark';
      }
      return prev === 'dark' ? 'light' : 'dark';
    });
  }, [resolvedTheme]);

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

/**
 * Hook to access pipeline canvas theme context.
 * Must be used within a PipelineThemeProvider.
 */
export const usePipelineTheme = (): ThemeContextValue => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('usePipelineTheme must be used within a PipelineThemeProvider');
  }
  return context;
};

/**
 * Hook that returns true if the current theme is dark.
 * Convenience hook for conditional styling.
 */
export const useIsDarkTheme = (): boolean => {
  const { resolvedTheme } = usePipelineTheme();
  return resolvedTheme === 'dark';
};
