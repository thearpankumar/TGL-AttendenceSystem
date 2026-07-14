/* eslint-disable no-console */
import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  appName: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);

    try {
      fetch('/api/logs/client', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: error.message,
          stack: error.stack,
          componentStack: errorInfo.componentStack,
          url: window.location.href,
          userAgent: navigator.userAgent,
          appName: this.props.appName,
        }),
      }).catch(err => {
        console.error('Failed to send error log to server', err);
      });
    } catch (e) {
      console.error('Failed to serialize error log', e);
    }
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f9fafb', padding: '1rem' }}>
          <div style={{ maxWidth: '28rem', width: '100%', backgroundColor: '#ffffff', borderRadius: '0.5rem', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)', padding: '2rem', textAlign: 'center', border: '1px solid #f3f4f6' }}>
            <div style={{ width: '4rem', height: '4rem', margin: '0 auto', backgroundColor: '#fee2e2', color: '#dc2626', borderRadius: '9999px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.5rem' }}>
              <svg xmlns="http://www.w3.org/2000/svg" style={{ height: '2rem', width: '2rem' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            
            <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827', marginBottom: '0.5rem' }}>Something went wrong</h2>
            <p style={{ color: '#6b7280', marginBottom: '1.5rem' }}>
              An unexpected error occurred in the application. The error has been reported to our technical team.
            </p>

            <button
              onClick={() => window.location.reload()}
              style={{ width: '100%', display: 'inline-flex', justifyContent: 'center', alignItems: 'center', padding: '0.75rem 1rem', border: '1px solid transparent', fontSize: '0.875rem', fontWeight: 500, borderRadius: '0.375rem', color: '#ffffff', backgroundColor: '#4f46e5', cursor: 'pointer' }}
            >
              Reload Page
            </button>
            
            {import.meta.env.DEV && this.state.error && (
              <div style={{ marginTop: '1.5rem', textAlign: 'left' }}>
                <p style={{ fontSize: '0.875rem', fontWeight: 600, color: '#374151', marginBottom: '0.5rem' }}>Developer Details:</p>
                <pre style={{ backgroundColor: '#f3f4f6', padding: '0.75rem', borderRadius: '0.25rem', fontSize: '0.75rem', color: '#dc2626', overflowX: 'auto' }}>
                  {this.state.error.message}
                </pre>
              </div>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
