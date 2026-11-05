import type { Request } from 'express';

export const ADMIN_SESSION_COOKIE_NAME = 'goswifthr_admin_session';

export function readAdminSessionCookie(request: Request): string | undefined {
  const cookieHeader = request.headers.cookie;
  if (!cookieHeader) {
    return undefined;
  }

  const cookie = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${ADMIN_SESSION_COOKIE_NAME}=`));
  return cookie?.slice(ADMIN_SESSION_COOKIE_NAME.length + 1);
}
