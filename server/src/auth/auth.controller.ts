import { Body, Controller, HttpCode, Post, Req, Res } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Request, Response } from "express";
import { AuthService } from "./auth.service";
import { ForgotPasswordDto, GoogleLoginDto, LoginDto, RegisterDto, ResetPasswordDto } from "./dto";
import { AUTH_COOKIE_NAME } from "./jwt.strategy";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService
  ) {}

  @Post("register")
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) response: Response) {
    const result = await this.auth.register(dto);
    this.setAuthCookie(response, result.accessToken);
    return result;
  }

  @Post("login")
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) response: Response) {
    const result = await this.auth.login(dto);
    this.setAuthCookie(response, result.accessToken);
    return result;
  }

  @Post("google")
  async google(@Body() dto: GoogleLoginDto, @Res({ passthrough: true }) response: Response) {
    const result = await this.auth.googleLogin(dto);
    this.setAuthCookie(response, result.accessToken);
    return result;
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
    await this.auth.logout(this.extractToken(request));
    response.clearCookie(AUTH_COOKIE_NAME, {
      httpOnly: true,
      sameSite: "lax",
      secure: this.config.get<string>("NODE_ENV") === "production",
      path: "/"
    });
  }

  private setAuthCookie(response: Response, token: string) {
    response.cookie(AUTH_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: this.config.get<string>("NODE_ENV") === "production",
      path: "/",
      maxAge: this.cookieMaxAgeMs()
    });
  }

  private cookieMaxAgeMs() {
    const configured = Number(this.config.get<string>("AUTH_COOKIE_MAX_AGE_MS"));
    return Number.isFinite(configured) && configured > 0 ? configured : 7 * 24 * 60 * 60 * 1000;
  }

  private extractToken(request: Request) {
    const authorization = request.headers.authorization;
    if (authorization?.startsWith("Bearer ")) return authorization.slice("Bearer ".length);

    return request.headers.cookie
      ?.split(";")
      .map((cookie) => cookie.trim())
      .find((cookie) => cookie.startsWith(`${AUTH_COOKIE_NAME}=`))
      ?.slice(AUTH_COOKIE_NAME.length + 1) ?? null;
  }
}
