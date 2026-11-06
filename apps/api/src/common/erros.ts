import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Exceções de domínio. O filtro global converte para RFC 7807 (application/problem+json).
 */
export class ErroDominio extends HttpException {
  constructor(
    status: HttpStatus,
    public readonly codigo: string,
    mensagem: string,
    public readonly detalhes?: Record<string, unknown>,
  ) {
    super({ codigo, mensagem, detalhes }, status);
  }
}

export const naoEncontrado = (entidade: string) =>
  new ErroDominio(HttpStatus.NOT_FOUND, 'NAO_ENCONTRADO', `${entidade} não encontrado(a).`);

export const conflito = (mensagem: string, detalhes?: Record<string, unknown>) =>
  new ErroDominio(HttpStatus.CONFLICT, 'CONFLITO', mensagem, detalhes);

export const regraNegocio = (mensagem: string, detalhes?: Record<string, unknown>) =>
  new ErroDominio(HttpStatus.UNPROCESSABLE_ENTITY, 'REGRA_DE_NEGOCIO', mensagem, detalhes);

export const saldoInsuficiente = (detalhes: Record<string, unknown>) =>
  new ErroDominio(
    HttpStatus.CONFLICT,
    'SALDO_INSUFICIENTE',
    'Saldo disponível insuficiente para a operação.',
    detalhes,
  );

export const proibido = (mensagem = 'Você não tem permissão para esta operação.') =>
  new ErroDominio(HttpStatus.FORBIDDEN, 'PROIBIDO', mensagem);

export const naoAutenticado = (mensagem = 'Autenticação necessária.') =>
  new ErroDominio(HttpStatus.UNAUTHORIZED, 'NAO_AUTENTICADO', mensagem);
