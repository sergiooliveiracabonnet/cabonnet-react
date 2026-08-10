import { useMemo, useState } from 'react'
import { Brain, CheckCircle, CircleNotch, PaperPlaneTilt, Robot, ShieldCheck, Sparkle, User, WarningCircle } from '@phosphor-icons/react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Button } from '../../components/ui/Button'
import { ai } from '../../lib/api'
import { buildAIContext, type SignalFilters, type SignalRow } from './nivelSinal'

interface ActionItem { prazo: string; acao: string; responsavel: string; criterio: string }
interface Analysis { diagnostico: string; prioridades: string[]; plano_acao: ActionItem[]; riscos: string[]; cached?: boolean }
interface Message { role: 'user' | 'assistant'; content: string }

const SUGGESTIONS = ['Por qual PON devemos começar?', 'Quais OLTs concentram mais risco?', 'O problema parece coletivo ou isolado?', 'Monte uma ordem de atuação para as equipes.']

export function NivelSinalAI({ rows, filters }: { rows: SignalRow[]; filters: SignalFilters }) {
  const context = useMemo(() => buildAIContext(rows, filters), [rows, filters])
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [question, setQuestion] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [answering, setAnswering] = useState(false)
  const [error, setError] = useState('')

  async function analyze() {
    setAnalyzing(true); setError('')
    try {
      const result = await ai.nivelSinal({ contexto: context }) as { ok: boolean } & Analysis
      if (!result.ok) throw new Error('A IA não retornou uma análise válida.')
      setAnalysis(result)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível analisar o relatório.')
    } finally { setAnalyzing(false) }
  }

  async function ask(text = question) {
    const value = text.trim()
    if (!value || answering) return
    const userMessage: Message = { role: 'user', content: value }
    const history = [...messages, userMessage]
    setMessages(history); setQuestion(''); setAnswering(true); setError('')
    try {
      const result = await ai.nivelSinal({ contexto: context, pergunta: value, historico: messages.slice(-6) }) as { ok: boolean; resposta?: string }
      if (!result.ok || !result.resposta) throw new Error('A IA não retornou uma resposta válida.')
      setMessages(current => [...current, { role: 'assistant', content: result.resposta! }])
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível responder à pergunta.')
    } finally { setAnswering(false) }
  }

  return <section className="overflow-hidden rounded-xl border border-primary/20 bg-card shadow-lg">
    <div className="flex flex-wrap items-center gap-3 border-b border-border bg-primary/[0.04] px-5 py-4">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-primary/20 bg-primary/10"><Brain size={18} className="text-primary" /></div>
      <div className="min-w-0 flex-1"><h2 className="flex items-center gap-2 text-body font-bold text-text">Agente IA · análise óptica <span className="rounded-full bg-primary/10 px-2 py-0.5 text-caption font-semibold text-primary">Claude</span></h2><p className="mt-0.5 text-caption text-muted">Diagnóstico, prioridades e plano de ação baseados no recorte atual do relatório.</p></div>
      <div className="flex items-center gap-2 text-caption text-muted"><ShieldCheck size={13} className="text-green" /> Somente métricas agregadas</div>
      <Button onClick={analyze} disabled={analyzing}>{analyzing ? <CircleNotch size={14} className="animate-spin" /> : <Sparkle size={14} />}{analysis ? 'Reanalisar' : 'Analisar relatório'}</Button>
    </div>

    {error && <div role="alert" className="m-4 flex items-center gap-2 rounded-lg border border-red/20 bg-red/[0.07] px-3 py-2 text-label text-red"><WarningCircle size={14} />{error}</div>}

    {!analysis && !analyzing ? <div className="grid gap-4 p-5 lg:grid-cols-[1fr_1.2fr]"><div className="rounded-xl border border-border bg-surface/20 p-5"><Robot size={24} className="text-primary" /><p className="mt-3 text-body font-semibold text-text">Transforme o relatório em decisão operacional</p><p className="mt-1 text-label leading-relaxed text-muted">A IA cruza severidade, RX, OLTs, PONs, cidades, hotspots, causas e modelos. Nenhum nome, PPPoE, código ou serial é enviado.</p></div><div><Conversation messages={messages} /><QuestionBox question={question} setQuestion={setQuestion} ask={ask} answering={answering} suggestions={SUGGESTIONS} /></div></div> : null}

    {analyzing && <div className="flex items-center justify-center gap-3 px-5 py-12 text-label text-muted"><CircleNotch size={18} className="animate-spin text-primary" />Analisando padrões e montando plano de ação…</div>}

    {analysis && <div className="space-y-5 p-5">
      <div className="rounded-xl border border-primary/15 bg-primary/[0.04] p-4"><p className="text-caption font-bold uppercase tracking-wide text-primary">Diagnóstico</p><p className="mt-2 text-body leading-relaxed text-text">{analysis.diagnostico}</p></div>
      <div className="grid gap-4 lg:grid-cols-[.8fr_1.2fr]">
        <div><h3 className="mb-2 text-label font-bold uppercase tracking-wide text-muted">Prioridades</h3><div className="space-y-2">{analysis.prioridades.map((item, index) => <div key={item} className="flex gap-3 rounded-lg border border-border bg-surface/20 p-3"><span className="font-mono text-caption font-bold text-primary">{String(index + 1).padStart(2, '0')}</span><span className="text-label text-text">{item}</span></div>)}</div></div>
        <div><h3 className="mb-2 text-label font-bold uppercase tracking-wide text-muted">Plano de ação</h3><div className="space-y-2">{analysis.plano_acao.map((item, index) => <div key={`${item.prazo}-${index}`} className="grid gap-2 rounded-lg border border-border bg-surface/20 p-3 sm:grid-cols-[90px_1fr_100px]"><span className="text-caption font-bold text-primary">{item.prazo}</span><div><p className="text-label font-semibold text-text">{item.acao}</p><p className="mt-1 flex items-center gap-1 text-caption text-muted"><CheckCircle size={11} />{item.criterio}</p></div><span className="text-caption font-semibold text-secondary">{item.responsavel}</span></div>)}</div></div>
      </div>
      {analysis.riscos.length > 0 && <div className="flex flex-wrap gap-2">{analysis.riscos.map(item => <span key={item} className="rounded-full border border-orange/20 bg-orange/[0.07] px-3 py-1 text-caption text-orange">{item}</span>)}</div>}
      <div className="border-t border-border pt-5"><Conversation messages={messages} /><QuestionBox question={question} setQuestion={setQuestion} ask={ask} answering={answering} suggestions={SUGGESTIONS} /></div>
    </div>}
  </section>
}

function Conversation({ messages }: { messages: Message[] }) {
  if (!messages.length) return null
  return <div className="mb-4 max-h-80 space-y-3 overflow-y-auto rounded-xl border border-border bg-bg/40 p-4">{messages.map((message, index) => <div key={index} className={`flex gap-2 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}><span className={`mt-1 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full ${message.role === 'user' ? 'order-2 bg-primary/10 text-primary' : 'bg-surface text-secondary'}`}>{message.role === 'user' ? <User size={11} /> : <Robot size={11} />}</span><div className={`max-w-[85%] rounded-xl border px-3 py-2 text-label leading-relaxed ${message.role === 'user' ? 'border-primary/15 bg-primary/[0.07] text-text' : 'border-border bg-card text-secondary'}`}>{message.role === 'assistant' ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown> : message.content}</div></div>)}</div>
}

function QuestionBox({ question, setQuestion, ask, answering, suggestions }: { question: string; setQuestion: (value: string) => void; ask: (value?: string) => void; answering: boolean; suggestions: string[] }) {
  return <div><div className="mb-3 flex flex-wrap gap-2">{suggestions.map(item => <button key={item} onClick={() => ask(item)} disabled={answering} className="rounded-full border border-border px-3 py-1 text-caption text-muted hover:border-primary/30 hover:text-primary disabled:opacity-40">{item}</button>)}</div><div className="flex items-end gap-2"><label className="flex-1"><span className="sr-only">Pergunta para a IA</span><textarea value={question} onChange={event => setQuestion(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); ask() } }} rows={2} placeholder="Pergunte sobre riscos, prioridades, cidades, OLTs ou PONs…" className="w-full resize-none rounded-lg border border-border bg-surface px-3 py-2 text-body text-text outline-none placeholder:text-muted focus:border-primary/50" /></label><Button aria-label="Enviar pergunta" onClick={() => ask()} disabled={!question.trim() || answering} className="h-11 w-11 px-0">{answering ? <CircleNotch size={15} className="animate-spin" /> : <PaperPlaneTilt size={15} />}</Button></div></div>
}
