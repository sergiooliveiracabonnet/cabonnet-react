// Migração one-shot do que já está no localStorage para o servidor.
//
// Sem isto, o custo que o gestor digitou some na entrega — regressão visível
// para quem mais usa a tela. A regra que não é óbvia: o servidor SEMPRE vence.
// Migrar por cima de um valor já gravado no servidor sobrescreveria a decisão de
// outro gestor com um resíduo do navegador local, que é justamente o problema
// que esta entrega existe para acabar.

export interface ConfigServidor {
  custo: Record<string, number>
  meta:  Record<string, number>
}

export interface MigracaoPlano {
  custo: { fornKey: string; valor: number }[]
  meta:  { fornKey: string; valor: number }[]
}

export function planejarMigracao(
  localCusto: Record<string, number>,
  localMeta:  Record<string, number>,
  servidor:   ConfigServidor,
): MigracaoPlano {
  const custo = Object.entries(localCusto ?? {})
    // Zero é o default semeado no store, não um valor que alguém digitou.
    .filter(([fornKey, valor]) => valor > 0 && servidor.custo[fornKey] == null)
    .map(([fornKey, valor]) => ({ fornKey, valor }))

  const meta = Object.entries(localMeta ?? {})
    .filter(([fornKey, valor]) => valor != null && servidor.meta[fornKey] == null)
    .map(([fornKey, valor]) => ({ fornKey, valor }))

  return { custo, meta }
}

export function planoVazio(plano: MigracaoPlano): boolean {
  return plano.custo.length === 0 && plano.meta.length === 0
}
