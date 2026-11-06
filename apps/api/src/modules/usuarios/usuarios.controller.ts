import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Ator, RequerPermissoes } from '../../common/auth/decoradores';
import type { ContextoAtor } from '../../common/auth/tipos';
import {
  AtualizarUsuarioDto,
  CriarUsuarioDto,
  ListarUsuariosDto,
  PerfilDto,
  RedefinirSenhaDto,
} from '../../common/dto';
import { PerfisService } from './perfis.service';
import { UsuariosService } from './usuarios.service';

@ApiTags('Usuários e permissões')
@ApiBearerAuth()
@Controller('usuarios')
export class UsuariosController {
  constructor(private readonly usuarios: UsuariosService) {}

  @Get()
  @RequerPermissoes('usuarios:ler')
  listar(@Query() q: ListarUsuariosDto) {
    return this.usuarios.listar(q);
  }

  @Get(':id')
  @RequerPermissoes('usuarios:ler')
  obter(@Param('id', ParseUUIDPipe) id: string) {
    return this.usuarios.obter(id);
  }

  @Post()
  @RequerPermissoes('usuarios:gerenciar')
  criar(@Body() dados: CriarUsuarioDto, @Ator() ator: ContextoAtor) {
    return this.usuarios.criar(dados, ator);
  }

  @Patch(':id')
  @RequerPermissoes('usuarios:gerenciar')
  atualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dados: AtualizarUsuarioDto,
    @Ator() ator: ContextoAtor,
  ) {
    return this.usuarios.atualizar(id, dados, ator);
  }

  @Post(':id/redefinir-senha')
  @HttpCode(204)
  @RequerPermissoes('usuarios:gerenciar')
  async redefinirSenha(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dados: RedefinirSenhaDto,
    @Ator() ator: ContextoAtor,
  ) {
    await this.usuarios.redefinirSenha(id, dados, ator);
  }

  @Post(':id/desbloquear')
  @HttpCode(204)
  @RequerPermissoes('usuarios:gerenciar')
  async desbloquear(@Param('id', ParseUUIDPipe) id: string, @Ator() ator: ContextoAtor) {
    await this.usuarios.desbloquear(id, ator);
  }
}

@ApiTags('Usuários e permissões')
@ApiBearerAuth()
@Controller('perfis')
export class PerfisController {
  constructor(private readonly perfis: PerfisService) {}

  @Get()
  @RequerPermissoes('usuarios:ler')
  listar() {
    return this.perfis.listar();
  }

  @Get('permissoes')
  @RequerPermissoes('usuarios:ler')
  permissoes() {
    return this.perfis.listarPermissoes();
  }

  @Get(':id')
  @RequerPermissoes('usuarios:ler')
  obter(@Param('id', ParseUUIDPipe) id: string) {
    return this.perfis.obter(id);
  }

  @Post()
  @RequerPermissoes('perfis:gerenciar')
  criar(@Body() dados: PerfilDto, @Ator() ator: ContextoAtor) {
    return this.perfis.criar(dados, ator);
  }

  @Put(':id')
  @RequerPermissoes('perfis:gerenciar')
  atualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dados: PerfilDto,
    @Ator() ator: ContextoAtor,
  ) {
    return this.perfis.atualizar(id, dados, ator);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequerPermissoes('perfis:gerenciar')
  async excluir(@Param('id', ParseUUIDPipe) id: string, @Ator() ator: ContextoAtor) {
    await this.perfis.excluir(id, ator);
  }
}
