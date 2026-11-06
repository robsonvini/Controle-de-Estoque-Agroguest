import {
  Controller,
  Get,
  HttpCode,
  Injectable,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { somenteDigitos } from '@estoque/shared';
import { Ator, RequerPermissoes } from '../../common/auth/decoradores';
import type { ContextoAtor } from '../../common/auth/tipos';
import { ContextoUsuarioService } from '../../common/auth/contexto-usuario.service';
import { CriptoService } from '../../common/cripto.service';
import { TitularLgpdDto } from '../../common/dto';
import { naoEncontrado, regraNegocio } from '../../common/erros';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { SenhaService } from '../auth/senha.service';

/**
 * Atendimento aos direitos do titular (LGPD, art. 18): acesso/portabilidade e anonimização.
 * Os clientes são espelho do CRM (controlador da informação): solicitações sobre
 * clientes devem ser atendidas no CRM, e o espelho é atualizado pela sincronização.
 */
@Injectable()
export class LgpdService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly senhas: SenhaService,
    private readonly auditoria: AuditoriaService,
    private readonly contexto: ContextoUsuarioService,
  ) {}

  async exportar(email: string | undefined, documento: string | undefined, ator: ContextoAtor) {
    const doc = documento ? somenteDigitos(documento) : undefined;
    const emailMin = email?.toLowerCase();
    const [usuarios, fornecedores, contatos, clientes] = await Promise.all([
      emailMin
        ? this.prisma.usuario.findMany({
            where: { email: emailMin },
            select: {
              id: true,
              nome: true,
              email: true,
              ativo: true,
              criadoEm: true,
              ultimoLoginEm: true,
              perfil: { select: { nome: true } },
              sessoes: {
                select: { criadoEm: true, ip: true, userAgent: true, revogadaEm: true },
                take: 100,
                orderBy: { criadoEm: 'desc' },
              },
            },
          })
        : [],
      doc
        ? this.prisma.fornecedor.findMany({
            where: { documento: doc },
            include: { contatos: true },
          })
        : [],
      emailMin
        ? this.prisma.fornecedorContato.findMany({
            where: { email: emailMin },
            include: { fornecedor: { select: { razaoSocial: true } } },
          })
        : [],
      this.prisma.clienteCrm.findMany({
        where: {
          OR: [
            ...(emailMin ? [{ email: emailMin }] : []),
            ...(doc ? [{ cpf: doc }, { cnpj: doc }] : []),
          ],
        },
      }),
    ]);
    const atividades = usuarios.length
      ? await this.prisma.logAuditoria.count({
          where: { usuarioId: { in: usuarios.map((u) => u.id) } },
        })
      : 0;
    await this.auditoria.registrar(ator, {
      acao: 'LGPD_EXPORTAR',
      entidade: 'titular',
      dados: { email: !!email, documento: !!documento },
    });
    return {
      geradoEm: new Date().toISOString(),
      controlador: 'Agrogest',
      finalidades: {
        usuarios:
          'Autenticação, controle de acesso e trilha de auditoria (execução de contrato e obrigação legal).',
        fornecedores: 'Gestão de compras e recebimentos (execução de contrato).',
        clientes: 'Espelho do CRM para vínculo de vendas e devoluções (fonte da verdade: CRM).',
      },
      usuarios: usuarios.map((u) => ({ ...u, totalAtividadesRegistradas: atividades })),
      fornecedores,
      contatosDeFornecedores: contatos,
      clientesEspelhoCrm: clientes,
      observacao: clientes.length
        ? 'Dados de clientes são mantidos pelo CRM Agrogest; correções e exclusões devem ser solicitadas no CRM.'
        : undefined,
    };
  }

  async anonimizarUsuario(id: string, ator: ContextoAtor) {
    if (id === ator.usuarioId)
      throw regraNegocio('Você não pode anonimizar o seu próprio usuário.');
    const u = await this.prisma.usuario.findUnique({ where: { id } });
    if (!u) throw naoEncontrado('Usuário');
    if (u.anonimizadoEm) throw regraNegocio('Usuário já anonimizado.');
    await this.prisma.$transaction(async (tx) => {
      await tx.usuario.update({
        where: { id },
        data: {
          nome: 'Usuário anonimizado',
          email: `anonimizado+${id}@anonimizado.local`,
          senhaHash: await this.senhas.gerarHash(CriptoService.tokenAleatorio(32)),
          ativo: false,
          idExterno: null,
          anonimizadoEm: new Date(),
        },
      });
      await tx.sessao.updateMany({
        where: { usuarioId: id },
        data: { revogadaEm: new Date(), ip: null, userAgent: null },
      });
      await this.auditoria.registrar(
        ator,
        { acao: 'LGPD_ANONIMIZAR', entidade: 'usuario', entidadeId: id },
        tx,
      );
    });
    this.contexto.invalidarUsuario(id);
  }

  async anonimizarFornecedor(id: string, ator: ContextoAtor) {
    const f = await this.prisma.fornecedor.findUnique({ where: { id } });
    if (!f) throw naoEncontrado('Fornecedor');
    if (f.situacao === 'ATIVO') throw regraNegocio('Inative o fornecedor antes de anonimizá-lo.');
    if (f.tipoPessoa !== 'PF')
      throw regraNegocio('A anonimização se aplica a fornecedores pessoa física.');
    await this.prisma.$transaction(async (tx) => {
      await tx.fornecedorContato.deleteMany({ where: { fornecedorId: id } });
      await tx.fornecedor.update({
        where: { id },
        data: {
          razaoSocial: 'Fornecedor anonimizado',
          nomeFantasia: null,
          documento: `X${id.replace(/-/g, '').slice(0, 13)}`,
          email: null,
          telefone: null,
          cep: null,
          logradouro: null,
          numero: null,
          complemento: null,
          bairro: null,
          observacoes: null,
          situacao: 'INATIVO',
          anonimizadoEm: new Date(),
        },
      });
      await this.auditoria.registrar(
        ator,
        { acao: 'LGPD_ANONIMIZAR', entidade: 'fornecedor', entidadeId: id },
        tx,
      );
    });
  }
}

@ApiTags('LGPD')
@ApiBearerAuth()
@Controller('lgpd')
export class LgpdController {
  constructor(private readonly lgpd: LgpdService) {}

  @Get('titular')
  @RequerPermissoes('lgpd:gerenciar')
  exportar(@Query() q: TitularLgpdDto, @Ator() ator: ContextoAtor) {
    return this.lgpd.exportar(q.email, q.documento, ator);
  }

  @Post('usuarios/:id/anonimizar')
  @HttpCode(204)
  @RequerPermissoes('lgpd:gerenciar')
  async anonimizarUsuario(@Param('id', ParseUUIDPipe) id: string, @Ator() ator: ContextoAtor) {
    await this.lgpd.anonimizarUsuario(id, ator);
  }

  @Post('fornecedores/:id/anonimizar')
  @HttpCode(204)
  @RequerPermissoes('lgpd:gerenciar')
  async anonimizarFornecedor(@Param('id', ParseUUIDPipe) id: string, @Ator() ator: ContextoAtor) {
    await this.lgpd.anonimizarFornecedor(id, ator);
  }
}
