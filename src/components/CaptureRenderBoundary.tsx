import { Component, type ErrorInfo, type ReactNode } from "react";
import { TriangleAlert } from "lucide-react";
import type { AppLanguage } from "../i18n";

interface CaptureRenderBoundaryProps {
  children: ReactNode;
  language: AppLanguage;
  resetKey: string;
  onReset: () => void;
}

interface CaptureRenderBoundaryState {
  error: Error | null;
}

const text = {
  ja: {
    title: "MIDI解析結果を表示できませんでした",
    description:
      "このMIDIの解析結果を画面へ表示する途中で問題が発生しました。アプリはそのまま利用できます。",
    reset: "MIDI選択へ戻る",
    details: "技術情報",
  },
  en: {
    title: "Could not display the MIDI analysis",
    description:
      "A problem occurred while displaying this MIDI analysis. The rest of the app is still available.",
    reset: "Back to MIDI selection",
    details: "Technical details",
  },
} as const;

export class CaptureRenderBoundary extends Component<
  CaptureRenderBoundaryProps,
  CaptureRenderBoundaryState
> {
  state: CaptureRenderBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): CaptureRenderBoundaryState {
    return {
      error: error instanceof Error ? error : new Error("Unknown Capture rendering error"),
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Capture view rendering failed.", error, info.componentStack);
  }

  componentDidUpdate(previous: CaptureRenderBoundaryProps) {
    if (previous.resetKey !== this.props.resetKey && this.state.error !== null) {
      this.setState({ error: null });
    }
  }

  private reset = () => {
    this.props.onReset();
  };

  render() {
    const { error } = this.state;
    if (error === null) return this.props.children;

    const copy = text[this.props.language];
    return (
      <section
        className="my-5 border border-red-400/40 bg-red-950/20 p-5"
        role="alert"
        data-testid="capture-render-error"
      >
        <div className="flex items-start gap-3">
          <TriangleAlert className="mt-0.5 shrink-0 text-red-300" aria-hidden="true" size={20} />
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-red-100">{copy.title}</h2>
            <p className="mt-2 text-sm text-red-100/80">{copy.description}</p>
            <button
              type="button"
              className="mt-4 min-h-10 border border-red-300/50 px-4 text-sm font-semibold text-red-50 hover:bg-red-300/10"
              onClick={this.reset}
            >
              {copy.reset}
            </button>
            <details className="mt-4 text-xs text-red-100/70">
              <summary className="cursor-pointer">{copy.details}</summary>
              <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap break-words">
                {error.name}: {error.message}
              </pre>
            </details>
          </div>
        </div>
      </section>
    );
  }
}
