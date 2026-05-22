import { Component, type ReactNode, type ErrorInfo } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          minHeight: '100vh', background: '#07090f', color: '#e2eeff',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'monospace', padding: '2rem', gap: '1rem',
        }}>
          <div style={{ fontSize: 32, color: '#ef4444' }}>⚠</div>
          <p style={{ fontSize: 14, fontWeight: 700, color: '#ef4444' }}>Erro de renderização</p>
          <pre style={{
            background: '#0d1220', border: '1px solid rgba(239,68,68,.3)', borderRadius: 8,
            padding: '1rem', maxWidth: 640, width: '100%', overflowX: 'auto',
            fontSize: 11, color: '#fca5a5', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          }}>
            {this.state.error?.message ?? String(this.state.error)}
            {'\n\n'}
            {this.state.error?.stack?.split('\n').slice(1, 6).join('\n')}
          </pre>
          <button
            onClick={() => this.setState({ error: null })}
            style={{
              background: '#0ea5e9', color: '#fff', border: 'none', borderRadius: 6,
              padding: '8px 20px', fontSize: 12, cursor: 'pointer', fontWeight: 600,
            }}
          >
            Tentar novamente
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
