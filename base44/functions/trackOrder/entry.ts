// Lets a customer follow their own order. Public by design: the random tracking code is the check.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import C from '../../shared/core.ts';

const rows = (x) => (Array.isArray(x) ? x : (x?.items || []));

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const { code } = await req.json().catch(() => ({}));
    if (typeof code !== 'string' || !/^[0-9a-f]{32}$/.test(code)) return Response.json({ error: 'Order not found' }, { status: 404 });
    const rec = rows(await base44.asServiceRole.entities.Order.filter({ track_code: code }))[0];
    if (!rec) return Response.json({ error: 'Order not found' }, { status: 404 });
    return Response.json(C.publicOrder(C.fromRecord(rec), code));
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Could not load the order' }, { status: 500 });
  }
}
