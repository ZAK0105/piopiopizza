// Connects the Pio Pio front-ends (app.js, admin.js) to Base44: entities, backend functions and sign-in.
// It offers the same operations the stand-alone Node server does, so both front-ends run unchanged.
import { base44 } from '@/api/base44Client';
import M from './menu.js';
import C from './core.js';

const TZ = 'Europe/Oslo';
const { Order, StoreConfig } = base44.entities;
const rows = (x) => (Array.isArray(x) ? x : (x?.items || []));
const fail = (status, message) => Object.assign(new Error(message), { status });
const sdkError = (e) => fail(e?.response?.status || e?.status || 500, e?.response?.data?.error || e?.data?.error || e?.message || 'Request failed');
const guard = (p) => p.catch((e) => { throw e instanceof C.Invalid ? e : sdkError(e); });

// ---- store config: one record holding settings and menu overrides ----
const getConfig = async () => rows(await StoreConfig.list())[0] || null;
async function saveConfig(patch) {
  const cfg = await getConfig();
  return cfg ? StoreConfig.update(cfg.id, patch) : StoreConfig.create({ ...C.DEFAULT_SETTINGS, overrides: {}, ...patch });
}
const settingsOf = (cfg) => { const s = { ...C.DEFAULT_SETTINGS }; for (const k of Object.keys(s)) if (cfg?.[k] != null) s[k] = cfg[k]; return s; };

// ---- customer ----
const invoke = (name, body) => base44.functions.invoke(name, body).then((r) => r.data).catch((e) => { throw sdkError(e); });
const menu = async () => { const cfg = await getConfig(); return C.publicMenu(M, cfg?.overrides, settingsOf(cfg)); };
const placeOrder = (body) => invoke('placeOrder', body);
const order = (code) => invoke('trackOrder', { code });

// ---- admin ----
let live = null, muted = false;
const known = new Map(); // order id -> last status passed to the dashboard
function emit(o, isNew) {
  if (!live || muted) return;
  const seen = known.get(o.id);
  if (seen === o.status) return;
  known.set(o.id, o.status);
  live.order({ type: isNew && seen === undefined ? 'new' : 'update', order: o });
}
const countOrders = async (q = {}) => { try { return await Order.count(q); } catch (e) { return rows(await Order.filter(q, '-placed_at', 500)).length; } };
async function ordersSince(since) {
  const all = [];
  for (let skip = 0; skip < 10000; skip += 500) {
    const page = rows(await Order.filter({ placed_at: { $gte: since } }, '-placed_at', 500, skip));
    all.push(...page.map(C.fromRecord));
    if (page.length < 500) break;
  }
  return all;
}
async function activeOrders() { return rows(await Order.filter({ status: { $in: C.ACTIVE } }, '-placed_at', 500)).map(C.fromRecord); }

async function adminApi(method, url, body) {
  const [path, qs] = url.split('?'), q = new URLSearchParams(qs || ''), seg = path.split('/');
  if (path === 'logout') { base44.auth.logout(window.location.href); return {}; }
  const user = await base44.auth.me().catch(() => null);
  if (!user) throw fail(401, 'Sign in required');
  if (user.role !== 'admin') throw fail(403, `${user.email} is not an admin of this app.`);

  if (path === 'me') return { ok: true, tz: TZ, targetMin: C.TARGET_MIN };
  if (path === 'orders') {
    const f = q.get('filter') || 'active', text = (q.get('q') || '').toLowerCase(), limit = Math.min(+q.get('limit') || 200, 500);
    let list = f === 'active' ? await activeOrders()
      : rows(await Order.filter(f === 'done' || f === 'cancelled' ? { status: f } : {}, '-placed_at', 500)).map(C.fromRecord);
    if (text) list = list.filter((o) => o.number.toLowerCase().includes(text) || o.address.toLowerCase().includes(text));
    if (f === 'active') for (const o of list) known.set(o.id, o.status);
    const total = text || f !== 'all' ? list.length : await countOrders();
    return { total, orders: list.slice(0, limit) };
  }
  if (seg[0] === 'orders' && seg[1] && method === 'PATCH') {
    const o = C.fromRecord(await Order.get(seg[1]));
    const change = C.transition(o, body.action);
    await Order.update(o.id, change);
    Object.assign(o, change); emit(o, false);
    return o;
  }
  if (path === 'stats') {
    const days = +q.get('days') || 7;
    const [orders, active] = await Promise.all([ordersSince(C.statsSince(days)), countOrders({ status: { $in: C.ACTIVE } })]);
    return { ...C.stats(M, orders, days, TZ), active };
  }
  if (path === 'catalog') return C.catalog(M, (await getConfig())?.overrides);
  if (seg[0] === 'catalog' && seg[1] && method === 'PATCH') {
    const overrides = { ...(await getConfig())?.overrides };
    const item = C.catalog(M, overrides).find((c) => c.id === seg[1]);
    if (!item) throw fail(404, 'Unknown item');
    const o = C.patchOverride(item, overrides[item.id], body);
    if (Object.keys(o).length) overrides[item.id] = o; else delete overrides[item.id];
    await saveConfig({ overrides });
    const updated = C.catalog(M, overrides).find((c) => c.id === item.id);
    live?.catalog(updated);
    return updated;
  }
  if (path === 'settings') {
    if (method === 'PATCH') await saveConfig(C.patchSettings(body));
    return settingsOf(await getConfig());
  }
  if (path === 'demo' && method === 'POST') {
    const cfg = await getConfig(), ov = cfg?.overrides, st = settingsOf(cfg);
    let next = 1001 + await countOrders();
    if (body.action === 'order') {
      const o = C.priceOrder(M, ov, st, C.randomBody(M), { demo: true, force: true });
      o.number = 'PP-' + next;
      const rec = await Order.create(C.toRecord(o));
      const made = C.fromRecord(rec); emit(made, true);
      return made;
    }
    if (body.action === 'seed') {
      const list = C.demoHistory(M, ov, st, TZ).map((o) => C.toRecord({ ...o, number: 'PP-' + next++ }));
      muted = true;
      try { for (let i = 0; i < list.length; i += 100) await Order.bulkCreate(list.slice(i, i + 100)); }
      finally { muted = false; }
      live?.reload();
      return { created: list.length };
    }
    if (body.action === 'clear') {
      const removed = await countOrders({ demo: true });
      muted = true;
      try { for (let i = 0; i < 50 && await countOrders({ demo: true }) > 0; i++) await Order.deleteMany({ demo: true }); }
      finally { muted = false; }
      live?.reload();
      return { removed };
    }
  }
  throw fail(404, 'Not found');
}

// Live updates: realtime subscription, with a slow poll as a safety net. Returns a function that stops both.
function connect(handlers) {
  live = handlers; live.open();
  let unsub = () => {};
  try { unsub = Order.subscribe((ev) => { if (ev.type !== 'delete' && ev.data?.number) emit(C.fromRecord({ ...ev.data, id: ev.data.id || ev.id }), ev.type === 'create'); }); }
  catch (e) { /* polling below still covers it */ }
  let first = true;
  const poll = async () => {
    try {
      const list = await activeOrders(), ids = new Set(list.map((o) => o.id));
      for (const o of list) { if (first) known.set(o.id, o.status); else emit(o, true); }
      // an order that left the active list was finished or cancelled elsewhere
      for (const [id, status] of known) if (C.ACTIVE.includes(status) && !ids.has(id)) { known.delete(id); if (!first) live?.reload(); }
      first = false; live?.open();
    } catch (e) { live?.error(); }
  };
  poll(); const timer = setInterval(poll, 10000);
  return () => { clearInterval(timer); unsub(); live = null; };
}

window.PIOPIO_MENU = M;
window.PP_CORE = C;
window.PP_BACKEND = {
  menu, placeOrder, order,
  api: (method, url, body) => guard(adminApi(method, url, body)),
  connect,
  login: () => base44.auth.redirectToLogin(window.location.href),
};
