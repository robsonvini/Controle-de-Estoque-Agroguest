import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Ator, RequerPermissoes } from '../../common/auth/decoradores';
import type { ContextoAtor } from '../../common/auth/tipos';
import { CategoriaDto, ListarAtivosDto, LocalDto, UnidadeMedidaDto } from '../../common/dto';
import { CadastrosService } from './cadastros.service';

@ApiTags('Categorias')
@ApiBearerAuth()
@Controller('categorias')
export class CategoriasController {
  constructor(private readonly servico: CadastrosService) {}

  @Get()
  @RequerPermissoes('categorias:ler')
  listar(@Query() q: ListarAtivosDto) {
    return this.servico.listarCategorias(q);
  }

  @Get('arvore')
  arvore() {
    return this.servico.arvoreCategorias();
  }

  @Get(':id')
  @RequerPermissoes('categorias:ler')
  obter(@Param('id', ParseUUIDPipe) id: string) {
    return this.servico.obterCategoria(id);
  }

  @Post()
  @RequerPermissoes('categorias:escrever')
  criar(@Body() dados: CategoriaDto, @Ator() ator: ContextoAtor) {
    return this.servico.criarCategoria(dados, ator);
  }

  @Put(':id')
  @RequerPermissoes('categorias:escrever')
  atualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dados: CategoriaDto,
    @Ator() ator: ContextoAtor,
  ) {
    return this.servico.atualizarCategoria(id, dados, ator);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequerPermissoes('categorias:escrever')
  async excluir(@Param('id', ParseUUIDPipe) id: string, @Ator() ator: ContextoAtor) {
    await this.servico.excluirCategoria(id, ator);
  }
}

@ApiTags('Unidades de medida')
@ApiBearerAuth()
@Controller('unidades')
export class UnidadesController {
  constructor(private readonly servico: CadastrosService) {}

  /** Leitura liberada a qualquer usuário autenticado (usada em formulários). */
  @Get()
  listar(@Query() q: ListarAtivosDto) {
    return this.servico.listarUnidades(q);
  }

  @Post()
  @RequerPermissoes('estoque:configurar')
  criar(@Body() dados: UnidadeMedidaDto, @Ator() ator: ContextoAtor) {
    return this.servico.criarUnidade(dados, ator);
  }

  @Put(':id')
  @RequerPermissoes('estoque:configurar')
  atualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dados: UnidadeMedidaDto,
    @Ator() ator: ContextoAtor,
  ) {
    return this.servico.atualizarUnidade(id, dados, ator);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequerPermissoes('estoque:configurar')
  async excluir(@Param('id', ParseUUIDPipe) id: string, @Ator() ator: ContextoAtor) {
    await this.servico.excluirUnidade(id, ator);
  }
}

@ApiTags('Locais de armazenamento')
@ApiBearerAuth()
@Controller('locais')
export class LocaisController {
  constructor(private readonly servico: CadastrosService) {}

  /** Leitura liberada a qualquer usuário autenticado (usada em formulários de movimentação). */
  @Get()
  listar(@Query() q: ListarAtivosDto) {
    return this.servico.listarLocais(q);
  }

  @Get(':id')
  obter(@Param('id', ParseUUIDPipe) id: string) {
    return this.servico.obterLocal(id);
  }

  @Post()
  @RequerPermissoes('estoque:configurar')
  criar(@Body() dados: LocalDto, @Ator() ator: ContextoAtor) {
    return this.servico.criarLocal(dados, ator);
  }

  @Put(':id')
  @RequerPermissoes('estoque:configurar')
  atualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dados: LocalDto,
    @Ator() ator: ContextoAtor,
  ) {
    return this.servico.atualizarLocal(id, dados, ator);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequerPermissoes('estoque:configurar')
  async excluir(@Param('id', ParseUUIDPipe) id: string, @Ator() ator: ContextoAtor) {
    await this.servico.excluirLocal(id, ator);
  }
}
