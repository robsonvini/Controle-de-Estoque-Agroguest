import { Injectable, Logger } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfiguracoesService } from '../configuracoes/configuracoes.service';

const escapar = (t: string) =>
  t.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporte?: Transporter;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configuracoes: ConfiguracoesService,
  ) {}

  private obterTransporte() {
    this.transporte ??= nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    });
    return this.transporte;
  }

  async enviarNotificacao(notificacaoId: string) {
    if (!env.EMAIL_HABILITADO) {
      this.logger.debug('Envio de e-mail desabilitado (EMAIL_HABILITADO=false)');
      return;
    }
    const n = await this.prisma.notificacao.findUnique({ where: { id: notificacaoId } });
    const config = await this.configuracoes.obter();
    if (!n || !config.notificacoes.emailsDestino.length) return;
    await this.obterTransporte().sendMail({
      from: env.EMAIL_REMETENTE,
      to: config.notificacoes.emailsDestino,
      subject: `[Estoque Agrogest] ${n.titulo}`,
      text: `${n.titulo}\n\n${n.mensagem}\n\nAcesse ${env.WEB_ORIGIN}${n.link ?? '/notificacoes'}`,
      html: `<h2>${escapar(n.titulo)}</h2><p>${escapar(n.mensagem)}</p><p><a href="${escapar(env.WEB_ORIGIN + (n.link ?? '/notificacoes'))}">Abrir no sistema</a></p>`,
    });
  }
}
