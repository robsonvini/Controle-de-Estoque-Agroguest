import { z } from 'zod';
import {
  MOTIVOS_MOVIMENTACAO,
  TIPOS_MOVIMENTACAO,
  TIPOS_NOTIFICACAO,
  TIPOS_RELATORIO,
} from '../enums';
import { idSchema, paginacaoSchema } from './comum';

const horario = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use o formato HH:MM');

/** Configurações gerais (tabela `configuracoes`, chave `sistema`). */
export const configuracoesSistemaSchema = z.object({
  alertas: z.object({
    /** Desvios-padrão acima da média para considerar a saída atípica. */
    multiplicadorDesvio: z.coerce.number().min(1).max(10).default(3),
    /** Janela, em dias, para calcular a média de saídas. */
    janelaDias: z.coerce.number().int().min(7).max(365).default(90),
    /** Mínimo de movimentações na janela para aplicar a regra estatística. */
    minimoAmostras: z.coerce.number().int().min(3).max(100).default(5),
    /** Saída que consome este percentual (ou mais) do saldo é atípica. 0 desativa a regra. */
    percentualSaldoAtipico: z.coerce.number().min(0).max(100).default(80),
    horarioInicio: horario.default('06:00'),
    horarioFim: horario.default('20:00'),
    fusoHorario: z.string().default('America/Sao_Paulo'),
  }),
  notificacoes: z.object({
    emailHabilitado: z.boolean().default(false),
    emailsDestino: z.array(z.email('E-mail inválido')).max(20).default([]),
    tiposPorEmail: z.array(z.enum(TIPOS_NOTIFICACAO)).default([]),
  }),
  integracao: z.object({
    /** Falhas consecutivas antes de gerar o alerta de sincronização. */
    falhasParaAlerta: z.coerce.number().int().min(1).max(20).default(3),
  }),
  retencao: z.object({
    logsIntegracaoDias: z.coerce.number().int().min(30).max(3650).default(180),
    logsAuditoriaDias: z.coerce.number().int().min(180).max(3650).default(1825),
  }),
});
export type ConfiguracoesSistema = z.infer<typeof configuracoesSistemaSchema>;

export const CONFIGURACOES_PADRAO: ConfiguracoesSistema = configuracoesSistemaSchema.parse({
  alertas: {},
  notificacoes: {},
  integracao: {},
  retencao: {},
});

export const filtroRelatorioSchema = z
  .object({
    dataInicio: z.coerce.date().optional(),
    dataFim: z.coerce.date().optional(),
    produtoId: idSchema.optional(),
    categoriaId: idSchema.optional(),
    fornecedorId: idSchema.optional(),
    localId: idSchema.optional(),
    tipo: z.enum(TIPOS_MOVIMENTACAO).optional(),
    motivo: z.enum(MOTIVOS_MOVIMENTACAO).optional(),
    /** Dias sem saída para "sem movimentação" e "baixo giro". */
    dias: z.coerce.number().int().min(1).max(3650).optional(),
    limite: z.coerce.number().int().min(1).max(5000).default(1000),
    formato: z.enum(['json', 'pdf', 'xlsx']).default('json'),
  })
  .refine((f) => !f.dataInicio || !f.dataFim || f.dataInicio <= f.dataFim, {
    message: 'A data inicial deve ser anterior à data final',
    path: ['dataFim'],
  });
export type FiltroRelatorio = z.infer<typeof filtroRelatorioSchema>;
export const tipoRelatorioSchema = z.enum(TIPOS_RELATORIO);

export const listarNotificacoesSchema = paginacaoSchema.extend({
  naoLidas: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  tipo: z.enum(TIPOS_NOTIFICACAO).optional(),
});

export const listarAuditoriaSchema = paginacaoSchema.extend({
  usuarioId: idSchema.optional(),
  entidade: z.string().max(60).optional(),
  acao: z.string().max(60).optional(),
  dataInicio: z.coerce.date().optional(),
  dataFim: z.coerce.date().optional(),
});

export const titularLgpdSchema = z
  .object({
    email: z.email().optional(),
    documento: z.string().max(20).optional(),
  })
  .refine((v) => v.email || v.documento, 'Informe o e-mail ou o documento do titular');
