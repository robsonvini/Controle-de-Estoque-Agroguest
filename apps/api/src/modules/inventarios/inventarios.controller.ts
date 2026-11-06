import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Ator, RequerPermissoes, UsuarioAtual } from '../../common/auth/decoradores';
import type { ContextoAtor, UsuarioAutenticado } from '../../common/auth/tipos';
import {
  AjusteDto,
  CancelamentoDto,
  ContagemDto,
  InventarioDto,
  ListarAjustesDto,
  ListarInventariosDto,
  SolicitarAjusteInventarioDto,
} from '../../common/dto';
import { Idempotente } from '../../common/idempotencia';
import { InventariosService } from './inventarios.service';

@ApiTags('Inventário')
@ApiBearerAuth()
@Controller('inventarios')
export class InventariosController {
  constructor(private readonly servico: InventariosService) {}

  @Get()
  @RequerPermissoes('inventarios:ler')
  listar(@Query() q: ListarInventariosDto) {
    return this.servico.listar(q);
  }

  @Get(':id')
  @RequerPermissoes('inventarios:ler')
  obter(@Param('id', ParseUUIDPipe) id: string) {
    return this.servico.obter(id);
  }

  @Post()
  @RequerPermissoes('inventarios:escrever')
  @Idempotente()
  criar(@Body() dados: InventarioDto, @Ator() ator: ContextoAtor) {
    return this.servico.criar(dados, ator);
  }

  @Post(':id/contagens')
  @HttpCode(200)
  @RequerPermissoes('inventarios:escrever')
  contagens(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dados: ContagemDto,
    @Ator() ator: ContextoAtor,
  ) {
    return this.servico.registrarContagens(id, dados, ator);
  }

  @Post(':id/concluir-contagem')
  @HttpCode(200)
  @RequerPermissoes('inventarios:escrever')
  concluir(@Param('id', ParseUUIDPipe) id: string, @Ator() ator: ContextoAtor) {
    return this.servico.concluirContagem(id, ator);
  }

  @Post(':id/reabrir')
  @HttpCode(200)
  @RequerPermissoes('inventarios:escrever')
  reabrir(@Param('id', ParseUUIDPipe) id: string, @Ator() ator: ContextoAtor) {
    return this.servico.reabrir(id, ator);
  }

  @Post(':id/solicitar-ajuste')
  @HttpCode(200)
  @RequerPermissoes('inventarios:escrever', 'ajustes:solicitar')
  solicitarAjuste(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dados: SolicitarAjusteInventarioDto,
    @Ator() ator: ContextoAtor,
  ) {
    return this.servico.solicitarAjuste(id, dados.justificativa, ator);
  }

  @Post(':id/cancelar')
  @HttpCode(200)
  @RequerPermissoes('inventarios:escrever')
  cancelar(@Param('id', ParseUUIDPipe) id: string, @Ator() ator: ContextoAtor) {
    return this.servico.cancelar(id, ator);
  }
}

@ApiTags('Ajustes de estoque')
@ApiBearerAuth()
@Controller('ajustes')
export class AjustesController {
  constructor(private readonly servico: InventariosService) {}

  @Get()
  @RequerPermissoes('inventarios:ler')
  listar(@Query() q: ListarAjustesDto) {
    return this.servico.listarAjustes(q);
  }

  @Get(':id')
  @RequerPermissoes('inventarios:ler')
  obter(@Param('id', ParseUUIDPipe) id: string) {
    return this.servico.obterAjuste(id);
  }

  @Post()
  @RequerPermissoes('ajustes:solicitar')
  @Idempotente()
  solicitar(@Body() dados: AjusteDto, @Ator() ator: ContextoAtor) {
    return this.servico.solicitarAjusteManual(dados, ator);
  }

  @Post(':id/aprovar')
  @HttpCode(200)
  @RequerPermissoes('ajustes:aprovar')
  @Idempotente()
  aprovar(
    @Param('id', ParseUUIDPipe) id: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Ator() ator: ContextoAtor,
  ) {
    return this.servico.aprovarAjuste(id, usuario, ator);
  }

  @Post(':id/rejeitar')
  @HttpCode(200)
  @RequerPermissoes('ajustes:aprovar')
  rejeitar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dados: CancelamentoDto,
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Ator() ator: ContextoAtor,
  ) {
    return this.servico.rejeitarAjuste(id, dados.motivo, usuario, ator);
  }
}
