import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

export interface MenuFallbackAction {
  label: string;
  onClick: () => void;
}

interface MenuErrorBoundaryProps {
  menuLabel: string;
  resetKey: string;
  fallbackActions?: MenuFallbackAction[];
  children: ReactNode;
}

interface MenuErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class MenuErrorBoundary extends Component<
  MenuErrorBoundaryProps,
  MenuErrorBoundaryState
> {
  state: MenuErrorBoundaryState = {
    hasError: false,
    errorMessage: '',
  };

  static getDerivedStateFromError(error: Error): MenuErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error.message || 'This menu view encountered an unexpected issue.',
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`Menu view error (${this.props.menuLabel}):`, error, info.componentStack);
  }

  componentDidUpdate(prevProps: MenuErrorBoundaryProps): void {
    if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false, errorMessage: '' });
    }
  }

  private handleRetry = () => {
    this.setState({ hasError: false, errorMessage: '' });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const { menuLabel, fallbackActions = [] } = this.props;

    return (
      <div className="bg-white border border-slate-200 rounded-lg p-6 max-w-2xl mx-auto my-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-amber-50 border border-amber-200 rounded-md text-amber-700 shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h2 className="text-sm font-bold text-slate-900">
              {menuLabel} could not load
            </h2>
            <p className="text-xs text-slate-600">
              {this.state.errorMessage} You can retry this screen or switch directly to a working menu below.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={this.handleRetry}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#0B3B2B] hover:bg-[#08291E] rounded-md whitespace-nowrap"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Retry {menuLabel}
          </button>

          {fallbackActions.map((act) => (
            <button
              key={act.label}
              type="button"
              onClick={() => {
                this.setState({ hasError: false, errorMessage: '' });
                act.onClick();
              }}
              className="px-3 py-2 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-300 rounded-md whitespace-nowrap"
            >
              {act.label}
            </button>
          ))}
        </div>
      </div>
    );
  }
}
