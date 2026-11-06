import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { Ator, RequerPermissoes, UsuarioAtual } from '../../common/auth/decoradores';
import type { ContextoAtor, UsuarioAutenticado } from '../../common/auth/tipos';
import {
  EntradaDto,
  EstornoDto,
  ListarMovimentacoesDto,
  ListarSaldosDto,
  SaidaDto,
  TransferenciaDto,
} from '../../common/dto';
import { proibido } from '../../common/erros';
import { Idempotente } from '../../common/idempotencia';
import { MovimentacoesService } from './movimentacoes.service';

const CABECALHO_IDEMPOTENCIA = {
  name: 'Idempotency-Key',
  required: false,
  description:
    'Chave única da operação (8 a 100 caracteres). Repetições devolvem a resposta original.',
};

@ApiTags('Estoque e movimentações')
@ApiBearerAuth()
@Controller()
export class MovimentacoesController {
  constructor(private readonly servico: MovimentacoesService) {}

  @Post('movimentacoes/entradas')
  @RequerPermissoes('entradas:registrar')
  @Idempotente()
  @ApiHeader(CABECALHO_IDEMPOTENCIA)
  entrada(
    @Body() dados: EntradaDto,
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Ator() ator: ContextoAtor,
  ) {
    return this.servico.registrarEntrada(dados, usuario, ator);
  }

  @Post('movimentacoes/saidas')
  @RequerPermissoes('saidas:registrar')
  @Idempotente()
  @ApiHeader(CABECALHO_IDEMPOTENCIA)
  saida(@Body() dados: SaidaDto, @Ator() ator: ContextoAtor) {
    return this.servico.registrarSaida(dados, ator);
  }

  @Post('movimentacoes/transferencias')
  @RequerPermissoes('transferencias:registrar')
  @Idempotente()
  @ApiHeader(CABECALHO_IDEMPOTENCIA)
  transferencia(@Body() dados: TransferenciaDto, @Ator() ator: ContextoAtor) {
    return this.servico.registrarTransferencia(dados, ator);
  }

  @Post('movimentacoes/:id/estorno')
  @RequerPermissoes('movimentacoes:estornar')
  @Idempotente()
  @ApiHeader(CABECALHO_IDEMPOTENCIA)
  estornar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dados: EstornoDto,
    @Ator() ator: ContextoAtor,
  ) {
    return this.servico.estornar(id, dados, ator);
  }

  /** Lista movimentações. Exige leitura de entradas ou de saídas (o filtro por tipo respeita a permissão). */
  @Get('movimentacoes')
  listar(@Query() q: ListarMovimentacoesDto, @UsuarioAtual() usuario: UsuarioAutenticado) {
    this.exigirLeitura(usuario, q.tipo);
    return this.servico.listar(q);
  }

  @Get('movimentacoes/:id')
  obter(@Param('id', ParseUUIDPipe) id: string, @UsuarioAtual() usuario: UsuarioAutenticado) {
    this.exigirLeitura(usuario);
    return this.servico.obter(id);
  }

  @Get('estoque/saldos')
  @RequerPermissoes('estoque:ler')
  saldos(@Query() q: ListarSaldosDto) {
    return this.servico.listarSaldos(q);
  }

  @Get('estoque/conciliacao')
  @RequerPermissoes('auditoria:ler')
  conciliacao() {
    return this.servico.conciliacao();
  }

  private exigirLeitura(usuario: UsuarioAutenticado, tipo?: string) {
    const p = usuario.permissoes;
    const geral = p.has('estoque:ler') || (p.has('entradas:ler') && p.has('saidas:ler'));
    if (geral) return;
    if (tipo === 'ENTRADA' && p.has('entradas:ler')) return;
    if (tipo === 'SAIDA' && p.has('saidas:ler')) return;
    throw proibido();
  }
}
