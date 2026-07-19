import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NotificationProvider } from './context/NotificationContext';
import { StyleProvider } from './context/StyleContext';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import ErrorBoundary from './components/ErrorBoundary';
import { Loader2 } from 'lucide-react';

const HomePage  = lazy(() => import('./pages/HomePage').then(m => ({ default: m.HomePage })));
const WorkPage  = lazy(() => import('./pages/WorkPage').then(m => ({ default: m.WorkPage })));
const LoginPage = lazy(() => import('./pages/LoginPage').then(m => ({ default: m.LoginPage })));
const AdminPage = lazy(() => import('./pages/AdminPage').then(m => ({ default: m.AdminPage })));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 1,
    },
  },
});

const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-bg-color">
    <div className="flex flex-col items-center gap-4">
      <Loader2 size={48} className="animate-spin text-primary" />
      <p className="text-sm font-semibold text-text-muted">A carregar...</p>
    </div>
  </div>
);

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <StyleProvider>
            <NotificationProvider>
              <BrowserRouter>
                <Suspense fallback={<PageLoader />}>
                  <Routes>
                    <Route path="/login" element={<LoginPage />} />
                    <Route path="/" element={
                      <ProtectedRoute><HomePage /></ProtectedRoute>
                    } />
                    <Route path="/work/:isbn" element={
                      <ProtectedRoute><WorkPage /></ProtectedRoute>
                    } />
                    <Route path="/admin" element={
                      <ProtectedRoute adminOnly><AdminPage /></ProtectedRoute>
                    } />
                  </Routes>
                </Suspense>
              </BrowserRouter>
            </NotificationProvider>
          </StyleProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
