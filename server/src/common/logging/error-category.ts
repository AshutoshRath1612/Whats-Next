import { BadRequestException, ConflictException, ForbiddenException, HttpException, NotFoundException, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { Prisma } from "@prisma/client";

export type ErrorCategory =
  | "Validation"
  | "Authentication"
  | "Authorization"
  | "Database"
  | "External API"
  | "Business Logic"
  | "Internal Server Error";

export function classifyError(error: unknown): ErrorCategory {
  if (error instanceof BadRequestException) return "Validation";
  if (error instanceof UnauthorizedException) return "Authentication";
  if (error instanceof ForbiddenException) return "Authorization";
  if (error instanceof ServiceUnavailableException) return "External API";
  if (isPrismaError(error)) return "Database";
  if (error instanceof ConflictException || error instanceof NotFoundException) return "Business Logic";

  if (error instanceof HttpException) {
    const status = error.getStatus();
    if (status === 400 || status === 422) return "Validation";
    if (status === 401) return "Authentication";
    if (status === 403) return "Authorization";
    if (status === 409 || status === 404) return "Business Logic";
    if (status === 429) return "Business Logic";
    if (status >= 500 && status < 600) return "Internal Server Error";
  }

  return "Internal Server Error";
}

function isPrismaError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError ||
    error instanceof Prisma.PrismaClientUnknownRequestError ||
    error instanceof Prisma.PrismaClientRustPanicError ||
    error instanceof Prisma.PrismaClientInitializationError ||
    error instanceof Prisma.PrismaClientValidationError
  );
}
