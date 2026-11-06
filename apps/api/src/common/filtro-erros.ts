import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { ZodValidationException } from 'nestjs-zod';
import { ZodError } from 'zod';
import { Prisma } from '../generated/prisma/client';
import { ErroDominio } from './erros';

interface Problema {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  codigo: string;
  erros?: { campo: string; mensagem: string }[];
  detalhes?: Record<string, unknown>;
}

const TITULOS: Record<number, string> = {
  400: 'Requisição inválida',
  401: 'Não autenticado',
  403: 'Acesso negado',
  404: 'Não encontrado',
  409: 'Conflito',
  413: 'Conteúdo muito grande',
  415: 'Tipo de mídia não suportado',
  422: 'Regra de negócio violada',
  429: 'Muitas requisições',
  500: 'Erro interno',
  503: 'Serviço indisponível',
};

/** Converte qualquer erro em resposta RFC 7807 (application/problem+json), sem vazar detalhes internos. */
@Catch()
export class FiltroErros implements ExceptionFilter {
  private readonly logger = new Logger('Erros');

  catch(excecao: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    const problema = this.converter(excecao, req.originalUrl ?? req.url);

    if (problema.status >= 500) {
      this.logger.error(
        { err: excecao, rota: `${req.method} ${req.originalUrl}` },
        'Erro não tratado',
      );
    }

    if (res.headersSent) return;
    res.status(problema.status).type('application/problem+json').json(problema);
  }

  private converter(e: unknown, instancia: string): Problema {
    const base = (status: number, codigo: string, detail: string): Problema => ({
      type: `https://estoque.agrogest/erros/${codigo.toLowerCase().replace(/_/g, '-')}`,
      title: TITULOS[status] ?? 'Erro',
      status,
      detail,
      instance: instancia,
      codigo,
    });

    if (e instanceof ZodValidationException) {
      const zodError = e.getZodError() as ZodError;
      return {
        ...base(400, 'VALIDACAO', 'Os dados enviados são inválidos.'),
        erros: zodError.issues.map((i) => ({ campo: i.path.join('.'), mensagem: i.message })),
      };
    }
    if (e instanceof ZodError) {
      return {
        ...base(400, 'VALIDACAO', 'Os dados enviados são inválidos.'),
        erros: e.issues.map((i) => ({ campo: i.path.join('.'), mensagem: i.message })),
      };
    }
    if (e instanceof ErroDominio) {
      const p = base(e.getStatus(), e.codigo, (e.getResponse() as { mensagem: string }).mensagem);
      if (e.detalhes) p.detalhes = e.detalhes;
      return p;
    }
    if (e instanceof ThrottlerException) {
      return base(429, 'LIMITE_REQUISICOES', 'Muitas requisições. Aguarde e tente novamente.');
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      return this.converterPrisma(e, base);
    }
    if (e instanceof HttpException) {
      const status = e.getStatus();
      const resposta = e.getResponse();
      const mensagem =
        typeof resposta === 'string'
          ? resposta
          : ((resposta as { message?: string | string[] }).message ?? e.message);
      return base(
        status,
        HttpStatus[status] ?? 'ERRO_HTTP',
        Array.isArray(mensagem) ? mensagem.join('; ') : String(mensagem),
      );
    }
    const pg = this.erroPostgres(e);
    if (pg) return base(pg.status, pg.codigo, pg.mensagem);

    return base(500, 'ERRO_INTERNO', 'Ocorreu um erro inesperado. Tente novamente mais tarde.');
  }

  private converterPrisma(
    e: Prisma.PrismaClientKnownRequestError,
    base: (s: number, c: string, d: string) => Problema,
  ): Problema {
    switch (e.code) {
      case 'P2002': {
        const alvo = (e.meta?.target as string[] | string | undefined) ?? '';
        const campos = Array.isArray(alvo) ? alvo.join(', ') : alvo;
        return {
          ...base(
            409,
            'DUPLICADO',
            `Já existe um registro com o mesmo valor${campos ? ` (${campos})` : ''}.`,
          ),
          detalhes: { campos },
        };
      }
      case 'P2003':
        return base(409, 'REFERENCIA', 'Operação viola um relacionamento entre registros.');
      case 'P2025':
        return base(404, 'NAO_ENCONTRADO', 'Registro não encontrado.');
      case 'P2034':
        return base(409, 'CONCORRENCIA', 'Conflito de concorrência. Tente novamente.');
      default: {
        const pg = this.erroPostgres(e);
        if (pg) return base(pg.status, pg.codigo, pg.mensagem);
        return base(500, 'ERRO_BANCO', 'Erro ao acessar o banco de dados.');
      }
    }
  }

  /** Mapeia violações de CHECK e triggers do PostgreSQL. */
  private erroPostgres(e: unknown): { status: number; codigo: string; mensagem: string } | null {
    const texto = e instanceof Error ? e.message : '';
    if (/ck_saldo_/.test(texto)) {
      return {
        status: 409,
        codigo: 'SALDO_INSUFICIENTE',
        mensagem: 'Saldo insuficiente para a operação.',
      };
    }
    if (/ck_ajuste_segregacao/.test(texto)) {
      return {
        status: 422,
        codigo: 'SEGREGACAO_FUNCOES',
        mensagem: 'O ajuste deve ser aprovado por usuário diferente do solicitante.',
      };
    }
    if (/Registro (de auditoria )?imutável/.test(texto)) {
      return {
        status: 409,
        codigo: 'REGISTRO_IMUTAVEL',
        mensagem: 'Registros consolidados não podem ser alterados.',
      };
    }
    if (/violates check constraint|check_violation/.test(texto)) {
      return {
        status: 422,
        codigo: 'RESTRICAO',
        mensagem: 'Os dados violam uma regra de integridade.',
      };
    }
    return null;
  }
}
