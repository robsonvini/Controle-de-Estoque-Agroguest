import { Injectable } from '@nestjs/common';
import {
  CONFIGURACOES_PADRAO,
  configuracoesSistemaSchema,
  type ConfiguracoesSistema,
} from '@estoque/shared';
import type { Prisma } from '../../generated/prisma/client';
import type { ContextoAtor } from '../../common/auth/tipos';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';

const CHAVE = 'sistema';
const TTL_MS = 30_000;

@Injectable()
export class ConfiguracoesService {
  private cache?: { valor: ConfiguracoesSistema; expira: number };

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async obter(): Promise<ConfiguracoesSistema> {
    if (this.cache && this.cache.expira > Date.now()) return this.cache.valor;
    const registro = await this.prisma.configuracao.findUnique({ where: { chave: CHAVE } });
    // Mescla com os padrões para tolerar campos novos adicionados em versões futuras
    const valor = configuracoesSistemaSchema.parse({
      ...CONFIGURACOES_PADRAO,
      ...((registro?.valor as object | undefined) ?? {}),
    });
    this.cache = { valor, expira: Date.now() + TTL_MS };
    return valor;
  }

  async atualizar(dados: ConfiguracoesSistema, ator: ContextoAtor) {
    const anterior = await this.obter();
    await this.prisma.configuracao.upsert({
      where: { chave: CHAVE },
      update: { valor: dados as unknown as Prisma.InputJsonValue, atualizadoPorId: ator.usuarioId },
      create: {
        chave: CHAVE,
        valor: dados as unknown as Prisma.InputJsonValue,
        atualizadoPorId: ator.usuarioId,
      },
    });
    this.cache = undefined;
    await this.auditoria.registrar(ator, {
      acao: 'ATUALIZAR',
      entidade: 'configuracoes',
      entidadeId: CHAVE,
      dados: { antes: anterior, depois: dados },
    });
    return this.obter();
  }
}
