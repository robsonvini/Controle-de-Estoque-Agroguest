import { Injectable } from '@nestjs/common';
import { listarAuditoriaSchema } from '@estoque/shared';
import { z } from 'zod';
import type { Prisma } from '../../generated/prisma/client';
import { intervaloDatas, paginar, resultadoPaginado } from '../../common/paginacao';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AuditoriaConsultaService {
  constructor(private readonly prisma: PrismaService) {}

  async listar(q: z.infer<typeof listarAuditoriaSchema>) {
    const where: Prisma.LogAuditoriaWhereInput = {
      ...(q.usuarioId && { usuarioId: q.usuarioId }),
      ...(q.entidade && { entidade: q.entidade }),
      ...(q.acao && { acao: q.acao }),
      ...(intervaloDatas(q.dataInicio, q.dataFim) && {
        criadoEm: intervaloDatas(q.dataInicio, q.dataFim),
      }),
      ...(q.busca && {
        OR: [{ entidadeId: q.busca }, { acao: { contains: q.busca.toUpperCase() } }],
      }),
    };
    const [dados, total] = await Promise.all([
      this.prisma.logAuditoria.findMany({ where, orderBy: { criadoEm: 'desc' }, ...paginar(q) }),
      this.prisma.logAuditoria.count({ where }),
    ]);
    const usuarioIds = [...new Set(dados.map((d) => d.usuarioId).filter(Boolean))] as string[];
    const clienteIds = [...new Set(dados.map((d) => d.clienteApiId).filter(Boolean))] as string[];
    const [usuarios, clientes] = await Promise.all([
      this.prisma.usuario.findMany({
        where: { id: { in: usuarioIds } },
        select: { id: true, nome: true },
      }),
      this.prisma.clienteApi.findMany({
        where: { id: { in: clienteIds } },
        select: { id: true, nome: true },
      }),
    ]);
    const nomes = new Map([...usuarios, ...clientes].map((u) => [u.id, u.nome]));
    return resultadoPaginado(
      dados.map((d) => ({
        ...d,
        ator: nomes.get(d.usuarioId ?? d.clienteApiId ?? '') ?? 'sistema',
      })),
      total,
      q,
    );
  }
}
