import { ConflictException, Injectable, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import * as argon2 from "argon2";
import { randomUUID } from "crypto";
import { buildPasswordResetEmail } from "../common/email/email-templates";
import { PrismaService } from "../prisma/prisma.service";
import { ForgotPasswordDto, GoogleLoginDto, LoginDto, RegisterDto, ResetPasswordDto } from "./dto";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService
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

    return this.issueToken(user);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user?.passwordHash) throw new UnauthorizedException("Invalid credentials");

    const valid = await argon2.verify(user.passwordHash, dto.password);
    if (!valid) throw new UnauthorizedException("Invalid credentials");

    return this.issueToken({ id: user.id, email: user.email, name: user.name });
  }

  async googleLogin(dto: GoogleLoginDto) {
    const profile = await this.verifyGoogleToken(dto.idToken);
    const email = profile.email.toLowerCase();

    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, name: true }
    });

    if (user) return this.issueToken(user);

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

    return this.issueToken(created);
  }

  async logout(token?: string | null) {
    const decoded = token ? this.jwt.decode(token) : null;
    const sessionId = typeof decoded === "object" && decoded && "sid" in decoded && typeof decoded.sid === "string" ? decoded.sid : "";
    if (!sessionId) return;

    await this.prisma.authSession.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() }
    });
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

  private async issueToken(user: { id: string; email: string; name: string }) {
    const sessionId = randomUUID();
    const expiresAt = new Date(Date.now() + this.sessionMaxAgeMs());
    await this.prisma.authSession.create({
      data: {
        id: sessionId,
        userId: user.id,
        expiresAt
      }
    });

    return {
      accessToken: this.jwt.sign({ sub: user.id, email: user.email, name: user.name, sid: sessionId }),
      user
    };
  }

  private sessionMaxAgeMs() {
    const configured = Number(this.config.get<string>("AUTH_COOKIE_MAX_AGE_MS"));
    return Number.isFinite(configured) && configured > 0 ? configured : 7 * 24 * 60 * 60 * 1000;
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
