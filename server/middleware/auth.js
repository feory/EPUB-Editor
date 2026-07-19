import { jwtVerify } from 'jose';
import { JWT_SECRET } from '../config.js';
import { corsHeaders } from '../response.js';

export const SECRET = new TextEncoder().encode(JWT_SECRET);

export async function requireAuth(req) {
  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return [null, new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })];
  }
  const token = authHeader.slice(7);
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return [payload, null];
  } catch {
    return [null, new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })];
  }
}

export function requireAdmin(user) {
  if (user.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: corsHeaders });
  }
  return null;
}
