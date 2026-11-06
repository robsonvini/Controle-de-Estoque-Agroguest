import { z } from 'zod';
import { ESCOPOS_INTEGRACAO, type EscopoIntegracao } from '../permissoes';
import {
  paginacaoSchema,
  quantidadePositiva,
  textoObrigatorio,
  textoOpcional,
  valorMonetario,
} from './comum';

// =====================================================================
// Contrato do CRM Agrogest (verificado no repositório crm-agrogest,
// backend/app/Repositories/Database/DatabaseClienteRepository.php::fromDatabase)
// GET /api/clientes  -> Cliente[]
// GET /api/clientes/{uuid} -> Cliente | 404 { message }
// =====================================================================
const textoCrm = z
  .string()
  .nullish()
  .transform((v) => (v == null ? null : v.trim() || null));

export const crmClienteSchema = z.object({
  id: z.uuid(),
  nome: z.string().trim().min(1),
  razaosocial: textoCrm,
  cnpj: textoCrm,
  cpf: textoCrm,
  email: textoCrm,
  telefone: textoCrm,
  cidade: textoCrm,
  estado: textoCrm,
});
export type CrmCliente = z.infer<typeof crmClienteSchema>;
export const crmListaClientesSchema = z.array(z.unknown());

// =====================================================================
// Configuração da integração (tela "Integração CRM")
// =====================================================================
export const configuracaoIntegracaoSchema = z.object({
  ativo: z.boolean(),
  baseUrl: z.url('URL inválida').max(300),
  /** Cabeçalho de autenticação opcional (ex.: Authorization), para quando o CRM exigir. */
  authHeaderNome: z
    .string()
    .trim()
    .max(60)
    .regex(/^[A-Za-z0-9-]*$/, 'Nome de cabeçalho inválido')
    .nullish()
    .transform((v) => (v ? v : null)),
  /** Valor do cabeçalho: vazio ou ausente mantém o valor atual; `null` explícito remove. */
  authHeaderValor: z.string().max(2000).nullish(),
  timeoutMs: z.coerce.number().int().min(1000).max(60000),
  intervaloSyncMinutos: z.coerce.number().int().min(5).max(1440),
  webhookSaidaAtivo: z.boolean(),
  webhookSaidaUrl: z
    .union([z.url('URL inválida').max(300), z.literal('')])
    .nullish()
    .transform((v) => (v ? v : null)),
});
export type ConfiguracaoIntegracaoInput = z.infer<typeof configuracaoIntegracaoSchema>;

const escopoSchema = z.enum(
  Object.keys(ESCOPOS_INTEGRACAO) as [EscopoIntegracao, ...EscopoIntegracao[]],
);

export const clienteApiSchema = z.object({
  nome: textoObrigatorio(100),
  escopos: z.array(escopoSchema).min(1, 'Selecione ao menos um escopo'),
});
export type ClienteApiInput = z.infer<typeof clienteApiSchema>;

export const listarLogsIntegracaoSchema = paginacaoSchema.extend({
  sucesso: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  direcao: z.enum(['ENTRADA', 'SAIDA']).optional(),
  dataInicio: z.coerce.date().optional(),
  dataFim: z.coerce.date().optional(),
});

// =====================================================================
// API de integração de entrada (/api/integracao/v1) — contrato do Estoque
// =====================================================================
export const tokenRequestSchema = z.object({
  grant_type: z.literal('client_credentials', 'grant_type deve ser client_credentials'),
  client_id: z.string().min(1).max(100),
  client_secret: z.string().min(1).max(200),
  scope: z.string().max(300).optional(),
});

export const integracaoPedidoSchema = z.object({
  idExterno: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[A-Za-z0-9._:-]+$/, 'idExterno inválido'),
  /** UUID do cliente no CRM (opcional). */
  clienteCrmId: z.uuid().nullish(),
  observacao: textoOpcional(1000),
  itens: z
    .array(
      z.object({
        sku: z
          .string()
          .trim()
          .min(1)
          .max(50)
          .transform((v) => v.toUpperCase()),
        quantidade: quantidadePositiva,
        precoUnitario: valorMonetario.nullish(),
        /** Código do local de saída; se omitido, o Estoque distribui entre os locais com saldo. */
        localCodigo: z.string().trim().max(30).nullish(),
      }),
    )
    .min(1)
    .max(200),
});
export type IntegracaoPedidoInput = z.infer<typeof integracaoPedidoSchema>;

export const consultaSaldosSchema = z.object({
  skus: z.array(z.string().trim().min(1).max(50)).min(1).max(500),
});

export const integracaoCancelamentoSchema = z.object({ motivo: textoObrigatorio(500) });

export const TIPOS_EVENTO_WEBHOOK = [
  'pedido.criado',
  'pedido.confirmado',
  'pedido.cancelado',
  'cliente.atualizado',
] as const;

/** Envelope dos eventos recebidos por webhook (POST /api/integracao/v1/webhooks/crm). */
export const webhookEventoSchema = z.object({
  id: z.string().trim().min(1).max(100),
  tipo: z.enum(TIPOS_EVENTO_WEBHOOK),
  ocorridoEm: z.iso.datetime({ offset: true }),
  dados: z.record(z.string(), z.unknown()),
});
export type WebhookEvento = z.infer<typeof webhookEventoSchema>;

export const webhookClienteAtualizadoSchema = z.object({ clienteId: z.uuid() });
export const webhookPedidoRefSchema = z.object({
  idExterno: z.string().trim().min(1).max(100),
  motivo: z.string().trim().max(500).optional(),
});
