/**
 * Auth helper for internal admin API routes.
 * All protected routes must call requireAdminToken(req) and return early
 * if the result is a Response (401).
 */

export function requireAdminToken(req: Request): Response | null {
  const token = process.env.INTERNAL_ADMIN_TOKEN;

  if (!token) {
    // Misconfiguration — fail closed
    return new Response(
      JSON.stringify({ error: 'Server misconfiguration: INTERNAL_ADMIN_TOKEN not set' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response(
      JSON.stringify({ error: 'Missing Authorization header' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const provided = authHeader.slice('Bearer '.length).trim();
  if (provided !== token) {
    return new Response(
      JSON.stringify({ error: 'Invalid token' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } },
    );
  }

  return null; // OK
}
