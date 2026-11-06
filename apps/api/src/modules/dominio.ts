import { Global, Module } from '@nestjs/common';
import { ArmazenamentoService } from './arquivos/armazenamento.service';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { ProvedorLocal } from './auth/provedores';
import {
  CategoriasController,
  LocaisController,
  UnidadesController,
} from './cadastros/cadastros.controller';
import { CadastrosService } from './cadastros/cadastros.service';
import { ComprasController } from './compras/compras.controller';
import { ComprasService } from './compras/compras.service';
import { ConfiguracoesService } from './configuracoes/configuracoes.service';
import { DashboardService } from './dashboard/dashboard.service';
import { MotorEstoqueService } from './estoque/motor-estoque.service';
import { MovimentacoesController } from './estoque/movimentacoes.controller';
import { MovimentacoesService } from './estoque/movimentacoes.service';
import { FornecedoresController } from './fornecedores/fornecedores.controller';
import { FornecedoresService } from './fornecedores/fornecedores.service';
import { HealthController } from './health/health.controller';
import { CrmAgrogestClient } from './integracao/crm-agrogest.client';
import { CrmSyncService } from './integracao/crm-sync.service';
import { IntegracaoApiController } from './integracao/integracao-api.controller';
import {
  IntegracaoGuard,
  IntegracaoTokenService,
  LogIntegracaoInterceptor,
} from './integracao/integracao-auth';
import { ClientesController, IntegracaoController } from './integracao/integracao.controller';
import { IntegracaoService } from './integracao/integracao.service';
import { PedidosIntegracaoService } from './integracao/pedidos-integracao.service';
import { WebhookSaidaService } from './integracao/webhook-saida.service';
import { WebhooksService } from './integracao/webhooks.service';
import { AjustesController, InventariosController } from './inventarios/inventarios.controller';
import { InventariosService } from './inventarios/inventarios.service';
import { LgpdController, LgpdService } from './lgpd/lgpd.controller';
import { AlertasService } from './notificacoes/alertas.service';
import { EmailService } from './notificacoes/email.service';
import {
  ConfiguracoesController,
  NotificacoesController,
} from './notificacoes/notificacoes.controller';
import { NotificacoesService } from './notificacoes/notificacoes.service';
import { PedidosController } from './pedidos/pedidos.controller';
import { PedidosService } from './pedidos/pedidos.service';
import { ProdutosController } from './produtos/produtos.controller';
import { ProdutosService } from './produtos/produtos.service';
import { AuditoriaConsultaService } from './relatorios/auditoria-consulta.service';
import {
  AuditoriaController,
  DashboardController,
  RelatoriosController,
} from './relatorios/relatorios.controller';
import { RelatoriosService } from './relatorios/relatorios.service';
import { TarefasService } from './tarefas/tarefas.service';
import { PerfisService } from './usuarios/perfis.service';
import { PerfisController, UsuariosController } from './usuarios/usuarios.controller';
import { UsuariosService } from './usuarios/usuarios.service';

const NUCLEO = [
  TarefasService,
  MotorEstoqueService,
  ArmazenamentoService,
  PedidosService,
  ConfiguracoesService,
  NotificacoesService,
  AlertasService,
  EmailService,
  CrmAgrogestClient,
  CrmSyncService,
  PedidosIntegracaoService,
  WebhooksService,
  WebhookSaidaService,
];

/** Serviços de domínio compartilhados entre a API HTTP e o worker. */
@Global()
@Module({ providers: NUCLEO, exports: NUCLEO })
export class EstoqueNucleoModule {}

@Module({ controllers: [HealthController] })
export class HealthModule {}

@Module({ controllers: [AuthController], providers: [AuthService, ProvedorLocal] })
export class AuthModule {}

@Module({
  controllers: [UsuariosController, PerfisController],
  providers: [UsuariosService, PerfisService],
})
export class UsuariosModule {}

@Module({
  controllers: [CategoriasController, UnidadesController, LocaisController],
  providers: [CadastrosService],
})
export class CadastrosModule {}

@Module({ controllers: [ProdutosController], providers: [ProdutosService] })
export class ProdutosModule {}

@Module({ controllers: [FornecedoresController], providers: [FornecedoresService] })
export class FornecedoresModule {}

@Module({ controllers: [MovimentacoesController], providers: [MovimentacoesService] })
export class MovimentacoesModule {}

@Module({ controllers: [ComprasController], providers: [ComprasService] })
export class ComprasModule {}

@Module({ controllers: [PedidosController] })
export class PedidosModule {}

@Module({
  controllers: [InventariosController, AjustesController],
  providers: [InventariosService],
})
export class InventariosModule {}

@Module({
  controllers: [IntegracaoController, ClientesController, IntegracaoApiController],
  providers: [IntegracaoService, IntegracaoTokenService, IntegracaoGuard, LogIntegracaoInterceptor],
})
export class IntegracaoModule {}

@Module({ controllers: [NotificacoesController, ConfiguracoesController] })
export class NotificacoesModule {}

@Module({
  controllers: [DashboardController, RelatoriosController, AuditoriaController],
  providers: [DashboardService, RelatoriosService, AuditoriaConsultaService],
})
export class RelatoriosModule {}

@Module({ controllers: [LgpdController], providers: [LgpdService] })
export class LgpdModule {}

/** Módulos de domínio carregados pela API HTTP. */
export const DOMINIO_MODULES = [
  EstoqueNucleoModule,
  HealthModule,
  AuthModule,
  UsuariosModule,
  CadastrosModule,
  ProdutosModule,
  FornecedoresModule,
  MovimentacoesModule,
  ComprasModule,
  PedidosModule,
  InventariosModule,
  IntegracaoModule,
  NotificacoesModule,
  RelatoriosModule,
  LgpdModule,
];
