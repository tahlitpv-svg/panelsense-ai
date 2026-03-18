import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import { createHmac, createHash } from 'node:crypto';

const SOLIS_KEY_ID = Deno.env.get("SOLIS_API_KEY_ID");
const SOLIS_KEY_SECRET = Deno.env.get("SOLIS_API_KEY_SECRET");
const SOLIS_BASE_URL = (Deno.env.get("SOLIS_API_URL") || "https://www.soliscloud.com:13333").replace(/\/$/, '');

function getGMTDate() { return new Date().toUTCString().replace('UTC', 'GMT'); }
function md5Base64(str) { return createHash('md5').update(str, 'utf8').digest('base64'); }
function hmacSHA1Base64(secret, str) { return createHmac('sha1', secret).update(str, 'utf8').digest('base64'); }
function buildHeaders(endpoint, bodyStr) {
  const date = getGMTDate();
  const contentType = 'application/json';
  const contentMD5 = md5Base64(bodyStr);
  const signStr = `POST\n${contentMD5}\n${contentType}\n${date}\n${endpoint}`;
  const sign = hmacSHA1Base64(SOLIS_KEY_SECRET, signStr);
  return { 'Content-Type': contentType, 'Content-MD5': contentMD5, 'Date': date, 'Authorization': `API ${SOLIS_KEY_ID}:${sign}` };
}
async function solisPost(endpoint, body) {
  const bodyStr = JSON.stringify(body);
  const headers = buildHeaders(endpoint, bodyStr);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(`${SOLIS_BASE_URL}${endpoint}`, { method: 'POST', headers, body: bodyStr, signal: controller.signal });
    return await res.json();
  } finally { clearTimeout(timeout); }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { inverterId, sn } = await req.json();
    const detailRes = await solisPost('/v1/api/inverterDetail', { id: inverterId, sn });
    const detail = detailRes?.data || {};

    // Return all keys matching pv pattern
    const pvKeys = {};
    for (const k of Object.keys(detail)) {
      if (/pv|pow|pac|mppt|temp|eday|eToday|e_today/i.test(k)) {
        pvKeys[k] = detail[k];
      }
    }
    return Response.json({ success: detailRes.success, pv_keys: pvKeys, all_keys: Object.keys(detail) });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});