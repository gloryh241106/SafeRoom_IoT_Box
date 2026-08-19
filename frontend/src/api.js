/**
 * Authenticated fetch boundary for protected Safebox API routes.
 *
 * URLs remain relative so Vite's development proxy and a production same-origin
 * reverse proxy can use the same code. Response parsing and `res.ok` handling
 * stay with each page because endpoint payloads are intentionally different.
 */
export function apiFetch(input, options = {}) {
  // Read at call time so login/logout changes do not leave a stale cached token.
  const token = localStorage.getItem('safebox_token');
  // Clone the caller's headers rather than mutating its options object.
  const headers = new Headers(options.headers || {});

  // Preserve caller headers while injecting the latest token at request time;
  // this avoids a stale module-level token after login or logout.
  if (token) headers.set('Authorization', `Bearer ${token}`);

  // Spread options first, then replace headers with the authenticated copy.
  return fetch(input, {
    ...options,
    headers
  });
}
