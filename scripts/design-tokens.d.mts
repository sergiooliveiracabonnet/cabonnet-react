export interface DesignTokens {
  /** false enquanto o index.css estiver na camada única anterior à Fase 1. */
  emCamadas: boolean
  primitivos: Record<string, string>
  dark: Record<string, string>
  light: Record<string, string>
}

export declare function parseTokens(css: string): DesignTokens
export declare function resolveTheme(tokens: DesignTokens, tema: 'dark' | 'light'): Record<string, string>
export declare function lerIndexCss(caminho?: string): DesignTokens

export interface EscalaTipo {
  /** Papel → tamanho em px. Ordenado do menor para o maior. */
  mesa: Record<string, number>
  parede: Record<string, number>
}

export declare function parseEscalaTipo(css: string): EscalaTipo
export declare function lerEscalaTipo(caminho?: string): EscalaTipo
