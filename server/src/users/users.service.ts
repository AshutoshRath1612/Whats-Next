import { Injectable, UnauthorizedException } from "@nestjs/common";
import * as argon2 from "argon2";
import { PrismaService } from "../prisma/prisma.service";
import { ChangePasswordDto, UpdateProfileDto } from "./dto";

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async me(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        timezone: true,
        memberships: {
          select: {
            role: true,
            workspace: {
              select: { id: true, name: true, slug: true, icon: true, color: true }
            }
          }
        }
      }
    });
    return this.withHydratedAvatarUrl(user, userId);
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        name: dto.name,
        avatarUrl: dto.avatarUrl,
        timezone: dto.timezone
      },
      select: { id: true, email: true, name: true, avatarUrl: true, timezone: true }
    });
    return this.withHydratedAvatarUrl(user, userId);
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { passwordHash: true }
    });
    if (!user.passwordHash || !(await argon2.verify(user.passwordHash, dto.currentPassword))) {
      throw new UnauthorizedException("Current password is incorrect");
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await argon2.hash(dto.nextPassword) }
    });
    return { updated: true };
  }

  sessions(userId: string) {
    return this.prisma.authSession.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { id: true, createdAt: true, expiresAt: true, revokedAt: true }
    });
  }

  async logoutAll(userId: string) {
    await this.prisma.authSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() }
    });
    return { revoked: true };
  }

  private async withHydratedAvatarUrl<T extends { avatarUrl?: string | null }>(user: T, userId: string) {
    return { ...user, avatarUrl: await this.resolveAvatarContentUrl(user.avatarUrl, userId) };
  }

  private async resolveAvatarContentUrl(avatarUrl: string | null | undefined, userId: string) {
    if (!avatarUrl || (avatarUrl.includes("/files/") && avatarUrl.endsWith("/content"))) return avatarUrl ?? null;

    const file = await this.prisma.fileAsset.findFirst({
      where: {
        url: avatarUrl,
        deletedAt: null,
        workspace: { members: { some: { userId } } }
      },
      select: { id: true }
    });

    return file ? `/files/${file.id}/content` : avatarUrl;
  }
}
