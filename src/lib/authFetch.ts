/**
 * Auth-aware fetch wrapper for the PicoBot frontend.
 * 
 * On first call, it fetches the auth token from /api/auth-token (localhost-only).
 * All subsequent fetch calls include the token as an Authorization header.
 */

let cachedToken: string | null = null;
let tokenFetchPromise: Promise<string | null> | null = null;

async function getAuthToken(): Promise<string | null> {
    if (cachedToken) return cachedToken;

    // Deduplicate concurrent token fetches
    if (tokenFetchPromise) return tokenFetchPromise;

    tokenFetchPromise = (async () => {
        try {
            const res = await fetch('/api/auth-token');
            if (res.ok) {
                const data = await res.json();
                cachedToken = data.token || null;
                return cachedToken;
            }
        } catch (e) {
            console.warn('Failed to fetch auth token:', e);
        }
        return null;
    })();

    const token = await tokenFetchPromise;
    tokenFetchPromise = null;
    return token;
}

/**
 * Drop-in replacement for fetch() that automatically injects the auth token.
 * Usage: import { authFetch } from '@/lib/authFetch'; then use authFetch(url, options).
 */
export async function authFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const token = await getAuthToken();

    const headers = new Headers(init?.headers || {});
    if (token) {
        headers.set('Authorization', `Bearer ${token}`);
    }

    return fetch(input, {
        ...init,
        headers,
    });
}

export default authFetch;
