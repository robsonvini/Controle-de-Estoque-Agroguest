import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuditoriaService } from '../modules/auditoria/auditoria.service';
import { SenhaService } from '../modules/auth/senha.service';
import { ContextoUsuarioService } from './auth/contexto-usuario.service';
import { CriptoService } from './cripto.service';

/** Serviços transversais disponíveis em todos os módulos. */
@Global()
@Module({
  imports: [JwtModule.register({})],
  providers: [AuditoriaService, CriptoService, ContextoUsuarioService, SenhaService],
  exports: [AuditoriaService, CriptoService, ContextoUsuarioService, SenhaService, JwtModule],
})
export class NucleoModule {}
