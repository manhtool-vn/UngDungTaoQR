/* Đăng nhập Google: OAuth 2.0 Authorization Code + PKCE (OpenID Connect).
   Biến môi trường (.env) luôn được ưu tiên hơn cài đặt trong trang quản trị. */
'use strict';
const crypto = require('node:crypto');

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';

const sha256 = (s) => crypto.createHash('sha256').update(s).digest();

class GoogleError extends Error {}

function createGoogleService({ config, db, fetch, log }) {
  const env = config.env;
  const hasEnv = (k) => env[k] != null && String(env[k]).trim() !== '';

  function settings() {
    const s = db.data.settings;
    const clientId = hasEnv('GOOGLE_CLIENT_ID') ? String(env.GOOGLE_CLIENT_ID).trim() : s.googleClientId || '';
    const clientSecret = hasEnv('GOOGLE_CLIENT_SECRET') ? String(env.GOOGLE_CLIENT_SECRET).trim() : s.googleClientSecret || '';
    const enabled = hasEnv('GOOGLE_LOGIN_ENABLED') ? env.GOOGLE_LOGIN_ENABLED === 'true' : s.googleLoginEnabled !== false;
    const redirectUri = hasEnv('GOOGLE_REDIRECT_URI') ? String(env.GOOGLE_REDIRECT_URI).trim() : config.publicUrl + '/api/auth/google/callback';
    return {
      clientId, clientSecret, enabled, redirectUri, ready: !!(enabled && clientId && clientSecret),
      fromEnv: { clientId: hasEnv('GOOGLE_CLIENT_ID'), clientSecret: hasEnv('GOOGLE_CLIENT_SECRET'), enabled: hasEnv('GOOGLE_LOGIN_ENABLED'), redirectUri: hasEnv('GOOGLE_REDIRECT_URI') }
    };
  }

  // Địa chỉ chuyển sang Google, kèm state chống giả mạo và code_challenge (PKCE)
  function authUrl(state, verifier) {
    const g = settings();
    const params = new URLSearchParams({
      client_id: g.clientId, redirect_uri: g.redirectUri, response_type: 'code', scope: 'openid email profile',
      state, code_challenge: sha256(verifier).toString('base64url'), code_challenge_method: 'S256', prompt: 'select_account'
    });
    return AUTH_URL + '?' + params;
  }

  // Đổi code lấy token rồi lấy hồ sơ người dùng trực tiếp từ Google qua HTTPS
  async function exchange(code, verifier) {
    const g = settings();
    let token;
    try {
      const res = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code, client_id: g.clientId, client_secret: g.clientSecret, redirect_uri: g.redirectUri,
          grant_type: 'authorization_code', code_verifier: verifier
        }).toString()
      });
      token = await res.json();
      if (!res.ok || !token.access_token) {
        log('[google] Đổi code thất bại:', token.error, token.error_description);
        throw new GoogleError(
          token.error === 'invalid_client' ? 'Client ID hoặc Client secret của Google không đúng'
            : token.error === 'redirect_uri_mismatch' ? 'Redirect URI chưa được khai báo trong Google Cloud Console'
              : 'Không xác thực được với Google, vui lòng thử lại');
      }
      const info = await fetch(USERINFO_URL, { headers: { Authorization: 'Bearer ' + token.access_token } });
      if (!info.ok) throw new GoogleError('Không lấy được thông tin tài khoản Google');
      return await info.json();
    } catch (e) {
      if (e instanceof GoogleError) throw e;
      log('[google] Lỗi kết nối:', e.message);
      throw new GoogleError('Không kết nối được tới Google, vui lòng thử lại');
    }
  }

  return { settings, authUrl, exchange, GoogleError };
}

module.exports = { createGoogleService, GoogleError };
