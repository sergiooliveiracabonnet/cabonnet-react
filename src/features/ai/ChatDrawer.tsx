import { useEffect, useRef, useState } from 'react'
import { AlertCircle, Bot, Loader2, Send, User, Wrench } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Drawer } from '../../components/ui/Drawer'
import { ai } from '../../lib/api'

const MARKDOWN_COMPONENTS = {
  p:          ({ children }: { children?: React.ReactNode }) => <p className="mb-2 last:mb-0">{children}</p>,
  strong:     ({ children }: { children?: React.ReactNode }) => <strong className="font-semibold text-text">{children}</strong>,
  em:         ({ children }: { children?: React.ReactNode }) => <em className="italic">{children}</em>,
  ul:         ({ children }: { children?: React.ReactNode }) => <ul className="list-disc pl-4 mb-2 space-y-0.5 last:mb-0">{children}</ul>,
  ol:         ({ children }: { children?: React.ReactNode }) => <ol className="list-decimal pl-4 mb-2 space-y-0.5 last:mb-0">{children}</ol>,
  li:         ({ children }: { children?: React.ReactNode }) => <li>{children}</li>,
  h1:         ({ children }: { children?: React.ReactNode }) => <h1 className="text-sm font-semibold text-text mb-1.5 mt-2 first:mt-0">{children}</h1>,
  h2:         ({ children }: { children?: React.ReactNode }) => <h2 className="text-sm font-semibold text-text mb-1.5 mt-2 first:mt-0">{children}</h2>,
  h3:         ({ children }: { children?: React.ReactNode }) => <h3 className="text-body font-semibold text-text mb-1 mt-2 first:mt-0">{children}</h3>,
  hr:         () => <hr className="border-white/[0.08] my-2" />,
  a:          ({ children, href }: { children?: React.ReactNode; href?: string }) => (
    <a href={href} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2 hover:text-primary/80">{children}</a>
  ),
  code:       ({ children }: { children?: React.ReactNode }) => (
    <code className="px-1 py-0.5 rounded bg-surface border border-white/[0.08] text-caption font-mono">{children}</code>
  ),
  table:      ({ children }: { children?: React.ReactNode }) => (
    <div className="overflow-x-auto mb-2 last:mb-0 rounded-lg border border-white/[0.08]">
      <table className="w-full text-caption border-collapse">{children}</table>
    </div>
  ),
  thead:      ({ children }: { children?: React.ReactNode }) => <thead className="bg-surface">{children}</thead>,
  th:         ({ children }: { children?: React.ReactNode }) => <th className="text-left font-semibold text-text px-2 py-1.5 border-b border-white/[0.08]">{children}</th>,
  td:         ({ children }: { children?: React.ReactNode }) => <td className="px-2 py-1.5 border-b border-white/[0.06] align-top">{children}</td>,
}

interface Message {
  role: 'user' | 'assistant'
  content: string
  toolCalls?: string[]
}

interface ChatDrawerProps {
  open: boolean
  onClose: () => void
}

const SUGGESTIONS = [
  'Quantas OS estão abertas agora?',
  'Quais equipes têm mais OS atrasadas?',
  'Como está a situação em Taubaté?',
  'Liste as 5 OS mais antigas',
  'Quantas OS estão sem equipe atribuída?',
]

const TOOL_LABELS: Record<string, string> = {
  get_os_resumo:  'resumo OS',
  listar_os:      'listar OS',
  metricas_equipe:'métricas equipe',
  status_juniper: 'Juniper',
}

export function ChatDrawer({ open, onClose }: ChatDrawerProps) {
  const [messages, setMessages]  = useState<Message[]>([])
  const [input,    setInput]     = useState('')
  const [loading,  setLoading]   = useState(false)
  const [error,    setError]     = useState<string | null>(null)
  const bottomRef  = useRef<HTMLDivElement>(null)
  const inputRef   = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 80)
  }, [open])

  async function send() {
    const text = input.trim()
    if (!text || loading) return
    const userMsg: Message = { role: 'user', content: text }
    const newMsgs          = [...messages, userMsg]
    setMessages(newMsgs)
    setInput('')
    setLoading(true)
    setError(null)
    try {
      const result = await ai.chat(newMsgs.map(m => ({ role: m.role, content: m.content })))
      setMessages(prev => [...prev, {
        role:      'assistant',
        content:   result.response,
        toolCalls: result.tool_calls,
      }])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido')
    } finally {
      setLoading(false)
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  function pickSuggestion(q: string) {
    setInput(q)
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Assistente IA"
      subtitle="Pergunte sobre OS, equipes, cidades e dados operacionais em tempo real"
      width="460px"
      actions={
        messages.length > 0 ? (
          <button
            onClick={() => { setMessages([]); setError(null) }}
            className="text-caption text-muted hover:text-secondary transition-colors px-2 py-1 rounded"
          >
            Limpar
          </button>
        ) : undefined
      }
      footerActions={
        <div className="w-full flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Pergunte algo… (Enter para enviar, Shift+Enter = nova linha)"
            rows={2}
            disabled={loading}
            className="flex-1 resize-none rounded-lg bg-card border border-white/[0.08] text-body text-text
                       placeholder:text-muted/50 px-3 py-2 outline-none
                       focus:border-primary/60 focus:ring-1 focus:ring-primary/20
                       transition-all disabled:opacity-50 leading-snug"
          />
          <button
            onClick={send}
            disabled={loading || !input.trim()}
            aria-label="Enviar mensagem"
            className="h-10 w-10 rounded-lg bg-primary hover:bg-primary/80 text-black
                       flex items-center justify-center transition-all flex-shrink-0
                       disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-3 p-4 pb-2">
        {messages.length === 0 && !loading && (
          <div className="flex flex-col items-center gap-4 py-10 text-center">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Bot size={22} className="text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-text">Assistente operacional</p>
              <p className="text-label text-muted mt-1">Consulta dados de OS em tempo real via ferramentas</p>
            </div>
            <div className="w-full space-y-1.5">
              {SUGGESTIONS.map(q => (
                <button
                  key={q}
                  onClick={() => pickSuggestion(q)}
                  className="w-full text-left text-label text-secondary hover:text-text
                             px-3 py-2 rounded-lg border border-white/[0.06]
                             hover:border-white/[0.14] hover:bg-surface/40
                             transition-all duration-150"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
            <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5
                            ${msg.role === 'user'
                              ? 'bg-primary/15 text-primary border border-primary/20'
                              : 'bg-surface border border-white/[0.08] text-secondary'}`}>
              {msg.role === 'user' ? <User size={12} /> : <Bot size={12} />}
            </div>

            <div className={`flex flex-col gap-1 min-w-0 max-w-[87%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
              {msg.toolCalls && msg.toolCalls.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {[...new Set(msg.toolCalls)].map(t => (
                    <span key={t}
                      className="flex items-center gap-1 text-caption text-muted
                                 bg-surface border border-white/[0.06] rounded-full px-2 py-0.5">
                      <Wrench size={9} />
                      {TOOL_LABELS[t] ?? t}
                    </span>
                  ))}
                </div>
              )}
              <div className={`rounded-2xl px-3.5 py-2.5 text-body leading-relaxed break-words min-w-0
                              ${msg.role === 'user'
                                ? 'bg-primary/12 text-text border border-primary/15 rounded-tr-sm whitespace-pre-wrap'
                                : 'bg-card border border-white/[0.08] text-text rounded-tl-sm'}`}>
                {msg.role === 'assistant' ? (
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
                    {msg.content}
                  </ReactMarkdown>
                ) : (
                  msg.content
                )}
              </div>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex gap-2.5">
            <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0
                            bg-surface border border-white/[0.08] text-secondary">
              <Bot size={12} />
            </div>
            <div className="flex items-center gap-2 bg-card border border-white/[0.08] rounded-2xl rounded-tl-sm px-3.5 py-2.5">
              <Loader2 size={12} className="text-primary animate-spin flex-shrink-0" />
              <span className="text-label text-muted">Consultando dados…</span>
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl
                          bg-red/[0.07] border border-red/20 text-red text-label">
            <AlertCircle size={13} className="flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </Drawer>
  )
}
