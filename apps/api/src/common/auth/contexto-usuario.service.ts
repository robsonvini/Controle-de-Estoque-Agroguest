import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { UsuarioAutenticado } from './tipos';

const TTL_MS = 30_000;

/**
 * Carrega o contexto do usuário (perfil, permissões, sessão válida) com cache curto,
 * para que desativação de usuário, revogação de sessão e mudança de permissões
 * tenham efeito em até 30 segundos, sem consultar o banco a cada requisição.
 */
@Injectable()
export class ContextoUsuarioService {
  private readonly cache = new Map<string, { valor: UsuarioAutenticado | null; expira: number }>();

  constructor(private readonly prisma: PrismaService) {}

  async obter(usuarioId: string, sessaoId: string): Promise<UsuarioAutenticado | null> {
    const chave = `${usuarioId}:${sessaoId}`;
    const agora = Date.now();
    const emCache = this.cache.get(chave);
    if (emCache && emCache.expira > agora) return emCache.valor;

    const sessao = await this.prisma.sessao.findUnique({
      where: { id: sessaoId },
      select: {
        usuarioId: true,
        revogadaEm: true,
        expiraEm: true,
        usuario: {
          select: {
            id: true,
            nome: true,
            email: true,
            ativo: true,
            perfilId: true,
            deveTrocarSenha: true,
            perfil: { select: { nome: true, permissoes: { select: { permissaoCodigo: true } } } },
          },
        },
      },
    });

    let valor: UsuarioAutenticado | null = null;
    if (
      sessao &&
      sessao.usuarioId === usuarioId &&
      !sessao.revogadaEm &&
      sessao.expiraEm > new Date() &&
      sessao.usuario.ativo
    ) {
      const u = sessao.usuario;
      valor = {
        tipo: 'usuario',
        id: u.id,
        sessaoId,
        nome: u.nome,
        email: u.email,
        perfilId: u.perfilId,
        perfilNome: u.perfil.nome,
        permissoes: new Set(u.perfil.permissoes.map((p) => p.permissaoCodigo)),
        deveTrocarSenha: u.deveTrocarSenha,
      };
    }
    this.cache.set(chave, { valor, expira: agora + TTL_MS });
    if (this.cache.size > 5000) this.limparExpirados();
    return valor;
  }

  invalidarUsuario(usuarioId: string) {
    for (const chave of this.cache.keys())
      if (chave.startsWith(`${usuarioId}:`)) this.cache.delete(chave);
  }

  invalidarTudo() {
    this.cache.clear();
  }

  private limparExpirados() {
    const agora = Date.now();
    for (const [k, v] of this.cache) if (v.expira <= agora) this.cache.delete(k);
  }
}
