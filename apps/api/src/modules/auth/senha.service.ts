import { Injectable } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';

/** Parâmetros recomendados pela OWASP para Argon2id (19 MiB, 2 iterações). */
const OPCOES = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

@Injectable()
export class SenhaService {
  /** Hash usado para equalizar o tempo de resposta quando o usuário não existe. */
  private hashFicticio?: Promise<string>;

  gerarHash(senha: string): Promise<string> {
    return hash(senha, OPCOES);
  }

  async verificar(hashArmazenado: string | null | undefined, senha: string): Promise<boolean> {
    if (!hashArmazenado) {
      this.hashFicticio ??= hash('senha-inexistente-para-tempo-constante', OPCOES);
      await verify(await this.hashFicticio, senha).catch(() => false);
      return false;
    }
    try {
      return await verify(hashArmazenado, senha);
    } catch {
      return false;
    }
  }
}
