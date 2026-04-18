import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface Props { 
  children: ReactNode;
  fallback?: ReactNode;
}
interface State { 
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = { hasError: false };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleGoHome = () => {
    window.location.hash = '#/';
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex h-screen items-center justify-center flex-col p-6 text-center bg-background">
          <div className="max-w-sm w-full">
            {/* Icon */}
            <div className="w-20 h-20 mx-auto mb-6 bg-destructive/10 rounded-full flex items-center justify-center">
              <AlertTriangle className="w-10 h-10 text-destructive" />
            </div>
            
            {/* Message */}
            <h1 className="text-xl font-bold text-foreground mb-2">
              Something went wrong
            </h1>
            <p className="text-muted-foreground mb-6 text-sm">
              An unexpected error occurred. Don't worry, your data is safe. 
              Please try reloading the page.
            </p>
            
            {/* Error details (collapsed) */}
            {this.state.error && (
              <details className="mb-6 text-left bg-muted/50 rounded-xl p-3">
                <summary className="text-xs font-bold text-muted-foreground cursor-pointer">
                  Technical Details
                </summary>
                <pre className="mt-2 text-[10px] text-destructive overflow-auto max-h-24 font-mono">
                  {this.state.error.message}
                </pre>
              </details>
            )}
            
            {/* Actions */}
            <div className="flex gap-3">
              <button 
                onClick={this.handleGoHome}
                className="flex-1 py-3 px-4 bg-muted text-muted-foreground rounded-xl font-bold text-sm flex items-center justify-center gap-2 active:scale-95 transition-transform"
              >
                <Home size={18} />
                Home
              </button>
              <button 
                onClick={this.handleReload}
                className="flex-[2] py-3 px-4 bg-primary text-primary-foreground rounded-xl font-bold text-sm flex items-center justify-center gap-2 active:scale-95 transition-transform shadow-lg"
              >
                <RefreshCw size={18} />
                Reload App
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// Smaller inline error boundary for components
export const InlineErrorFallback = ({ message = "Failed to load" }: { message?: string }) => (
  <div className="flex items-center justify-center p-8 bg-destructive/5 rounded-2xl border border-destructive/10">
    <div className="text-center">
      <AlertTriangle className="w-8 h-8 text-destructive/60 mx-auto mb-2" />
      <p className="text-sm font-bold text-destructive/80">{message}</p>
      <button 
        onClick={() => window.location.reload()}
        className="mt-3 text-xs font-bold text-primary hover:underline"
      >
        Try Again
      </button>
    </div>
  </div>
);







