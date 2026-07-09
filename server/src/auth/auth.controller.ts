import { Body, Controller, HttpCode, Post, Req, Res } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Request, Response } from "express";
import { AuthService } from "./auth.service";
import { ForgotPasswordDto, GoogleLoginDto, LoginDto, RegisterDto, ResetPasswordDto } from "./dto";
import { AUTH_COOKIE_NAME, AUTH_REFRESH_COOKIE_NAME } from "./jwt.strategy";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService
  ) {}

  @Post("register")
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) response: Response) {
    const result = await this.auth.register(dto);
    this.setAuthCookies(response, result.accessToken, result.refreshToken);
    return { accessToken: result.accessToken, user: result.user };
  }

  @Post("login")
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) response: Response) {
    const result = await this.auth.login(dto);
    this.setAuthCookies(response, result.accessToken, result.refreshToken);
    return { accessToken: result.accessToken, user: result.user };
  }

  @Post("google")
  async google(@Body() dto: GoogleLoginDto, @Res({ passthrough: true }) response: Response) {
    const result = await this.auth.googleLogin(dto);
    this.setAuthCookies(response, result.accessToken, result.refreshToken);
    return { accessToken: result.accessToken, user: result.user };
  }

  @Post("refresh")
  @HttpCode(200)
  async refresh(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const result = await this.auth.refresh(this.extractCookie(request, AUTH_REFRESH_COOKIE_NAME));
    this.setAuthCookies(response, result.accessToken, result.refreshToken);
    return { accessToken: result.accessToken, user: result.user };
  }

  @Post("session")
  @HttpCode(200)
  async session(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const result = await this.auth.bootstrapSession(this.extractToken(request), this.extractCookie(request, AUTH_REFRESH_COOKIE_NAME));
    if (!result.authenticated) return { authenticated: false };
    if (result.refreshToken) this.setAuthCookies(response, result.accessToken, result.refreshToken);
    return { authenticated: true, accessToken: result.accessToken, user: result.user };
  }

  @Post("forgot-password")
  @HttpCode(200)
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.auth.forgotPassword(dto);
  }

  @Post("reset-password")
  @HttpCode(200)
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto);
  }

  @Post("logout")
  @HttpCode(204)
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    await this.auth.logout(this.extractToken(request), this.extractCookie(request, AUTH_REFRESH_COOKIE_NAME));
    this.clearAuthCookie(response, AUTH_COOKIE_NAME);
    this.clearAuthCookie(response, AUTH_REFRESH_COOKIE_NAME);
  }

  private setAuthCookies(response: Response, accessToken: string, refreshToken: string) {
    response.cookie(AUTH_COOKIE_NAME, accessToken, {
      httpOnly: true,
      sameSite: this.config.get<string>("NODE_ENV") === "production" ? "none" : "lax",
      secure: this.config.get<string>("NODE_ENV") === "production",
      path: "/",
      maxAge: this.cookieMaxAgeMs()
    });
    response.cookie(AUTH_REFRESH_COOKIE_NAME, refreshToken, {
      httpOnly: true,
      sameSite: this.config.get<string>("NODE_ENV") === "production" ? "none" : "lax",
      secure: this.config.get<string>("NODE_ENV") === "production",
      path: "/api/auth",
      maxAge: this.refreshCookieMaxAgeMs()
    });
  }

  private cookieMaxAgeMs() {
    const configured = Number(this.config.get<string>("AUTH_COOKIE_MAX_AGE_MS"));
    return Number.isFinite(configured) && configured > 0 ? configured : 15 * 60 * 1000;
  }

  private refreshCookieMaxAgeMs() {
    const configured = Number(this.config.get<string>("REFRESH_TOKEN_MAX_AGE_MS"));
    return Number.isFinite(configured) && configured > 0 ? configured : 30 * 24 * 60 * 60 * 1000;
  }

  private clearAuthCookie(response: Response, name: string) {
    response.clearCookie(name, {
      httpOnly: true,
      sameSite: this.config.get<string>("NODE_ENV") === "production" ? "none" : "lax",
      secure: this.config.get<string>("NODE_ENV") === "production",
      path: name === AUTH_REFRESH_COOKIE_NAME ? "/api/auth" : "/"
    });
  }

  private extractToken(request: Request) {
    const authorization = request.headers.authorization;
    if (authorization?.startsWith("Bearer ")) return authorization.slice("Bearer ".length);

    return this.extractCookie(request, AUTH_COOKIE_NAME);
  }

  private extractCookie(request: Request, name: string) {
    return request.headers.cookie
      ?.split(";")
      .map((cookie) => cookie.trim())
      .find((cookie) => cookie.startsWith(`${name}=`))
      ?.slice(name.length + 1) ?? null;
  }
}
