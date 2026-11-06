import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService, type Tx } from '../../prisma/prisma.service';
import type { ContextoAtor } from '../../common/auth/tipos';

const CAMPOS_SENSIVEIS = /senha|token|secret|segredo|hash|authorization|cpf/i;

/** Remove campos sensíveis antes de gravar na auditoria (LGPD e segurança). */
export function sanitizar(valor: unknown, profundidade = 0): unknown {
  if (profundidade > 5 || valor == null) return valor;
  if (Array.isArray(valor)) return valor.slice(0, 50).map((v) => sanitizar(v, profundidade + 1));
  if (typeof valor === 'object') {
    if (valor instanceof Date) return valor.toISOString();
    const saida: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(valor as Record<string, unknown>)) {
      saida[k] = CAMPOS_SENSIVEIS.test(k) ? '[omitido]' : sanitizar(v, profundidade + 1);
    }
    return saida;
  }
  if (typeof valor === 'bigint') return valor.toString();
  return valor;
}

export interface RegistroAuditoria {
  acao: string;
  entidade: string;
  entidadeId?: string | null;
  dados?: unknown;
}

@Injectable()
export class AuditoriaService {
  constructor(private readonly prisma: PrismaService) {}

  /** Registra a atividade; aceita a transação corrente para gravar atomicamente com a operação. */
  async registrar(ator: ContextoAtor, registro: RegistroAuditoria, tx?: Tx) {
    const cliente = tx ?? this.prisma;
    await cliente.logAuditoria.create({
      data: {
        usuarioId: ator.usuarioId ?? null,
        clienteApiId: ator.clienteApiId ?? null,
        acao: registro.acao,
        entidade: registro.entidade,
        entidadeId: registro.entidadeId ?? null,
        dados: (registro.dados === undefined
          ? undefined
          : sanitizar(registro.dados)) as Prisma.InputJsonValue,
        ip: ator.ip ?? null,
        userAgent: ator.userAgent ?? null,
      },
    });
  }
}
