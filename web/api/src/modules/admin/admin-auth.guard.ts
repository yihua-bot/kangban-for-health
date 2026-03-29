import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

@Injectable()
export class AdminAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user as { role?: string; account?: string };

    if (user?.role === 'super_admin' && user.account === process.env.SUPER_ADMIN_ACCOUNT) {
      return true;
    }

    throw new ForbiddenException('仅超级管理员可访问该接口');
  }
}
