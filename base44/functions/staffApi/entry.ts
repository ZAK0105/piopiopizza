// The staff dashboard's backend. A signed-in user counts as staff when their e-mail is on the Staff list;
// an admin may act as any staff member. Drivers only ever reach deliveries that are free or their own.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import C from '../../shared/core.ts';

const rows = (x) => (Array.isArray(x) ? x : (x?.items || []));
const json = (body, status = 200) => Response.json(body, { status });
const none = (e) => (e?.status === 404 ? null : Promise.reject(e));

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e) => (e?.status === 401 || e?.status === 403 ? null : Promise.reject(e)));
    if (!user) return json({ error: 'Sign in required' }, 401);
    const body = await req.json().catch(() => ({}));
    const db = base44.asServiceRole.entities;
    const admin = user.role === 'admin';

    let me = null;
    if (admin && typeof body.as === 'string' && body.as) {
      me = await db.Staff.get(body.as).catch(none);
    } else {
      const email = String(user.email || '').toLowerCase();
      me = email ? rows(await db.Staff.filter({ email }))[0] || null : null;
    }
    if (me && me.active === false) me = null;
    const notStaff = `${user.email} is not on the staff list. Ask your manager to add this e-mail under Staff.`;

    if (body.op === 'me') {
      if (!me && !admin) return json({ error: notStaff }, 403);
      const staff = admin ? rows(await db.Staff.filter({ active: true })).map(C.staffView) : undefined;
      return json({ me: me && C.staffView(me), admin, auth: 'account', staff });
    }
    if (!me) return admin ? json({ error: 'Choose who you are working as' }, 400) : json({ error: notStaff }, 403);

    if (body.op === 'board') {
      const orders = rows(await db.Order.filter({ status: { $in: C.ACTIVE } }, '-placed_at', 500)).map(C.fromRecord);
      return json({ orders: C.staffBoard(orders, me), now: Date.now() });
    }
    if (body.op === 'act') {
      if (typeof body.id !== 'string' || !body.id) return json({ error: 'Order not found' }, 404);
      const rec = await db.Order.get(body.id).catch(none);
      if (!rec) return json({ error: 'Order not found' }, 404);
      const o = C.fromRecord(rec), change = C.staffAct(o, me, body.action);
      await db.Order.update(o.id, change);
      return json({ ok: true, status: change.status || o.status });
    }
    if (body.op === 'location') {
      const out = rows(await db.Order.filter({ status: 'out' }, '-placed_at', 100)).map(C.fromRecord);
      const ups = C.driverPosUpdates(out, me, { lat: body.lat, lng: body.lng });
      await Promise.all(ups.map(([o, ch]) => db.Order.update(o.id, ch)));
      return json({ updated: ups.length });
    }
    return json({ error: 'Unknown request' }, 400);
  } catch (error) {
    if (error instanceof C.Invalid) return json({ error: error.message }, error.status);
    console.error(error);
    return json({ error: 'Something went wrong' }, 500);
  }
}
