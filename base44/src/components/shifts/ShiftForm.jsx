import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ROLES } from '@/lib/shifts';

const field = 'h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary';
const label = 'text-[11px] font-bold uppercase tracking-wider text-muted-foreground';

export default function ShiftForm({ staff, defaultDate, busy, onSubmit, onCancel }) {
  const [form, setForm] = useState({
    employee_id: '',
    date: defaultDate,
    start_time: '16:00',
    end_time: '22:00',
    role: 'kitchen',
    notes: '',
  });
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const pickPerson = (e) => {
    const person = staff.find((s) => s.id === e.target.value);
    setForm((f) => ({ ...f, employee_id: e.target.value, role: person ? (person.role === 'driver' ? 'driver' : 'kitchen') : f.role }));
  };

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onSubmit(form); }}
      className="space-y-3 rounded-2xl border border-border bg-card p-4"
    >
      <p className="text-sm font-bold">Ny vakt</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 sm:col-span-2">
          <span className={label}>Hvem</span>
          <select value={form.employee_id} onChange={pickPerson} className={field}>
            <option value="">Ledig vakt – ingen ansatt</option>
            {staff.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className={label}>Dato</span>
          <input type="date" required value={form.date} onChange={set('date')} className={field} />
        </label>
        <label className="space-y-1">
          <span className={label}>Rolle</span>
          <select value={form.role} onChange={set('role')} className={field}>
            {Object.entries(ROLES).map(([key, role]) => <option key={key} value={key}>{role.label}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className={label}>Fra</span>
          <input type="time" required value={form.start_time} onChange={set('start_time')} className={field} />
        </label>
        <label className="space-y-1">
          <span className={label}>Til</span>
          <input type="time" required value={form.end_time} onChange={set('end_time')} className={field} />
        </label>
        <label className="space-y-1 sm:col-span-2">
          <span className={label}>Notat (valgfritt)</span>
          <input value={form.notes} onChange={set('notes')} placeholder="Ekstra folk til fredag" className={field} />
        </label>
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={busy} className="h-10 flex-1 rounded-xl font-bold">
          {busy ? 'Lagrer…' : 'Lagre vakt'}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel} className="h-10 rounded-xl font-bold">
          Avbryt
        </Button>
      </div>
    </form>
  );
}