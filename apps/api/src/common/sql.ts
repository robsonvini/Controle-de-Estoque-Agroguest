import { Prisma } from '../generated/prisma/client';

/** Condição SQL: categoria informada ou qualquer subcategoria dela (recursivo). */
export function sqlCategoriaComFilhas(coluna: Prisma.Sql, categoriaId: string): Prisma.Sql {
  return Prisma.sql`${coluna} IN (
    WITH RECURSIVE arvore AS (
      SELECT id FROM categorias WHERE id = ${categoriaId}::uuid
      UNION ALL
      SELECT c.id FROM categorias c JOIN arvore a ON c.pai_id = a.id
    ) SELECT id FROM arvore
  )`;
}

/** Subconsulta com saldo total, reservado e disponível por produto. */
export const SQL_SALDO_POR_PRODUTO = Prisma.sql`(
  SELECT produto_id,
         SUM(quantidade) AS quantidade,
         SUM(reservado) AS reservado,
         SUM(quantidade - reservado) AS disponivel
    FROM saldos_estoque
   GROUP BY produto_id
)`;

/** Expressão da situação do estoque a partir do saldo disponível e do mínimo. */
export const SQL_SITUACAO = Prisma.sql`CASE
  WHEN COALESCE(s.disponivel, 0) <= 0 THEN 'ESGOTADO'
  WHEN p.estoque_minimo > 0 AND COALESCE(s.disponivel, 0) <= p.estoque_minimo THEN 'BAIXO'
  ELSE 'DISPONIVEL' END`;

export function sqlFiltroSituacao(situacao?: 'DISPONIVEL' | 'BAIXO' | 'ESGOTADO'): Prisma.Sql {
  switch (situacao) {
    case 'ESGOTADO':
      return Prisma.sql`AND COALESCE(s.disponivel, 0) <= 0`;
    case 'BAIXO':
      return Prisma.sql`AND COALESCE(s.disponivel, 0) > 0 AND p.estoque_minimo > 0 AND COALESCE(s.disponivel, 0) <= p.estoque_minimo`;
    case 'DISPONIVEL':
      return Prisma.sql`AND COALESCE(s.disponivel, 0) > p.estoque_minimo AND COALESCE(s.disponivel, 0) > 0`;
    default:
      return Prisma.empty;
  }
}

/** Escapa curingas do LIKE para busca literal. */
export function termoBusca(busca: string): string {
  return `%${busca.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/** Converte valores numéricos/bigint vindos de consultas SQL para tipos JSON seguros. */
export function normalizarLinha<T extends Record<string, unknown>>(linha: T): T {
  const saida: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(linha)) {
    if (typeof v === 'bigint') saida[k] = Number(v);
    else if (v instanceof Prisma.Decimal) saida[k] = v.toString();
    else saida[k] = v;
  }
  return saida as T;
}
