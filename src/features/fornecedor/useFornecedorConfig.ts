import { useCallback, useEffect, useState } from 'react'
import { fornecedorConfig } from '../../lib/api'
import { useERPStore } from '../../store/erpStore'
import { useAlertStore } from '../../store/alertStore'
import { planejarMigracao, planoVazio } from './migracaoConfig'

/** Marca que a subida one-shot do localStorage já aconteceu neste navegador.
 *  Sem a marca, um gestor que apagasse um custo no servidor o veria ressurgir
 *  do cache local no reload seguinte. */
const FLAG_MIGRADO = 'cabonnet-fornecedor-migrado-v1'

/** Data de referência do custo: o FIM do período analisado. Analisar março tem
 *  de usar o custo vigente em março, não o de hoje — é a razão de a vigência
 *  existir. */
function dataRefDe(to: Date | null): string | undefined {
  if (!to) return undefined
  return `${to.getFullYear()}-${String(to.getMonth() + 1).padStart(2, '0')}-${String(to.getDate()).padStart(2, '0')}`
}

export function useFornecedorConfig(to: Date | null) {
  const [custo,     setCusto]     = useState<Record<string, number>>({})
  const [meta,      setMeta]      = useState<Record<string, number>>({})
  const [carregando, setCarregando] = useState(true)
  const [erro,      setErro]      = useState<string | null>(null)

  const dataRef = dataRefDe(to)

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      let resp = await fornecedorConfig.get(dataRef)

      if (!localStorage.getItem(FLAG_MIGRADO)) {
        // getState() em vez de assinar o store: o valor local só interessa neste
        // instante, e assiná-lo faria a migração entrar nas dependências do
        // efeito e reavaliar a cada troca de período.
        const plano = planejarMigracao(
          useERPStore.getState().custoFornecedor,
          useAlertStore.getState().metaSla,
          resp,
        )
        if (!planoVazio(plano)) {
          await Promise.all([
            ...plano.custo.map(c => fornecedorConfig.setCusto({ forn_key: c.fornKey, custo_mensal: c.valor })),
            ...plano.meta.map(m  => fornecedorConfig.setMeta({ forn_key: m.fornKey, meta_sla: m.valor })),
          ])
          resp = await fornecedorConfig.get(dataRef)
        }
        localStorage.setItem(FLAG_MIGRADO, '1')
      }

      setCusto(resp?.custo ?? {})
      setMeta(resp?.meta ?? {})
      setErro(null)
    } catch (e) {
      // Sem fallback para o localStorage de propósito: mostrar um custo local
      // como se viesse do servidor recria exatamente a confusão que esta
      // entrega remove. Melhor a tela dizer que não conseguiu carregar.
      setCusto({})
      setMeta({})
      setErro(e instanceof Error ? e.message : 'Falha ao carregar configuração de fornecedor')
    } finally {
      setCarregando(false)
    }
  }, [dataRef])

  useEffect(() => { void carregar() }, [carregar])

  const salvarCusto = useCallback(async (fornKey: string, valor: number) => {
    await fornecedorConfig.setCusto({ forn_key: fornKey, custo_mensal: valor })
    await carregar()
  }, [carregar])

  const salvarMeta = useCallback(async (fornKey: string, valor: number | null) => {
    await fornecedorConfig.setMeta({ forn_key: fornKey, meta_sla: valor })
    await carregar()
  }, [carregar])

  return { custo, meta, carregando, erro, salvarCusto, salvarMeta }
}
