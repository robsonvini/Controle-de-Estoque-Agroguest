import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Ator, RequerPermissoes } from '../../common/auth/decoradores';
import type { ContextoAtor } from '../../common/auth/tipos';
import { CancelamentoDto, ListarPedidosDto, PedidoVendaDto } from '../../common/dto';
import { Idempotente } from '../../common/idempotencia';
import { PedidosService } from './pedidos.service';

@ApiTags('Pedidos de venda')
@ApiBearerAuth()
@Controller('pedidos')
export class PedidosController {
  constructor(private readonly pedidos: PedidosService) {}

  @Get()
  @RequerPermissoes('pedidos:ler')
  listar(@Query() q: ListarPedidosDto) {
    return this.pedidos.listar(q);
  }

  @Get(':id')
  @RequerPermissoes('pedidos:ler')
  obter(@Param('id', ParseUUIDPipe) id: string) {
    return this.pedidos.obter(id);
  }

  @Post()
  @RequerPermissoes('pedidos:escrever')
  @Idempotente()
  async criar(@Body() dados: PedidoVendaDto, @Ator() ator: ContextoAtor) {
    const { pedido } = await this.pedidos.criar({ origem: 'MANUAL', ...dados }, ator);
    return pedido;
  }

  @Post(':id/confirmar')
  @HttpCode(200)
  @RequerPermissoes('pedidos:escrever', 'saidas:registrar')
  @Idempotente()
  confirmar(@Param('id', ParseUUIDPipe) id: string, @Ator() ator: ContextoAtor) {
    return this.pedidos.confirmar(id, ator);
  }

  @Post(':id/cancelar')
  @HttpCode(200)
  @RequerPermissoes('pedidos:escrever')
  cancelar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dados: CancelamentoDto,
    @Ator() ator: ContextoAtor,
  ) {
    return this.pedidos.cancelar(id, dados, ator);
  }
}
