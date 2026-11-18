import { CalendarDays } from 'lucide-react';
import { dateLabel, roleLabel, shiftHours } from '@/lib/shifts';

export default function OpenShiftList({ shifts, busy, onTake }) {
  if (!shifts.length) {
    return (
      <div className="rounded-2xl border border-border bg-card px-4 py-6 text-center">
        <p className="text-sm font-bold">Ingen ledige vakter nå</p>
        <p className="mt-1 text-xs text-muted-foreground">Nye ledige vakter dukker opp her.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {shifts.map((shift) => (
        <div key={shift.id} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3">
          <div className="grid h-11 w-11 flex-none place-items-center rounded-xl bg-accent/10 text-accent">
            <CalendarDays className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold capitalize">{dateLabel(shift.date)}</p>
            <p className="truncate text-xs text-muted-foreground">
              {shift.start_time}–{shift.end_time} · {roleLabel(shift.role)} · {shiftHours(shift).toFixed(1).replace('.0', '')} t
              {shift.notes ? ` · ${shift.notes}` : ''}
            </p>
          </div>
          <button
            onClick={() => onTake(shift)}
            disabled={busy}
            className="h-9 flex-none rounded-xl bg-primary px-3 text-xs font-bold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            Ta vakten
          </button>
        </div>
      ))}
    </div>
  );
}