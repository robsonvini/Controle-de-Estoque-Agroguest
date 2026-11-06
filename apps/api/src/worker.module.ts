import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { LoggerModule } from 'nestjs-pino';
import { NucleoModule } from './common/nucleo.module';
import { opcoesLogger } from './config/logger';
import { EstoqueNucleoModule } from './modules/dominio';
import { ProcessadorTarefasService } from './modules/tarefas/processador.service';
import { PrismaModule } from './prisma/prisma.service';

/**
 * Worker: processa a fila de tarefas (alertas, webhooks, e-mails, sincronização
 * com o CRM) e executa as rotinas agendadas. Roda em processo separado da API.
 */
@Module({
  imports: [
    LoggerModule.forRoot(opcoesLogger),
    ScheduleModule.forRoot(),
    PrismaModule,
    NucleoModule,
    EstoqueNucleoModule,
  ],
  providers: [ProcessadorTarefasService],
})
export class WorkerModule {}
