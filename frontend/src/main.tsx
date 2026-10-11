import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { AuthProvider, LangProvider, OnlineProvider, ToastProvider } from './store/providers';
import { startSyncLoop } from './lib/sync';
import './styles/app.css';

const qc = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 15_000,
    },
  },
});

// Kick off the offline outbox flusher (online + interval + on-login triggers).
startSyncLoop();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={qc}>
      <OnlineProvider>
        <LangProvider>
          <ToastProvider>
            <AuthProvider>
              <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
                <App />
              </BrowserRouter>
            </AuthProvider>
          </ToastProvider>
        </LangProvider>
      </OnlineProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);