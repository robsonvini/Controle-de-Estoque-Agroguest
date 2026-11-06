import { Module } from '@nestjs/common';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { ProvedorLocal } from './auth/provedores';
import { HealthController } from './health/health.controller';
import { PerfisService } from './usuarios/perfis.service';
import { PerfisController, UsuariosController } from './usuarios/usuarios.controller';
import { UsuariosService } from './usuarios/usuarios.service';

@Module({
  controllers: [AuthController],
  providers: [AuthService, ProvedorLocal],
})
export class AuthModule {}

@Module({
  controllers: [UsuariosController, PerfisController],
  providers: [UsuariosService, PerfisService],
})
export class UsuariosModule {}

@Module({ controllers: [HealthController] })
export class HealthModule {}

/** Módulos de domínio carregados pela API HTTP. */
export const DOMINIO_MODULES = [HealthModule, AuthModule, UsuariosModule];
