import { useEffect, useMemo, useState } from 'react';
import { addMonths, format } from 'date-fns';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import ShiftCalendar from '@/components/shifts/ShiftCalendar';
import OpenShiftList from '@/components/shifts/OpenShiftList';
import ShiftForm from '@/components/shifts/ShiftForm';
import { byDate, dayKey, isMyShift, isOpenShift, monthGrid, monthTitle, shiftHours } from '@/lib/shifts';

export default function Vaktliste() {
  const [month, setMonth] = useState(() => new Date());
  const [user, setUser] = useState(null);
  const [board, setBoard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [formOpen, setFormOpen] = useState(false);

  const days = useMemo(() => monthGrid(month), [month]);
  const from = dayKey(days[0]);
  const to = dayKey(days[days.length - 1]);

  useEffect(() => {
    document.title = 'Vaktliste · Pio Pio';
  }, []);

  useEffect(() => {
    base44.auth
      .me()
      .then(setUser)
      .catch((e) => {
        const status = e?.response?.status || e?.status;
        if (status === 401 || status === 403) base44.auth.redirectToLogin(window.location.href);
        else setError('Kunne ikke hente vaktlisten. Prøv igjen.');
        setLoading(false);
      });
  }, []);

  const load = async () => {
    try {
      const res = await base44.functions.invoke('shifts', { op: 'board', from, to });
      setBoard(res.data);
      setError('');
    } catch (e) {
      setError(e?.response?.data?.error || 'Kunne ikke hente vaktlisten. Prøv igjen.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    load();
  }, [user, from, to]);

  const shifts = board?.shifts || [];
  const mine = shifts.filter((s) => isMyShift(s, board?.me)).sort(byDate);
  const open = shifts.filter(isOpenShift).sort(byDate);
  const mineThisMonth = mine.filter((s) => s.date.startsWith(format(month, 'yyyy-MM')));
  const hours = mineThisMonth.reduce((sum, s) => sum + shiftHours(s), 0);

  const send = async (payload, done) => {
    setBusy(true);
    try {
      await base44.functions.invoke('shifts', payload);
      setError('');
      done();
      await load();
    } catch (e) {
      setError(e?.response?.data?.error || 'Noe gikk galt. Prøv igjen.');
    } finally {
      setBusy(false);
    }
  };

  const take = (shift) => send({ op: 'take', id: shift.id }, () => {
    setNotice('Vakten er din.');
    setTimeout(() => setNotice(''), 4000);
  });

  const create = (form) => send({ op: 'create', ...form }, () => setFormOpen(false));

  return (
    <div className="min-h-screen bg-background px-4 pb-16 pt-6 text-foreground">
      <div className="mx-auto max-w-3xl space-y-5">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black tracking-tight">📋 Vaktliste</h1>
            <p className="text-xs text-muted-foreground">
              {board?.me?.name ? `Hei ${board.me.name.split(' ')[0]}!` : 'Månedens vakter og ledige skift'}
            </p>
          </div>
          <div className="flex items-center gap-1">
            {board?.admin && (
              <button
                onClick={() => setFormOpen((v) => !v)}
                className="mr-1 flex h-9 items-center gap-1 rounded-xl bg-primary px-3 text-xs font-bold text-primary-foreground"
              >
                <Plus className="h-4 w-4" /> Ny vakt
              </button>
            )}
            <button onClick={() => setMonth((m) => addMonths(m, -1))} aria-label="Forrige måned" className="grid h-9 w-9 place-items-center rounded-xl border border-border bg-card hover:bg-secondary">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button onClick={() => setMonth(new Date())} className="h-9 rounded-xl border border-border bg-card px-3 text-xs font-bold hover:bg-secondary">
              I dag
            </button>
            <button onClick={() => setMonth((m) => addMonths(m, 1))} aria-label="Neste måned" className="grid h-9 w-9 place-items-center rounded-xl border border-border bg-card hover:bg-secondary">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-bold capitalize">{monthTitle(month)}</h2>
          <p className="text-xs text-muted-foreground">
            {mineThisMonth.length
              ? `Du har ${mineThisMonth.length} vakt${mineThisMonth.length === 1 ? '' : 'er'} · ${String(hours.toFixed(1)).replace('.0', '')} t`
              : 'Ingen vakter på deg denne måneden'}
          </p>
        </div>

        {formOpen && (
          <ShiftForm
            staff={board?.staff || []}
            defaultDate={format(new Date(), 'yyyy-MM-dd')}
            busy={busy}
            onSubmit={create}
            onCancel={() => setFormOpen(false)}
          />
        )}

        <ShiftCalendar days={days} month={month} shifts={shifts} me={board?.me} />

        <div className="flex flex-wrap gap-3 px-1 text-[11px] font-semibold text-muted-foreground">
          <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm bg-primary" /> Din vakt</span>
          <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm border border-dashed border-accent" /> Ledig</span>
          <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm bg-secondary" /> Andre</span>
        </div>

        {notice && <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-300">{notice}</p>}
        {error && <p className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-bold text-red-300">{error}</p>}

        <section className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Ledige vakter</h2>
            <span className="text-xs font-bold text-muted-foreground">{open.length}</span>
          </div>
          {loading && !board ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Laster…</p>
          ) : (
            <OpenShiftList shifts={open} busy={busy} onTake={take} />
          )}
        </section>
      </div>
    </div>
  );
}