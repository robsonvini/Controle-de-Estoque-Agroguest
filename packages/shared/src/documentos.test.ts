import { describe, expect, it } from 'vitest';
import { cnpjValido, cpfValido, mascararCpf, mascararDocumento } from './documentos';
import { entradaSchema, fornecedorSchema, produtoSchema } from './index';

describe('validação de documentos', () => {
  it('aceita CPF válido e rejeita inválido', () => {
    expect(cpfValido('529.982.247-25')).toBe(true);
    expect(cpfValido('52998224725')).toBe(true);
    expect(cpfValido('529.982.247-24')).toBe(false);
    expect(cpfValido('111.111.111-11')).toBe(false);
    expect(cpfValido('123')).toBe(false);
  });

  it('aceita CNPJ válido e rejeita inválido', () => {
    expect(cnpjValido('11.222.333/0001-81')).toBe(true);
    expect(cnpjValido('11222333000181')).toBe(true);
    expect(cnpjValido('11.222.333/0001-80')).toBe(false);
    expect(cnpjValido('00.000.000/0000-00')).toBe(false);
  });

  it('mascara CPF e preserva CNPJ (LGPD)', () => {
    expect(mascararCpf('52998224725')).toBe('***.982.247-**');
    expect(mascararDocumento('52998224725')).toBe('***.982.247-**');
    expect(mascararDocumento('11222333000181')).toBe('11.222.333/0001-81');
  });
});

describe('schemas', () => {
  it('fornecedor PJ exige CNPJ válido', () => {
    const base = { tipoPessoa: 'PJ', razaoSocial: 'Empresa', contatos: [] };
    expect(fornecedorSchema.safeParse({ ...base, documento: '11.222.333/0001-81' }).success).toBe(
      true,
    );
    const r = fornecedorSchema.safeParse({ ...base, documento: '11.222.333/0001-80' });
    expect(r.success).toBe(false);
  });

  it('produto rejeita máximo menor que mínimo', () => {
    const r = produtoSchema.safeParse({
      codigoInterno: 'P1',
      sku: 'sku-1',
      nome: 'Produto',
      unidadeMedidaId: '0190a1b2-0000-7000-8000-000000000001',
      estoqueMinimo: 10,
      estoqueMaximo: 5,
    });
    expect(r.success).toBe(false);
  });

  it('entrada por compra exige fornecedor e custo', () => {
    const r = entradaSchema.safeParse({
      motivo: 'COMPRA',
      itens: [
        {
          produtoId: '0190a1b2-0000-7000-8000-000000000001',
          localId: '0190a1b2-0000-7000-8000-000000000002',
          quantidade: 5,
        },
      ],
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      const caminhos = r.error.issues.map((i) => i.path.join('.'));
      expect(caminhos).toContain('fornecedorId');
      expect(caminhos).toContain('itens.0.custoUnitario');
    }
  });

  it('quantidade aceita até 4 casas decimais', () => {
    const item = {
      produtoId: '0190a1b2-0000-7000-8000-000000000001',
      localId: '0190a1b2-0000-7000-8000-000000000002',
    };
    const ok = entradaSchema.safeParse({
      motivo: 'DEVOLUCAO_CLIENTE',
      itens: [{ ...item, quantidade: '1.2345' }],
    });
    expect(ok.success).toBe(true);
    const erro = entradaSchema.safeParse({
      motivo: 'DEVOLUCAO_CLIENTE',
      itens: [{ ...item, quantidade: 1.23456 }],
    });
    expect(erro.success).toBe(false);
  });
});
