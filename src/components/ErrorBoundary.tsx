import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error.message || 'Gözlənilməz xəta baş verdi.',
    };
  }

  override render() {
    if (this.state.hasError) {
      let friendly = this.state.errorMessage;
      try {
        const parsed = JSON.parse(this.state.errorMessage) as { error?: string; path?: string };
        if (parsed.error) {
          friendly = `Verilənlər bazası əməliyyatında icazə və ya bağlantı xətası (${parsed.path || 'sistem'}): ${parsed.error}`;
        }
      } catch {
        // Keep plain message
      }

      return (
        <div className="min-h-screen bg-[#090B10] text-slate-100 flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-[#11151E] border border-white/10 rounded-xl p-8 space-y-5">
            <div className="flex items-center gap-3 text-amber-400">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h2 className="font-display text-xl font-semibold text-white">
                Sistem Xətası Aşkarlandı
              </h2>
            </div>
            <p className="text-sm text-slate-300 leading-relaxed break-words">{friendly}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500 text-slate-950 font-medium text-sm rounded-lg hover:bg-amber-400 transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Səhifəni Yenilə</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
