import { describe, expect, it } from 'vitest';
import { CriptoService } from './common/cripto.service';
import { intervaloDatas, ordenacao } from './common/paginacao';
import { detectarImagem } from './modules/arquivos/armazenamento.service';
import { sanitizar } from './modules/auditoria/auditoria.service';
import { mapearCliente } from './modules/integracao/crm-sync.service';
import { assinar } from './modules/integracao/webhooks.service';
import { proximaTentativa } from './modules/tarefas/processador.service';

describe('assinatura de webhooks (HMAC-SHA256)', () => {
  it('é determinística e muda com o corpo, o timestamp ou o segredo', () => {
    const a = assinar('segredo', '1700000000', '{"id":"1"}');
    expect(a).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(assinar('segredo', '1700000000', '{"id":"1"}')).toBe(a);
    expect(assinar('segredo', '1700000001', '{"id":"1"}')).not.toBe(a);
    expect(assinar('segredo', '1700000000', '{"id":"2"}')).not.toBe(a);
    expect(assinar('outro', '1700000000', '{"id":"1"}')).not.toBe(a);
  });

  it('comparação em tempo constante', () => {
    expect(CriptoService.comparacaoSegura('abc', 'abc')).toBe(true);
    expect(CriptoService.comparacaoSegura('abc', 'abd')).toBe(false);
    expect(CriptoService.comparacaoSegura('abc', 'abcd')).toBe(false);
  });
});

describe('criptografia de segredos (AES-256-GCM)', () => {
  const cripto = new CriptoService();
  it('cifra com IV aleatório e decifra o valor original', () => {
    const c1 = cripto.cifrar('Bearer token-do-crm');
    const c2 = cripto.cifrar('Bearer token-do-crm');
    expect(c1).not.toBe(c2);
    expect(c1).not.toContain('token');
    expect(cripto.decifrar(c1)).toBe('Bearer token-do-crm');
  });
  it('detecta adulteração (tag de autenticação)', () => {
    const [v, iv, tag, dados] = cripto.cifrar('valor').split('.');
    const adulterado = [v, iv, tag, Buffer.from('xxxxx').toString('base64') + dados!.slice(8)].join(
      '.',
    );
    expect(() => cripto.decifrar(adulterado)).toThrow();
  });
});

describe('mapeamento de cliente do CRM (minimização LGPD)', () => {
  it('normaliza documentos, UF e e-mail e gera hash estável', () => {
    const c = {
      id: '9b2f4c1e-6a7d-4e3b-9c1a-0f5e8d7c6b5a',
      nome: 'Fazenda Boa Vista',
      razaosocial: 'Boa Vista Agro Ltda',
      cnpj: '11.222.333/0001-81',
      cpf: null,
      email: 'Contato@BoaVista.com',
      telefone: '(16) 99999-0000',
      cidade: 'Ribeirão Preto',
      estado: 'sp',
    };
    const m = mapearCliente(c);
    expect(m).toMatchObject({
      cnpj: '11222333000181',
      cpf: null,
      uf: 'SP',
      email: 'contato@boavista.com',
    });
    expect(mapearCliente(c).hash).toBe(m.hash);
    expect(mapearCliente({ ...c, cidade: 'Sertãozinho' }).hash).not.toBe(m.hash);
    expect(mapearCliente({ ...c, cnpj: '123' }).cnpj).toBeNull();
  });
});

describe('fila de processamento', () => {
  it('backoff exponencial limitado a 1 hora', () => {
    const agora = Date.now();
    const delta = (n: number) => proximaTentativa(n).getTime() - agora;
    expect(delta(1)).toBeGreaterThanOrEqual(10_000);
    expect(delta(2)).toBeGreaterThanOrEqual(20_000);
    expect(delta(3)).toBeGreaterThanOrEqual(40_000);
    expect(delta(30)).toBeLessThanOrEqual(3_600_000 + 50);
  });
});

describe('validação de imagens pelo conteúdo', () => {
  it('reconhece JPEG, PNG e WEBP e rejeita outros formatos', () => {
    expect(detectarImagem(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe(
      'image/jpeg',
    );
    expect(
      detectarImagem(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])),
    ).toBe('image/png');
    expect(
      detectarImagem(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP')])),
    ).toBe('image/webp');
    expect(detectarImagem(Buffer.from('<svg onload="alert(1)"></svg>'))).toBeNull();
    expect(detectarImagem(Buffer.from('%PDF-1.7 aaaaa'))).toBeNull();
  });
});

describe('auditoria', () => {
  it('omite campos sensíveis em qualquer nível', () => {
    const r = sanitizar({
      nome: 'Ana',
      senha: 'x',
      dados: { client_secret: 'y', cpf: '123', itens: [{ token: 'z', qtd: 1 }] },
    }) as Record<string, any>;
    expect(r.nome).toBe('Ana');
    expect(r.senha).toBe('[omitido]');
    expect(r.dados.client_secret).toBe('[omitido]');
    expect(r.dados.cpf).toBe('[omitido]');
    expect(r.dados.itens[0].token).toBe('[omitido]');
    expect(r.dados.itens[0].qtd).toBe(1);
  });
});

describe('paginação e filtros', () => {
  it('ordenação aceita apenas campos permitidos (sem injeção)', () => {
    expect(ordenacao({ ordenarPor: 'nome', ordem: 'desc' }, ['nome', 'sku'], 'nome')).toEqual({
      nome: 'desc',
    });
    expect(ordenacao({ ordenarPor: 'senhaHash', ordem: 'asc' }, ['nome', 'sku'], 'nome')).toEqual({
      nome: 'asc',
    });
  });
  it('data final sem hora inclui o dia inteiro', () => {
    const f = intervaloDatas(new Date('2026-01-01T00:00:00Z'), new Date('2026-01-31T00:00:00Z'));
    expect(f?.lte?.toISOString()).toBe('2026-01-31T23:59:59.999Z');
  });
});
