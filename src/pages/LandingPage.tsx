import React, { Suspense, lazy, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { LandingHeader } from '../components/LandingHeader';
import { ErrorBoundary } from '../components/ErrorBoundary';

// Lazy load ChatPanel to improve initial page load
const ChatPanel = lazy(() => import('../components/ChatPanel').then(module => ({ default: module.ChatPanel })));

// Loading fallback component
const LoadingFallback = () => (
  <div className="w-full max-w-4xl p-8 bg-white rounded-lg shadow-sm">
    <div className="animate-pulse space-y-4">
      <div className="h-4 bg-gray-200 rounded w-3/4"></div>
      <div className="h-4 bg-gray-200 rounded w-1/2"></div>
      <div className="h-32 bg-gray-200 rounded"></div>
    </div>
  </div>
);

export const LandingPage: React.FC = () => {
  const [isPageReady, setIsPageReady] = React.useState(false);
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  // Redirect to /app if user is already signed in
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/app', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  // Mark page as ready after initial render
  React.useEffect(() => {
    // Small delay to ensure all components are mounted
    const timer = setTimeout(() => {
      setIsPageReady(true);
      // Set data attribute for test detection
      document.body.setAttribute('data-page-ready', 'true');
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  // Don't render landing page if user is authenticated (will redirect)
  if (isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-blue-50 via-purple-50 to-pink-50" data-testid="landing-page" data-page-ready={isPageReady}>
      <ErrorBoundary>
        <LandingHeader />
      </ErrorBoundary>
      
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col items-center justify-center px-3 sm:px-4 py-6 sm:py-8">
        {/* Hero Section */}
        <div className="text-center mb-8 sm:mb-12 max-w-3xl">
          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-gray-900 mb-3 sm:mb-4">
            Build something powerful
          </h1>
          <p className="text-base sm:text-lg md:text-xl text-gray-600 px-2">
            Create protein designs and visualizations by chatting with AI
          </p>
        </div>

        {/* Chat Interface - Centered and Prominent */}
        <div className="w-full max-w-4xl" data-testid="chat-interface-container">
          <ErrorBoundary
            fallback={
              <div className="p-8 bg-white rounded-lg shadow-sm border border-red-200">
                <p className="text-red-600 mb-4">
                  The chat interface failed to load. Please refresh the page or try again later.
                </p>
                <button
                  onClick={() => window.location.reload()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Reload Page
                </button>
              </div>
            }
          >
            <Suspense fallback={<LoadingFallback />}>
              <ChatPanel />
            </Suspense>
          </ErrorBoundary>
        </div>
      </div>
    </div>
  );
};

