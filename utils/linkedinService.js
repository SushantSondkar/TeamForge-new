/**
 * LinkedIn OAuth Service for TeamForge
 * Confirms LinkedIn identity via OAuth 2.0 and assigns the honest "LinkedIn Linked" trust badge.
 */

const LINKEDIN_AUTH_URL = "https://www.linkedin.com/oauth/v2/authorization";
const LINKEDIN_TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";
const LINKEDIN_USERINFO_URL = "https://api.linkedin.com/v2/userinfo";

let customFetch = null;

/**
 * Returns the active fetch implementation (custom injected or global)
 */
function getFetch() {
  return customFetch || globalThis.fetch;
}

/**
 * Allows injecting a fake or custom fetch function (for unit and integration tests)
 */
function setFetch(fn) {
  customFetch = fn;
}

/**
 * Returns LinkedIn OAuth authorization URL
 */
function getAuthorizationUrl(state, redirectUri) {
  const clientId = process.env.LINKEDIN_CLIENT_ID || "";
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri || "http://localhost:8080/auth/linkedin/callback",
    state: state || "teamforge_linkedin_oauth_state",
    scope: "openid profile email"
  });
  return `${LINKEDIN_AUTH_URL}?${params.toString()}`;
}

/**
 * Exchanges OAuth authorization code for access token
 */
async function exchangeCodeForToken(code, redirectUri) {
  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("LinkedIn OAuth credentials (LINKEDIN_CLIENT_ID / LINKEDIN_CLIENT_SECRET) are missing.");
  }

  const params = new URLSearchParams({
    grant_type: "authorization_code",
    code: code,
    redirect_uri: redirectUri || "http://localhost:8080/auth/linkedin/callback",
    client_id: clientId,
    client_secret: clientSecret
  });

  const fetchFn = getFetch();
  const res = await fetchFn(LINKEDIN_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: params.toString()
  });

  const data = await res.json();
  if (data.error) {
    throw new Error(data.error_description || data.error);
  }

  return data;
}

/**
 * Fetches basic profile info to verify identity and obtain vanity/name
 */
async function fetchUserInfo(accessToken) {
  const fetchFn = getFetch();
  const res = await fetchFn(LINKEDIN_USERINFO_URL, {
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Accept": "application/json"
    }
  });

  if (!res.ok) {
    throw new Error(`LinkedIn userinfo request failed with status ${res.status}`);
  }

  return await res.json();
}

module.exports = {
  getAuthorizationUrl,
  exchangeCodeForToken,
  fetchUserInfo,
  setFetch
};
