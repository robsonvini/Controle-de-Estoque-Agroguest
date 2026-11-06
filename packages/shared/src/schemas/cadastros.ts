import { z } from 'zod';
import { cnpjValido, cpfValido, somenteDigitos } from '../documentos';
import { SITUACOES_FORNECEDOR, STATUS_PRODUTO, TIPOS_LOCAL, UFS } from '../enums';
import {
  booleanoQuery,
  emailOpcional,
  idOpcional,
  idSchema,
  paginacaoSchema,
  quantidadeNaoNegativa,
  telefoneOpcional,
  textoObrigatorio,
  textoOpcional,
  valorMonetario,
} from './comum';

// ---------------- Categorias ----------------
export const categoriaSchema = z.object({
  nome: textoObrigatorio(80),
  descricao: textoOpcional(200),
  paiId: idOpcional,
  ativo: z.boolean().default(true),
});
export type CategoriaInput = z.infer<typeof categoriaSchema>;

// ---------------- Unidades de medida ----------------
export const unidadeMedidaSchema = z.object({
  sigla: z
    .string()
    .trim()
    .min(1, 'Campo obrigatório')
    .max(10)
    .regex(/^[A-Za-z0-9²³/]+$/, 'Use apenas letras e números')
    .transform((v) => v.toUpperCase()),
  nome: textoObrigatorio(60),
  casasDecimais: z.coerce.number().int().min(0).max(4).default(0),
  ativo: z.boolean().default(true),
});
export type UnidadeMedidaInput = z.infer<typeof unidadeMedidaSchema>;

// ---------------- Locais de armazenamento ----------------
export const localSchema = z.object({
  codigo: z
    .string()
    .trim()
    .min(1, 'Campo obrigatório')
    .max(30)
    .regex(/^[A-Za-z0-9._-]+$/, 'Use letras, números, ponto, hífen ou sublinhado')
    .transform((v) => v.toUpperCase()),
  nome: textoObrigatorio(100),
  descricao: textoOpcional(200),
  tipo: z.enum(TIPOS_LOCAL),
  paiId: idOpcional,
  ativo: z.boolean().default(true),
});
export type LocalInput = z.infer<typeof localSchema>;

// ---------------- Produtos ----------------
const codigoBarras = z
  .string()
  .trim()
  .regex(/^[0-9A-Za-z-]{4,50}$/, 'Código de barras inválido')
  .or(z.literal(''))
  .nullish()
  .transform((v) => (v ? v : null));

export const produtoSchema = z
  .object({
    codigoInterno: z
      .string()
      .trim()
      .min(1, 'Campo obrigatório')
      .max(30)
      .regex(/^[A-Za-z0-9._-]+$/, 'Use letras, números, ponto, hífen ou sublinhado'),
    sku: z
      .string()
      .trim()
      .min(1, 'Campo obrigatório')
      .max(50)
      .regex(/^[A-Za-z0-9._-]+$/, 'Use letras, números, ponto, hífen ou sublinhado')
      .transform((v) => v.toUpperCase()),
    codigoBarras,
    nome: textoObrigatorio(150),
    descricao: textoOpcional(2000),
    categoriaId: idOpcional,
    unidadeMedidaId: idSchema,
    precoCusto: valorMonetario.default(0),
    precoVenda: valorMonetario.default(0),
    estoqueMinimo: quantidadeNaoNegativa.default(0),
    estoqueMaximo: quantidadeNaoNegativa.nullish().transform((v) => (v == null ? null : v)),
    localPadraoId: idOpcional,
    status: z.enum(STATUS_PRODUTO).default('ATIVO'),
    fornecedores: z
      .array(
        z.object({
          fornecedorId: idSchema,
          codigoNoFornecedor: textoOpcional(50),
          prazoEntregaDias: z.coerce.number().int().min(0).max(365).nullish(),
          principal: z.boolean().default(false),
        }),
      )
      .max(20)
      .default([]),
  })
  .refine((p) => p.estoqueMaximo == null || p.estoqueMaximo >= p.estoqueMinimo, {
    message: 'O estoque máximo deve ser maior ou igual ao mínimo',
    path: ['estoqueMaximo'],
  })
  .refine(
    (p) => new Set(p.fornecedores.map((f) => f.fornecedorId)).size === p.fornecedores.length,
    {
      message: 'Fornecedor repetido na lista',
      path: ['fornecedores'],
    },
  );
export type ProdutoInput = z.infer<typeof produtoSchema>;

export const listarProdutosSchema = paginacaoSchema.extend({
  categoriaId: idSchema.optional(),
  fornecedorId: idSchema.optional(),
  status: z.enum(STATUS_PRODUTO).optional(),
  situacaoEstoque: z.enum(['DISPONIVEL', 'BAIXO', 'ESGOTADO']).optional(),
});
export type ListarProdutosQuery = z.infer<typeof listarProdutosSchema>;

export const imagemProdutoSchema = z.object({
  textoAlternativo: textoObrigatorio(200),
});

// ---------------- Fornecedores ----------------
export const fornecedorSchema = z
  .object({
    tipoPessoa: z.enum(['PF', 'PJ']),
    documento: z.string().trim().transform(somenteDigitos),
    razaoSocial: textoObrigatorio(200),
    nomeFantasia: textoOpcional(200),
    inscricaoEstadual: textoOpcional(30),
    email: emailOpcional,
    telefone: telefoneOpcional,
    cep: z
      .string()
      .trim()
      .transform(somenteDigitos)
      .refine((v) => v === '' || v.length === 8, 'CEP inválido')
      .nullish()
      .transform((v) => (v ? v : null)),
    logradouro: textoOpcional(200),
    numero: textoOpcional(20),
    complemento: textoOpcional(100),
    bairro: textoOpcional(100),
    cidade: textoOpcional(100),
    uf: z
      .enum(UFS)
      .or(z.literal(''))
      .nullish()
      .transform((v) => (v ? v : null)),
    situacao: z.enum(SITUACOES_FORNECEDOR).default('ATIVO'),
    observacoes: textoOpcional(2000),
    contatos: z
      .array(
        z.object({
          nome: textoObrigatorio(120),
          cargo: textoOpcional(80),
          email: emailOpcional,
          telefone: telefoneOpcional,
        }),
      )
      .max(20)
      .default([]),
  })
  .superRefine((f, ctx) => {
    const valido = f.tipoPessoa === 'PF' ? cpfValido(f.documento) : cnpjValido(f.documento);
    if (!valido) {
      ctx.addIssue({
        code: 'custom',
        path: ['documento'],
        message: f.tipoPessoa === 'PF' ? 'CPF inválido' : 'CNPJ inválido',
      });
    }
  });
export type FornecedorInput = z.infer<typeof fornecedorSchema>;

export const listarFornecedoresSchema = paginacaoSchema.extend({
  situacao: z.enum(SITUACOES_FORNECEDOR).optional(),
});

export const listarAtivosSchema = paginacaoSchema.extend({ ativo: booleanoQuery });
