import { stmt } from '../database.js';
import { corsHeaders, jsonResponse } from '../response.js';
import { requireAdmin } from '../middleware/auth.js';

export function listActivityLog(req, user) {
  const adminErr = requireAdmin(user);
  if (adminErr) return adminErr;
  return jsonResponse({ data: stmt.listActivityLog.all() }, req, corsHeaders);
}
