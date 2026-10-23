/* JWT HS256 tự viết bằng node:crypto (không cần thư viện).
   Chỉ chấp nhận đúng thuật toán HS256 (chặn kiểu tấn công "alg: none"), so chữ ký theo thời gian không đổi,
   kiểm tra exp / nbf / iss / aud. */
'use strict';
const crypto = require('node:crypto');

const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
const hmac = (data, secret) => crypto.createHmac('sha256', secret).update(data).digest();

class JwtError extends Error {
  constructor(code) { super('jwt ' + code); this.code = code; }
}

function sign(payload, secret, opts) {
  opts = opts || {};
  const now = Math.floor((opts.now || Date.now()) / 1000);
  const body = Object.assign({}, payload, { iat: now, exp: now + (opts.expiresIn || 900) });
  if (opts.issuer) body.iss = opts.issuer;
  if (opts.audience) body.aud = opts.audience;
  if (opts.jti !== false) body.jti = crypto.randomBytes(9).toString('base64url');
  const head = b64({ alg: 'HS256', typ: 'JWT' }) + '.' + b64(body);
  return head + '.' + hmac(head, secret).toString('base64url');
}

function verify(token, secret, opts) {
  opts = opts || {};
  if (typeof token !== 'string' || token.length > 4096) throw new JwtError('malformed');
  const parts = token.split('.');
  if (parts.length !== 3) throw new JwtError('malformed');
  let header, payload;
  try {
    header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch (e) { throw new JwtError('malformed'); }
  if (!header || header.alg !== 'HS256') throw new JwtError('bad_alg');
  const expected = hmac(parts[0] + '.' + parts[1], secret);
  const given = Buffer.from(parts[2], 'base64url');
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) throw new JwtError('bad_signature');
  if (!payload || typeof payload !== 'object') throw new JwtError('malformed');
  const now = Math.floor((opts.now || Date.now()) / 1000);
  const skew = opts.clockSkew == null ? 30 : opts.clockSkew;
  if (typeof payload.exp !== 'number' || now > payload.exp + skew) throw new JwtError('expired');
  if (typeof payload.nbf === 'number' && now + skew < payload.nbf) throw new JwtError('not_yet_valid');
  if (opts.issuer && payload.iss !== opts.issuer) throw new JwtError('bad_claims');
  if (opts.audience && payload.aud !== opts.audience) throw new JwtError('bad_claims');
  return payload;
}

module.exports = { sign, verify, JwtError };
