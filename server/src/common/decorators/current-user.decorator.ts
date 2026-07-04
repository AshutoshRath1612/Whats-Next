import { createParamDecorator, ExecutionContext } from "@nestjs/common";

export type CurrentUser = {
  sub: string;
  email: string;
  name: string;
  sid?: string;
};

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): CurrentUser => {
  const request = ctx.switchToHttp().getRequest<{ user: CurrentUser }>();
  return request.user;
});
