import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './App.tsx'
import { LandingPage } from './pages/LandingPage.tsx'
import { PricingPage } from './pages/PricingPage.tsx'
import { PipelinePage } from './pages/PipelinePage.tsx'
import { SignInForm } from './components/auth/SignInForm'
import { SignUpForm } from './components/auth/SignUpForm'
import { AdminDashboard } from './pages/AdminDashboard'
import { AuthGuard } from './components/auth/AuthGuard'
import { ErrorBoundary } from './components/ErrorBoundary'
import './index.css'

// Verify root element exists before rendering
const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found. Make sure index.html has a <div id="root"></div> element.');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          {/* Public Landing Page */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/signin" element={<SignInForm />} />
          <Route path="/signup" element={<SignUpForm />} />
          
          {/* Authenticated App Routes */}
          <Route
            path="/app"
            element={
              <AuthGuard>
                <App />
              </AuthGuard>
            }
          />
          <Route
            path="/pipeline"
            element={
              <AuthGuard>
                <PipelinePage />
              </AuthGuard>
            }
          />
          <Route
            path="/admin"
            element={
              <AuthGuard requireRole="admin">
                <AdminDashboard />
              </AuthGuard>
            }
          />
          <Route
            path="/admin/users/:userId"
            element={
              <AuthGuard requireRole="admin">
                <AdminDashboard />
              </AuthGuard>
            }
          />
          <Route
            path="/admin/users/:userId/chat"
            element={
              <AuthGuard requireRole="admin">
                <AdminDashboard />
              </AuthGuard>
            }
          />
          <Route
            path="/admin/users/:userId/tokens"
            element={
              <AuthGuard requireRole="admin">
                <AdminDashboard />
              </AuthGuard>
            }
          />
          <Route
            path="/admin/chat"
            element={
              <AuthGuard requireRole="admin">
                <AdminDashboard />
              </AuthGuard>
            }
          />
          <Route
            path="/admin/tokens"
            element={
              <AuthGuard requireRole="admin">
                <AdminDashboard />
              </AuthGuard>
            }
          />
          <Route
            path="/admin/audit"
            element={
              <AuthGuard requireRole="admin">
                <AdminDashboard />
              </AuthGuard>
            }
          />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
)