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
import { MotorEstoqueService } from './estoque/motor-estoque.service';
import { MovimentacoesController } from './estoque/movimentacoes.controller';
import { MovimentacoesService } from './estoque/movimentacoes.service';
import { FornecedoresController } from './fornecedores/fornecedores.controller';
import { FornecedoresService } from './fornecedores/fornecedores.service';
import { HealthController } from './health/health.controller';
import { AjustesController, InventariosController } from './inventarios/inventarios.controller';
import { InventariosService } from './inventarios/inventarios.service';
import { PedidosController } from './pedidos/pedidos.controller';
import { PedidosService } from './pedidos/pedidos.service';
import { ProdutosController } from './produtos/produtos.controller';
import { ProdutosService } from './produtos/produtos.service';
import { TarefasService } from './tarefas/tarefas.service';
import { PerfisService } from './usuarios/perfis.service';
import { PerfisController, UsuariosController } from './usuarios/usuarios.controller';
import { UsuariosService } from './usuarios/usuarios.service';

/** Serviços de domínio compartilhados entre a API HTTP e o worker. */
@Global()
@Module({
  providers: [TarefasService, MotorEstoqueService, ArmazenamentoService, PedidosService],
  exports: [TarefasService, MotorEstoqueService, ArmazenamentoService, PedidosService],
})
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
];
