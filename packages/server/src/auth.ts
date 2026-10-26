import { ServiceError } from './errors';
export interface AuthEnvironment { APP_ENV?: string; AUTH_MODE?: string; APP_ORIGIN?: string }
export function checkOrigin(request: Request, env: AuthEnvironment): void {
  const origin = request.headers.get('Origin');
  const expected = env.APP_ORIGIN ?? new URL(request.url).origin;
  if (origin && origin !== expected) throw new ServiceError(403, 'origin-rejected', 'Cross-origin private access is not allowed.');
}
export function authenticate(request: Request, env: AuthEnvironment): string {
  checkOrigin(request, env);
  const host = new URL(request.url).hostname;
  if (env.APP_ENV === 'development' && env.AUTH_MODE === 'local-development' && ['localhost', '127.0.0.1', '[::1]'].includes(host)) return 'local-development-user';
  // No bearer/header/cookie is trusted until a real OAuth verifier is implemented.
  throw new ServiceError(503, 'authentication-not-configured', 'Private access is disabled. Production OAuth is not implemented.');
}
