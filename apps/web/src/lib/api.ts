/**
 * Cliente HTTP da API.
 * - Access token mantido apenas em memória (não fica exposto a XSS via storage).
 * - Renovação automática e única (single-flight) em caso de 401, usando o
 *   cookie httpOnly de refresh + cabeçalho CSRF (double-submit).
 * - Erros RFC 7807 convertidos em ErroApi, com erros por campo.
 */

export interface ErroCampo {
  campo: string;
  mensagem: string;
}

export class ErroApi extends Error {
  constructor(
    public readonly status: number,
    mensagem: string,
    public readonly codigo?: string,
    public readonly erros: ErroCampo[] = [],
    public readonly detalhes?: Record<string, unknown>,
  ) {
    super(mensagem);
  }
}

let accessToken: string | null = null;
let renovacaoEmAndamento: Promise<boolean> | null = null;
let aoExpirarSessao: (() => void) | null = null;

export function definirToken(token: string | null) {
  accessToken = token;
}

export function aoSessaoExpirar(fn: () => void) {
  aoExpirarSessao = fn;
}

function lerCookie(nome: string) {
  if (typeof document === 'undefined') return undefined;
  return document.cookie
    .split('; ')
    .find((c) => c.startsWith(`${nome}=`))
    ?.split('=')[1];
}

/** Chave de idempotência para operações que alteram estoque. */
export function novaChaveIdempotencia() {
  return crypto.randomUUID();
}

export async function renovarSessao(): Promise<boolean> {
  renovacaoEmAndamento ??= (async () => {
    for (let tentativa = 0; tentativa < 2; tentativa++) {
      const csrf = lerCookie('estoque_csrf');
      if (!csrf) return false;
      const r = await fetch('/api/v1/auth/refresh', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'X-CSRF-Token': csrf },
        cache: 'no-store',
      });
      if (r.ok) {
        const dados = await r.json();
        accessToken = dados.accessToken;
        ultimaSessao = dados;
        return true;
      }
      // 409: outra aba renovou ao mesmo tempo; tenta de novo com o cookie atualizado
      if (r.status !== 409) return false;
      await new Promise((res) => setTimeout(res, 300));
    }
    return false;
  })().finally(() => {
    setTimeout(() => (renovacaoEmAndamento = null), 0);
  });
  return renovacaoEmAndamento;
}

/** Última resposta de sessão (login/refresh), usada no carregamento inicial. */
export let ultimaSessao: { accessToken: string; usuario: unknown } | null = null;

async function converterErro(r: Response): Promise<ErroApi> {
  let corpo: Record<string, unknown> = {};
  try {
    corpo = await r.json();
  } catch {
    /* corpo não-JSON */
  }
  const mensagem =
    (corpo.detail as string) ??
    (r.status === 403
      ? 'Você não tem permissão para esta operação.'
      : r.status >= 500
        ? 'O servidor encontrou um erro. Tente novamente em instantes.'
        : 'Não foi possível concluir a operação.');
  return new ErroApi(
    r.status,
    mensagem,
    corpo.codigo as string | undefined,
    (corpo.erros as ErroCampo[] | undefined) ?? [],
    corpo.detalhes as Record<string, unknown> | undefined,
  );
}

export interface OpcoesRequisicao {
  metodo?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  corpo?: unknown;
  consulta?: Record<string, string | number | boolean | null | undefined>;
  idempotencia?: string;
  sinal?: AbortSignal;
}

export function montarUrl(caminho: string, consulta?: OpcoesRequisicao['consulta']) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(consulta ?? {})) {
    if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
  }
  const qs = params.toString();
  return `/api/v1${caminho}${qs ? `?${qs}` : ''}`;
}

async function executar(
  caminho: string,
  op: OpcoesRequisicao,
  tentarRenovar: boolean,
): Promise<Response> {
  const cabecalhos: Record<string, string> = { Accept: 'application/json' };
  if (accessToken) cabecalhos.Authorization = `Bearer ${accessToken}`;
  if (op.idempotencia) cabecalhos['Idempotency-Key'] = op.idempotencia;
  let corpo: BodyInit | undefined;
  if (op.corpo instanceof FormData) corpo = op.corpo;
  else if (op.corpo !== undefined) {
    cabecalhos['Content-Type'] = 'application/json';
    corpo = JSON.stringify(op.corpo);
  }
  const r = await fetch(montarUrl(caminho, op.consulta), {
    method: op.metodo ?? 'GET',
    headers: cabecalhos,
    body: corpo,
    credentials: 'same-origin',
    cache: 'no-store',
    signal: op.sinal,
  });
  if (r.status === 401 && tentarRenovar) {
    if (await renovarSessao()) return executar(caminho, op, false);
    aoExpirarSessao?.();
  }
  return r;
}

export async function api<T = unknown>(caminho: string, op: OpcoesRequisicao = {}): Promise<T> {
  const r = await executar(caminho, op, true);
  if (!r.ok) throw await converterErro(r);
  if (r.status === 204) return undefined as T;
  return r.json() as Promise<T>;
}

/** Download de arquivo autenticado (exportação de relatórios). */
export async function baixarArquivo(
  caminho: string,
  consulta: OpcoesRequisicao['consulta'],
  nomePadrao: string,
) {
  const r = await executar(caminho, { consulta }, true);
  if (!r.ok) throw await converterErro(r);
  const blob = await r.blob();
  const disposicao = r.headers.get('Content-Disposition') ?? '';
  const nome = /filename="([^"]+)"/.exec(disposicao)?.[1] ?? nomePadrao;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function login(email: string, senha: string) {
  const r = await fetch('/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, senha }),
    credentials: 'same-origin',
    cache: 'no-store',
  });
  if (!r.ok) throw await converterErro(r);
  const dados = await r.json();
  accessToken = dados.accessToken;
  return dados;
}

export async function logout() {
  const csrf = lerCookie('estoque_csrf');
  await fetch('/api/v1/auth/logout', {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      ...(csrf && { 'X-CSRF-Token': csrf }),
      ...(accessToken && { Authorization: `Bearer ${accessToken}` }),
    },
  }).catch(() => undefined);
  accessToken = null;
}

export interface Paginado<T> {
  dados: T[];
  total: number;
  pagina: number;
  porPagina: number;
  totalPaginas: number;
}
