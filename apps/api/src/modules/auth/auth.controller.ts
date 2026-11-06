import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { CookieOptions, Response } from 'express';
import { env } from '../../config/env';
import { Ator, Publico, UsuarioAtual } from '../../common/auth/decoradores';
import type {
  ContextoAtor,
  RequisicaoAutenticada,
  UsuarioAutenticado,
} from '../../common/auth/tipos';
import { CriptoService } from '../../common/cripto.service';
import { LoginDto, TrocarSenhaDto } from '../../common/dto';
import { ErroDominio } from '../../common/erros';
import { AuthService, type SessaoEmitida } from './auth.service';
import { HttpStatus } from '@nestjs/common';

export const COOKIE_REFRESH = 'estoque_rt';
export const COOKIE_CSRF = 'estoque_csrf';
const CAMINHO_REFRESH = '/api/v1/auth';

@ApiTags('Autenticação')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Publico()
  @Throttle({ default: { limit: env.LOGIN_LIMITE_POR_MINUTO, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() dados: LoginDto,
    @Ator() ator: ContextoAtor,
    @Res({ passthrough: true }) res: Response,
  ) {
    const sessao = await this.auth.login(dados, ator);
    return this.responder(sessao, res);
  }

  @Publico()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Req() req: RequisicaoAutenticada,
    @Ator() ator: ContextoAtor,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.validarCsrf(req);
    const sessao = await this.auth.renovar(req.cookies?.[COOKIE_REFRESH], ator);
    return this.responder(sessao, res);
  }

  @Publico()
  @Post('logout')
  @HttpCode(204)
  async logout(
    @Req() req: RequisicaoAutenticada,
    @Ator() ator: ContextoAtor,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.validarCsrf(req);
    await this.auth.logout(req.cookies?.[COOKIE_REFRESH], req.usuario, ator);
    res.clearCookie(COOKIE_REFRESH, { ...this.opcoesCookie(), path: CAMINHO_REFRESH });
    res.clearCookie(COOKIE_CSRF, { ...this.opcoesCookie(), httpOnly: false, path: '/' });
  }

  @ApiBearerAuth()
  @Get('me')
  me(@UsuarioAtual() usuario: UsuarioAutenticado) {
    return this.auth.perfil(usuario.id);
  }

  @ApiBearerAuth()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('trocar-senha')
  @HttpCode(204)
  async trocarSenha(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Body() dados: TrocarSenhaDto,
    @Ator() ator: ContextoAtor,
  ) {
    await this.auth.trocarSenha(usuario, dados, ator);
  }

  @ApiBearerAuth()
  @Get('sessoes')
  sessoes(@UsuarioAtual() usuario: UsuarioAutenticado) {
    return this.auth.listarSessoes(usuario);
  }

  @ApiBearerAuth()
  @Delete('sessoes/:id')
  @HttpCode(204)
  async revogarSessao(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Ator() ator: ContextoAtor,
  ) {
    await this.auth.revogarSessao(usuario, id, ator);
  }

  private responder(sessao: SessaoEmitida, res: Response) {
    const csrf = CriptoService.tokenAleatorio(24);
    res.cookie(COOKIE_REFRESH, sessao.refreshToken, {
      ...this.opcoesCookie(),
      path: CAMINHO_REFRESH,
      expires: sessao.refreshExpiraEm,
    });
    res.cookie(COOKIE_CSRF, csrf, {
      ...this.opcoesCookie(),
      httpOnly: false,
      path: '/',
      expires: sessao.refreshExpiraEm,
    });
    return { accessToken: sessao.accessToken, expiraEm: sessao.expiraEm, usuario: sessao.usuario };
  }

  private opcoesCookie(): CookieOptions {
    return { httpOnly: true, secure: env.COOKIE_SECURE, sameSite: 'strict' };
  }

  /** Proteção CSRF por double-submit: o cabeçalho deve repetir o valor do cookie. */
  private validarCsrf(req: RequisicaoAutenticada) {
    const cookie = req.cookies?.[COOKIE_CSRF];
    const cabecalho = req.headers['x-csrf-token'];
    if (
      !cookie ||
      typeof cabecalho !== 'string' ||
      !CriptoService.comparacaoSegura(cookie, cabecalho)
    ) {
      throw new ErroDominio(HttpStatus.FORBIDDEN, 'CSRF', 'Token CSRF ausente ou inválido.');
    }
  }
}
