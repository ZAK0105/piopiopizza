// Guest checkout: prices and validates the order on the server, then stores it.
// Public by design — anything the caller says about money is ignored.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import M from '../../shared/menu.ts';
import C from '../../shared/core.ts';

const rows = (x) => (Array.isArray(x) ? x : (x?.items || []));

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const db = base44.asServiceRole.entities;
    const body = await req.json().catch(() => ({}));
    const cfg = rows(await db.StoreConfig.list())[0] || {};
    let order;
    try {
      order = C.priceOrder(M, cfg.overrides, cfg, body);
    } catch (e) {
      if (e instanceof C.Invalid) return Response.json({ error: e.message }, { status: e.status });
      throw e;
    }
    const count = await db.Order.count();
    order.number = 'PP-' + (1001 + count);
    const code = crypto.randomUUID().replace(/-/g, '');
    await db.Order.create({ ...C.toRecord(order), track_code: code });
    return Response.json(C.publicOrder(order, code), { status: 201 });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Could not place the order' }, { status: 500 });
  }
}
