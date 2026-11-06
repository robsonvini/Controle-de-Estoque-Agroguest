import { Controller, Get, HttpStatus, Res, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { Publico } from '../../common/auth/decoradores';
import { PrismaService } from '../../prisma/prisma.service';

/** Endpoints para o balanceador de carga e o monitoramento de disponibilidade. */
@ApiTags('Saúde')
@Publico()
@SkipThrottle()
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /** Liveness: o processo está respondendo. */
  @Get()
  vivo() {
    return { status: 'ok', horario: new Date().toISOString() };
  }

  /** Readiness: dependências (banco) disponíveis. */
  @Get('pronto')
  async pronto(@Res({ passthrough: true }) res: Response) {
    const inicio = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', banco: { status: 'ok', latenciaMs: Date.now() - inicio } };
    } catch {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
      return { status: 'indisponivel', banco: { status: 'erro' } };
    }
  }
}
