import { ServiceError } from './errors';
export interface AuthEnvironment { DB?: D1Database; APP_ENV?: string; AUTH_MODE?: string; APP_ORIGIN?: string; GITHUB_ALLOWED_USER_ID?: string }
export const SESSION_COOKIE = '__Host-ew-session';
export const randomToken = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
export const hash = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), b => b.toString(16).padStart(2, '0')).join('');
export const cookie = (request: Request, name: string) => request.headers.get('Cookie')?.split(';').map(x => x.trim()).find(x => x.startsWith(name + '='))?.slice(name.length + 1);
export const sessionCookie = (value: string, age = 28800) => `${SESSION_COOKIE}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${age}`;
export function checkOrigin(request: Request, env: AuthEnvironment): void {
  const origin = request.headers.get('Origin');
  const expected = env.APP_ORIGIN ?? new URL(request.url).origin;
  if (origin && origin !== expected) throw new ServiceError(403, 'origin-rejected', 'Cross-origin private access is not allowed.');
  if (request.headers.get('Sec-Fetch-Site') === 'cross-site') throw new ServiceError(403, 'origin-rejected', 'Cross-site private access is not allowed.');
}
export function localIdentity(request: Request, env: AuthEnvironment): string | undefined {
  const host = new URL(request.url).hostname;
  if (env.APP_ENV === 'development' && env.AUTH_MODE === 'local-development' && ['localhost', '127.0.0.1', '[::1]'].includes(host)) return 'local-development-user';
}
// GitHub REST /users/kadencartwright verified 2026-10-26; numeric ID also prevents username reassignment.
export function allowedIdentity(user: { id: string | number; login: string }, env: AuthEnvironment): string {
  if (user.login?.toLowerCase() !== 'kadencartwright' || !/^\d+$/.test(String(user.id)) || String(user.id) !== (env.GITHUB_ALLOWED_USER_ID ?? '40246541')) throw new ServiceError(403, 'account-not-allowed', 'This workbench is restricted to kadencartwright.');
  return `github:${user.id}`;
}
export async function authenticate(request: Request, env: AuthEnvironment): Promise<string> {
  checkOrigin(request, env);
  const local = localIdentity(request, env); if (local) return local;
  if (env.AUTH_MODE !== 'github' || !env.DB || !env.APP_ORIGIN) throw new ServiceError(503, 'authentication-not-configured', 'Configure GitHub OAuth before enabling private access.');
  const token = cookie(request, SESSION_COOKIE);
  if (token && /^[a-f0-9]{64}$/.test(token)) {
    const row = await env.DB.prepare('SELECT user_id, login FROM auth_sessions WHERE token_hash=? AND expires_at>?').bind(await hash(token), Date.now()).first<{user_id: string; login: string}>();
    if (row) return allowedIdentity({ id: row.user_id, login: row.login }, env);
  }
  throw new ServiceError(401, 'authentication-required', 'Sign in at /auth/login.');
}
