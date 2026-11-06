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
import { z } from 'zod';
import { paginacaoSchema } from '@estoque/shared';
import { Ator, RequerPermissoes } from '../../common/auth/decoradores';
import type { ContextoAtor } from '../../common/auth/tipos';
import {
  ClienteApiDto,
  ConfiguracaoIntegracaoDto,
  ListarLogsIntegracaoDto,
  PaginacaoDto,
} from '../../common/dto';
import { regraNegocio } from '../../common/erros';
import { TarefasService } from '../tarefas/tarefas.service';
import { IntegracaoService } from './integracao.service';

@ApiTags('Integração CRM (gestão)')
@ApiBearerAuth()
@Controller('integracao')
export class IntegracaoController {
  constructor(
    private readonly integracao: IntegracaoService,
    private readonly tarefas: TarefasService,
  ) {}

  @Get('crm')
  @RequerPermissoes('integracao:ler')
  painel() {
    return this.integracao.painel();
  }

  @Put('crm')
  @RequerPermissoes('integracao:gerenciar')
  atualizar(@Body() dados: ConfiguracaoIntegracaoDto, @Ator() ator: ContextoAtor) {
    return this.integracao.atualizar(dados, ator);
  }

  @Post('crm/testar')
  @HttpCode(200)
  @RequerPermissoes('integracao:gerenciar')
  testar(@Ator() ator: ContextoAtor) {
    return this.integracao.testarConexao(ator);
  }

  @Post('crm/sincronizar')
  @HttpCode(200)
  @RequerPermissoes('integracao:gerenciar')
  sincronizar(@Ator() ator: ContextoAtor) {
    return this.integracao.sincronizarAgora(ator);
  }

  @Post('crm/segredos/:tipo')
  @HttpCode(200)
  @RequerPermissoes('integracao:gerenciar')
  gerarSegredo(@Param('tipo') tipo: string, @Ator() ator: ContextoAtor) {
    if (tipo !== 'entrada' && tipo !== 'saida') throw regraNegocio('Tipo de segredo inválido.');
    return this.integracao.gerarSegredo(tipo, ator);
  }

  @Get('execucoes')
  @RequerPermissoes('integracao:ler')
  execucoes(@Query() q: PaginacaoDto) {
    return this.integracao.listarExecucoes(q);
  }

  @Get('logs')
  @RequerPermissoes('integracao:ler')
  logs(@Query() q: ListarLogsIntegracaoDto) {
    return this.integracao.listarLogs(q);
  }

  @Get('eventos')
  @RequerPermissoes('integracao:ler')
  eventos(@Query() q: PaginacaoDto) {
    return this.integracao.listarEventos(q);
  }

  @Post('eventos/:id/reprocessar')
  @HttpCode(204)
  @RequerPermissoes('integracao:gerenciar')
  async reprocessarEvento(@Param('id', ParseUUIDPipe) id: string, @Ator() ator: ContextoAtor) {
    await this.integracao.reprocessarEvento(id, ator);
  }

  @Get('tarefas')
  @RequerPermissoes('integracao:ler')
  async tarefasResumo() {
    return { resumo: await this.tarefas.resumo(), falhas: await this.tarefas.listarFalhas() };
  }

  @Post('tarefas/:id/reprocessar')
  @HttpCode(204)
  @RequerPermissoes('integracao:gerenciar')
  async reprocessarTarefa(@Param('id') id: string) {
    if (!/^\d+$/.test(id)) throw regraNegocio('Identificador de tarefa inválido.');
    await this.tarefas.reprocessar(BigInt(id));
  }

  @Get('clientes-api')
  @RequerPermissoes('integracao:gerenciar')
  clientesApi() {
    return this.integracao.listarClientesApi();
  }

  @Post('clientes-api')
  @RequerPermissoes('integracao:gerenciar')
  criarClienteApi(@Body() dados: ClienteApiDto, @Ator() ator: ContextoAtor) {
    return this.integracao.criarClienteApi(dados, ator);
  }

  @Post('clientes-api/:id/revogar')
  @HttpCode(204)
  @RequerPermissoes('integracao:gerenciar')
  async revogarClienteApi(@Param('id', ParseUUIDPipe) id: string, @Ator() ator: ContextoAtor) {
    await this.integracao.revogarClienteApi(id, ator);
  }
}

const listarClientesSchema = paginacaoSchema.extend({
  incluirRemovidos: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

@ApiTags('Clientes (espelho do CRM)')
@ApiBearerAuth()
@Controller('clientes')
export class ClientesController {
  constructor(private readonly integracao: IntegracaoService) {}

  @Get()
  @RequerPermissoes('clientes:ler')
  listar(@Query() query: Record<string, string>) {
    return this.integracao.listarClientes(listarClientesSchema.parse(query));
  }

  @Get(':id')
  @RequerPermissoes('clientes:ler')
  obter(@Param('id', ParseUUIDPipe) id: string) {
    return this.integracao.obterCliente(id);
  }
}
