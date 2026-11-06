import {
  CallHandler,
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Response } from 'express';
import { Observable, tap } from 'rxjs';
import { ESCOPOS_INTEGRACAO } from '@estoque/shared';
import { env } from '../../config/env';
import { CHAVE_ESCOPOS } from '../../common/auth/decoradores';
import type { ClienteApiAutenticado, RequisicaoAutenticada } from '../../common/auth/tipos';
import { ErroDominio } from '../../common/erros';
import { PrismaService } from '../../prisma/prisma.service';
import { SenhaService } from '../auth/senha.service';
import { CODIGO_CRM } from './crm-sync.service';

export const AUDIENCIA_INTEGRACAO = 'estoque-integracao';
const TTL_TOKEN_SEGUNDOS = 3600;

/** Erro no formato OAuth 2.0 (RFC 6749 §5.2). */
export class ErroOAuth extends ErroDominio {
  constructor(erro: string, descricao: string, status = HttpStatus.BAD_REQUEST) {
    super(status, erro.toUpperCase(), descricao, { error: erro, error_description: descricao });
  }
}

@Injectable()
export class IntegracaoTokenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly senhas: SenhaService,
    private readonly jwt: JwtService,
  ) {}

  /** OAuth 2.0 client credentials. */
  async emitir(clientId: string, clientSecret: string, escopoSolicitado?: string) {
    const cliente = await this.prisma.clienteApi.findUnique({ where: { clientId } });
    const valido = await this.senhas.verificar(cliente?.segredoHash, clientSecret);
    if (!cliente || !valido || !cliente.ativo || cliente.revogadoEm) {
      throw new ErroOAuth(
        'invalid_client',
        'Credenciais do cliente inválidas.',
        HttpStatus.UNAUTHORIZED,
      );
    }
    let escopos = cliente.escopos;
    if (escopoSolicitado) {
      const pedidos = escopoSolicitado.split(' ').filter(Boolean);
      const invalidos = pedidos.filter(
        (e) => !cliente.escopos.includes(e) || !(e in ESCOPOS_INTEGRACAO),
      );
      if (invalidos.length)
        throw new ErroOAuth('invalid_scope', `Escopo não autorizado: ${invalidos.join(', ')}`);
      escopos = pedidos;
    }
    const token = await this.jwt.signAsync(
      { sub: cliente.id, scope: escopos.join(' '), cid: cliente.clientId },
      {
        secret: env.JWT_INTEGRACAO_SECRET,
        audience: AUDIENCIA_INTEGRACAO,
        expiresIn: TTL_TOKEN_SEGUNDOS,
        algorithm: 'HS256',
      },
    );
    await this.prisma.clienteApi.update({
      where: { id: cliente.id },
      data: { ultimoUsoEm: new Date() },
    });
    return {
      access_token: token,
      token_type: 'Bearer',
      expires_in: TTL_TOKEN_SEGUNDOS,
      scope: escopos.join(' '),
    };
  }
}

/** Guard da API de integração: valida o token OAuth e os escopos exigidos pela rota. */
@Injectable()
export class IntegracaoGuard implements CanActivate {
  private readonly cache = new Map<
    string,
    { ativo: boolean; nome: string; clientId: string; expira: number }
  >();

  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const exigidos = this.reflector.getAllAndOverride<string[] | undefined>(CHAVE_ESCOPOS, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!exigidos) return true; // rotas sem escopo (token, webhook com HMAC)

    const req = ctx.switchToHttp().getRequest<RequisicaoAutenticada>();
    const [tipo, token] = req.headers.authorization?.split(' ') ?? [];
    if (tipo !== 'Bearer' || !token)
      throw new ErroOAuth('invalid_token', 'Token de acesso ausente.', HttpStatus.UNAUTHORIZED);

    let claims: { sub: string; scope: string };
    try {
      claims = await this.jwt.verifyAsync(token, {
        secret: env.JWT_INTEGRACAO_SECRET,
        audience: AUDIENCIA_INTEGRACAO,
        algorithms: ['HS256'],
      });
    } catch {
      throw new ErroOAuth(
        'invalid_token',
        'Token de acesso inválido ou expirado.',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const cliente = await this.carregar(claims.sub);
    if (!cliente?.ativo)
      throw new ErroOAuth('invalid_token', 'Cliente de API revogado.', HttpStatus.UNAUTHORIZED);
    const escopos = new Set(claims.scope.split(' '));
    const faltando = exigidos.filter((e) => !escopos.has(e));
    if (faltando.length) {
      throw new ErroOAuth(
        'insufficient_scope',
        `Escopo necessário: ${faltando.join(', ')}`,
        HttpStatus.FORBIDDEN,
      );
    }
    const autenticado: ClienteApiAutenticado = {
      tipo: 'clienteApi',
      id: claims.sub,
      clientId: cliente.clientId,
      nome: cliente.nome,
      escopos,
    };
    req.clienteApi = autenticado;
    return true;
  }

  private async carregar(id: string) {
    const emCache = this.cache.get(id);
    if (emCache && emCache.expira > Date.now()) return emCache;
    const c = await this.prisma.clienteApi.findUnique({
      where: { id },
      select: { ativo: true, revogadoEm: true, nome: true, clientId: true },
    });
    const valor = c
      ? {
          ativo: c.ativo && !c.revogadoEm,
          nome: c.nome,
          clientId: c.clientId,
          expira: Date.now() + 30_000,
        }
      : null;
    if (valor) this.cache.set(id, valor);
    return valor;
  }
}

/** Registra cada chamada recebida na API de integração (logs de integração, direção ENTRADA). */
@Injectable()
export class LogIntegracaoInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest<RequisicaoAutenticada>();
    const res = ctx.switchToHttp().getResponse<Response>();
    const inicio = Date.now();
    const registrar = (sucesso: boolean, status: number, erro?: string) => {
      void this.prisma.integracao
        .findUnique({ where: { codigo: CODIGO_CRM }, select: { id: true } })
        .then((i) =>
          this.prisma.integracaoLog.create({
            data: {
              integracaoId: i?.id ?? null,
              direcao: 'ENTRADA',
              operacao: `${ctx.getClass().name}.${ctx.getHandler().name}`,
              metodo: req.method,
              url: (req.originalUrl ?? req.url).split('?')[0]!.slice(0, 500),
              statusHttp: status,
              duracaoMs: Date.now() - inicio,
              sucesso,
              erro: erro?.slice(0, 1000),
              detalhes: req.clienteApi ? { clientId: req.clienteApi.clientId } : undefined,
            },
          }),
        )
        .catch(() => undefined);
    };
    return next.handle().pipe(
      tap({
        next: () => registrar(true, res.statusCode),
        error: (e: unknown) => {
          const status =
            e instanceof ErroDominio ? e.getStatus() : ((e as { status?: number }).status ?? 500);
          registrar(false, status, (e as Error).message);
        },
      }),
    );
  }
}
