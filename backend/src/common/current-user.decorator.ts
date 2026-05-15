import { ExecutionContext, createParamDecorator } from '@nestjs/common';

export type AuthenticatedUser = {
  id: string;
  email: string;
};

export const CurrentUser = createParamDecorator<unknown, ExecutionContext, AuthenticatedUser>(
  (_data, ctx) => {
    const request = ctx.switchToHttp().getRequest<{ user: AuthenticatedUser }>();
    return request.user;
  },
);
