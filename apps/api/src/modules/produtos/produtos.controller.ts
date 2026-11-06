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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { Ator, RequerPermissoes } from '../../common/auth/decoradores';
import type { ContextoAtor } from '../../common/auth/tipos';
import { ImagemProdutoDto, ListarProdutosDto, ProdutoDto } from '../../common/dto';
import { ProdutosService } from './produtos.service';

@ApiTags('Produtos')
@ApiBearerAuth()
@Controller('produtos')
export class ProdutosController {
  constructor(private readonly produtos: ProdutosService) {}

  @Get()
  @RequerPermissoes('produtos:ler')
  listar(@Query() q: ListarProdutosDto) {
    return this.produtos.listar(q);
  }

  @Get('codigo/:codigo')
  @RequerPermissoes('produtos:ler')
  porCodigo(@Param('codigo') codigo: string) {
    return this.produtos.buscarPorCodigo(codigo);
  }

  @Get(':id')
  @RequerPermissoes('produtos:ler')
  obter(@Param('id', ParseUUIDPipe) id: string) {
    return this.produtos.obter(id);
  }

  @Get(':id/kardex')
  @RequerPermissoes('estoque:ler')
  kardex(@Param('id', ParseUUIDPipe) id: string, @Query('localId') localId?: string) {
    return this.produtos.kardex(
      id,
      localId && /^[0-9a-f-]{36}$/i.test(localId) ? localId : undefined,
    );
  }

  @Post()
  @RequerPermissoes('produtos:escrever')
  criar(@Body() dados: ProdutoDto, @Ator() ator: ContextoAtor) {
    return this.produtos.criar(dados, ator);
  }

  @Put(':id')
  @RequerPermissoes('produtos:escrever')
  atualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dados: ProdutoDto,
    @Ator() ator: ContextoAtor,
  ) {
    return this.produtos.atualizar(id, dados, ator);
  }

  @Post(':id/imagens')
  @RequerPermissoes('produtos:escrever')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['arquivo', 'textoAlternativo'],
      properties: {
        arquivo: { type: 'string', format: 'binary' },
        textoAlternativo: {
          type: 'string',
          description: 'Descrição da imagem para leitores de tela',
        },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('arquivo', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    }),
  )
  adicionarImagem(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() arquivo: Express.Multer.File | undefined,
    @Body() dados: ImagemProdutoDto,
    @Ator() ator: ContextoAtor,
  ) {
    return this.produtos.adicionarImagem(id, arquivo, dados.textoAlternativo, ator);
  }

  @Delete(':id/imagens/:imagemId')
  @HttpCode(204)
  @RequerPermissoes('produtos:escrever')
  async removerImagem(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('imagemId', ParseUUIDPipe) imagemId: string,
    @Ator() ator: ContextoAtor,
  ) {
    await this.produtos.removerImagem(id, imagemId, ator);
  }
}
