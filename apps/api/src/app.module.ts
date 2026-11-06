import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { ZodValidationPipe } from 'nestjs-zod';
import { AutenticacaoGuard, PermissoesGuard } from './common/auth/guards';
import { FiltroErros } from './common/filtro-erros';
import { IdempotenciaInterceptor } from './common/idempotencia';
import { NucleoModule } from './common/nucleo.module';
import { opcoesLogger } from './config/logger';
import { PrismaModule } from './prisma/prisma.service';
import { DOMINIO_MODULES } from './modules/dominio';

@Module({
  imports: [
    LoggerModule.forRoot(opcoesLogger),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 600 }]),
    PrismaModule,
    NucleoModule,
    ...DOMINIO_MODULES,
  ],
  providers: [
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_FILTER, useClass: FiltroErros },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AutenticacaoGuard },
    { provide: APP_GUARD, useClass: PermissoesGuard },
    { provide: APP_INTERCEPTOR, useClass: IdempotenciaInterceptor },
  ],
})
export class AppModule {}
