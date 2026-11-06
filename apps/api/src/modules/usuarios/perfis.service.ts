import { Injectable } from '@nestjs/common';
import { MODULOS_PERMISSAO, TODAS_PERMISSOES, type PerfilInput } from '@estoque/shared';
import { ContextoUsuarioService } from '../../common/auth/contexto-usuario.service';
import type { ContextoAtor } from '../../common/auth/tipos';
import { conflito, naoEncontrado, regraNegocio } from '../../common/erros';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';

@Injectable()
export class PerfisService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
    private readonly contexto: ContextoUsuarioService,
  ) {}

  async listar() {
    const perfis = await this.prisma.perfil.findMany({
      orderBy: { nome: 'asc' },
      include: {
        permissoes: { select: { permissaoCodigo: true } },
        _count: { select: { usuarios: true } },
      },
    });
    return perfis.map(({ permissoes, _count, ...p }) => ({
      ...p,
      permissoes: permissoes.map((x) => x.permissaoCodigo).sort(),
      totalUsuarios: _count.usuarios,
    }));
  }

  async obter(id: string) {
    const perfil = (await this.listar()).find((p) => p.id === id);
    if (!perfil) throw naoEncontrado('Perfil');
    return perfil;
  }

  async listarPermissoes() {
    const permissoes = await this.prisma.permissao.findMany({ orderBy: { codigo: 'asc' } });
    return permissoes.map((p) => ({ ...p, moduloNome: MODULOS_PERMISSAO[p.modulo] ?? p.modulo }));
  }

  async criar(dados: PerfilInput, ator: ContextoAtor) {
    if (await this.prisma.perfil.findUnique({ where: { nome: dados.nome } })) {
      throw conflito('Já existe um perfil com este nome.');
    }
    const perfil = await this.prisma.$transaction(async (tx) => {
      const p = await tx.perfil.create({
        data: {
          nome: dados.nome,
          descricao: dados.descricao,
          permissoes: { create: dados.permissoes.map((codigo) => ({ permissaoCodigo: codigo })) },
        },
      });
      await this.auditoria.registrar(
        ator,
        { acao: 'CRIAR', entidade: 'perfil', entidadeId: p.id, dados },
        tx,
      );
      return p;
    });
    return this.obter(perfil.id);
  }

  async atualizar(id: string, dados: PerfilInput, ator: ContextoAtor) {
    const atual = await this.obter(id);
    if (atual.sistema && atual.nome === 'Administrador') {
      const faltando = TODAS_PERMISSOES.filter((p) => !dados.permissoes.includes(p));
      if (faltando.length || dados.nome !== atual.nome) {
        throw regraNegocio('O perfil Administrador deve manter o nome e todas as permissões.');
      }
    }
    if (atual.sistema && dados.nome !== atual.nome) {
      throw regraNegocio('Perfis do sistema não podem ser renomeados.');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.perfil.update({
        where: { id },
        data: { nome: dados.nome, descricao: dados.descricao },
      });
      await tx.perfilPermissao.deleteMany({ where: { perfilId: id } });
      await tx.perfilPermissao.createMany({
        data: dados.permissoes.map((codigo) => ({ perfilId: id, permissaoCodigo: codigo })),
      });
      const admins = await tx.usuario.count({
        where: {
          ativo: true,
          perfil: { permissoes: { some: { permissaoCodigo: 'perfis:gerenciar' } } },
        },
      });
      if (admins === 0)
        throw regraNegocio('A operação deixaria o sistema sem nenhum administrador ativo.');
      await this.auditoria.registrar(
        ator,
        {
          acao: 'ATUALIZAR',
          entidade: 'perfil',
          entidadeId: id,
          dados: { antes: atual.permissoes, depois: dados.permissoes },
        },
        tx,
      );
    });
    this.contexto.invalidarTudo();
    return this.obter(id);
  }

  async excluir(id: string, ator: ContextoAtor) {
    const atual = await this.obter(id);
    if (atual.sistema) throw regraNegocio('Perfis do sistema não podem ser excluídos.');
    if (atual.totalUsuarios > 0) throw regraNegocio('O perfil possui usuários vinculados.');
    await this.prisma.$transaction(async (tx) => {
      await tx.perfil.delete({ where: { id } });
      await this.auditoria.registrar(
        ator,
        { acao: 'EXCLUIR', entidade: 'perfil', entidadeId: id, dados: { nome: atual.nome } },
        tx,
      );
    });
  }
}
