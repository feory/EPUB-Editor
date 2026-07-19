import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  private handleGoHome = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = '/';
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-bg-color flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-surface rounded-3xl shadow-2xl border border-border overflow-hidden p-8 text-center animate-in fade-in zoom-in duration-300">
            <div className="w-20 h-20 bg-rose-50 rounded-full flex items-center justify-center text-rose-500 mx-auto mb-6">
              <AlertCircle size={40} />
            </div>
            
            <h1 className="text-2xl font-bold text-slate-700 mb-2">Ups! Algo correu mal.</h1>
            <p className="text-text-muted mb-8 leading-relaxed">
              Ocorreu um erro inesperado na aplicação. Pedimos desculpa pelo incómodo.
            </p>

            {this.state.error && (
              <div className="bg-slate-50 rounded-xl p-4 mb-8 text-left overflow-hidden">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Detalhes do Erro</p>
                <p className="text-xs font-mono text-rose-600 break-words">{this.state.error.message}</p>
              </div>
            )}

            <div className="grid grid-cols-1 gap-3">
              <button
                onClick={this.handleReset}
                className="inline-flex items-center justify-center gap-2 bg-slate-700 hover:bg-slate-800 text-white px-6 py-3 rounded-xl font-bold transition-all shadow-md active:scale-95"
              >
                <RefreshCw size={18} />
                <span>Tentar Novamente</span>
              </button>
              
              <button
                onClick={this.handleGoHome}
                className="inline-flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-text-main px-6 py-3 rounded-xl font-bold transition-all active:scale-95"
              >
                <Home size={18} />
                <span>Voltar ao Início</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
