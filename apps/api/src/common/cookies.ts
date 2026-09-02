import type { CookieOptions, Request, Response } from 'express';

export type SessionCookies = Readonly<{
  accessToken: string;
  refreshToken: string;
  csrfToken: string;
  accessExpiresAt: Date;
  refreshExpiresAt: Date;
}>;

const secureCookies =
  process.env.COOKIE_SECURE === undefined
    ? process.env.NODE_ENV === 'production'
    : process.env.COOKIE_SECURE === 'true';

export const cookieNames = Object.freeze({
  access: secureCookies ? '__Host-bt_access' : 'bt_access',
  refresh: secureCookies ? '__Host-bt_refresh' : 'bt_refresh',
  csrf: secureCookies ? '__Host-bt_csrf' : 'bt_csrf',
});

const baseOptions: CookieOptions = {
  path: '/',
  sameSite: 'strict',
  secure: secureCookies,
};

export function readCookies(request: Request): Readonly<Record<string, string>> {
  const header = request.headers.cookie;

  if (!header) return {};

  return Object.fromEntries(
    header.split(';').flatMap((part) => {
      const separator = part.indexOf('=');
      if (separator < 1) return [];

      const name = part.slice(0, separator).trim();
      const value = part.slice(separator + 1).trim();

      try {
        return [[name, decodeURIComponent(value)]];
      } catch {
        return [];
      }
    }),
  );
}

export function setSessionCookies(response: Response, cookies: SessionCookies): void {
  response.cookie(cookieNames.access, cookies.accessToken, {
    ...baseOptions,
    expires: cookies.accessExpiresAt,
    httpOnly: true,
  });
  response.cookie(cookieNames.refresh, cookies.refreshToken, {
    ...baseOptions,
    expires: cookies.refreshExpiresAt,
    httpOnly: true,
  });
  response.cookie(cookieNames.csrf, cookies.csrfToken, {
    ...baseOptions,
    expires: cookies.refreshExpiresAt,
    httpOnly: false,
  });
}

export function clearSessionCookies(response: Response): void {
  response.clearCookie(cookieNames.access, { ...baseOptions, httpOnly: true });
  response.clearCookie(cookieNames.refresh, { ...baseOptions, httpOnly: true });
  response.clearCookie(cookieNames.csrf, { ...baseOptions, httpOnly: false });
}
