import { ConflictException, Injectable, Optional, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import * as argon2 from "argon2";
import { randomUUID } from "crypto";
import { buildPasswordResetEmail } from "../common/email/email-templates";
import { StructuredLoggerService } from "../common/logging/structured-logger.service";
import { PrismaService } from "../prisma/prisma.service";
import { ForgotPasswordDto, GoogleLoginDto, LoginDto, RegisterDto, ResetPasswordDto } from "./dto";

type AuthUserRecord = { id: string; email: string; name: string };
type AuthBootstrapResult =
  | { authenticated: false }
  | { authenticated: true; accessToken: string; refreshToken?: string; user: AuthUserRecord };

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    @Optional() private readonly logger?: StructuredLoggerService
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException("Email is already registered");

    const passwordHash = await argon2.hash(dto.password);
    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: { email: dto.email, name: dto.name, passwordHash },
        select: { id: true, email: true, name: true }
      });
      const slugBase = dto.email
        .split("@")[0]
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, "-")
        .replace(/^-|-$/g, "");
      const slug = `${slugBase || "workspace"}-${created.id.slice(0, 8)}`;
      const workspace = await tx.workspace.create({
        data: {
          name: "My Workspace",
          slug,
          ownerId: created.id
        }
      });
      await tx.workspaceMember.create({
        data: { userId: created.id, workspaceId: workspace.id, role: "OWNER" }
      });
      return created;
    });

    const session = await this.issueSession(user);
    this.logger?.userRegistration({ userId: user.id, email: user.email });
    return session;
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user?.passwordHash) throw new UnauthorizedException("Invalid credentials");

    const valid = await argon2.verify(user.passwordHash, dto.password);
    if (!valid) throw new UnauthorizedException("Invalid credentials");

    const session = await this.issueSession({ id: user.id, email: user.email, name: user.name });
    this.logger?.userLogin({ userId: user.id, email: user.email });
    return session;
  }

  async googleLogin(dto: GoogleLoginDto) {
    const profile = await this.verifyGoogleToken(dto.idToken);
    const email = profile.email.toLowerCase();

    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, name: true }
    });

    if (user) {
      const session = await this.issueSession(user);
      this.logger?.userLogin({ userId: user.id, email: user.email, data: { provider: "google" } });
      return session;
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const nextUser = await tx.user.create({
        data: {
          email,
          name: profile.name || email.split("@")[0],
          avatarUrl: profile.picture
        },
        select: { id: true, email: true, name: true }
      });

      const slugBase = email
        .split("@")[0]
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, "-")
        .replace(/^-|-$/g, "");
      const workspace = await tx.workspace.create({
        data: {
          name: "My Workspace",
          slug: `${slugBase || "workspace"}-${nextUser.id.slice(0, 8)}`,
          ownerId: nextUser.id
        }
      });
      await tx.workspaceMember.create({
        data: { userId: nextUser.id, workspaceId: workspace.id, role: "OWNER" }
      });

      return nextUser;
    });

    const session = await this.issueSession(created);
    this.logger?.userRegistration({ userId: created.id, email: created.email, data: { provider: "google" } });
    return session;
  }

  async refresh(refreshToken?: string | null) {
    if (!refreshToken) throw new UnauthorizedException("Refresh token is missing");
    const payload = this.verifyRefreshToken(refreshToken);
    const session = await this.prisma.authSession.findFirst({
      where: {
        id: payload.sid,
        userId: payload.sub,
        revokedAt: null,
        refreshExpiresAt: { gt: new Date() }
      },
      select: {
        id: true,
        refreshTokenHash: true,
        user: { select: { id: true, email: true, name: true } }
      }
    });

    if (!session?.refreshTokenHash) throw new UnauthorizedException("Refresh session is invalid or expired");

    const valid = await argon2.verify(session.refreshTokenHash, refreshToken).catch(() => false);
    if (!valid) {
      await this.prisma.authSession.updateMany({
        where: { id: payload.sid, revokedAt: null },
        data: { revokedAt: new Date() }
      });
      throw new UnauthorizedException("Refresh session is invalid or expired");
    }

    const refreshed = await this.rotateSession(session.user, session.id);
    this.logger?.businessEvent({ event: "user_session_refreshed", message: "User session refreshed.", userId: session.user.id });
    return refreshed;
  }

  async bootstrapSession(accessToken?: string | null, refreshToken?: string | null): Promise<AuthBootstrapResult> {
    const accessSession = await this.getValidAccessSession(accessToken);
    if (accessSession) {
      return {
        authenticated: true,
        accessToken: accessToken as string,
        user: accessSession.user
      };
    }

    if (!refreshToken) return { authenticated: false };

    try {
      const refreshed = await this.refresh(refreshToken);
      return {
        authenticated: true,
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken,
        user: refreshed.user
      };
    } catch {
      return { authenticated: false };
    }
  }

  async logout(accessToken?: string | null, refreshToken?: string | null) {
    const sessionId = this.extractAccessSessionId(accessToken) || this.extractRefreshSessionId(refreshToken);
    if (!sessionId) return;

    await this.prisma.authSession.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() }
    });
    this.logger?.userLogout({ data: { sessionId } });
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
      select: { id: true, email: true, passwordHash: true }
    });

    if (!user?.passwordHash) return { sent: true };

    const token = this.jwt.sign(
      { sub: user.id, email: user.email, purpose: "password-reset" },
      { expiresIn: this.config.get<string>("PASSWORD_RESET_EXPIRES_IN", "30m") }
    );
    const baseUrl = this.config.get<string>("PASSWORD_RESET_BASE_URL", this.config.get<string>("CLIENT_URL", "http://localhost:3000"));
    const resetUrl = `${baseUrl.replace(/\/$/, "")}/reset-password?token=${encodeURIComponent(token)}`;
    const emailSent = await this.sendPasswordResetEmail(user.email, resetUrl);
    if (!emailSent) throw new ServiceUnavailableException("Password reset email delivery is not configured.");

    return {
      sent: true
    };
  }

  async resetPassword(dto: ResetPasswordDto) {
    let payload: { sub: string; purpose?: string };
    try {
      payload = this.jwt.verify(dto.token);
    } catch {
      throw new UnauthorizedException("Reset link is invalid or expired");
    }

    if (payload.purpose !== "password-reset") {
      throw new UnauthorizedException("Reset link is invalid or expired");
    }

    await this.prisma.user.update({
      where: { id: payload.sub },
      data: { passwordHash: await argon2.hash(dto.password) }
    });
    await this.prisma.authSession.updateMany({
      where: { userId: payload.sub, revokedAt: null },
      data: { revokedAt: new Date() }
    });

    return { updated: true };
  }

  private async verifyGoogleToken(idToken: string) {
    const clientId = this.config.get<string>("GOOGLE_CLIENT_ID");
    if (!clientId) throw new UnauthorizedException("Google login is not configured");

    const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
    const profile = await response.json().catch(() => null) as {
      aud?: string;
      email?: string;
      email_verified?: string | boolean;
      name?: string;
      picture?: string;
    } | null;

    if (!response.ok || !profile?.email || profile.aud !== clientId) {
      throw new UnauthorizedException("Invalid Google token");
    }

    if (!(profile.email_verified === true || profile.email_verified === "true")) {
      throw new UnauthorizedException("Google email is not verified");
    }

    return {
      email: profile.email,
      name: profile.name,
      picture: profile.picture
    };
  }

  private async issueSession(user: AuthUserRecord) {
    const sessionId = randomUUID();
    const refreshExpiresAt = new Date(Date.now() + this.refreshTokenMaxAgeMs());
    await this.prisma.authSession.create({
      data: {
        id: sessionId,
        userId: user.id,
        expiresAt: refreshExpiresAt,
        refreshExpiresAt
      }
    });

    return this.rotateSession(user, sessionId);
  }

  private async rotateSession(user: AuthUserRecord, sessionId: string) {
    const refreshToken = this.signRefreshToken(user, sessionId);
    const refreshExpiresAt = new Date(Date.now() + this.refreshTokenMaxAgeMs());
    await this.prisma.authSession.update({
      where: { id: sessionId },
      data: {
        refreshTokenHash: await argon2.hash(refreshToken),
        refreshExpiresAt,
        expiresAt: refreshExpiresAt
      }
    });

    return {
      accessToken: this.signAccessToken(user, sessionId),
      refreshToken,
      refreshExpiresAt,
      user
    };
  }

  private signAccessToken(user: AuthUserRecord, sessionId: string) {
    return this.jwt.sign({ sub: user.id, email: user.email, name: user.name, sid: sessionId });
  }

  private async getValidAccessSession(accessToken?: string | null) {
    if (!accessToken) return null;
    let payload: { sub?: string; sid?: string };
    try {
      payload = this.jwt.verify(accessToken);
    } catch {
      return null;
    }
    if (!payload.sub || !payload.sid) return null;

    const session = await this.prisma.authSession.findFirst({
      where: {
        id: payload.sid,
        userId: payload.sub,
        revokedAt: null,
        expiresAt: { gt: new Date() }
      },
      select: {
        user: { select: { id: true, email: true, name: true } }
      }
    });

    return session;
  }

  private signRefreshToken(user: AuthUserRecord, sessionId: string) {
    return this.jwt.sign(
      { sub: user.id, sid: sessionId, purpose: "auth-refresh", jti: randomUUID() },
      {
        secret: this.refreshTokenSecret(),
        expiresIn: Math.floor(this.refreshTokenMaxAgeMs() / 1000)
      }
    );
  }

  private verifyRefreshToken(refreshToken: string) {
    try {
      const payload = this.jwt.verify(refreshToken, { secret: this.refreshTokenSecret() }) as { sub?: string; sid?: string; purpose?: string };
      if (!payload.sub || !payload.sid || payload.purpose !== "auth-refresh") throw new Error("Invalid refresh payload");
      return { sub: payload.sub, sid: payload.sid };
    } catch {
      throw new UnauthorizedException("Refresh session is invalid or expired");
    }
  }

  private extractAccessSessionId(token?: string | null) {
    const decoded = token ? this.jwt.decode(token) : null;
    return typeof decoded === "object" && decoded && "sid" in decoded && typeof decoded.sid === "string" ? decoded.sid : "";
  }

  private extractRefreshSessionId(token?: string | null) {
    if (!token) return "";
    try {
      return this.verifyRefreshToken(token).sid;
    } catch {
      return "";
    }
  }

  private refreshTokenSecret() {
    return this.config.get<string>("JWT_REFRESH_SECRET") || this.config.get<string>("JWT_SECRET", "dev-secret");
  }

  private refreshTokenMaxAgeMs() {
    const configured = Number(this.config.get<string>("REFRESH_TOKEN_MAX_AGE_MS"));
    return Number.isFinite(configured) && configured > 0 ? configured : 30 * 24 * 60 * 60 * 1000;
  }

  private async sendPasswordResetEmail(email: string, resetUrl: string) {
    const apiKey = this.config.get<string>("RESEND_API_KEY");
    const from = this.config.get<string>("EMAIL_FROM");
    if (!apiKey || !from) return false;
    const message = buildPasswordResetEmail({
      resetUrl,
      expiresIn: this.config.get<string>("PASSWORD_RESET_EXPIRES_IN", "30m")
    });

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from,
        to: email,
        subject: message.subject,
        text: message.text,
        html: message.html
      })
    });

    return response.ok;
  }
}
