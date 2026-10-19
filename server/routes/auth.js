import { SignJWT } from 'jose';
import { createHash, randomBytes } from 'crypto';
import { db, stmt } from '../database.js';
import { corsHeaders } from '../response.js';
import { loginRateLimit } from '../middleware/rateLimit.js';
import { SECRET, requireAuth, requireAdmin } from '../middleware/auth.js';
import { logActivity, actorFromUser } from '../log-activity.js';
import { displayName } from '../display-name.js';

const COOKIE_SECURE = Bun.env.COOKIE_SECURE === 'true';
const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;
const VALID_ROLES = new Set(['admin', 'user']);

function sha256Hex(str) {
  return createHash('sha256').update(str).digest('hex');
}

function getRefreshCookie(req) {
  const header = req.headers.get('cookie') ?? '';
  const match = header.match(/(?:^|;\s*)refresh_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

async function signAccessToken(user) {
  return new SignJWT({ sub: String(user.id), email: user.email, role: user.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(SECRET);
}

function makeRefreshCookie(token, maxAge) {
  const secure = COOKIE_SECURE ? '; Secure' : '';
  return `refresh_token=${encodeURIComponent(token)}; HttpOnly${secure}; SameSite=Strict; Path=/api/auth/refresh; Max-Age=${maxAge}`;
}

function issueRefreshToken(userId) {
  const rawToken = randomBytes(32).toString('hex');
  const tokenHash = sha256Hex(rawToken);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000)
    .toISOString().replace('T', ' ').slice(0, 19);
  stmt.insertRefreshToken.run(userId, tokenHash, expiresAt);
  return rawToken;
}

const MAX_NAME = 60;
const cleanName = (v) => (typeof v === 'string' ? v.trim().slice(0, MAX_NAME) : '');
// Forma que o cliente guarda como utilizador autenticado.
const publicUser = (u) => ({ id: u.id, email: u.email, role: u.role, first_name: u.first_name ?? null, last_name: u.last_name ?? null, name: displayName(u) });

async function authSuccessResponse(user) {
  const accessToken = await signAccessToken(user);
  const rawRefresh = issueRefreshToken(user.id);
  return new Response(
    JSON.stringify({ accessToken, user: publicUser(user) }),
    {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Set-Cookie': makeRefreshCookie(rawRefresh, REFRESH_TOKEN_TTL_SECONDS),
      },
    }
  );
}

export async function login(req) {
  const limited = loginRateLimit(req, corsHeaders);
  if (limited) return limited;

  let body;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: corsHeaders });
  }
  const { email, password } = body ?? {};
  if (!email || !password) {
    return new Response(JSON.stringify({ error: 'Email and password required' }), { status: 400, headers: corsHeaders });
  }

  const user = stmt.getUserByEmail.get(email);
  if (!user || !(await Bun.password.verify(password, user.password))) {
    logActivity({ userId: null, userEmail: email }, 'login_failed',
      { meta: { reason: user ? 'wrong_password' : 'unknown_email' }, req });
    return new Response(JSON.stringify({ error: 'Invalid credentials' }), { status: 401, headers: corsHeaders });
  }

  logActivity({ userId: user.id, userEmail: user.email }, 'login_success', { req });
  return authSuccessResponse(user);
}

// POST /api/auth/password { currentPassword, newPassword } — o próprio utilizador muda a sua palavra-passe.
// Termina as outras sessões (refresh tokens) e devolve uma sessão nova para esta.
export async function changePassword(req, user) {
  const limited = loginRateLimit(req, corsHeaders); // a atual pode ser adivinhada: mesmo limite do login
  if (limited) return limited;
  const fail = (error, status = 400) => new Response(JSON.stringify({ error }), { status, headers: corsHeaders });

  let body;
  try { body = await req.json(); } catch { return fail('Invalid JSON'); }
  const { currentPassword, newPassword } = body ?? {};
  if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') return fail('Missing fields');
  if (newPassword.length < 12) return fail('Password must be at least 12 characters');
  if (newPassword === currentPassword) return fail('New password must differ from the current one');

  const id = Number(user.sub);
  const row = stmt.getPasswordHashById.get(id);
  // 403 e não 401: o cliente trata 401 como sessão expirada (refresh/logout).
  if (!row || !(await Bun.password.verify(currentPassword, row.password))) {
    logActivity(actorFromUser(user), 'password_change_failed', { req });
    return fail('Current password is wrong', 403);
  }

  stmt.setPassword.run(await Bun.password.hash(newPassword), id);
  stmt.deleteUserTokens.run(id);
  logActivity(actorFromUser(user), 'password_change', { req });
  return authSuccessResponse(stmt.getUserById.get(id));
}

export async function refresh(req) {
  const rawToken = getRefreshCookie(req);
  if (!rawToken) {
    return new Response(JSON.stringify({ error: 'No refresh token' }), { status: 401, headers: corsHeaders });
  }

  const tokenHash = sha256Hex(rawToken);
  const record = stmt.getRefreshToken.get(tokenHash);
  if (!record) {
    return new Response(JSON.stringify({ error: 'Invalid or expired refresh token' }), { status: 401, headers: corsHeaders });
  }

  stmt.deleteRefreshToken.run(tokenHash);

  const user = stmt.getUserById.get(record.user_id);
  if (!user) {
    return new Response(JSON.stringify({ error: 'User not found' }), { status: 401, headers: corsHeaders });
  }

  return authSuccessResponse(user);
}

export async function logout(req) {
  const rawToken = getRefreshCookie(req);
  if (rawToken) {
    const tokenHash = sha256Hex(rawToken);
    const record = stmt.getRefreshToken.get(tokenHash);
    stmt.deleteRefreshToken.run(tokenHash);
    if (record) {
      const u = stmt.getUserById.get(record.user_id);
      logActivity({ userId: record.user_id, userEmail: u?.email ?? null }, 'logout', { req });
    }
  }
  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders,
      'Set-Cookie': makeRefreshCookie('', 0),
    },
  });
}

export async function me(user) {
  const dbUser = stmt.getUserById.get(Number(user.sub));
  if (!dbUser) {
    return new Response(JSON.stringify({ error: 'User not found' }), { status: 404, headers: corsHeaders });
  }
  return Response.json({ data: dbUser }, { headers: corsHeaders });
}

// PUT /api/auth/profile { firstName, lastName } — o próprio utilizador define o seu nome (vazio = voltar ao email).
export async function updateProfile(req, user) {
  let body;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: corsHeaders });
  }
  const id = Number(user.sub);
  stmt.setUserName.run(cleanName(body?.firstName) || null, cleanName(body?.lastName) || null, id);
  return Response.json({ data: stmt.getUserById.get(id) }, { headers: corsHeaders });
}

export async function listUsers(req, user) {
  const adminErr = requireAdmin(user);
  if (adminErr) return adminErr;
  return Response.json({ data: stmt.listUsers.all() }, { headers: corsHeaders });
}

// Leve, sem gate de admin — usado pelo modal de partilha (só id+email, nunca role/password).
export async function listBasicUsers(user) {
  return Response.json({ data: stmt.listBasicUsers.all().filter(u => u.id !== Number(user.sub)) }, { headers: corsHeaders });
}

export async function createUser(req, user) {
  const adminErr = requireAdmin(user);
  if (adminErr) return adminErr;

  let body;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: corsHeaders });
  }
  const { email, password, role = 'user' } = body ?? {};
  const firstName = cleanName(body?.firstName), lastName = cleanName(body?.lastName);
  if (!email || !password) {
    return new Response(JSON.stringify({ error: 'Email and password required' }), { status: 400, headers: corsHeaders });
  }
  if (password.length < 12) {
    return new Response(JSON.stringify({ error: 'Password must be at least 12 characters' }), { status: 400, headers: corsHeaders });
  }
  if (!VALID_ROLES.has(role)) {
    return new Response(JSON.stringify({ error: 'Invalid role' }), { status: 400, headers: corsHeaders });
  }

  const existing = stmt.getUserByEmail.get(email);
  if (existing) {
    return new Response(JSON.stringify({ error: 'Email already in use' }), { status: 409, headers: corsHeaders });
  }

  const hash = await Bun.password.hash(password);
  const result = stmt.createUser.run(email, hash, role, firstName || null, lastName || null);
  logActivity(actorFromUser(user), 'user_create',
    { target: email, meta: { role }, req });
  return Response.json(
    { data: publicUser({ id: result.lastInsertRowid, email, role, first_name: firstName, last_name: lastName }) },
    { status: 201, headers: corsHeaders }
  );
}

export async function deleteUser(req, user, targetId) {
  const adminErr = requireAdmin(user);
  if (adminErr) return adminErr;

  const id = Number(targetId);
  if (isNaN(id)) {
    return new Response(JSON.stringify({ error: 'Invalid user id' }), { status: 400, headers: corsHeaders });
  }
  if (id === Number(user.sub)) {
    return new Response(JSON.stringify({ error: 'Cannot delete your own account' }), { status: 400, headers: corsHeaders });
  }

  const target = stmt.getUserById.get(id);
  if (!target) {
    return new Response(JSON.stringify({ error: 'User not found' }), { status: 404, headers: corsHeaders });
  }
  if (target.role === 'admin') {
    return new Response(JSON.stringify({ error: 'Cannot delete admin users' }), { status: 400, headers: corsHeaders });
  }

  db.transaction(() => {
    db.run('UPDATE ebooks SET user_id = ? WHERE user_id = ?', [Number(user.sub), id]);
    stmt.deleteUserTokens.run(id);
    stmt.deleteUser.run(id);
    logActivity(actorFromUser(user), 'user_delete',
      { target: target.email, meta: { deletedUserId: id, role: target.role }, req });
  })();
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function updateUser(req, user, targetId) {
  const adminErr = requireAdmin(user);
  if (adminErr) return adminErr;

  const id = Number(targetId);
  if (isNaN(id)) {
    return new Response(JSON.stringify({ error: 'Invalid user id' }), { status: 400, headers: corsHeaders });
  }

  const target = stmt.getUserById.get(id);
  if (!target) {
    return new Response(JSON.stringify({ error: 'User not found' }), { status: 404, headers: corsHeaders });
  }

  let body;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: corsHeaders });
  }
  const { email, password, role } = body ?? {};

  if (role && id === Number(user.sub) && role !== user.role) {
    return new Response(JSON.stringify({ error: 'Cannot change your own role' }), { status: 400, headers: corsHeaders });
  }
  if (role && !VALID_ROLES.has(role)) {
    return new Response(JSON.stringify({ error: 'Invalid role' }), { status: 400, headers: corsHeaders });
  }
  if (password && password.length < 12) {
    return new Response(JSON.stringify({ error: 'Password must be at least 12 characters' }), { status: 400, headers: corsHeaders });
  }
  if (email) {
    const existing = stmt.getUserByEmail.get(email);
    if (existing && existing.id !== id) {
      return new Response(JSON.stringify({ error: 'Email already in use' }), { status: 409, headers: corsHeaders });
    }
  }

  const sets = [];
  if (email)    sets.push('email = ?');
  if (password) sets.push('password = ?');
  if (role)     sets.push('role = ?');

  const hasNames = body?.firstName !== undefined || body?.lastName !== undefined;
  if (hasNames) {
    sets.push('first_name = ?', 'last_name = ?');
  }

  if (sets.length === 0) {
    return new Response(JSON.stringify({ error: 'Nothing to update' }), { status: 400, headers: corsHeaders });
  }

  const params = [];
  if (email)    params.push(email);
  if (password) params.push(await Bun.password.hash(password));
  if (role)     params.push(role);
  if (hasNames) params.push(cleanName(body.firstName) || null, cleanName(body.lastName) || null);
  params.push(id);

  db.run(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, params);

  if (password) stmt.deleteUserTokens.run(id);

  const updated = stmt.getUserById.get(id);
  logActivity(actorFromUser(user), 'user_update', {
    target: updated.email,
    meta: {
      targetUserId: id,
      emailChanged: !!email && email !== target.email,
      roleChanged: role && role !== target.role ? { from: target.role, to: role } : undefined,
      passwordChanged: !!password,
    },
    req,
  });
  return Response.json({ data: updated }, { headers: corsHeaders });
}
