import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Ator, RequerPermissoes, UsuarioAtual } from '../../common/auth/decoradores';
import type { ContextoAtor, UsuarioAutenticado } from '../../common/auth/tipos';
import { ConfiguracoesSistemaDto, ListarNotificacoesDto } from '../../common/dto';
import { ConfiguracoesService } from '../configuracoes/configuracoes.service';
import { NotificacoesService } from './notificacoes.service';

@ApiTags('Notificações')
@ApiBearerAuth()
@Controller('notificacoes')
export class NotificacoesController {
  constructor(private readonly notificacoes: NotificacoesService) {}

  /** Lista as notificações destinadas às permissões do usuário. */
  @Get()
  listar(@UsuarioAtual() usuario: UsuarioAutenticado, @Query() q: ListarNotificacoesDto) {
    return this.notificacoes.listar(usuario, q);
  }

  @Get('contagem')
  contagem(@UsuarioAtual() usuario: UsuarioAutenticado) {
    return this.notificacoes.contarNaoLidas(usuario);
  }

  @Post('lidas')
  @HttpCode(204)
  async marcarTodas(@UsuarioAtual() usuario: UsuarioAutenticado) {
    await this.notificacoes.marcarTodasLidas(usuario);
  }

  @Post(':id/lida')
  @HttpCode(204)
  async marcarLida(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.notificacoes.marcarLida(usuario, id);
  }
}

@ApiTags('Configurações')
@ApiBearerAuth()
@Controller('configuracoes')
export class ConfiguracoesController {
  constructor(private readonly configuracoes: ConfiguracoesService) {}

  @Get()
  @RequerPermissoes('configuracoes:gerenciar')
  obter() {
    return this.configuracoes.obter();
  }

  @Put()
  @RequerPermissoes('configuracoes:gerenciar')
  atualizar(@Body() dados: ConfiguracoesSistemaDto, @Ator() ator: ContextoAtor) {
    return this.configuracoes.atualizar(dados, ator);
  }
}
