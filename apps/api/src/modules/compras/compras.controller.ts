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
import { Ator, RequerPermissoes } from '../../common/auth/decoradores';
import type { ContextoAtor } from '../../common/auth/tipos';
import {
  CancelamentoDto,
  ListarComprasDto,
  PedidoCompraDto,
  RecebimentoDto,
} from '../../common/dto';
import { Idempotente } from '../../common/idempotencia';
import { ComprasService } from './compras.service';

@ApiTags('Compras')
@ApiBearerAuth()
@Controller('compras')
export class ComprasController {
  constructor(private readonly compras: ComprasService) {}

  @Get()
  @RequerPermissoes('compras:ler')
  listar(@Query() q: ListarComprasDto) {
    return this.compras.listar(q);
  }

  @Get(':id')
  @RequerPermissoes('compras:ler')
  obter(@Param('id', ParseUUIDPipe) id: string) {
    return this.compras.obter(id);
  }

  @Post()
  @RequerPermissoes('compras:escrever')
  @Idempotente()
  criar(@Body() dados: PedidoCompraDto, @Ator() ator: ContextoAtor) {
    return this.compras.criar(dados, ator);
  }

  @Put(':id')
  @RequerPermissoes('compras:escrever')
  atualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dados: PedidoCompraDto,
    @Ator() ator: ContextoAtor,
  ) {
    return this.compras.atualizar(id, dados, ator);
  }

  @Post(':id/enviar')
  @HttpCode(200)
  @RequerPermissoes('compras:escrever')
  enviar(@Param('id', ParseUUIDPipe) id: string, @Ator() ator: ContextoAtor) {
    return this.compras.enviar(id, ator);
  }

  @Post(':id/cancelar')
  @HttpCode(200)
  @RequerPermissoes('compras:escrever')
  cancelar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dados: CancelamentoDto,
    @Ator() ator: ContextoAtor,
  ) {
    return this.compras.cancelar(id, dados, ator);
  }

  @Post(':id/recebimentos')
  @RequerPermissoes('compras:escrever', 'entradas:registrar')
  @Idempotente()
  receber(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dados: RecebimentoDto,
    @Ator() ator: ContextoAtor,
  ) {
    return this.compras.receber(id, dados, ator);
  }
}
