// Vaktlisten: innloggede ansatte ser månedens vakter og kan ta ledige vakter. Bare admin lager vakter.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { json, none, rows } from '../../shared/http.ts';

const ROLES = ['kitchen', 'driver', 'manager'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e) => (e?.status === 401 || e?.status === 403 ? null : Promise.reject(e)));
    if (!user) return json({ error: 'Du må logge inn for å se vaktlisten' }, 401);

    const body = await req.json().catch(() => ({}));
    const db = base44.asServiceRole.entities;
    const admin = user.role === 'admin';
    const email = String(user.email || '').toLowerCase();
    const name = user.full_name || user.email || 'Ansatt';

    if (body.op === 'board') {
      const from = String(body.from || ''), to = String(body.to || '');
      if (!DATE.test(from) || !DATE.test(to)) return json({ error: 'Ugyldig periode' }, 400);
      const shifts = rows(await db.Shift.filter({ date: { $gte: from, $lte: to } }, 'date', 500));
      const staff = admin
        ? rows(await db.Staff.filter({ active: true }, 'name', 100)).map((s) => ({ id: s.id, name: s.name, email: s.email || '', role: s.role }))
        : [];
      return json({ admin, me: { id: user.id, name, email }, shifts, staff });
    }

    if (body.op === 'take') {
      const id = typeof body.id === 'string' ? body.id : '';
      if (!id) return json({ error: 'Fant ikke vakten' }, 400);
      const rec = await db.Shift.get(id).catch(none);
      if (!rec) return json({ error: 'Fant ikke vakten' }, 404);
      if (rec.employee_name || rec.employee_email) return json({ error: 'Noen har allerede tatt denne vakten' }, 409);
      const shift = await db.Shift.update(rec.id, { employee_id: user.id, employee_name: name, employee_email: email });
      return json({ shift });
    }

    if (body.op === 'create') {
      if (!admin) return json({ error: 'Bare administratorer kan lage vakter' }, 403);
      const date = String(body.date || ''), start = String(body.start_time || '');
      const end = String(body.end_time || ''), role = String(body.role || 'kitchen');
      if (!DATE.test(date) || !TIME.test(start) || !TIME.test(end) || !ROLES.includes(role) || start === end)
        return json({ error: 'Fyll ut dato, start og slutt' }, 400);
      const who = typeof body.employee_id === 'string' && body.employee_id
        ? rows(await db.Staff.filter({ id: body.employee_id }))[0] || null
        : null;
      const shift = await db.Shift.create({
        date,
        start_time: start,
        end_time: end,
        role,
        employee_id: who ? who.id : '',
        employee_name: who ? who.name : '',
        employee_email: who && who.email ? String(who.email).toLowerCase() : '',
        notes: String(body.notes || ''),
      });
      return json({ shift });
    }

    return json({ error: 'Ukjent forespørsel' }, 400);
  } catch (error) {
    console.error(error);
    return json({ error: 'Noe gikk galt' }, 500);
  }
}