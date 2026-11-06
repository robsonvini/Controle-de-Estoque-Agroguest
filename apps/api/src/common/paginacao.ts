import type { Paginacao, Paginado } from '@estoque/shared';

export function paginar(p: Pick<Paginacao, 'pagina' | 'porPagina'>) {
  return { skip: (p.pagina - 1) * p.porPagina, take: p.porPagina };
}

export function resultadoPaginado<T>(dados: T[], total: number, p: Paginacao): Paginado<T> {
  return {
    dados,
    total,
    pagina: p.pagina,
    porPagina: p.porPagina,
    totalPaginas: Math.max(1, Math.ceil(total / p.porPagina)),
  };
}

/** Ordenação segura: só aceita campos da lista permitida (evita injeção em orderBy). */
export function ordenacao<T extends string>(
  p: Pick<Paginacao, 'ordenarPor' | 'ordem'>,
  permitidos: readonly T[],
  padrao: T,
): Record<string, 'asc' | 'desc'> {
  const campo = (permitidos as readonly string[]).includes(p.ordenarPor ?? '')
    ? p.ordenarPor!
    : padrao;
  return { [campo]: p.ordem };
}

/** Filtro de intervalo de datas inclusivo (dataFim considera o dia inteiro quando sem hora). */
export function intervaloDatas(inicio?: Date, fim?: Date) {
  if (!inicio && !fim) return undefined;
  const filtro: { gte?: Date; lte?: Date } = {};
  if (inicio) filtro.gte = inicio;
  if (fim) {
    const f = new Date(fim);
    if (f.getUTCHours() === 0 && f.getUTCMinutes() === 0 && f.getUTCSeconds() === 0) {
      f.setUTCHours(23, 59, 59, 999);
    }
    filtro.lte = f;
  }
  return filtro;
}
