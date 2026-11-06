import {
  CallHandler,
  ExecutionContext,
  HttpStatus,
  Injectable,
  NestInterceptor,
  SetMetadata,
} from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import type { Response } from 'express';
import { from, of, throwError, type Observable } from 'rxjs';
import { catchError, mergeMap } from 'rxjs/operators';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { RequisicaoAutenticada } from './auth/tipos';
import { CriptoService } from './cripto.service';
import { ErroDominio } from './erros';

const CHAVE_IDEMPOTENTE = 'rota:idempotente';
const VALIDADE_HORAS = 24;
const FORMATO_CHAVE = /^[A-Za-z0-9_.:-]{8,100}$/;

interface OpcoesIdempotencia {
  /** Quando true, o cabeçalho Idempotency-Key é obrigatório. */
  obrigatorio?: boolean;
}

/**
 * Marca a rota como idempotente: requisições repetidas com o mesmo cabeçalho
 * `Idempotency-Key` devolvem a resposta original sem executar a operação de novo.
 */
export const Idempotente = (opcoes: OpcoesIdempotencia = {}) =>
  SetMetadata(CHAVE_IDEMPOTENTE, opcoes);

@Injectable()
export class IdempotenciaInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const opcoes = this.reflector.get<OpcoesIdempotencia | undefined>(
      CHAVE_IDEMPOTENTE,
      ctx.getHandler(),
    );
    if (!opcoes) return next.handle();

    const req = ctx.switchToHttp().getRequest<RequisicaoAutenticada>();
    const res = ctx.switchToHttp().getResponse<Response>();
    const chave = (req.headers['idempotency-key'] as string | undefined)?.trim();

    if (!chave) {
      if (opcoes.obrigatorio) {
        return throwError(
          () =>
            new ErroDominio(
              HttpStatus.BAD_REQUEST,
              'IDEMPOTENCIA_OBRIGATORIA',
              'Informe o cabeçalho Idempotency-Key.',
            ),
        );
      }
      return next.handle();
    }
    if (!FORMATO_CHAVE.test(chave)) {
      return throwError(
        () =>
          new ErroDominio(
            HttpStatus.BAD_REQUEST,
            'IDEMPOTENCIA_INVALIDA',
            'Idempotency-Key deve ter de 8 a 100 caracteres alfanuméricos.',
          ),
      );
    }

    const ator = req.usuario?.id ?? req.clienteApi?.id ?? 'anonimo';
    const rota = `${req.method} ${req.route?.path ?? req.path}`;
    const escopo = `${ator}|${rota}`.slice(0, 120);
    const hash = CriptoService.sha256(JSON.stringify({ p: req.params, b: req.body ?? null }));
    const statusPadrao =
      this.reflector.get<number | undefined>(HTTP_CODE_METADATA, ctx.getHandler()) ??
      (req.method === 'POST' ? HttpStatus.CREATED : HttpStatus.OK);

    return from(this.reservar(escopo, chave, hash)).pipe(
      mergeMap((existente) => {
        if (existente) {
          res.setHeader('Idempotent-Replayed', 'true');
          res.status(existente.statusHttp ?? statusPadrao);
          return of(existente.resposta);
        }
        return next.handle().pipe(
          mergeMap((resultado) =>
            from(this.concluir(escopo, chave, statusPadrao, resultado)).pipe(
              mergeMap(() => of(resultado)),
            ),
          ),
          catchError((erro) =>
            from(this.liberar(escopo, chave)).pipe(mergeMap(() => throwError(() => erro))),
          ),
        );
      }),
    );
  }

  /** Reserva a chave. Retorna o registro concluído se for repetição; lança erro em conflito. */
  private async reservar(escopo: string, chave: string, hash: string) {
    const expiraEm = new Date(Date.now() + VALIDADE_HORAS * 3600_000);
    for (let tentativa = 0; tentativa < 2; tentativa++) {
      try {
        await this.prisma.chaveIdempotencia.create({
          data: { escopo, chave, hashRequisicao: hash, expiraEm },
        });
        return null;
      } catch (e) {
        if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== 'P2002') throw e;
        const atual = await this.prisma.chaveIdempotencia.findUnique({
          where: { escopo_chave: { escopo, chave } },
        });
        if (!atual) continue;
        if (atual.expiraEm < new Date()) {
          await this.prisma.chaveIdempotencia.deleteMany({
            where: { escopo, chave, expiraEm: { lt: new Date() } },
          });
          continue;
        }
        if (atual.hashRequisicao !== hash) {
          throw new ErroDominio(
            HttpStatus.UNPROCESSABLE_ENTITY,
            'IDEMPOTENCIA_CONFLITO',
            'Esta Idempotency-Key já foi usada com outro conteúdo.',
          );
        }
        if (!atual.concluida) {
          throw new ErroDominio(
            HttpStatus.CONFLICT,
            'IDEMPOTENCIA_EM_PROCESSAMENTO',
            'Uma requisição com esta Idempotency-Key ainda está em processamento.',
          );
        }
        return atual;
      }
    }
    throw new ErroDominio(
      HttpStatus.CONFLICT,
      'CONCORRENCIA',
      'Conflito de concorrência. Tente novamente.',
    );
  }

  private async concluir(escopo: string, chave: string, status: number, resultado: unknown) {
    const resposta = resultado === undefined ? null : JSON.parse(JSON.stringify(resultado));
    await this.prisma.chaveIdempotencia.update({
      where: { escopo_chave: { escopo, chave } },
      data: { concluida: true, statusHttp: status, resposta: resposta ?? Prisma.JsonNull },
    });
  }

  private async liberar(escopo: string, chave: string) {
    await this.prisma.chaveIdempotencia.deleteMany({ where: { escopo, chave, concluida: false } });
  }
}
