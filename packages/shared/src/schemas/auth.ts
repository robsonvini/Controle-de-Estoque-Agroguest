import { z } from 'zod';
import { TODAS_PERMISSOES, type Permissao } from '../permissoes';
import { idSchema, paginacaoSchema, textoObrigatorio, textoOpcional, booleanoQuery } from './comum';

/**
 * Política de senha: mínimo de 10 caracteres, com letra maiúscula, minúscula,
 * número e símbolo.
 */
export const senhaForteSchema = z
  .string()
  .min(10, 'A senha deve ter no mínimo 10 caracteres')
  .max(128, 'A senha deve ter no máximo 128 caracteres')
  .regex(/[a-z]/, 'A senha deve conter letra minúscula')
  .regex(/[A-Z]/, 'A senha deve conter letra maiúscula')
  .regex(/\d/, 'A senha deve conter número')
  .regex(/[^A-Za-z0-9]/, 'A senha deve conter símbolo');

export const loginSchema = z.object({
  email: z
    .email('Informe um e-mail válido')
    .max(160)
    .transform((v) => v.toLowerCase()),
  senha: z.string().min(1, 'Informe a senha').max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const trocarSenhaSchema = z
  .object({
    senhaAtual: z.string().min(1, 'Informe a senha atual'),
    novaSenha: senhaForteSchema,
    confirmacao: z.string(),
  })
  .refine((v) => v.novaSenha === v.confirmacao, {
    message: 'A confirmação não confere com a nova senha',
    path: ['confirmacao'],
  })
  .refine((v) => v.novaSenha !== v.senhaAtual, {
    message: 'A nova senha deve ser diferente da atual',
    path: ['novaSenha'],
  });
export type TrocarSenhaInput = z.infer<typeof trocarSenhaSchema>;

export const criarUsuarioSchema = z.object({
  nome: textoObrigatorio(120),
  email: z
    .email('Informe um e-mail válido')
    .max(160)
    .transform((v) => v.toLowerCase()),
  perfilId: idSchema,
  senhaInicial: senhaForteSchema,
});
export type CriarUsuarioInput = z.infer<typeof criarUsuarioSchema>;

export const atualizarUsuarioSchema = z.object({
  nome: textoObrigatorio(120).optional(),
  perfilId: idSchema.optional(),
  ativo: z.boolean().optional(),
});
export type AtualizarUsuarioInput = z.infer<typeof atualizarUsuarioSchema>;

export const redefinirSenhaSchema = z.object({ novaSenha: senhaForteSchema });
export type RedefinirSenhaInput = z.infer<typeof redefinirSenhaSchema>;

export const listarUsuariosSchema = paginacaoSchema.extend({
  perfilId: idSchema.optional(),
  ativo: booleanoQuery,
});

const permissaoSchema = z.enum(TODAS_PERMISSOES as [Permissao, ...Permissao[]]);

export const perfilSchema = z.object({
  nome: textoObrigatorio(60),
  descricao: textoOpcional(200),
  permissoes: z.array(permissaoSchema).min(1, 'Selecione ao menos uma permissão'),
});
export type PerfilInput = z.infer<typeof perfilSchema>;
