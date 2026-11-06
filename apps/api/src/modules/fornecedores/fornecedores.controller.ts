import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Ator, RequerPermissoes } from '../../common/auth/decoradores';
import type { ContextoAtor } from '../../common/auth/tipos';
import { FornecedorDto, ListarFornecedoresDto } from '../../common/dto';
import { FornecedoresService } from './fornecedores.service';

@ApiTags('Fornecedores')
@ApiBearerAuth()
@Controller('fornecedores')
export class FornecedoresController {
  constructor(private readonly fornecedores: FornecedoresService) {}

  @Get()
  @RequerPermissoes('fornecedores:ler')
  listar(@Query() q: ListarFornecedoresDto) {
    return this.fornecedores.listar(q);
  }

  @Get(':id')
  @RequerPermissoes('fornecedores:ler')
  obter(@Param('id', ParseUUIDPipe) id: string) {
    return this.fornecedores.obter(id);
  }

  @Get(':id/compras')
  @RequerPermissoes('fornecedores:ler')
  compras(@Param('id', ParseUUIDPipe) id: string) {
    return this.fornecedores.historicoCompras(id);
  }

  @Post()
  @RequerPermissoes('fornecedores:escrever')
  criar(@Body() dados: FornecedorDto, @Ator() ator: ContextoAtor) {
    return this.fornecedores.criar(dados, ator);
  }

  @Put(':id')
  @RequerPermissoes('fornecedores:escrever')
  atualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dados: FornecedorDto,
    @Ator() ator: ContextoAtor,
  ) {
    return this.fornecedores.atualizar(id, dados, ator);
  }
}
