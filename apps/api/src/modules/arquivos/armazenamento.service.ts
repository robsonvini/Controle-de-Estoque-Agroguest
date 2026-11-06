import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { env } from '../../config/env';

/**
 * Armazenamento de arquivos no Amazon S3 (em desenvolvimento, servidor compatível).
 * Os objetos são privados; o acesso é feito por URLs pré-assinadas de curta duração.
 */
@Injectable()
export class ArmazenamentoService implements OnModuleInit {
  private readonly logger = new Logger(ArmazenamentoService.name);
  private readonly s3 = new S3Client({
    region: env.S3_REGION,
    endpoint: env.S3_ENDPOINT,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    credentials:
      env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY
        ? { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY }
        : undefined,
  });

  async onModuleInit() {
    // Em desenvolvimento (endpoint local), cria o bucket se não existir.
    if (!env.S3_ENDPOINT || env.NODE_ENV === 'test') return;
    try {
      await this.s3.send(new HeadBucketCommand({ Bucket: env.S3_BUCKET }));
    } catch {
      try {
        await this.s3.send(new CreateBucketCommand({ Bucket: env.S3_BUCKET }));
        this.logger.log(`Bucket ${env.S3_BUCKET} criado no armazenamento local`);
      } catch (e) {
        this.logger.warn(`Armazenamento de arquivos indisponível: ${(e as Error).message}`);
      }
    }
  }

  async enviar(chave: string, conteudo: Buffer, mimeType: string) {
    await this.s3.send(
      new PutObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: chave,
        Body: conteudo,
        ContentType: mimeType,
        ServerSideEncryption: env.S3_ENDPOINT ? undefined : 'AES256',
      }),
    );
  }

  urlAssinada(chave: string, segundos = 900): Promise<string> {
    return getSignedUrl(this.s3, new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: chave }), {
      expiresIn: segundos,
    });
  }

  async remover(chave: string) {
    await this.s3.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: chave }));
  }
}

/** Identifica o tipo real do arquivo pelos primeiros bytes (não confia na extensão). */
export function detectarImagem(buffer: Buffer): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  if (
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}
