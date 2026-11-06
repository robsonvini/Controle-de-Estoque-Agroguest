/**
 * DTOs gerados a partir dos schemas Zod compartilhados (@estoque/shared).
 * A mesma regra de validação é aplicada no frontend e no backend, e o
 * Swagger é gerado a partir destes DTOs.
 */
import { createZodDto } from 'nestjs-zod';
import * as s from '@estoque/shared';

export class LoginDto extends createZodDto(s.loginSchema) {}
export class TrocarSenhaDto extends createZodDto(s.trocarSenhaSchema) {}
export class CriarUsuarioDto extends createZodDto(s.criarUsuarioSchema) {}
export class AtualizarUsuarioDto extends createZodDto(s.atualizarUsuarioSchema) {}
export class RedefinirSenhaDto extends createZodDto(s.redefinirSenhaSchema) {}
export class ListarUsuariosDto extends createZodDto(s.listarUsuariosSchema) {}
export class PerfilDto extends createZodDto(s.perfilSchema) {}

export class PaginacaoDto extends createZodDto(s.paginacaoSchema) {}
export class ListarAtivosDto extends createZodDto(s.listarAtivosSchema) {}

export class CategoriaDto extends createZodDto(s.categoriaSchema) {}
export class UnidadeMedidaDto extends createZodDto(s.unidadeMedidaSchema) {}
export class LocalDto extends createZodDto(s.localSchema) {}
export class ProdutoDto extends createZodDto(s.produtoSchema) {}
export class ListarProdutosDto extends createZodDto(s.listarProdutosSchema) {}
export class ImagemProdutoDto extends createZodDto(s.imagemProdutoSchema) {}
export class FornecedorDto extends createZodDto(s.fornecedorSchema) {}
export class ListarFornecedoresDto extends createZodDto(s.listarFornecedoresSchema) {}

export class EntradaDto extends createZodDto(s.entradaSchema) {}
export class SaidaDto extends createZodDto(s.saidaSchema) {}
export class TransferenciaDto extends createZodDto(s.transferenciaSchema) {}
export class EstornoDto extends createZodDto(s.estornoSchema) {}
export class ListarMovimentacoesDto extends createZodDto(s.listarMovimentacoesSchema) {}
export class ListarSaldosDto extends createZodDto(s.listarSaldosSchema) {}

export class PedidoCompraDto extends createZodDto(s.pedidoCompraSchema) {}
export class RecebimentoDto extends createZodDto(s.recebimentoSchema) {}
export class ListarComprasDto extends createZodDto(s.listarComprasSchema) {}
export class CancelamentoDto extends createZodDto(s.cancelamentoSchema) {}

export class PedidoVendaDto extends createZodDto(s.pedidoVendaSchema) {}
export class ListarPedidosDto extends createZodDto(s.listarPedidosSchema) {}

export class InventarioDto extends createZodDto(s.inventarioSchema) {}
export class ContagemDto extends createZodDto(s.contagemSchema) {}
export class ListarInventariosDto extends createZodDto(s.listarInventariosSchema) {}
export class AjusteDto extends createZodDto(s.ajusteSchema) {}
export class SolicitarAjusteInventarioDto extends createZodDto(s.solicitarAjusteInventarioSchema) {}
export class ListarAjustesDto extends createZodDto(s.listarAjustesSchema) {}

export class ConfiguracaoIntegracaoDto extends createZodDto(s.configuracaoIntegracaoSchema) {}
export class ClienteApiDto extends createZodDto(s.clienteApiSchema) {}
export class ListarLogsIntegracaoDto extends createZodDto(s.listarLogsIntegracaoSchema) {}
export class TokenRequestDto extends createZodDto(s.tokenRequestSchema) {}
export class IntegracaoPedidoDto extends createZodDto(s.integracaoPedidoSchema) {}
export class ConsultaSaldosDto extends createZodDto(s.consultaSaldosSchema) {}
export class IntegracaoCancelamentoDto extends createZodDto(s.integracaoCancelamentoSchema) {}

export class ConfiguracoesSistemaDto extends createZodDto(s.configuracoesSistemaSchema) {}
export class FiltroRelatorioDto extends createZodDto(s.filtroRelatorioSchema) {}
export class ListarNotificacoesDto extends createZodDto(s.listarNotificacoesSchema) {}
export class ListarAuditoriaDto extends createZodDto(s.listarAuditoriaSchema) {}
export class TitularLgpdDto extends createZodDto(s.titularLgpdSchema) {}
