import { ConflictException, HttpException, NotFoundException } from '@nestjs/common';

export function expectedVersion(ifMatch: string | undefined): number {
  const value = ifMatch?.trim().replace(/^W\//u, '').replace(/^"|"$/gu, '');
  const parsed = value && /^\d+$/u.test(value) ? Number(value) : Number.NaN;

  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new HttpException(
      {
        type: 'about:blank',
        title: 'A valid If-Match entity version is required',
        status: 428,
        code: 'ENTITY_VERSION_REQUIRED',
      },
      428,
    );
  }

  return parsed;
}

export function staleWrite(): ConflictException {
  return new ConflictException({
    type: 'about:blank',
    title: 'The record changed after it was loaded; refresh and retry',
    status: 409,
    code: 'STALE_WRITE',
  });
}

export function invalidCursor(): NotFoundException {
  return new NotFoundException({
    type: 'about:blank',
    title: 'The pagination cursor is not available in this tenant scope',
    status: 404,
    code: 'CURSOR_NOT_FOUND',
  });
}
