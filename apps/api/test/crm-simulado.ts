import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * Servidor HTTP que reproduz o contrato REAL da API de clientes do CRM Agrogest
 * (Laravel: ClienteController + DatabaseClienteRepository::fromDatabase).
 * Usado apenas em testes automatizados.
 */
export interface ClienteCrmFake {
  id: string;
  nome: string;
  razaosocial: string | null;
  cnpj: string | null;
  cpf: string | null;
  email: string | null;
  telefone: string | null;
  cidade: string | null;
  estado: string | null;
}

export class CrmSimulado {
  clientes: (ClienteCrmFake | Record<string, unknown>)[] = [];
  modo: 'ok' | 'erro500' | 'lento' | 'html' = 'ok';
  requisicoes: { metodo: string; url: string; cabecalhos: Record<string, unknown> }[] = [];
  private servidor?: Server;

  async iniciar(): Promise<string> {
    this.servidor = createServer((req, res) => {
      this.requisicoes.push({
        metodo: req.method ?? '',
        url: req.url ?? '',
        cabecalhos: req.headers,
      });
      const responder = (status: number, corpo: unknown) => {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(corpo));
      };
      if (this.modo === 'erro500') return responder(500, { message: 'Server Error' });
      if (this.modo === 'html') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        return res.end('<html>manutenção</html>');
      }
      const atender = () => {
        const url = req.url ?? '';
        if (req.method === 'GET' && url === '/api/clientes') return responder(200, this.clientes);
        const m = url.match(/^\/api\/clientes\/([0-9a-fA-F-]{36})$/);
        if (req.method === 'GET' && m) {
          const c = this.clientes.find((x) => (x as ClienteCrmFake).id === m[1]);
          return c ? responder(200, c) : responder(404, { message: 'Cliente não encontrado.' });
        }
        return responder(404, { message: 'Not Found' });
      };
      if (this.modo === 'lento') setTimeout(atender, 3000);
      else atender();
    });
    await new Promise<void>((r) => this.servidor!.listen(0, '127.0.0.1', r));
    return `http://127.0.0.1:${(this.servidor.address() as AddressInfo).port}`;
  }

  async parar() {
    await new Promise<void>((r) => this.servidor?.close(() => r()) ?? r());
  }
}

export function clienteCrm(
  id: string,
  nome: string,
  extra: Partial<ClienteCrmFake> = {},
): ClienteCrmFake {
  return {
    id,
    nome,
    razaosocial: `${nome} Agropecuária Ltda`,
    cnpj: '11.222.333/0001-81',
    cpf: null,
    email: `${nome.toLowerCase().replace(/\s/g, '')}@exemplo.com`,
    telefone: '(16) 99999-0000',
    cidade: 'Ribeirão Preto',
    estado: 'SP',
    ...extra,
  };
}
