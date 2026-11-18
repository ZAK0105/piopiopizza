import { isMyShift, isOpenShift, roleLabel } from '@/lib/shifts';

export default function ShiftPill({ shift, me }) {
  const open = isOpenShift(shift);
  const mine = isMyShift(shift, me);
  const tone = mine
    ? 'bg-primary text-primary-foreground'
    : open
      ? 'border border-dashed border-accent/60 bg-accent/10 text-accent'
      : 'bg-secondary text-foreground';
  const label = open ? 'Ledig' : String(shift.employee_name || '').split(' ')[0];
  const title = `${shift.start_time}–${shift.end_time} · ${roleLabel(shift.role)}${open ? ' · ledig' : ` · ${shift.employee_name}`}`;

  return (
    <div title={title} className={`truncate rounded-md px-1 py-0.5 text-[10px] font-semibold leading-tight ${tone}`}>
      <span className="hidden sm:inline">{shift.start_time}–{shift.end_time} </span>
      <span className="sm:hidden">{String(shift.start_time).slice(0, 2)}–{String(shift.end_time).slice(0, 2)} </span>
      <span className="font-bold">{label}</span>
    </div>
  );
}