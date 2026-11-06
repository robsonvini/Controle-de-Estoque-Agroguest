import { z } from 'zod';

/**
 * Data recebida como texto ISO 8601 (formato do JSON) e convertida para Date.
 * Representável em JSON Schema/OpenAPI como string, ao contrário de z.coerce.date().
 */
export const dataTexto = z
  .string({ error: 'Data inválida' })
  .trim()
  .refine((s) => !Number.isNaN(Date.parse(s)), 'Data inválida')
  .transform((s) => new Date(s));

/** Texto obrigatório, sem espaços nas pontas. */
export const textoObrigatorio = (max: number) =>
  z.string().trim().min(1, 'Campo obrigatório').max(max, `Máximo de ${max} caracteres`);

/** Texto opcional: string vazia vira `null`. */
export const textoOpcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo de ${max} caracteres`)
    .nullish()
    .transform((v) => (v ? v : null));

export const idSchema = z.uuid('Identificador inválido');
export const idOpcional = z
  .union([z.uuid('Identificador inválido'), z.literal('')])
  .nullish()
  .transform((v) => (v ? v : null));

function casasDecimais(valor: number): number {
  if (!Number.isFinite(valor)) return 0;
  const s = valor.toString();
  if (s.includes('e-')) return Number(s.split('e-')[1]);
  return s.includes('.') ? s.split('.')[1]!.length : 0;
}

/** Quantidade positiva com até 4 casas decimais (aceita número ou texto). */
export const quantidadePositiva = z.coerce
  .number({ error: 'Informe um número válido' })
  .positive('A quantidade deve ser maior que zero')
  .max(1_000_000_000, 'Quantidade acima do limite permitido')
  .refine((v) => casasDecimais(v) <= 4, 'Use no máximo 4 casas decimais');

/** Quantidade maior ou igual a zero. */
export const quantidadeNaoNegativa = z.coerce
  .number({ error: 'Informe um número válido' })
  .min(0, 'O valor não pode ser negativo')
  .max(1_000_000_000, 'Valor acima do limite permitido')
  .refine((v) => casasDecimais(v) <= 4, 'Use no máximo 4 casas decimais');

/** Valor monetário não negativo com até 4 casas decimais. */
export const valorMonetario = z.coerce
  .number({ error: 'Informe um valor válido' })
  .min(0, 'O valor não pode ser negativo')
  .max(1_000_000_000, 'Valor acima do limite permitido')
  .refine((v) => casasDecimais(v) <= 4, 'Use no máximo 4 casas decimais');

export const emailOpcional = z
  .union([z.email('E-mail inválido').max(160), z.literal('')])
  .nullish()
  .transform((v) => (v ? v.toLowerCase() : null));

export const telefoneOpcional = z
  .string()
  .trim()
  .regex(/^[\d\s()+-]{8,20}$/, 'Telefone inválido')
  .or(z.literal(''))
  .nullish()
  .transform((v) => (v ? v : null));

/** Data/hora opcional; não pode estar no futuro (tolerância de 5 minutos). */
export const dataHoraNaoFutura = dataTexto
  .refine((d) => d.getTime() <= Date.now() + 5 * 60_000, 'A data não pode estar no futuro')
  .optional();

export const paginacaoSchema = z.object({
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(1).max(200).default(20),
  ordenarPor: z.string().trim().max(50).optional(),
  ordem: z.enum(['asc', 'desc']).default('asc'),
  busca: z.string().trim().max(120).optional(),
});
export type Paginacao = z.infer<typeof paginacaoSchema>;

export interface Paginado<T> {
  dados: T[];
  total: number;
  pagina: number;
  porPagina: number;
  totalPaginas: number;
}

export const booleanoQuery = z
  .enum(['true', 'false'])
  .optional()
  .transform((v) => (v === undefined ? undefined : v === 'true'));

export const periodoSchema = z
  .object({
    dataInicio: dataTexto.optional(),
    dataFim: dataTexto.optional(),
  })
  .refine((p) => !p.dataInicio || !p.dataFim || p.dataInicio <= p.dataFim, {
    message: 'A data inicial deve ser anterior à data final',
    path: ['dataFim'],
  });
