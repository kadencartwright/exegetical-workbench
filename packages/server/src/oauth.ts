import { AuthorizationError, OAuthAuthorizationServer, OAuthResourceServer, authorizationErrorRedirect, insufficientScope } from '@cloudflare/workers-oauth-provider';
import { allowedIdentity, authenticate, checkOrigin, cookie, hash, randomToken, sessionCookie, SESSION_COOKIE } from './auth';
import { ServiceError } from './errors';
import type { Env } from './index';
export interface OAuthEnv extends Env { OAUTH_KV?: KVNamespace; GITHUB_CLIENT_ID?: string; GITHUB_CLIENT_SECRET?: string }
const htmlEscape = (s: string) => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const redirect = (location: string, headers = new Headers()) => { headers.set('Location', location); headers.set('Cache-Control', 'no-store'); return new Response(null, { status: 302, headers }); };
const callback = (env: OAuthEnv) => `${env.APP_ORIGIN}/auth/callback`;
export async function s256(value: string): Promise<string> {
  return btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function githubUrl(env: OAuthEnv, state: string, verifier: string) {
  const url = new URL('https://github.com/login/oauth/authorize');
  url.search = new URLSearchParams({ client_id: env.GITHUB_CLIENT_ID!, redirect_uri: callback(env), state, code_challenge: await s256(verifier), code_challenge_method: 'S256', login: 'kadencartwright', allow_signup: 'false', scope: 'read:user' }).toString();
  return url.href;
}
export async function githubIdentity(env: OAuthEnv, code: string, verifier: string, fetcher: typeof fetch = fetch) {
  const token = await fetcher('https://github.com/login/oauth/access_token', { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: env.GITHUB_CLIENT_ID!, client_secret: env.GITHUB_CLIENT_SECRET!, code, code_verifier: verifier, redirect_uri: callback(env) }) });
  const result = await token.json() as { access_token?: string; token_type?: string };
  if (!token.ok || !result.access_token || result.token_type?.toLowerCase() !== 'bearer') throw new ServiceError(401, 'github-exchange-failed', 'GitHub did not authorize this sign-in.');
  const response = await fetcher('https://api.github.com/user', { headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${result.access_token}`, 'User-Agent': 'exegetical-workbench', 'X-GitHub-Api-Version': '2022-11-28' } });
  if (!response.ok) throw new ServiceError(401, 'github-identity-failed', 'GitHub identity could not be verified.');
  const user = await response.json() as { id: number; login: string };
  allowedIdentity(user, env); // Never derive identity from callback query strings or user headers.
  return user;
}
export function authorizationServer(origin: string) {
  return new OAuthAuthorizationServer<OAuthEnv>({ issuer: origin, resources: [`${origin}/mcp`], defaultResource: `${origin}/mcp`, clientIdMetadataDocumentEnabled: false, scopesSupported: ['mcp:read', 'offline_access'], accessTokenTTL: 900, refreshTokenTTL: 28800, clientRegistrationEndpoint: '/oauth/register' });
}
export function mcpResource(env: OAuthEnv, handler: (r: Request, e: OAuthEnv, owner: string) => Promise<Response>) {
  const server = authorizationServer(env.APP_ORIGIN!);
  return new OAuthResourceServer<OAuthEnv, { id: number; login: string }>({ resourceMetadata: { resource: `${env.APP_ORIGIN}/mcp`, authorization_servers: [env.APP_ORIGIN!] }, requiredScopes: ['mcp:read'], validateToken: e => (resource, token) => server.validateToken(resource, token, e), handler: { async fetch(r, e, ctx) {
    if (!ctx.auth.scope.includes('mcp:read')) return insufficientScope(ctx.auth, ['mcp:read']);
    try { return await handler(r, e, allowedIdentity(ctx.props, e)); } catch (err) { if (err instanceof ServiceError) return Response.json({ error: { code: err.code } }, { status: err.status }); throw err; }
  } } });
}
export function requireOAuthConfig(request: Request, env: OAuthEnv) {
  if (env.AUTH_MODE !== 'github' || !env.OAUTH_KV || !env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET || !env.APP_ORIGIN || new URL(env.APP_ORIGIN).origin !== env.APP_ORIGIN || !env.APP_ORIGIN.startsWith('https://')) throw new ServiceError(503, 'authentication-not-configured', 'GitHub OAuth credentials, canonical HTTPS APP_ORIGIN and OAUTH_KV are required.');
  if (new URL(request.url).origin !== env.APP_ORIGIN) throw new ServiceError(400, 'invalid-origin', 'Use the canonical application origin.');
}
export async function handleOAuth(request: Request, env: OAuthEnv, ctx: ExecutionContext): Promise<Response | undefined> {
  const url = new URL(request.url); const path = url.pathname;
  if (!(path.startsWith('/auth/') || path === '/authorize' || path.startsWith('/oauth/') || path.startsWith('/.well-known/oauth-authorization-server'))) return undefined;
  if (path === '/auth/session' && env.APP_ENV === 'development' && env.AUTH_MODE === 'local-development') { const owner = await authenticate(request, env); return Response.json({ data: { owner, login: 'local-development-user' }, coverage: [], provenance: [] }, { headers: { 'Cache-Control': 'no-store' } }); }
  requireOAuthConfig(request, env);
  const oauthServer = authorizationServer(env.APP_ORIGIN!); const oauth = oauthServer.getOAuthApi(env);
  try {
    if (path === '/auth/session') { const owner = await authenticate(request, env); return Response.json({ data: { owner, login: 'kadencartwright' }, coverage: [], provenance: [] }, { headers: { 'Cache-Control': 'no-store' } }); }
    if (path === '/auth/logout') {
      if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
      checkOrigin(request, env);
      if (request.headers.get('Origin') !== env.APP_ORIGIN) throw new ServiceError(403, 'origin-rejected', 'Same-origin logout required.');
      const token = cookie(request, SESSION_COOKIE); if (token) await env.DB.prepare('DELETE FROM auth_sessions WHERE token_hash=?').bind(await hash(token)).run();
      return redirect('/', new Headers({ 'Set-Cookie': sessionCookie('', 0) }));
    }
    if (path === '/auth/login') {
      if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 });
      checkOrigin(request, env);
      const state = `web.${randomToken()}`; const binding = randomToken(); const verifier = randomToken();
      const returnTo = url.searchParams.get('returnTo') ?? '/';
      const safeReturn = returnTo.startsWith('/') && !returnTo.startsWith('//') && !returnTo.includes('\\') && !/[\r\n]/.test(returnTo) ? returnTo : '/';
      await env.DB.prepare('DELETE FROM auth_states WHERE expires_at<=?').bind(Date.now()).run();
      await env.DB.prepare('INSERT INTO auth_states VALUES(?,?,?,?,?)').bind(await hash(state), await hash(binding), verifier, safeReturn, Date.now() + 600000).run();
      return redirect(await githubUrl(env, state, verifier), new Headers({ 'Set-Cookie': `__Host-ew-state=${binding}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=600` }));
    }
    if (path === '/authorize') {
      if (request.method === 'GET') {
        const auth = await oauth.parseAuthRequest(request); const info = await oauth.describeConsent(auth); const consent = await oauth.beginConsent(auth);
        consent.headers.set('Content-Type', 'text/html; charset=utf-8');
        return new Response(`<!doctype html><title>Authorize workbench access</title><h1>Authorize ${htmlEscape(info.clientName)}</h1><p>This client will read corpus evidence and your private notes. Only kadencartwright can authorize.</p><p>Redirect: ${htmlEscape(auth.redirectUri)}</p><p>Resource: ${htmlEscape(String(auth.resource))}</p><p>Scopes: ${htmlEscape(auth.scope.join(' '))}</p><form method="post"><input type="hidden" name="handle" value="${htmlEscape(consent.handle)}"><button name="decision" value="allow">Allow read access</button><button name="decision" value="deny">Deny</button></form>`, { headers: consent.headers });
      }
      if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
      checkOrigin(request, env);
      const form = await request.formData(); const handle = String(form.get('handle') ?? '');
      if (form.get('decision') !== 'allow') { const denied = await oauth.denyConsent(request, handle); return new Response(null, { status: 302, headers: denied.headers }); }
      const approved = await oauth.approveConsent(request, handle); const verifier = randomToken();
      const upstream = await oauth.beginUpstream(approved.request, { data: { verifier }, headers: approved.headers });
      return redirect(await githubUrl(env, upstream.state, verifier), upstream.headers);
    }
    if (path === '/auth/callback') {
      if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 });
      const state = url.searchParams.get('state') ?? ''; const code = url.searchParams.get('code');
      if (state.startsWith('web.')) {
        const binding = cookie(request, '__Host-ew-state');
        if (!binding) throw new ServiceError(400, 'invalid-state', 'Missing sign-in browser binding.');
        // Atomic consumption prevents replay, including concurrent callbacks.
        const row = await env.DB.prepare('DELETE FROM auth_states WHERE state_hash=? AND binding_hash=? AND expires_at>? RETURNING verifier,return_to').bind(await hash(state), await hash(binding), Date.now()).first<{verifier: string; return_to: string}>();
        if (!row) throw new ServiceError(400, 'invalid-state', 'Expired, replayed or invalid sign-in state.');
        if (!code || url.searchParams.has('error')) throw new ServiceError(401, 'authorization-denied', 'GitHub sign-in was denied.');
        const user = await githubIdentity(env, code, row.verifier); const session = randomToken();
        await env.DB.prepare('DELETE FROM auth_sessions WHERE expires_at<=?').bind(Date.now()).run();
        await env.DB.prepare('INSERT INTO auth_sessions VALUES(?,?,?,?)').bind(await hash(session), String(user.id), user.login, Date.now() + 28800000).run();
        const headers = new Headers(); headers.append('Set-Cookie', sessionCookie(session)); headers.append('Set-Cookie', '__Host-ew-state=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0');
        return redirect(row.return_to, headers);
      }
      const resumed = await oauth.finishUpstream<{verifier: string}>(request);
      if (!code || url.searchParams.has('error')) return redirect(authorizationErrorRedirect(resumed.request, 'access_denied'), resumed.headers);
      const user = await githubIdentity(env, code, resumed.data.verifier);
      const result = await oauth.completeAuthorization({ request: resumed.request, userId: String(user.id), metadata: { login: user.login }, scope: resumed.request.scope, props: user });
      return redirect(result.redirectTo, resumed.headers);
    }
    return oauthServer.fetch(request, env, ctx);
  } catch (error) { if (error instanceof AuthorizationError) return Response.json({ error: { code: 'invalid-oauth-request', message: error.message } }, { status: 400, headers: { 'Cache-Control': 'no-store' } }); throw error; }
}
