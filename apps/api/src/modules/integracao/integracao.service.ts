import { HttpStatus, Injectable } from '@nestjs/common';
import {
  listarLogsIntegracaoSchema,
  mascararCpf,
  paginacaoSchema,
  type ClienteApiInput,
  type ConfiguracaoIntegracaoInput,
} from '@estoque/shared';
import { z } from 'zod';
import type { Prisma } from '../../generated/prisma/client';
import type { ContextoAtor } from '../../common/auth/tipos';
import { CriptoService } from '../../common/cripto.service';
import { ErroDominio, naoEncontrado, regraNegocio } from '../../common/erros';
import { intervaloDatas, paginar, resultadoPaginado } from '../../common/paginacao';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { SenhaService } from '../auth/senha.service';
import { TAREFAS, TarefasService } from '../tarefas/tarefas.service';
import { CrmAgrogestClient } from './crm-agrogest.client';
import { CrmSyncService } from './crm-sync.service';

export const CLIENT_ID_WEBHOOKS = 'crm-agrogest-webhooks';

@Injectable()
export class IntegracaoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cripto: CriptoService,
    private readonly senhas: SenhaService,
    private readonly sync: CrmSyncService,
    private readonly crm: CrmAgrogestClient,
    private readonly tarefas: TarefasService,
    private readonly auditoria: AuditoriaService,
  ) {}

  /** Configuração e status, sem expor segredos (apenas se estão definidos). */
  async painel() {
    const i = await this.sync.integracao();
    const [ultimaExecucao, clientes, removidos, eventosPendentes, falhas24h, tarefasFalhas] =
      await Promise.all([
        this.prisma.integracaoExecucao.findFirst({
          where: { integracaoId: i.id },
          orderBy: { iniciadoEm: 'desc' },
        }),
        this.prisma.clienteCrm.count({ where: { removidoNoCrm: false } }),
        this.prisma.clienteCrm.count({ where: { removidoNoCrm: true } }),
        this.prisma.eventoRecebido.count({ where: { status: { in: ['RECEBIDO', 'ERRO'] } } }),
        this.prisma.integracaoLog.count({
          where: { sucesso: false, criadoEm: { gte: new Date(Date.now() - 86_400_000) } },
        }),
        this.prisma.tarefa.count({ where: { status: 'FALHOU' } }),
      ]);
    return {
      configuracao: {
        ativo: i.ativo,
        nome: i.nome,
        baseUrl: i.baseUrl,
        authHeaderNome: i.authHeaderNome,
        authHeaderDefinido: !!i.authHeaderValorCifrado,
        timeoutMs: i.timeoutMs,
        intervaloSyncMinutos: i.intervaloSyncMinutos,
        webhookSaidaAtivo: i.webhookSaidaAtivo,
        webhookSaidaUrl: i.webhookSaidaUrl,
        webhookSaidaSegredoDefinido: !!i.webhookSaidaSegredoCifrado,
        webhookEntradaSegredoDefinido: !!i.webhookEntradaSegredoCifrado,
      },
      status: {
        falhasConsecutivas: i.falhasConsecutivas,
        ultimaSincronizacaoEm: i.ultimaSincronizacaoEm,
        ultimoSucessoEm: i.ultimoSucessoEm,
        ultimoErro: i.ultimoErro,
        ultimaExecucao,
        clientesSincronizados: clientes,
        clientesRemovidosNoCrm: removidos,
        eventosPendentes,
        falhasUltimas24h: falhas24h,
        tarefasComFalha: tarefasFalhas,
      },
      endpoints: {
        crmUtilizados: ['GET /api/clientes', 'GET /api/clientes/{id}'],
        webhookEntrada: '/api/integracao/v1/webhooks/crm',
        apiIntegracao: '/api/integracao/v1',
        documentacao: '/api/docs',
      },
    };
  }

  async atualizar(dados: ConfiguracaoIntegracaoInput, ator: ContextoAtor) {
    const i = await this.sync.integracao();
    const data: Prisma.IntegracaoUpdateInput = {
      ativo: dados.ativo,
      baseUrl: dados.baseUrl.replace(/\/+$/, ''),
      authHeaderNome: dados.authHeaderNome,
      timeoutMs: dados.timeoutMs,
      intervaloSyncMinutos: dados.intervaloSyncMinutos,
      webhookSaidaAtivo: dados.webhookSaidaAtivo,
      webhookSaidaUrl: dados.webhookSaidaUrl,
    };
    // Valor do cabeçalho: undefined/'' mantém; null remove; texto substitui (cifrado)
    if (dados.authHeaderValor === null || !dados.authHeaderNome) data.authHeaderValorCifrado = null;
    else if (dados.authHeaderValor)
      data.authHeaderValorCifrado = this.cripto.cifrar(dados.authHeaderValor);
    if (dados.webhookSaidaAtivo && !dados.webhookSaidaUrl) {
      throw regraNegocio('Informe a URL para ativar o envio de webhooks ao CRM.');
    }
    await this.prisma.integracao.update({ where: { id: i.id }, data });
    await this.auditoria.registrar(ator, {
      acao: 'ATUALIZAR',
      entidade: 'integracao',
      entidadeId: i.id,
      dados: { ...dados, authHeaderValor: dados.authHeaderValor ? '[alterado]' : undefined },
    });
    return this.painel();
  }

  async testarConexao(ator: ContextoAtor) {
    const i = await this.sync.integracao();
    try {
      const r = await this.crm.testar(i);
      await this.auditoria.registrar(ator, {
        acao: 'TESTAR_CONEXAO',
        entidade: 'integracao',
        entidadeId: i.id,
        dados: r,
      });
      return r;
    } catch (e) {
      return { ok: false, erro: (e as Error).message };
    }
  }

  /** Sincronização manual imediata (impede execuções simultâneas). */
  async sincronizarAgora(ator: ContextoAtor) {
    const i = await this.sync.integracao();
    const emAndamento = await this.prisma.integracaoExecucao.count({
      where: {
        integracaoId: i.id,
        status: 'EM_ANDAMENTO',
        iniciadoEm: { gte: new Date(Date.now() - 10 * 60_000) },
      },
    });
    if (emAndamento) {
      throw new ErroDominio(
        HttpStatus.CONFLICT,
        'SINCRONIZACAO_EM_ANDAMENTO',
        'Já existe uma sincronização em andamento.',
      );
    }
    try {
      return await this.sync.sincronizarClientes('MANUAL', ator.usuarioId);
    } catch (e) {
      if (e instanceof ErroDominio) throw e;
      throw new ErroDominio(
        HttpStatus.BAD_GATEWAY,
        'FALHA_INTEGRACAO',
        `Falha ao sincronizar com o CRM: ${(e as Error).message}`,
      );
    }
  }

  /** Gera um novo segredo HMAC. O valor é exibido uma única vez. */
  async gerarSegredo(tipo: 'entrada' | 'saida', ator: ContextoAtor) {
    const i = await this.sync.integracao();
    const segredo = `whsec_${CriptoService.tokenAleatorio(32)}`;
    await this.prisma.integracao.update({
      where: { id: i.id },
      data:
        tipo === 'entrada'
          ? { webhookEntradaSegredoCifrado: this.cripto.cifrar(segredo) }
          : { webhookSaidaSegredoCifrado: this.cripto.cifrar(segredo) },
    });
    if (tipo === 'entrada') {
      // Ator de sistema que assina, no livro-razão, as operações originadas por webhooks do CRM
      await this.prisma.clienteApi.upsert({
        where: { clientId: CLIENT_ID_WEBHOOKS },
        update: { ativo: true, revogadoEm: null },
        create: {
          nome: 'CRM Agrogest — Webhooks',
          clientId: CLIENT_ID_WEBHOOKS,
          escopos: ['webhooks:enviar'],
          // Segredo aleatório nunca revelado: este cliente não obtém tokens, só identifica a origem
          segredoHash: await this.senhas.gerarHash(CriptoService.tokenAleatorio(32)),
          criadoPorId: ator.usuarioId!,
        },
      });
    }
    await this.auditoria.registrar(ator, {
      acao: `GERAR_SEGREDO_WEBHOOK_${tipo.toUpperCase()}`,
      entidade: 'integracao',
      entidadeId: i.id,
    });
    return { segredo, aviso: 'Guarde este segredo agora. Ele não será exibido novamente.' };
  }

  async listarExecucoes(q: z.infer<typeof paginacaoSchema>) {
    const [dados, total] = await Promise.all([
      this.prisma.integracaoExecucao.findMany({ orderBy: { iniciadoEm: 'desc' }, ...paginar(q) }),
      this.prisma.integracaoExecucao.count(),
    ]);
    return resultadoPaginado(dados, total, q);
  }

  async listarLogs(q: z.infer<typeof listarLogsIntegracaoSchema>) {
    const where: Prisma.IntegracaoLogWhereInput = {
      ...(q.sucesso !== undefined && { sucesso: q.sucesso }),
      ...(q.direcao && { direcao: q.direcao }),
      ...(intervaloDatas(q.dataInicio, q.dataFim) && {
        criadoEm: intervaloDatas(q.dataInicio, q.dataFim),
      }),
      ...(q.busca && {
        OR: [
          { operacao: { contains: q.busca } },
          { erro: { contains: q.busca, mode: 'insensitive' } },
        ],
      }),
    };
    const [dados, total] = await Promise.all([
      this.prisma.integracaoLog.findMany({ where, orderBy: { criadoEm: 'desc' }, ...paginar(q) }),
      this.prisma.integracaoLog.count({ where }),
    ]);
    return resultadoPaginado(dados, total, q);
  }

  async listarEventos(q: z.infer<typeof paginacaoSchema>) {
    const [dados, total] = await Promise.all([
      this.prisma.eventoRecebido.findMany({ orderBy: { recebidoEm: 'desc' }, ...paginar(q) }),
      this.prisma.eventoRecebido.count(),
    ]);
    return resultadoPaginado(dados, total, q);
  }

  async reprocessarEvento(id: string, ator: ContextoAtor) {
    const r = await this.prisma.eventoRecebido.updateMany({
      where: { id, status: { in: ['ERRO', 'RECEBIDO'] } },
      data: { status: 'RECEBIDO', erro: null },
    });
    if (!r.count)
      throw regraNegocio('Somente eventos com erro ou pendentes podem ser reprocessados.');
    await this.tarefas.enfileirar(
      TAREFAS.WEBHOOK_PROCESSAR_EVENTO,
      { eventoRecebidoId: id },
      { chaveUnica: `evento:${id}` },
    );
    await this.auditoria.registrar(ator, {
      acao: 'REPROCESSAR_EVENTO',
      entidade: 'evento_recebido',
      entidadeId: id,
    });
  }

  // ------------------------- Clientes de API -------------------------

  async listarClientesApi() {
    return this.prisma.clienteApi.findMany({
      orderBy: { criadoEm: 'desc' },
      select: {
        id: true,
        nome: true,
        clientId: true,
        escopos: true,
        ativo: true,
        criadoEm: true,
        ultimoUsoEm: true,
        revogadoEm: true,
        criadoPor: { select: { nome: true } },
      },
    });
  }

  /** Cria credenciais OAuth 2.0 (client credentials). O segredo é exibido uma única vez. */
  async criarClienteApi(dados: ClienteApiInput, ator: ContextoAtor) {
    const clientId = `cli_${CriptoService.tokenAleatorio(12)}`;
    const segredo = `sk_${CriptoService.tokenAleatorio(32)}`;
    const c = await this.prisma.clienteApi.create({
      data: {
        nome: dados.nome,
        clientId,
        escopos: dados.escopos,
        segredoHash: await this.senhas.gerarHash(segredo),
        criadoPorId: ator.usuarioId!,
      },
    });
    await this.auditoria.registrar(ator, {
      acao: 'CRIAR',
      entidade: 'cliente_api',
      entidadeId: c.id,
      dados: { nome: dados.nome, escopos: dados.escopos },
    });
    return {
      id: c.id,
      nome: c.nome,
      clientId,
      clientSecret: segredo,
      escopos: c.escopos,
      aviso: 'Guarde o client_secret agora. Ele não será exibido novamente.',
    };
  }

  async revogarClienteApi(id: string, ator: ContextoAtor) {
    const r = await this.prisma.clienteApi.updateMany({
      where: { id, revogadoEm: null },
      data: { ativo: false, revogadoEm: new Date() },
    });
    if (!r.count) throw naoEncontrado('Cliente de API ativo');
    await this.auditoria.registrar(ator, {
      acao: 'REVOGAR',
      entidade: 'cliente_api',
      entidadeId: id,
    });
  }

  // ---------------------- Espelho de clientes (CRM) ----------------------

  async listarClientes(q: z.infer<typeof paginacaoSchema> & { incluirRemovidos?: boolean }) {
    const where: Prisma.ClienteCrmWhereInput = {
      ...(!q.incluirRemovidos && { removidoNoCrm: false }),
      ...(q.busca && {
        OR: [
          { nome: { contains: q.busca, mode: 'insensitive' } },
          { razaoSocial: { contains: q.busca, mode: 'insensitive' } },
          { cnpj: { contains: q.busca.replace(/\D/g, '') || q.busca } },
        ],
      }),
    };
    const [dados, total] = await Promise.all([
      this.prisma.clienteCrm.findMany({ where, orderBy: { nome: 'asc' }, ...paginar(q) }),
      this.prisma.clienteCrm.count({ where }),
    ]);
    return resultadoPaginado(
      dados.map((c) => ({ ...c, cpf: mascararCpf(c.cpf) || null })),
      total,
      q,
    );
  }

  async obterCliente(id: string) {
    const c = await this.prisma.clienteCrm.findUnique({
      where: { id },
      include: {
        pedidos: {
          orderBy: { criadoEm: 'desc' },
          take: 50,
          select: {
            id: true,
            numero: true,
            status: true,
            valorTotal: true,
            criadoEm: true,
            idExterno: true,
          },
        },
      },
    });
    if (!c) throw naoEncontrado('Cliente');
    return { ...c, cpf: mascararCpf(c.cpf) || null };
  }
}
