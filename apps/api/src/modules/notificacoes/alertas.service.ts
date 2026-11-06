import { Injectable } from '@nestjs/common';
import { formatarQuantidade } from '@estoque/shared';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfiguracoesService } from '../configuracoes/configuracoes.service';
import { NotificacoesService } from './notificacoes.service';

const D = Prisma.Decimal;

/** Minutos desde 00:00 no fuso configurado. */
function minutosNoFuso(data: Date, fuso: string) {
  const partes = new Intl.DateTimeFormat('pt-BR', {
    timeZone: fuso,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
    .formatToParts(data)
    .reduce<Record<string, string>>((acc, p) => ({ ...acc, [p.type]: p.value }), {});
  return Number(partes.hour) * 60 + Number(partes.minute);
}

const paraMinutos = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** Regras de alertas automáticos (executadas pelo worker após cada evento). */
@Injectable()
export class AlertasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificacoes: NotificacoesService,
    private readonly configuracoes: ConfiguracoesService,
  ) {}

  async avaliarMovimentacao(movimentacaoId: string) {
    const mov = await this.prisma.movimentacao.findUnique({
      where: { id: movimentacaoId },
      include: {
        usuario: { select: { nome: true } },
        clienteApi: { select: { nome: true } },
        itens: {
          include: {
            produto: {
              select: {
                id: true,
                sku: true,
                nome: true,
                estoqueMinimo: true,
                estoqueMaximo: true,
                unidadeMedida: { select: { sigla: true } },
              },
            },
          },
        },
      },
    });
    if (!mov) return;

    const produtos = new Map(mov.itens.map((i) => [i.produto.id, i.produto]));
    for (const produto of produtos.values()) await this.avaliarNivel(produto);
    await this.avaliarAtipica(mov);
  }

  /** Esgotado, abaixo do mínimo e necessidade de reposição (com resolução automática). */
  async avaliarNivel(produto: {
    id: string;
    sku: string;
    nome: string;
    estoqueMinimo: Prisma.Decimal;
    estoqueMaximo: Prisma.Decimal | null;
    unidadeMedida: { sigla: string };
  }) {
    const s = await this.prisma.saldoEstoque.aggregate({
      where: { produtoId: produto.id },
      _sum: { quantidade: true, reservado: true },
    });
    const disponivel = (s._sum.quantidade ?? new D(0)).sub(s._sum.reservado ?? new D(0));
    const chaves = {
      esgotado: `estoque:esgotado:${produto.id}`,
      minimo: `estoque:minimo:${produto.id}`,
      reposicao: `estoque:reposicao:${produto.id}`,
    };
    const un = produto.unidadeMedida.sigla;
    const link = `/produtos/${produto.id}`;
    const alvo = produto.estoqueMaximo ?? produto.estoqueMinimo.mul(2);
    const sugestao = D.max(alvo.sub(disponivel), produto.estoqueMinimo.sub(disponivel), new D(0));

    if (disponivel.lte(0)) {
      await this.notificacoes.resolver(chaves.minimo);
      await this.notificacoes.notificar({
        tipo: 'ESTOQUE_ESGOTADO',
        severidade: 'CRITICA',
        titulo: `Produto esgotado: ${produto.sku}`,
        mensagem: `${produto.nome} está sem saldo disponível.`,
        permissaoAlvo: 'estoque:ler',
        entidade: 'produto',
        entidadeId: produto.id,
        link,
        chaveDeduplicacao: chaves.esgotado,
      });
    } else if (produto.estoqueMinimo.gt(0) && disponivel.lte(produto.estoqueMinimo)) {
      await this.notificacoes.resolver(chaves.esgotado);
      await this.notificacoes.notificar({
        tipo: 'ESTOQUE_MINIMO',
        severidade: 'ALERTA',
        titulo: `Estoque abaixo do mínimo: ${produto.sku}`,
        mensagem: `${produto.nome}: disponível ${formatarQuantidade(disponivel.toString())} ${un}, mínimo ${formatarQuantidade(produto.estoqueMinimo.toString())} ${un}.`,
        permissaoAlvo: 'estoque:ler',
        entidade: 'produto',
        entidadeId: produto.id,
        link,
        chaveDeduplicacao: chaves.minimo,
      });
    } else {
      await this.notificacoes.resolver(chaves.esgotado);
      await this.notificacoes.resolver(chaves.minimo);
      await this.notificacoes.resolver(chaves.reposicao);
      return;
    }
    if (sugestao.gt(0)) {
      await this.notificacoes.notificar({
        tipo: 'REPOSICAO',
        severidade: 'INFO',
        titulo: `Reposição necessária: ${produto.sku}`,
        mensagem: `Sugestão de compra de ${formatarQuantidade(sugestao.toString())} ${un} de ${produto.nome} para atingir o estoque ${produto.estoqueMaximo ? 'máximo' : 'de segurança'}.`,
        permissaoAlvo: 'compras:ler',
        entidade: 'produto',
        entidadeId: produto.id,
        link: `/compras/nova?produtoId=${produto.id}`,
        chaveDeduplicacao: chaves.reposicao,
      });
    }
  }

  /** Movimentação fora do padrão: estatística (média + kσ), percentual do saldo ou fora do horário. */
  private async avaliarAtipica(mov: {
    id: string;
    numero: bigint;
    tipo: string;
    origem: string;
    criadoEm: Date;
    usuario: { nome: string } | null;
    clienteApi: { nome: string } | null;
    itens: {
      produtoId: string;
      localOrigemId: string | null;
      localDestinoId: string | null;
      quantidade: Prisma.Decimal;
      produto: { sku: string; unidadeMedida: { sigla: string } };
    }[];
  }) {
    const cfg = (await this.configuracoes.obter()).alertas;
    const motivos: string[] = [];

    for (const item of mov.itens) {
      const ehSaida = item.localOrigemId && !item.localDestinoId;
      if (!ehSaida || mov.tipo === 'ESTORNO') continue;
      const q = item.quantidade;
      const [estat] = await this.prisma.$queryRaw<
        { media: Prisma.Decimal | null; desvio: Prisma.Decimal | null; amostras: bigint }[]
      >`
        SELECT AVG(mi.quantidade) AS media, STDDEV_SAMP(mi.quantidade) AS desvio, COUNT(*) AS amostras
          FROM movimentacao_itens mi
          JOIN movimentacoes m ON m.id = mi.movimentacao_id
         WHERE mi.produto_id = ${item.produtoId}::uuid
           AND mi.local_origem_id IS NOT NULL AND mi.local_destino_id IS NULL
           AND m.tipo IN ('SAIDA', 'AJUSTE')
           AND m.id <> ${mov.id}::uuid
           AND m.data_movimentacao >= now() - make_interval(days => ${cfg.janelaDias})`;
      const amostras = Number(estat?.amostras ?? 0);
      if (
        amostras >= cfg.minimoAmostras &&
        estat?.media &&
        estat.desvio &&
        new D(estat.desvio).gt(0)
      ) {
        const limite = new D(estat.media).add(new D(estat.desvio).mul(cfg.multiplicadorDesvio));
        if (q.gt(limite)) {
          motivos.push(
            `${item.produto.sku}: saída de ${formatarQuantidade(q.toString())} ${item.produto.unidadeMedida.sigla} acima do padrão (média ${formatarQuantidade(new D(estat.media).toFixed(2))}, limite ${formatarQuantidade(limite.toFixed(2))})`,
          );
          continue;
        }
      }
      if (cfg.percentualSaldoAtipico > 0 && q.gt(1)) {
        const s = await this.prisma.saldoEstoque.findUnique({
          where: { produtoId_localId: { produtoId: item.produtoId, localId: item.localOrigemId! } },
        });
        const antes = (s?.quantidade ?? new D(0)).add(q);
        if (antes.gt(0) && q.div(antes).mul(100).gte(cfg.percentualSaldoAtipico)) {
          motivos.push(
            `${item.produto.sku}: saída consumiu ${q.div(antes).mul(100).toFixed(0)}% do saldo do local`,
          );
        }
      }
    }

    if (mov.origem === 'MANUAL') {
      const minutos = minutosNoFuso(mov.criadoEm, cfg.fusoHorario);
      const inicio = paraMinutos(cfg.horarioInicio);
      const fim = paraMinutos(cfg.horarioFim);
      const dentro =
        inicio <= fim ? minutos >= inicio && minutos <= fim : minutos >= inicio || minutos <= fim;
      if (!dentro)
        motivos.push(
          `registrada fora do horário de operação (${cfg.horarioInicio}–${cfg.horarioFim})`,
        );
    }

    if (motivos.length) {
      await this.notificacoes.notificar({
        tipo: 'MOVIMENTACAO_ATIPICA',
        severidade: 'ALERTA',
        titulo: `Movimentação nº ${mov.numero} fora do padrão`,
        mensagem: `Responsável: ${mov.usuario?.nome ?? mov.clienteApi?.nome ?? 'sistema'}. ${motivos.join('; ')}.`,
        permissaoAlvo: 'movimentacoes:estornar',
        entidade: 'movimentacao',
        entidadeId: mov.id,
        link: `/movimentacoes/${mov.id}`,
        chaveDeduplicacao: `mov-atipica:${mov.id}`,
      });
    }
  }

  async divergenciaInventario(inventarioId: string, divergentes: number) {
    const inv = await this.prisma.inventario.findUnique({
      where: { id: inventarioId },
      select: { numero: true, descricao: true },
    });
    if (!inv) return;
    await this.notificacoes.notificar({
      tipo: 'DIVERGENCIA_INVENTARIO',
      severidade: 'ALERTA',
      titulo: `Divergências no inventário nº ${inv.numero}`,
      mensagem: `${divergentes} item(ns) com diferença entre o físico e o sistema em "${inv.descricao}".`,
      permissaoAlvo: 'ajustes:aprovar',
      entidade: 'inventario',
      entidadeId: inventarioId,
      link: `/inventario/${inventarioId}`,
      chaveDeduplicacao: `inventario:${inventarioId}`,
    });
  }

  async ajusteSolicitado(ajusteId: string) {
    const a = await this.prisma.ajuste.findUnique({
      where: { id: ajusteId },
      include: { solicitadoPor: { select: { nome: true } }, _count: { select: { itens: true } } },
    });
    if (!a || a.status !== 'PENDENTE') return;
    await this.notificacoes.notificar({
      tipo: 'AJUSTE_PENDENTE',
      severidade: 'INFO',
      titulo: `Ajuste nº ${a.numero} aguardando aprovação`,
      mensagem: `Solicitado por ${a.solicitadoPor.nome} com ${a._count.itens} item(ns): ${a.justificativa}`,
      permissaoAlvo: 'ajustes:aprovar',
      entidade: 'ajuste',
      entidadeId: ajusteId,
      link: `/ajustes/${ajusteId}`,
      chaveDeduplicacao: `ajuste:${ajusteId}`,
    });
  }
}
