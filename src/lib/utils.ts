/** Junta classes ignorando valores vazios — o `cn` do shadcn sem tailwind-merge
 *  (o projeto não usa). Passe só classes que somam; conflito não é resolvido. */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ')
}
