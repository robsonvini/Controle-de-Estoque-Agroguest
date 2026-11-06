/**
 * Enumerações de domínio. Os valores espelham os enums do schema Prisma
 * (apps/api/prisma/schema.prisma) e são usados pelo frontend para rótulos.
 */

export const TIPOS_MOVIMENTACAO = [
  'ENTRADA',
  'SAIDA',
  'TRANSFERENCIA',
  'AJUSTE',
  'ESTORNO',
] as const;
export type TipoMovimentacao = (typeof TIPOS_MOVIMENTACAO)[number];

export const MOTIVOS_ENTRADA = [
  'COMPRA',
  'RECEBIMENTO',
  'DEVOLUCAO_CLIENTE',
  'AJUSTE_POSITIVO',
] as const;
export const MOTIVOS_SAIDA = [
  'VENDA',
  'CONSUMO_INTERNO',
  'PERDA',
  'AVARIA',
  'DEVOLUCAO_FORNECEDOR',
] as const;
export const MOTIVOS_MOVIMENTACAO = [
  ...MOTIVOS_ENTRADA,
  ...MOTIVOS_SAIDA,
  'AJUSTE_NEGATIVO',
  'TRANSFERENCIA',
  'AJUSTE_INVENTARIO',
  'ESTORNO',
] as const;
export type MotivoMovimentacao = (typeof MOTIVOS_MOVIMENTACAO)[number];
export type MotivoEntrada = (typeof MOTIVOS_ENTRADA)[number];
export type MotivoSaida = (typeof MOTIVOS_SAIDA)[number];

export const ORIGENS_MOVIMENTACAO = [
  'MANUAL',
  'COMPRA',
  'PEDIDO_VENDA',
  'AJUSTE',
  'ESTORNO',
] as const;

export const ROTULOS_TIPO_MOVIMENTACAO: Record<TipoMovimentacao, string> = {
  ENTRADA: 'Entrada',
  SAIDA: 'Saída',
  TRANSFERENCIA: 'Transferência',
  AJUSTE: 'Ajuste',
  ESTORNO: 'Estorno',
};

export const ROTULOS_MOTIVO: Record<MotivoMovimentacao, string> = {
  COMPRA: 'Compra',
  RECEBIMENTO: 'Recebimento de mercadoria',
  DEVOLUCAO_CLIENTE: 'Devolução de cliente',
  AJUSTE_POSITIVO: 'Ajuste positivo',
  VENDA: 'Venda',
  CONSUMO_INTERNO: 'Consumo interno',
  PERDA: 'Perda',
  AVARIA: 'Avaria',
  DEVOLUCAO_FORNECEDOR: 'Devolução ao fornecedor',
  AJUSTE_NEGATIVO: 'Ajuste negativo',
  TRANSFERENCIA: 'Transferência',
  AJUSTE_INVENTARIO: 'Ajuste de inventário',
  ESTORNO: 'Estorno',
};

export const STATUS_PRODUTO = ['ATIVO', 'INATIVO'] as const;
export type StatusProduto = (typeof STATUS_PRODUTO)[number];

export const SITUACOES_FORNECEDOR = ['ATIVO', 'INATIVO', 'BLOQUEADO'] as const;
export type SituacaoFornecedor = (typeof SITUACOES_FORNECEDOR)[number];
export const ROTULOS_SITUACAO_FORNECEDOR: Record<SituacaoFornecedor, string> = {
  ATIVO: 'Ativo',
  INATIVO: 'Inativo',
  BLOQUEADO: 'Bloqueado',
};

export const TIPOS_LOCAL = ['DEPOSITO', 'AREA', 'POSICAO'] as const;
export type TipoLocal = (typeof TIPOS_LOCAL)[number];
export const ROTULOS_TIPO_LOCAL: Record<TipoLocal, string> = {
  DEPOSITO: 'Depósito',
  AREA: 'Área / corredor',
  POSICAO: 'Posição / prateleira',
};

export const STATUS_PEDIDO_COMPRA = [
  'RASCUNHO',
  'ENVIADO',
  'PARCIALMENTE_RECEBIDO',
  'RECEBIDO',
  'CANCELADO',
] as const;
export type StatusPedidoCompra = (typeof STATUS_PEDIDO_COMPRA)[number];
export const ROTULOS_STATUS_PEDIDO_COMPRA: Record<StatusPedidoCompra, string> = {
  RASCUNHO: 'Rascunho',
  ENVIADO: 'Enviado ao fornecedor',
  PARCIALMENTE_RECEBIDO: 'Parcialmente recebido',
  RECEBIDO: 'Recebido',
  CANCELADO: 'Cancelado',
};

export const STATUS_PEDIDO = ['RESERVADO', 'CONFIRMADO', 'CANCELADO'] as const;
export type StatusPedido = (typeof STATUS_PEDIDO)[number];
export const ROTULOS_STATUS_PEDIDO: Record<StatusPedido, string> = {
  RESERVADO: 'Reservado',
  CONFIRMADO: 'Confirmado (baixado)',
  CANCELADO: 'Cancelado',
};

export const ORIGENS_PEDIDO = ['MANUAL', 'CRM_API'] as const;
export type OrigemPedido = (typeof ORIGENS_PEDIDO)[number];

export const STATUS_INVENTARIO = ['EM_CONTAGEM', 'EM_REVISAO', 'FINALIZADO', 'CANCELADO'] as const;
export type StatusInventario = (typeof STATUS_INVENTARIO)[number];
export const ROTULOS_STATUS_INVENTARIO: Record<StatusInventario, string> = {
  EM_CONTAGEM: 'Em contagem',
  EM_REVISAO: 'Em revisão',
  FINALIZADO: 'Finalizado',
  CANCELADO: 'Cancelado',
};

export const STATUS_AJUSTE = ['PENDENTE', 'APROVADO', 'REJEITADO'] as const;
export type StatusAjuste = (typeof STATUS_AJUSTE)[number];
export const ROTULOS_STATUS_AJUSTE: Record<StatusAjuste, string> = {
  PENDENTE: 'Pendente de aprovação',
  APROVADO: 'Aprovado',
  REJEITADO: 'Rejeitado',
};

export const TIPOS_NOTIFICACAO = [
  'ESTOQUE_MINIMO',
  'ESTOQUE_ESGOTADO',
  'REPOSICAO',
  'MOVIMENTACAO_ATIPICA',
  'FALHA_SINCRONIZACAO',
  'DIVERGENCIA_INVENTARIO',
  'AJUSTE_PENDENTE',
] as const;
export type TipoNotificacao = (typeof TIPOS_NOTIFICACAO)[number];
export const ROTULOS_TIPO_NOTIFICACAO: Record<TipoNotificacao, string> = {
  ESTOQUE_MINIMO: 'Estoque abaixo do mínimo',
  ESTOQUE_ESGOTADO: 'Produto esgotado',
  REPOSICAO: 'Necessidade de reposição',
  MOVIMENTACAO_ATIPICA: 'Movimentação fora do padrão',
  FALHA_SINCRONIZACAO: 'Falha de sincronização com o CRM',
  DIVERGENCIA_INVENTARIO: 'Divergência de inventário',
  AJUSTE_PENDENTE: 'Ajuste aguardando aprovação',
};

export const SEVERIDADES = ['INFO', 'ALERTA', 'CRITICA'] as const;
export type Severidade = (typeof SEVERIDADES)[number];

export const TIPOS_RELATORIO = [
  'posicao-estoque',
  'historico-movimentacoes',
  'mais-vendidos',
  'baixo-giro',
  'sem-movimentacao',
  'inventarios-divergencias',
  'valor-estoque',
  'historico-compras',
  'perdas-ajustes',
] as const;
export type TipoRelatorio = (typeof TIPOS_RELATORIO)[number];
export const ROTULOS_RELATORIO: Record<TipoRelatorio, string> = {
  'posicao-estoque': 'Posição atual do estoque',
  'historico-movimentacoes': 'Histórico de entradas e saídas',
  'mais-vendidos': 'Produtos mais vendidos',
  'baixo-giro': 'Produtos com baixo giro',
  'sem-movimentacao': 'Produtos sem movimentação',
  'inventarios-divergencias': 'Inventários e divergências',
  'valor-estoque': 'Valor financeiro do estoque',
  'historico-compras': 'Histórico de compras',
  'perdas-ajustes': 'Perdas e ajustes',
};

export const UFS = [
  'AC',
  'AL',
  'AP',
  'AM',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MT',
  'MS',
  'MG',
  'PA',
  'PB',
  'PR',
  'PE',
  'PI',
  'RJ',
  'RN',
  'RS',
  'RO',
  'RR',
  'SC',
  'SP',
  'SE',
  'TO',
] as const;
