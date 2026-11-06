import { z } from 'zod';
import {
  MOTIVOS_ENTRADA,
  MOTIVOS_MOVIMENTACAO,
  MOTIVOS_SAIDA,
  STATUS_AJUSTE,
  STATUS_INVENTARIO,
  STATUS_PEDIDO,
  STATUS_PEDIDO_COMPRA,
  TIPOS_MOVIMENTACAO,
} from '../enums';
import {
  dataHoraNaoFutura,
  idOpcional,
  idSchema,
  paginacaoSchema,
  quantidadeNaoNegativa,
  quantidadePositiva,
  textoObrigatorio,
  textoOpcional,
  valorMonetario,
} from './comum';

const MAX_ITENS = 200;

const semItensDuplicados = <T extends { produtoId: string; localId?: string }>(itens: T[]) =>
  new Set(itens.map((i) => `${i.produtoId}:${i.localId ?? ''}`)).size === itens.length;

const documento = {
  numeroDocumento: textoOpcional(60),
  serieDocumento: textoOpcional(10),
  dataDocumento: z.coerce.date().nullish(),
};

// ---------------- Entradas ----------------
export const entradaSchema = z
  .object({
    motivo: z.enum(MOTIVOS_ENTRADA),
    dataMovimentacao: dataHoraNaoFutura,
    fornecedorId: idOpcional,
    clienteCrmId: idOpcional,
    ...documento,
    observacao: textoOpcional(1000),
    itens: z
      .array(
        z.object({
          produtoId: idSchema,
          localId: idSchema,
          quantidade: quantidadePositiva,
          custoUnitario: valorMonetario.nullish(),
        }),
      )
      .min(1, 'Informe ao menos um item')
      .max(MAX_ITENS),
  })
  .superRefine((e, ctx) => {
    if ((e.motivo === 'COMPRA' || e.motivo === 'RECEBIMENTO') && !e.fornecedorId) {
      ctx.addIssue({ code: 'custom', path: ['fornecedorId'], message: 'Informe o fornecedor' });
    }
    if (e.motivo === 'COMPRA' || e.motivo === 'RECEBIMENTO') {
      e.itens.forEach((item, i) => {
        if (item.custoUnitario == null) {
          ctx.addIssue({
            code: 'custom',
            path: ['itens', i, 'custoUnitario'],
            message: 'Informe o custo unitário',
          });
        }
      });
    }
    if (e.motivo === 'AJUSTE_POSITIVO' && !e.observacao) {
      ctx.addIssue({
        code: 'custom',
        path: ['observacao'],
        message: 'Informe a justificativa do ajuste',
      });
    }
    if (!semItensDuplicados(e.itens)) {
      ctx.addIssue({ code: 'custom', path: ['itens'], message: 'Produto e local repetidos' });
    }
  });
export type EntradaInput = z.infer<typeof entradaSchema>;

// ---------------- Saídas ----------------
export const saidaSchema = z
  .object({
    motivo: z.enum(MOTIVOS_SAIDA),
    dataMovimentacao: dataHoraNaoFutura,
    clienteCrmId: idOpcional,
    fornecedorId: idOpcional,
    destino: textoOpcional(120),
    numeroDocumento: textoOpcional(60),
    observacao: textoOpcional(1000),
    itens: z
      .array(z.object({ produtoId: idSchema, localId: idSchema, quantidade: quantidadePositiva }))
      .min(1, 'Informe ao menos um item')
      .max(MAX_ITENS),
  })
  .superRefine((s, ctx) => {
    if (s.motivo === 'DEVOLUCAO_FORNECEDOR' && !s.fornecedorId) {
      ctx.addIssue({ code: 'custom', path: ['fornecedorId'], message: 'Informe o fornecedor' });
    }
    if (s.motivo === 'CONSUMO_INTERNO' && !s.destino) {
      ctx.addIssue({
        code: 'custom',
        path: ['destino'],
        message: 'Informe o setor ou destino do consumo',
      });
    }
    if ((s.motivo === 'PERDA' || s.motivo === 'AVARIA') && !s.observacao) {
      ctx.addIssue({
        code: 'custom',
        path: ['observacao'],
        message: 'Descreva a perda ou avaria',
      });
    }
    if (!semItensDuplicados(s.itens)) {
      ctx.addIssue({ code: 'custom', path: ['itens'], message: 'Produto e local repetidos' });
    }
  });
export type SaidaInput = z.infer<typeof saidaSchema>;

// ---------------- Transferências ----------------
export const transferenciaSchema = z
  .object({
    localOrigemId: idSchema,
    localDestinoId: idSchema,
    dataMovimentacao: dataHoraNaoFutura,
    observacao: textoOpcional(1000),
    itens: z
      .array(z.object({ produtoId: idSchema, quantidade: quantidadePositiva }))
      .min(1, 'Informe ao menos um item')
      .max(MAX_ITENS),
  })
  .refine((t) => t.localOrigemId !== t.localDestinoId, {
    message: 'O local de destino deve ser diferente do local de origem',
    path: ['localDestinoId'],
  })
  .refine((t) => semItensDuplicados(t.itens), { message: 'Produto repetido', path: ['itens'] });
export type TransferenciaInput = z.infer<typeof transferenciaSchema>;

export const estornoSchema = z.object({ justificativa: textoObrigatorio(500) });
export type EstornoInput = z.infer<typeof estornoSchema>;

export const listarMovimentacoesSchema = paginacaoSchema.extend({
  tipo: z.enum(TIPOS_MOVIMENTACAO).optional(),
  motivo: z.enum(MOTIVOS_MOVIMENTACAO).optional(),
  produtoId: idSchema.optional(),
  localId: idSchema.optional(),
  fornecedorId: idSchema.optional(),
  clienteCrmId: idSchema.optional(),
  usuarioId: idSchema.optional(),
  dataInicio: z.coerce.date().optional(),
  dataFim: z.coerce.date().optional(),
});
export type ListarMovimentacoesQuery = z.infer<typeof listarMovimentacoesSchema>;

export const listarSaldosSchema = paginacaoSchema.extend({
  produtoId: idSchema.optional(),
  localId: idSchema.optional(),
  categoriaId: idSchema.optional(),
  somenteComSaldo: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

// ---------------- Compras ----------------
export const pedidoCompraSchema = z.object({
  fornecedorId: idSchema,
  previsaoEntrega: z.coerce.date().nullish(),
  observacao: textoOpcional(1000),
  itens: z
    .array(
      z.object({
        produtoId: idSchema,
        quantidade: quantidadePositiva,
        precoUnitario: valorMonetario,
      }),
    )
    .min(1, 'Informe ao menos um item')
    .max(MAX_ITENS)
    .refine((i) => new Set(i.map((x) => x.produtoId)).size === i.length, 'Produto repetido'),
});
export type PedidoCompraInput = z.infer<typeof pedidoCompraSchema>;

export const recebimentoSchema = z.object({
  dataMovimentacao: dataHoraNaoFutura,
  ...documento,
  observacao: textoOpcional(1000),
  itens: z
    .array(z.object({ itemId: idSchema, localId: idSchema, quantidade: quantidadePositiva }))
    .min(1, 'Informe ao menos um item recebido')
    .max(MAX_ITENS),
});
export type RecebimentoInput = z.infer<typeof recebimentoSchema>;

export const listarComprasSchema = paginacaoSchema.extend({
  fornecedorId: idSchema.optional(),
  status: z.enum(STATUS_PEDIDO_COMPRA).optional(),
  dataInicio: z.coerce.date().optional(),
  dataFim: z.coerce.date().optional(),
});

export const cancelamentoSchema = z.object({ motivo: textoObrigatorio(500) });
export type CancelamentoInput = z.infer<typeof cancelamentoSchema>;

// ---------------- Pedidos de venda ----------------
export const pedidoVendaSchema = z.object({
  clienteCrmId: idOpcional,
  observacao: textoOpcional(1000),
  itens: z
    .array(
      z.object({
        produtoId: idSchema,
        localId: idSchema,
        quantidade: quantidadePositiva,
        precoUnitario: valorMonetario.nullish(),
      }),
    )
    .min(1, 'Informe ao menos um item')
    .max(MAX_ITENS)
    .refine(semItensDuplicados, 'Produto e local repetidos'),
});
export type PedidoVendaInput = z.infer<typeof pedidoVendaSchema>;

export const listarPedidosSchema = paginacaoSchema.extend({
  status: z.enum(STATUS_PEDIDO).optional(),
  origem: z.enum(['MANUAL', 'CRM_API']).optional(),
  clienteCrmId: idSchema.optional(),
  dataInicio: z.coerce.date().optional(),
  dataFim: z.coerce.date().optional(),
});

// ---------------- Inventário ----------------
export const inventarioSchema = z.object({
  descricao: textoObrigatorio(150),
  localId: idOpcional,
  categoriaId: idOpcional,
  incluirSemSaldo: z.boolean().default(false),
  observacao: textoOpcional(1000),
});
export type InventarioInput = z.infer<typeof inventarioSchema>;

export const contagemSchema = z.object({
  itens: z
    .array(z.object({ itemId: idSchema, quantidadeContada: quantidadeNaoNegativa }))
    .min(1)
    .max(1000),
});
export type ContagemInput = z.infer<typeof contagemSchema>;

export const listarInventariosSchema = paginacaoSchema.extend({
  status: z.enum(STATUS_INVENTARIO).optional(),
});

// ---------------- Ajustes ----------------
export const ajusteSchema = z.object({
  justificativa: textoObrigatorio(1000),
  itens: z
    .array(
      z.object({
        produtoId: idSchema,
        localId: idSchema,
        quantidadeDelta: z.coerce
          .number({ error: 'Informe um número válido' })
          .refine((v) => v !== 0, 'A quantidade do ajuste não pode ser zero')
          .refine((v) => Math.abs(v) <= 1_000_000_000, 'Quantidade acima do limite'),
      }),
    )
    .min(1, 'Informe ao menos um item')
    .max(MAX_ITENS)
    .refine(semItensDuplicados, 'Produto e local repetidos'),
});
export type AjusteInput = z.infer<typeof ajusteSchema>;

export const solicitarAjusteInventarioSchema = z.object({ justificativa: textoObrigatorio(1000) });

export const listarAjustesSchema = paginacaoSchema.extend({
  status: z.enum(STATUS_AJUSTE).optional(),
});
