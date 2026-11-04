import React from 'react';
import { AlertTriangle, RotateCcw, Home } from 'lucide-react';

/**
 * monipack Enterprise CRM - Global Crash Shield (ErrorBoundary)
 * Catches unhandled runtime exceptions in the component tree, preventing white screens
 * and providing a one-click session recovery.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[monipack CRM ErrorBoundary] Caught render exception:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReload = () => {
    window.location.reload();
  };

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6 text-slate-100 font-sans">
          <div className="max-w-lg w-full bg-slate-800 border border-slate-700 rounded-2xl p-6 sm:p-8 shadow-2xl text-center">
            <div className="w-16 h-16 bg-red-500/10 border border-red-500/30 rounded-2xl flex items-center justify-center mx-auto mb-4 text-[#CC1A22]">
              <AlertTriangle className="w-8 h-8 text-red-500" />
            </div>

            <h2 className="text-xl font-black text-white tracking-tight mb-2">
              Something went wrong in <span className="font-monipack lowercase text-2xl font-normal">monipack</span> CRM
            </h2>

            <p className="text-xs text-slate-400 mb-6 leading-relaxed">
              An unexpected display error occurred in this view. Your saved customer leads and quotations are safe on the server.
            </p>

            {this.state.error && (
              <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-3 text-left mb-6 text-[11px] font-mono text-red-400 overflow-x-auto max-h-32">
                {this.state.error.toString()}
              </div>
            )}

            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={this.handleReset}
                className="flex items-center gap-1.5 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold rounded-lg transition cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Try Again</span>
              </button>

              <button
                type="button"
                onClick={this.handleReload}
                className="flex items-center gap-1.5 px-4 py-2 bg-[#CC1A22] hover:bg-red-700 text-white text-xs font-bold rounded-lg shadow-md transition cursor-pointer"
              >
                <Home className="w-3.5 h-3.5" />
                <span>Reload Application</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
