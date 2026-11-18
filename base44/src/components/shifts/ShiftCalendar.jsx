import { format, isSameMonth, isToday } from 'date-fns';
import ShiftPill from '@/components/shifts/ShiftPill';
import { WEEKDAYS, dayKey } from '@/lib/shifts';

export default function ShiftCalendar({ days, month, shifts, me }) {
  const byDay = {};
  for (const shift of shifts) (byDay[shift.date] = byDay[shift.date] || []).push(shift);

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="grid grid-cols-7 border-b border-border">
        {WEEKDAYS.map((day) => (
          <div key={day} className="py-2 text-center text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            {day}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day) => {
          const key = dayKey(day);
          const list = [...(byDay[key] || [])].sort((a, b) => String(a.start_time).localeCompare(String(b.start_time)));
          return (
            <div
              key={key}
              className={`min-h-[84px] border-b border-r border-border/60 p-1 sm:min-h-[104px] ${isSameMonth(day, month) ? '' : 'opacity-40'}`}
            >
              <span
                className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold ${
                  isToday(day) ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
                }`}
              >
                {format(day, 'd')}
              </span>
              <div className="mt-1 space-y-1">
                {list.slice(0, 3).map((shift) => (
                  <ShiftPill key={shift.id} shift={shift} me={me} />
                ))}
                {list.length > 3 && (
                  <p className="px-1 text-[10px] font-bold text-muted-foreground">+{list.length - 3} mer</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}