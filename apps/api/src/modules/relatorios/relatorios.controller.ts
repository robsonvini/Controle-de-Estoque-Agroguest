import { Controller, Get, Param, Query, Res, StreamableFile } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { tipoRelatorioSchema } from '@estoque/shared';
import { Ator, RequerPermissoes, UsuarioAtual } from '../../common/auth/decoradores';
import type { ContextoAtor, UsuarioAutenticado } from '../../common/auth/tipos';
import { FiltroRelatorioDto, ListarAuditoriaDto } from '../../common/dto';
import { proibido } from '../../common/erros';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { DashboardService } from '../dashboard/dashboard.service';
import { gerarPdf, gerarXlsx } from './exportadores';
import { RelatoriosService } from './relatorios.service';
import { AuditoriaConsultaService } from './auditoria-consulta.service';

@ApiTags('Dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  @RequerPermissoes('dashboard:ler')
  resumo(@Query('dias') dias?: string) {
    const n = Number(dias);
    return this.dashboard.resumo(Number.isInteger(n) && n >= 7 && n <= 365 ? n : 30);
  }
}

@ApiTags('Relatórios')
@ApiBearerAuth()
@Controller('relatorios')
export class RelatoriosController {
  constructor(
    private readonly relatorios: RelatoriosService,
    private readonly auditoria: AuditoriaService,
  ) {}

  /** Gera o relatório em JSON (tela) ou exporta em PDF/Excel (`formato=pdf|xlsx`). */
  @Get(':tipo')
  @RequerPermissoes('relatorios:ler')
  async gerar(
    @Param('tipo') tipoParam: string,
    @Query() filtro: FiltroRelatorioDto,
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Ator() ator: ContextoAtor,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tipo = tipoRelatorioSchema.parse(tipoParam);
    if (filtro.formato !== 'json' && !usuario.permissoes.has('relatorios:exportar')) {
      throw proibido('Você não tem permissão para exportar relatórios.');
    }
    const relatorio = await this.relatorios.gerar(tipo, filtro);
    if (filtro.formato === 'json') return relatorio;

    await this.auditoria.registrar(ator, {
      acao: 'EXPORTAR_RELATORIO',
      entidade: 'relatorio',
      entidadeId: tipo,
      dados: {
        formato: filtro.formato,
        registros: relatorio.linhas.length,
        filtros: relatorio.filtros,
      },
    });
    const data = new Date().toISOString().slice(0, 10);
    const nome = `${tipo}-${data}.${filtro.formato}`;
    const conteudo =
      filtro.formato === 'pdf' ? await gerarPdf(relatorio) : await gerarXlsx(relatorio);
    res.setHeader('Content-Disposition', `attachment; filename="${nome}"`);
    return new StreamableFile(conteudo, {
      type:
        filtro.formato === 'pdf'
          ? 'application/pdf'
          : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
  }
}

@ApiTags('Auditoria')
@ApiBearerAuth()
@Controller('auditoria')
export class AuditoriaController {
  constructor(private readonly consulta: AuditoriaConsultaService) {}

  @Get()
  @RequerPermissoes('auditoria:ler')
  listar(@Query() q: ListarAuditoriaDto) {
    return this.consulta.listar(q);
  }
}
