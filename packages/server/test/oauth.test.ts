import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index';
import { OAuthAuthorizationServer } from '@cloudflare/workers-oauth-provider';
import { authorizationServer, s256, type OAuthEnv } from '../src/oauth';
import { authenticate } from '../src/auth';
import { database, memoryKv } from './helpers';
const origin='https://workbench.example';
const ctx={waitUntil(){},passThroughOnException(){}} as unknown as ExecutionContext;
let env:OAuthEnv; let sqlite:ReturnType<typeof database>['sqlite'];
const req=(path:string,init?:RequestInit)=>new Request(origin+path,init);
const send=(path:string,init?:RequestInit)=>worker.fetch(req(path,init),env,ctx);
const cookies=(r:Response)=>r.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');
const ghMock=(login='kadencartwright',id=40246541)=>vi.stubGlobal('fetch',vi.fn(async(url:string, init:RequestInit)=> {
 if(url==='https://github.com/login/oauth/access_token') {expect(String(init.body)).toContain('code_verifier=');return Response.json({access_token:'upstream-test-token',token_type:'bearer'});}
 if(url==='https://api.github.com/user')return Response.json({id,login});
 throw new Error('Unexpected network access: '+url);
}));
beforeEach(()=>{const databaseResult=database();sqlite=databaseResult.sqlite;env={DB:databaseResult.db,APP_ENV:'production',AUTH_MODE:'github',APP_ORIGIN:origin,GITHUB_CLIENT_ID:'registered-test-app',GITHUB_CLIENT_SECRET:'test-only-secret',OAUTH_KV:memoryKv(),ASSETS:{fetch:async()=>new Response('private app')} as unknown as Fetcher};});
afterEach(()=>{sqlite.close();vi.unstubAllGlobals();});
async function browserLogin() {
 const response=await send('/auth/login?returnTo=%2Fstudy%2FMatt.28.19');
 expect(response.status).toBe(302);const url=new URL(response.headers.get('Location')!);
 expect(url.origin).toBe('https://github.com');expect(url.searchParams.get('code_challenge_method')).toBe('S256');
 return {state:url.searchParams.get('state')!,cookie:cookies(response)};
}
async function mcpLogin(scope='mcp:read offline_access') {
 const api=authorizationServer(origin).getOAuthApi(env);
 const client=await api.createClient({clientName:'Research client <test>',redirectUris:['http://localhost:9345/callback'],tokenEndpointAuthMethod:'none',grantTypes:['authorization_code','refresh_token'],responseTypes:['code']});
 const verifier='test-verifier-with-enough-entropy-01234567890123456789';
 const params=new URLSearchParams({response_type:'code',client_id:client.clientId!,redirect_uri:'http://localhost:9345/callback',scope,resource:origin+'/mcp',code_challenge:await s256(verifier),code_challenge_method:'S256',state:'client-state'});
 const consent=await send('/authorize?'+params);expect(consent.status).toBe(200);
 const html=await consent.text();expect(html).toContain('&lt;test&gt;');expect(consent.headers.get('Content-Security-Policy')).toContain("frame-ancestors 'none'");
 const handle=html.match(/name="handle" value="([^"]+)"/)![1];
 const approved=await send('/authorize',{method:'POST',headers:{Cookie:cookies(consent),Origin:origin,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({handle,decision:'allow'})});
 expect(approved.status).toBe(302);
 const upstream=new URL(approved.headers.get('Location')!);
 expect((await send('/auth/callback?'+new URLSearchParams({code:'stolen',state:upstream.searchParams.get('state')!}))).status).toBe(400);
 const callback=await send('/auth/callback?'+new URLSearchParams({code:'verified-by-mocked-github-only',state:upstream.searchParams.get('state')!}),{headers:{Cookie:cookies(approved)}});
 expect(callback.status).toBe(302);
 expect((await send('/auth/callback?'+new URLSearchParams({code:'replayed',state:upstream.searchParams.get('state')!}),{headers:{Cookie:cookies(approved)}})).status).toBe(400);
 const returned=new URL(callback.headers.get('Location')!);expect(returned.searchParams.get('state')).toBe('client-state');
 return {client,verifier,code:returned.searchParams.get('code')!};
}
async function exchange(clientId:string,code:string,verifier:string) {
 return send('/oauth/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',client_id:clientId,code,code_verifier:verifier,redirect_uri:'http://localhost:9345/callback',resource:origin+'/mcp'})});
}
describe('production browser GitHub OAuth',()=>{
 it('rejects forged credentials and protects API and same-origin assets',async()=>{
  for(const path of ['/api/notes','/api/passage?ref=Matt.28.19'])expect((await send(path,{headers:{Authorization:'Bearer fake',Cookie:'__Host-ew-session=fake','X-User-ID':'kadencartwright'}})).status).toBe(401);
  expect((await send('/study/Matt.28.19')).headers.get('Location')).toContain('/auth/login');
  expect((await send('/auth/callback?state=fake&code=fake')).status).toBe(400);
 });
 it('exchanges a browser-bound code with PKCE, shares identity across sessions, expires and logs out',async()=>{
  ghMock();const login=await browserLogin();
  expect((await send('/auth/callback?state='+login.state+'&code=valid')).status).toBe(400);
  const callback=await send('/auth/callback?state='+login.state+'&code=valid',{headers:{Cookie:login.cookie}});
  expect(callback.status).toBe(302);expect(callback.headers.get('Location')).toBe('/study/Matt.28.19');
  expect(callback.headers.get('Set-Cookie')).toContain('Secure; HttpOnly; SameSite=Lax');
  const session=cookies(callback);expect(await authenticate(req('/api/notes',{headers:{Cookie:session}}),env)).toBe('github:40246541');
  expect((await send('/auth/callback?state='+login.state+'&code=valid',{headers:{Cookie:login.cookie}})).status).toBe(400);
  const body={anchor:{type:'verse-range',id:'Matt.28.19'},body:'Personal test note',tags:[],provenanceTag:'my-inference'};
  expect((await send('/api/notes',{method:'POST',headers:{Cookie:session,Origin:origin},body:JSON.stringify(body)})).status).toBe(201);
  const second=await browserLogin();const secondCallback=await send('/auth/callback?state='+second.state+'&code=valid',{headers:{Cookie:second.cookie}});
  const list=await send('/api/notes',{headers:{Cookie:cookies(secondCallback)}});expect((await list.json() as any).data).toHaveLength(1);
  expect((await send('/api/notes',{method:'POST',headers:{Cookie:session,Origin:'https://evil.example'},body:JSON.stringify(body)})).status).toBe(403);
  expect((await send('/',{headers:{Cookie:session}})).status).toBe(200);
  expect((await send('/auth/logout',{method:'POST',headers:{Cookie:session,Origin:origin}})).status).toBe(302);
  expect((await send('/api/notes',{headers:{Cookie:session}})).status).toBe(401);
  sqlite.exec('UPDATE auth_sessions SET expires_at=0');expect((await send('/api/notes',{headers:{Cookie:cookies(secondCallback)}})).status).toBe(401);
 });
 it('rejects a non-allowlisted verified GitHub identity and does not mint a session',async()=>{
  ghMock('another-user');const login=await browserLogin();expect((await send('/auth/callback?state='+login.state+'&code=valid',{headers:{Cookie:login.cookie}})).status).toBe(403);
  expect(sqlite.prepare('SELECT count(*) AS n FROM auth_sessions').get()?.n).toBe(0);
 });
 it('rejects expired state, checks an optionally pinned numeric GitHub id, and prevents open redirects',async()=>{
  ghMock();const login=await browserLogin();sqlite.exec('UPDATE auth_states SET expires_at=0');expect((await send('/auth/callback?state='+login.state+'&code=valid',{headers:{Cookie:login.cookie}})).status).toBe(400);
  env.GITHUB_ALLOWED_USER_ID='999';const other=await browserLogin();expect((await send('/auth/callback?state='+other.state+'&code=valid',{headers:{Cookie:other.cookie}})).status).toBe(403);
  await send('/auth/login?returnTo=https://evil.example');expect(sqlite.prepare('SELECT return_to FROM auth_states ORDER BY rowid DESC LIMIT 1').get()?.return_to).toBe('/');
 });
});
describe('actual Cloudflare OAuth provider and remote MCP',()=>{
 it('publishes discovery and challenges rather than accepting GitHub or forged access tokens',async()=>{
  const discovery=await send('/.well-known/oauth-authorization-server');expect(discovery.status).toBe(200);expect((await discovery.json() as any).issuer).toBe(origin);
  const metadata=await send('/.well-known/oauth-protected-resource/mcp');expect(metadata.status).toBe(200);expect((await metadata.json() as any).resource).toBe(origin+'/mcp');
  const challenge=await send('/mcp',{headers:{Authorization:'Bearer upstream-test-token'}});expect(challenge.status).toBe(401);expect(challenge.headers.get('WWW-Authenticate')).toContain('resource_metadata=');
 });
 it('requires consent cookie and upstream browser binding, refuses redirect tampering and plain PKCE',async()=>{
  const api=authorizationServer(origin).getOAuthApi(env);const client=await api.createClient({redirectUris:['http://localhost:9345/callback'],tokenEndpointAuthMethod:'none'});
  const base='/authorize?'+new URLSearchParams({response_type:'code',client_id:client.clientId!,redirect_uri:'http://localhost:9345/callback',code_challenge:'challenge',code_challenge_method:'plain',scope:'mcp:read'});
  expect((await send(base)).status).toBe(400);
  expect((await send('/authorize',{method:'POST',headers:{Origin:origin,'Content-Type':'application/x-www-form-urlencoded'},body:'handle=stolen&decision=allow'})).status).toBe(400);
  expect((await send(base.replace('plain','S256').replace(encodeURIComponent('http://localhost:9345/callback'),encodeURIComponent('https://evil.example/callback')))).status).toBe(400);
 });
 it('performs full consent/GitHub/code/token/MCP flow; rejects wrong verifier, code replay and wrong resource',async()=>{
  ghMock();
  const browser=await browserLogin();const browserCallback=await send('/auth/callback?state='+browser.state+'&code=valid',{headers:{Cookie:browser.cookie}});
  const body={anchor:{type:'verse-range',id:'Matt.28.19'},body:'Browser and remote MCP share this private note',tags:[],provenanceTag:'my-inference'};
  expect((await send('/api/notes',{method:'POST',headers:{Cookie:cookies(browserCallback),Origin:origin},body:JSON.stringify(body)})).status).toBe(201);
  const login=await mcpLogin();
  expect((await exchange(login.client.clientId!,login.code,'wrong-verifier')).status).toBe(400);
  const tokensResponse=await exchange(login.client.clientId!,login.code,login.verifier);expect(tokensResponse.status).toBe(200);
  const tokens=await tokensResponse.json() as any;expect(tokens.access_token).toBeTruthy();
  const response=await send('/mcp',{method:'POST',headers:{Authorization:'Bearer '+tokens.access_token,'Content-Type':'application/json',Accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'search_notes',arguments:{}}})});
  expect(response.status).toBe(200);expect(JSON.parse((await response.json() as any).result.content[0].text).data[0].body).toBe(body.body);
  expect(await new OAuthAuthorizationServer<OAuthEnv>({issuer:origin, resources:[origin+'/different'], clientIdMetadataDocumentEnabled:false}).validateToken(origin+'/different',tokens.access_token,env)).toBeNull();
  const discovery=await (await send('/.well-known/oauth-authorization-server')).json() as any;
  expect(discovery.revocation_endpoint).toBeTruthy();
  const revoke=await worker.fetch(new Request(discovery.revocation_endpoint,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token:tokens.access_token,client_id:login.client.clientId!})}),env,ctx);
  expect(revoke.status).toBe(200);expect((await send('/mcp',{headers:{Authorization:'Bearer '+tokens.access_token}})).status).toBe(401);
  expect((await exchange(login.client.clientId!,login.code,login.verifier)).status).toBe(400);
 });
 it('enforces mcp:read on a genuinely issued token and expires access tokens',async()=>{
  ghMock();const restricted=await mcpLogin('offline_access');const restrictedResponse=await exchange(restricted.client.clientId!,restricted.code,restricted.verifier);const restrictedTokens=await restrictedResponse.json() as any;
  const forbidden=await send('/mcp',{headers:{Authorization:'Bearer '+restrictedTokens.access_token}});expect(forbidden.status).toBe(403);expect(forbidden.headers.get('WWW-Authenticate')).toContain('insufficient_scope');
  const login=await mcpLogin();const response=await exchange(login.client.clientId!,login.code,login.verifier);const tokens=await response.json() as any;
  const now=Date.now();const spy=vi.spyOn(Date,'now').mockReturnValue(now+901000);
  try {expect((await send('/mcp',{headers:{Authorization:'Bearer '+tokens.access_token}})).status).toBe(401);} finally {spy.mockRestore();}
 });
 it('rotates refresh tokens without granting a broader scope or audience',async()=>{
  ghMock();const login=await mcpLogin();const tokens=await (await exchange(login.client.clientId!,login.code,login.verifier)).json() as any;
  const refreshed=await send('/oauth/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',client_id:login.client.clientId!,refresh_token:tokens.refresh_token,resource:origin+'/mcp',scope:'mcp:read'})});
  expect(refreshed.status).toBe(200);const next=await refreshed.json() as any;expect(next.access_token).not.toBe(tokens.access_token);expect(next.refresh_token).not.toBe(tokens.refresh_token);
  const verified=await authorizationServer(origin).validateToken(origin+'/mcp',next.access_token,env);expect(verified?.props).toMatchObject({id:40246541,login:'kadencartwright'});expect(verified?.scope).toContain('mcp:read');
 });

});
