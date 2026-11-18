import { eachDayOfInterval, endOfMonth, endOfWeek, format, startOfMonth, startOfWeek } from 'date-fns';
import { nb } from 'date-fns/locale';

export const WEEKDAYS = ['man', 'tir', 'ons', 'tor', 'fre', 'lør', 'søn'];

export const ROLES = {
  kitchen: { label: 'Kjøkken' },
  driver: { label: 'Utkjøring' },
  manager: { label: 'Drift' },
};

export const roleLabel = (role) => ROLES[role]?.label || 'Vakt';
export const dayKey = (date) => format(date, 'yyyy-MM-dd');
export const monthTitle = (date) => format(date, 'LLLL yyyy', { locale: nb });
export const dateLabel = (key) => format(new Date(`${key}T12:00:00`), 'EEE d. MMM', { locale: nb });

export function monthGrid(month) {
  const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
  const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
  return eachDayOfInterval({ start, end });
}

export const isOpenShift = (shift) => !shift.employee_name && !shift.employee_email;

export const isMyShift = (shift, me) => {
  if (!me) return false;
  if (shift.employee_id && shift.employee_id === me.id) return true;
  return !!shift.employee_email && shift.employee_email.toLowerCase() === String(me.email || '').toLowerCase();
};

// Timer på vakten. Slutter den etter midnatt, teller den som nattvakt.
export function shiftHours(shift) {
  const [sh, sm] = String(shift.start_time || '0:0').split(':').map(Number);
  const [eh, em] = String(shift.end_time || '0:0').split(':').map(Number);
  let minutes = eh * 60 + em - (sh * 60 + sm);
  if (minutes <= 0) minutes += 24 * 60;
  return minutes / 60;
}

export const byDate = (a, b) => a.date.localeCompare(b.date) || String(a.start_time).localeCompare(String(b.start_time));