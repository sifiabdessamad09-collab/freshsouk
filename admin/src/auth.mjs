const cache = new Map();
export const fault = (status, message) => Object.assign(new Error(message), { status });

function decode(value) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw fault(401, 'Authentification requise.');
  const base = value.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base + '='.repeat((4 - base.length % 4) % 4)), c => c.charCodeAt(0));
}

async function keys(team, force = false) {
  const previous = cache.get(team);
  if (previous && ((!force && previous.expires > Date.now()) || (force && previous.fetched > Date.now()-60000))) return previous.keys;
  let response;
  try { response = await fetch(`https://${team}/cdn-cgi/access/certs`, { signal: AbortSignal.timeout(5000), redirect: 'error' }); }
  catch { throw fault(503, 'Service d’authentification indisponible.'); }
  if (!response.ok) throw fault(503, 'Service d’authentification indisponible.');
  let data;try { data=await response.json(); } catch { throw fault(503,'Service d’authentification indisponible.'); }
  if (!Array.isArray(data.keys) || data.keys.length > 20) throw fault(503, 'Service d’authentification indisponible.');
  if (cache.size >= 8) cache.delete(cache.keys().next().value);
  cache.set(team, { keys: data.keys, fetched:Date.now(), expires: Date.now() + 600000 });
  return data.keys;
}

export async function requireAdmin(request, env) {
  const team = env.ACCESS_TEAM_DOMAIN || '';
  const audience = env.ACCESS_AUD || '';
  const allow = (env.ADMIN_EMAILS || '').split(',').map(v => v.trim().toLowerCase()).filter(Boolean);
  if (!/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(team) || team.includes('REPLACE') ||
      !audience || audience.includes('REPLACE') || !allow.length) throw fault(503, 'Accès administrateur non configuré.');
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token || token.length > 16000) throw fault(401, 'Authentification requise.');
  let header, claims, parts;
  try {
    parts = token.split('.');
    if (parts.length !== 3) throw new Error();
    header = JSON.parse(new TextDecoder().decode(decode(parts[0])));
    claims = JSON.parse(new TextDecoder().decode(decode(parts[1])));
  } catch { throw fault(401, 'Authentification requise.'); }
  const now = Date.now() / 1000;
  if (header.alg !== 'RS256' || header.typ!=='JWT' || header.crit!==undefined || typeof header.kid !== 'string' || !header.kid || header.kid.length>200 ||
      claims.iss !== `https://${team}` || !Array.isArray(claims.aud) || !claims.aud.includes(audience) ||
      claims.type !== 'app' || typeof claims.email !== 'string' || typeof claims.sub !== 'string' || !claims.sub ||
      !Number.isFinite(claims.exp) || claims.exp <= now || !Number.isFinite(claims.iat) || claims.iat > now + 60 ||
      (claims.nbf !== undefined && (!Number.isFinite(claims.nbf) || claims.nbf > now + 60))) {
    throw fault(401, 'Authentification requise.');
  }
  let jwk = (await keys(team)).find(k => k.kid === header.kid && k.kty === 'RSA');
  if (!jwk) jwk = (await keys(team, true)).find(k => k.kid === header.kid && k.kty === 'RSA');
  if (!jwk) throw fault(401, 'Authentification requise.');
  try {
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    if (!await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, decode(parts[2]), new TextEncoder().encode(parts[0] + '.' + parts[1]))) throw new Error();
  } catch { throw fault(401, 'Authentification requise.'); }
  const email = claims.email.trim().toLowerCase();
  if (!allow.includes(email)) throw fault(403, 'Compte non autorisé.');
  return { email, expiresAt: new Date(claims.exp * 1000).toISOString() };
}

export function requireSameOrigin(request) {
  const expected = new URL(request.url).origin;
  const origin = request.headers.get('Origin');
  if (origin && origin !== expected || request.headers.get('Sec-Fetch-Site') === 'cross-site') throw fault(403, 'Origine refusée.');
  if (!['GET', 'HEAD'].includes(request.method)) {
    if (origin !== expected || request.headers.get('X-Freshsouk-Admin') !== '1' ||
        request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase()!=='application/json') throw fault(403, 'Requête administrateur refusée.');
  }
}
