import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
  UseInterceptors,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiHeader,
  ApiOAuth2,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { z } from 'zod';
import { Ator, Publico, RequerEscopos } from '../../common/auth/decoradores';
import type { ContextoAtor, RequisicaoAutenticada } from '../../common/auth/tipos';
import {
  ConsultaSaldosDto,
  IntegracaoCancelamentoDto,
  IntegracaoPedidoDto,
  TokenRequestDto,
} from '../../common/dto';
import { Idempotente } from '../../common/idempotencia';
import {
  IntegracaoGuard,
  IntegracaoTokenService,
  LogIntegracaoInterceptor,
} from './integracao-auth';
import { pedidoExterno, PedidosIntegracaoService } from './pedidos-integracao.service';
import { CABECALHO_ASSINATURA, CABECALHO_TIMESTAMP, WebhooksService } from './webhooks.service';

const catalogoQuery = z.object({
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(1).max(500).default(100),
  busca: z.string().max(100).optional(),
  incluirInativos: z.enum(['true', 'false']).optional(),
});

/**
 * API de integração para o CRM Agrogest (contrato do Estoque).
 * Autenticação: OAuth 2.0 client credentials (POST /oauth/token) com escopos.
 * Webhooks: assinatura HMAC-SHA256 no cabeçalho X-Estoque-Assinatura.
 */
@ApiTags('Integração — API para o CRM')
@Publico()
@SkipThrottle({ default: false })
@UseGuards(IntegracaoGuard)
@UseInterceptors(LogIntegracaoInterceptor)
@Controller({ path: 'integracao/v1', version: VERSION_NEUTRAL })
export class IntegracaoApiController {
  constructor(
    private readonly tokens: IntegracaoTokenService,
    private readonly pedidos: PedidosIntegracaoService,
    private readonly webhooks: WebhooksService,
  ) {}

  @Post('oauth/token')
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Obtém token de acesso (OAuth 2.0 client credentials)' })
  token(@Body() dados: TokenRequestDto, @Res({ passthrough: true }) res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return this.tokens.emitir(dados.client_id, dados.client_secret, dados.scope);
  }

  @Get('produtos')
  @RequerEscopos('estoque:consultar')
  @ApiBearerAuth()
  @ApiOAuth2(['estoque:consultar'], 'integracao')
  @ApiOperation({ summary: 'Catálogo de produtos com disponibilidade' })
  catalogo(@Query() query: Record<string, string>) {
    const q = catalogoQuery.parse(query);
    return this.pedidos.catalogo({ ...q, incluirInativos: q.incluirInativos === 'true' });
  }

  @Get('produtos/:sku/saldo')
  @RequerEscopos('estoque:consultar')
  @ApiOAuth2(['estoque:consultar'], 'integracao')
  @ApiOperation({ summary: 'Saldo disponível de um produto por SKU' })
  saldo(@Param('sku') sku: string) {
    return this.pedidos.saldo(sku.slice(0, 50));
  }

  @Post('saldos/consulta')
  @HttpCode(200)
  @RequerEscopos('estoque:consultar')
  @ApiOAuth2(['estoque:consultar'], 'integracao')
  @ApiOperation({ summary: 'Consulta de saldos em lote (até 500 SKUs)' })
  saldos(@Body() dados: ConsultaSaldosDto) {
    return this.pedidos.saldos(dados.skus);
  }

  @Post('pedidos')
  @RequerEscopos('pedidos:gerenciar')
  @Idempotente({ obrigatorio: true })
  @ApiOAuth2(['pedidos:gerenciar'], 'integracao')
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'Obrigatório. Use um valor único por pedido.',
  })
  @ApiOperation({
    summary: 'Cria pedido de venda reservando estoque',
    description:
      'Se já existir pedido com o mesmo idExterno, devolve o existente (HTTP 200) sem nova reserva.',
  })
  async criarPedido(
    @Body() dados: IntegracaoPedidoDto,
    @Ator() ator: ContextoAtor,
    @Res({ passthrough: true }) res: Response,
  ) {
    const r = await this.pedidos.criar(dados, ator);
    if (r.jaExistia) res.status(200);
    return { ...pedidoExterno(r.pedido), jaExistia: r.jaExistia };
  }

  @Get('pedidos/:idExterno')
  @RequerEscopos('pedidos:gerenciar')
  @ApiOAuth2(['pedidos:gerenciar'], 'integracao')
  async obterPedido(@Param('idExterno') idExterno: string) {
    return pedidoExterno(await this.pedidos.obter(idExterno));
  }

  @Post('pedidos/:idExterno/confirmar')
  @HttpCode(200)
  @RequerEscopos('pedidos:gerenciar')
  @Idempotente()
  @ApiOAuth2(['pedidos:gerenciar'], 'integracao')
  @ApiOperation({ summary: 'Confirma a venda e baixa o estoque (idempotente)' })
  async confirmar(@Param('idExterno') idExterno: string, @Ator() ator: ContextoAtor) {
    return pedidoExterno(await this.pedidos.confirmar(idExterno, ator));
  }

  @Post('pedidos/:idExterno/cancelar')
  @HttpCode(200)
  @RequerEscopos('pedidos:gerenciar')
  @ApiOAuth2(['pedidos:gerenciar'], 'integracao')
  @ApiOperation({ summary: 'Cancela o pedido e libera a reserva (idempotente)' })
  async cancelar(
    @Param('idExterno') idExterno: string,
    @Body() dados: IntegracaoCancelamentoDto,
    @Ator() ator: ContextoAtor,
  ) {
    return pedidoExterno(await this.pedidos.cancelar(idExterno, dados.motivo, ator));
  }

  @Post('webhooks/crm')
  @HttpCode(202)
  @Throttle({ default: { limit: 300, ttl: 60_000 } })
  @ApiOperation({
    summary:
      'Recebe eventos do CRM (pedido.criado, pedido.confirmado, pedido.cancelado, cliente.atualizado)',
    description:
      'Assinatura: X-Estoque-Assinatura = "sha256=" + HMAC_SHA256(segredo, `${X-Estoque-Timestamp}.${corpo}`). ' +
      'Timestamp em segundos (tolerância de 5 minutos). Eventos repetidos (mesmo id) são ignorados.',
  })
  @ApiHeader({ name: 'X-Estoque-Timestamp', required: true })
  @ApiHeader({ name: 'X-Estoque-Assinatura', required: true })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['id', 'tipo', 'ocorridoEm', 'dados'],
      properties: {
        id: { type: 'string', example: 'evt_01J9...' },
        tipo: {
          type: 'string',
          enum: ['pedido.criado', 'pedido.confirmado', 'pedido.cancelado', 'cliente.atualizado'],
        },
        ocorridoEm: { type: 'string', format: 'date-time' },
        dados: { type: 'object' },
      },
    },
  })
  webhook(
    @Req() req: RawBodyRequest<RequisicaoAutenticada>,
    @Headers(CABECALHO_TIMESTAMP) timestamp?: string,
    @Headers(CABECALHO_ASSINATURA) assinatura?: string,
  ) {
    return this.webhooks.receber(req.rawBody, timestamp, assinatura);
  }
}
