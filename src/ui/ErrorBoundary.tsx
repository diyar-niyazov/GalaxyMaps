import { Component, type ReactNode } from "react";

export class ErrorBoundary extends Component<{ children: ReactNode; label: string }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error(`[GalaxyMaps] ${this.props.label} crashed`, error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="crash" role="alert">
        <p>
          <strong>{this.props.label} hit an error.</strong> {this.state.error.message}
        </p>
        <button type="button" className="btn" onClick={() => this.setState({ error: null })}>
          Try again
        </button>
      </div>
    );
  }
}
