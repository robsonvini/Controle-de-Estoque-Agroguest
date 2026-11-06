import { Injectable } from '@nestjs/common';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { env } from '../config/env';

/** Criptografia de segredos em repouso (AES-256-GCM) e utilitários de hash/HMAC. */
@Injectable()
export class CriptoService {
  private readonly chave = Buffer.from(env.CRYPTO_KEY, 'base64');

  cifrar(texto: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.chave, iv);
    const dados = Buffer.concat([cipher.update(texto, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return ['v1', iv.toString('base64'), tag.toString('base64'), dados.toString('base64')].join(
      '.',
    );
  }

  decifrar(cifrado: string): string {
    const [versao, iv, tag, dados] = cifrado.split('.');
    if (versao !== 'v1' || !iv || !tag || !dados)
      throw new Error('Formato de segredo cifrado inválido');
    const decipher = createDecipheriv('aes-256-gcm', this.chave, Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(dados, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }

  static sha256(texto: string): string {
    return createHash('sha256').update(texto).digest('hex');
  }

  static hmacSha256(segredo: string, mensagem: string): string {
    return createHmac('sha256', segredo).update(mensagem).digest('hex');
  }

  static comparacaoSegura(a: string, b: string): boolean {
    const ba = Buffer.from(a);
    const bb = Buffer.from(b);
    return ba.length === bb.length && timingSafeEqual(ba, bb);
  }

  static tokenAleatorio(bytes = 32): string {
    return randomBytes(bytes).toString('base64url');
  }
}
