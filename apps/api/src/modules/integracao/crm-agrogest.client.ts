import { Injectable, Logger } from '@nestjs/common';
import { crmClienteSchema, crmListaClientesSchema, type CrmCliente } from '@estoque/shared';
import type { Integracao, Prisma } from '../../generated/prisma/client';
import { CriptoService } from '../../common/cripto.service';
import { PrismaService } from '../../prisma/prisma.service';

export class ErroIntegracao extends Error {
  constructor(
    mensagem: string,
    public readonly statusHttp?: number,
    public readonly transitorio = true,
  ) {
    super(mensagem);
  }
}

const MAX_TENTATIVAS = 3;
const LIMIAR_CIRCUITO = 5;
const CIRCUITO_ABERTO_MS = 60_000;

/**
 * Cliente HTTP do CRM Agrogest.
 *
 * Usa SOMENTE os endpoints verificados no repositório do CRM
 * (crm-agrogest, backend/routes/api.php):
 *   GET /api/clientes        -> lista completa (sem paginação no CRM)
 *   GET /api/clientes/{uuid} -> cliente ou 404
 *
 * A API do CRM não exige autenticação hoje; o cabeçalho configurável
 * (authHeaderNome/authHeaderValor) é enviado quando definido.
 */
@Injectable()
export class CrmAgrogestClient {
  private readonly logger = new Logger(CrmAgrogestClient.name);
  private falhasSeguidas = 0;
  private abertoAte = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cripto: CriptoService,
  ) {}

  async listarClientes(integracao: Integracao, execucaoId?: string) {
    const corpo = await this.requisitar(
      integracao,
      'GET',
      '/api/clientes',
      'listar_clientes',
      execucaoId,
    );
    const lista = crmListaClientesSchema.safeParse(corpo);
    if (!lista.success)
      throw new ErroIntegracao(
        'Resposta do CRM em formato inesperado (esperado: lista).',
        undefined,
        false,
      );
    const validos: CrmCliente[] = [];
    let invalidos = 0;
    for (const item of lista.data) {
      const r = crmClienteSchema.safeParse(item);
      if (r.success) validos.push(r.data);
      else invalidos++;
    }
    return { clientes: validos, invalidos };
  }

  async obterCliente(integracao: Integracao, crmId: string): Promise<CrmCliente | null> {
    try {
      const corpo = await this.requisitar(
        integracao,
        'GET',
        `/api/clientes/${encodeURIComponent(crmId)}`,
        'obter_cliente',
      );
      const r = crmClienteSchema.safeParse(corpo);
      if (!r.success)
        throw new ErroIntegracao('Cliente do CRM em formato inesperado.', undefined, false);
      return r.data;
    } catch (e) {
      if (e instanceof ErroIntegracao && e.statusHttp === 404) return null;
      throw e;
    }
  }

  /** Teste de conectividade usado pela tela de configuração. */
  async testar(integracao: Integracao) {
    const inicio = Date.now();
    const { clientes, invalidos } = await this.listarClientes(integracao);
    return { ok: true, latenciaMs: Date.now() - inicio, clientes: clientes.length, invalidos };
  }

  private async requisitar(
    integracao: Integracao,
    metodo: 'GET',
    caminho: string,
    operacao: string,
    execucaoId?: string,
  ): Promise<unknown> {
    if (Date.now() < this.abertoAte) {
      throw new ErroIntegracao(
        'Circuito aberto: CRM indisponível nas últimas tentativas. Nova tentativa em instantes.',
      );
    }
    const url = new URL(
      caminho,
      integracao.baseUrl.endsWith('/') ? integracao.baseUrl : `${integracao.baseUrl}/`,
    );
    const cabecalhos: Record<string, string> = { Accept: 'application/json' };
    if (integracao.authHeaderNome && integracao.authHeaderValorCifrado) {
      cabecalhos[integracao.authHeaderNome] = this.cripto.decifrar(
        integracao.authHeaderValorCifrado,
      );
    }

    let ultimoErro: ErroIntegracao | undefined;
    for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
      const inicio = Date.now();
      let status: number | undefined;
      try {
        const resposta = await fetch(url, {
          method: metodo,
          headers: cabecalhos,
          signal: AbortSignal.timeout(integracao.timeoutMs),
          redirect: 'error',
        });
        status = resposta.status;
        const texto = await resposta.text();
        if (!resposta.ok) {
          const transitorio = status >= 500 || status === 429;
          throw new ErroIntegracao(`CRM respondeu HTTP ${status}`, status, transitorio);
        }
        let corpo: unknown;
        try {
          corpo = texto ? JSON.parse(texto) : null;
        } catch {
          throw new ErroIntegracao('Resposta do CRM não é JSON válido.', status, false);
        }
        await this.registrarLog(integracao, execucaoId, {
          operacao,
          metodo,
          url: url.pathname,
          statusHttp: status,
          duracaoMs: Date.now() - inicio,
          tentativa,
          sucesso: true,
          detalhes: { registros: Array.isArray(corpo) ? corpo.length : 1 },
        });
        this.falhasSeguidas = 0;
        return corpo;
      } catch (e) {
        ultimoErro =
          e instanceof ErroIntegracao
            ? e
            : new ErroIntegracao(
                (e as Error).name === 'TimeoutError'
                  ? `Tempo limite de ${integracao.timeoutMs} ms excedido`
                  : `Falha de conexão com o CRM: ${(e as Error).message}`,
              );
        await this.registrarLog(integracao, execucaoId, {
          operacao,
          metodo,
          url: url.pathname,
          statusHttp: status,
          duracaoMs: Date.now() - inicio,
          tentativa,
          sucesso: false,
          erro: ultimoErro.message,
        });
        if (ultimoErro.statusHttp === 404 || !ultimoErro.transitorio) break;
        if (tentativa < MAX_TENTATIVAS)
          await new Promise((r) => setTimeout(r, 400 * 3 ** (tentativa - 1)));
      }
    }

    if (ultimoErro?.transitorio && ultimoErro.statusHttp !== 404) {
      this.falhasSeguidas++;
      if (this.falhasSeguidas >= LIMIAR_CIRCUITO) {
        this.abertoAte = Date.now() + CIRCUITO_ABERTO_MS;
        this.logger.warn(
          'Circuito da integração com o CRM aberto por 60 s após falhas consecutivas',
        );
      }
    }
    throw ultimoErro ?? new ErroIntegracao('Falha desconhecida na integração.');
  }

  private async registrarLog(
    integracao: Integracao,
    execucaoId: string | undefined,
    dados: Omit<
      Prisma.IntegracaoLogUncheckedCreateInput,
      'direcao' | 'integracaoId' | 'execucaoId'
    >,
  ) {
    try {
      await this.prisma.integracaoLog.create({
        data: {
          ...dados,
          direcao: 'SAIDA',
          integracaoId: integracao.id,
          execucaoId: execucaoId ?? null,
        },
      });
    } catch (e) {
      this.logger.error(`Falha ao registrar log de integração: ${(e as Error).message}`);
    }
  }
}
