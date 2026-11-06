import { Injectable, Logger } from '@nestjs/common';
import { somenteDigitos, type CrmCliente } from '@estoque/shared';
import type { Integracao } from '../../generated/prisma/client';
import { CriptoService } from '../../common/cripto.service';
import { naoEncontrado, regraNegocio } from '../../common/erros';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfiguracoesService } from '../configuracoes/configuracoes.service';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import { CrmAgrogestClient } from './crm-agrogest.client';

export const CODIGO_CRM = 'crm-agrogest';
const CHAVE_ALERTA_FALHA = 'crm:falha-sincronizacao';

/** Converte o cliente do CRM para o espelho local (minimização de dados — LGPD). */
export function mapearCliente(c: CrmCliente) {
  const cnpj = c.cnpj ? somenteDigitos(c.cnpj) : '';
  const cpf = c.cpf ? somenteDigitos(c.cpf) : '';
  const dados = {
    nome: c.nome.slice(0, 150),
    razaoSocial: c.razaosocial?.slice(0, 200) ?? null,
    cnpj: cnpj.length === 14 ? cnpj : null,
    cpf: cpf.length === 11 ? cpf : null,
    email: c.email?.toLowerCase().slice(0, 160) ?? null,
    telefone: c.telefone?.slice(0, 20) ?? null,
    cidade: c.cidade?.slice(0, 100) ?? null,
    uf: c.estado ? c.estado.trim().toUpperCase().slice(0, 2) : null,
  };
  return { ...dados, hash: CriptoService.sha256(JSON.stringify(dados)) };
}

@Injectable()
export class CrmSyncService {
  private readonly logger = new Logger(CrmSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crm: CrmAgrogestClient,
    private readonly notificacoes: NotificacoesService,
    private readonly configuracoes: ConfiguracoesService,
  ) {}

  async integracao(): Promise<Integracao> {
    const i = await this.prisma.integracao.findUnique({ where: { codigo: CODIGO_CRM } });
    if (!i) throw naoEncontrado('Integração CRM');
    return i;
  }

  /** Sincronização completa dos clientes (o CRM não oferece filtro por data de alteração). */
  async sincronizarClientes(gatilho: 'AGENDADO' | 'MANUAL', disparadoPorId?: string | null) {
    const integracao = await this.integracao();
    if (!integracao.ativo) throw regraNegocio('A integração com o CRM está desativada.');

    const execucao = await this.prisma.integracaoExecucao.create({
      data: {
        integracaoId: integracao.id,
        tipo: 'SYNC_CLIENTES',
        gatilho,
        disparadoPorId: disparadoPorId ?? null,
      },
    });
    const agora = new Date();
    try {
      const { clientes, invalidos } = await this.crm.listarClientes(integracao, execucao.id);
      const existentes = await this.prisma.clienteCrm.findMany({
        select: { crmId: true, hash: true, removidoNoCrm: true },
      });
      const porCrmId = new Map(existentes.map((e) => [e.crmId, e]));
      let criados = 0;
      let atualizados = 0;
      let inalterados = 0;

      for (const c of clientes) {
        const dados = mapearCliente(c);
        const atual = porCrmId.get(c.id);
        if (!atual) {
          await this.prisma.clienteCrm.create({
            data: { crmId: c.id, ...dados, sincronizadoEm: agora },
          });
          criados++;
        } else if (atual.hash !== dados.hash || atual.removidoNoCrm) {
          await this.prisma.clienteCrm.update({
            where: { crmId: c.id },
            data: { ...dados, removidoNoCrm: false, sincronizadoEm: agora },
          });
          atualizados++;
        } else {
          await this.prisma.clienteCrm.update({
            where: { crmId: c.id },
            data: { sincronizadoEm: agora },
          });
          inalterados++;
        }
      }

      // Clientes que não vieram mais do CRM são marcados (não excluídos: preservam histórico)
      const recebidos = new Set(clientes.map((c) => c.id));
      const removidosIds = existentes
        .filter((e) => !e.removidoNoCrm && !recebidos.has(e.crmId))
        .map((e) => e.crmId);
      if (removidosIds.length) {
        await this.prisma.clienteCrm.updateMany({
          where: { crmId: { in: removidosIds } },
          data: { removidoNoCrm: true, sincronizadoEm: agora },
        });
      }

      await this.prisma.integracaoExecucao.update({
        where: { id: execucao.id },
        data: {
          status: 'SUCESSO',
          finalizadoEm: new Date(),
          totalRecebidos: clientes.length + invalidos,
          criados,
          atualizados,
          inalterados,
          removidos: removidosIds.length,
          invalidos,
        },
      });
      await this.prisma.integracao.update({
        where: { id: integracao.id },
        data: {
          falhasConsecutivas: 0,
          ultimaSincronizacaoEm: agora,
          ultimoSucessoEm: new Date(),
          ultimoErro: null,
        },
      });
      await this.notificacoes.resolver(CHAVE_ALERTA_FALHA);
      return this.prisma.integracaoExecucao.findUniqueOrThrow({ where: { id: execucao.id } });
    } catch (e) {
      const mensagem = (e as Error).message.slice(0, 1000);
      await this.prisma.integracaoExecucao.update({
        where: { id: execucao.id },
        data: { status: 'FALHA', finalizadoEm: new Date(), erro: mensagem },
      });
      const atualizada = await this.prisma.integracao.update({
        where: { id: integracao.id },
        data: {
          falhasConsecutivas: { increment: 1 },
          ultimaSincronizacaoEm: agora,
          ultimoErro: mensagem,
        },
      });
      const config = await this.configuracoes.obter();
      if (atualizada.falhasConsecutivas >= config.integracao.falhasParaAlerta) {
        await this.notificacoes.notificar({
          tipo: 'FALHA_SINCRONIZACAO',
          severidade: 'CRITICA',
          titulo: 'Falha de sincronização com o CRM',
          mensagem: `${atualizada.falhasConsecutivas} falhas consecutivas ao sincronizar clientes. Último erro: ${mensagem}`,
          permissaoAlvo: 'integracao:ler',
          entidade: 'integracao',
          entidadeId: integracao.id,
          link: '/integracao',
          chaveDeduplicacao: CHAVE_ALERTA_FALHA,
        });
      }
      this.logger.warn(`Sincronização de clientes falhou: ${mensagem}`);
      throw e;
    }
  }

  /**
   * Sincroniza um cliente específico sob demanda (pedido recebido de cliente ainda não
   * espelhado, ou evento cliente.atualizado). Retorna o registro local ou null se o CRM não o tiver.
   */
  async sincronizarCliente(crmId: string) {
    const integracao = await this.integracao();
    const cliente = await this.crm.obterCliente(integracao, crmId);
    if (!cliente) {
      await this.prisma.clienteCrm.updateMany({
        where: { crmId },
        data: { removidoNoCrm: true, sincronizadoEm: new Date() },
      });
      return null;
    }
    const dados = mapearCliente(cliente);
    return this.prisma.clienteCrm.upsert({
      where: { crmId },
      update: { ...dados, removidoNoCrm: false, sincronizadoEm: new Date() },
      create: { crmId, ...dados, sincronizadoEm: new Date() },
    });
  }

  /** Resolve o UUID do CRM para o id local, buscando no CRM se ainda não espelhado. */
  async resolverClienteLocal(crmId: string): Promise<string> {
    const local = await this.prisma.clienteCrm.findUnique({
      where: { crmId },
      select: { id: true },
    });
    if (local) return local.id;
    const sincronizado = await this.sincronizarCliente(crmId).catch((e) => {
      throw regraNegocio(
        `Cliente ${crmId} não encontrado no espelho e o CRM não respondeu: ${(e as Error).message}`,
      );
    });
    if (!sincronizado) throw regraNegocio(`Cliente ${crmId} não existe no CRM.`);
    return sincronizado.id;
  }
}
