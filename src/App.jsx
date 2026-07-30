import React, { useState, useEffect, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';

// --- CONFIGURACIÓN DE SUPABASE ---
const supabaseUrl = 'https://sscdkjeoehwjpyhauodp.supabase.co';
const supabaseKey = 'sb_publishable_t3W_u-wEBH9JyV5QG0_R4g_V2xh5byH';
const supabase = createClient(supabaseUrl, supabaseKey);

// Categorías y Opciones
const INCOME_CATEGORIES = ['Salario Base', 'Reparaciones', 'Ventas', 'Extra'];
const EXPENSE_CATEGORIES = [
  'Comida',
  'Servicios',
  'Insumos Taller/Refacciones',
  'Transporte',
  'Gustos',
];
const STORAGE_OPTIONS = [
  'Tarjeta',
  'Efectivo',
  'Cuenta de Ahorro',
  'Inversión',
];

const fmt = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 2,
});
const todayISO = () => new Date().toISOString().slice(0, 10);
const currentMonthStr = () => new Date().toISOString().slice(0, 7);

/* ---------- Iconos SVG ---------- */
const Icon = {
  Plus: (p) => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      {...p}
    >
      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
    </svg>
  ),
  Trash: (p) => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      {...p}
    >
      <path
        d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-9 0 1 12a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l1-12"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  Edit: (p) => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      {...p}
    >
      <path
        d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  Pulse: (p) => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      {...p}
    >
      <path
        d="M2 12h4l2-7 4 14 3-10 2 3h5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  Alert: (p) => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      {...p}
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  ),
  Target: (p) => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      {...p}
    >
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  ),
  Warning: (p) => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      {...p}
    >
      <path
        d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line
        x1="12"
        y1="9"
        x2="12"
        y2="13"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line
        x1="12"
        y1="17"
        x2="12.01"
        y2="17"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
};

/* ---------- Componentes Auxiliares ---------- */
const Section = ({ eyebrow, title, children }) => (
  <section className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-5 sm:p-6 transition-all duration-300 hover:border-neutral-700 hover:shadow-xl hover:shadow-black/40">
    <div className="mb-5">
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-neutral-500">
        {eyebrow}
      </p>
      <h2 className="mt-1 text-lg font-semibold text-neutral-100">{title}</h2>
    </div>
    {children}
  </section>
);

const Field = ({ label, children }) => (
  <label className="block">
    <span className="mb-1.5 block text-xs font-medium text-neutral-400">
      {label}
    </span>
    {children}
  </label>
);

const inputCls =
  'w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none transition-all duration-300 placeholder:text-neutral-600 focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 focus:bg-neutral-900';

/* ------------------------------- APP PRINCIPAL ------------------------------- */
export default function App() {
  const [incomes, setIncomes] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [goals, setGoals] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState(currentMonthStr());
  const [isLoading, setIsLoading] = useState(true);

  // Estados de Formularios
  const [incomeForm, setIncomeForm] = useState({
    id: null,
    amount: '',
    cost: '',
    category: INCOME_CATEGORIES[0],
    note: '',
    date: todayISO(),
  });
  const [expenseForm, setExpenseForm] = useState({
    id: null,
    amount: '',
    category: EXPENSE_CATEGORIES[0],
    note: '',
    date: todayISO(),
  });
  const [goalForm, setGoalForm] = useState({
    id: null,
    name: '',
    target: '',
    saved: '',
    deadline: '',
    storage: STORAGE_OPTIONS[0],
  });

  // Estados de Modales (Pop-ups)
  const [deleteModal, setDeleteModal] = useState({
    isOpen: false,
    table: null,
    id: null,
    setFn: null,
  });
  const [fundModal, setFundModal] = useState({
    isOpen: false,
    goal: null,
    amount: '',
  });

  // --- CARGA DE DATOS ---
  useEffect(() => {
    const fetchAllData = async () => {
      setIsLoading(true);
      const { data: iData } = await supabase
        .from('incomes')
        .select('*')
        .order('date', { ascending: false });
      if (iData) setIncomes(iData);
      const { data: eData } = await supabase
        .from('expenses')
        .select('*')
        .order('date', { ascending: false });
      if (eData) setExpenses(eData);
      const { data: gData } = await supabase
        .from('goals')
        .select('*')
        .order('deadline', { ascending: true });
      if (gData) setGoals(gData);
      setIsLoading(false);
    };
    fetchAllData();
  }, []);

  const filteredIncomes = useMemo(
    () => incomes.filter((i) => i.date.startsWith(selectedMonth)),
    [incomes, selectedMonth]
  );
  const filteredExpenses = useMemo(
    () => expenses.filter((e) => e.date.startsWith(selectedMonth)),
    [expenses, selectedMonth]
  );

  const monthIncomeTotal = filteredIncomes.reduce(
    (s, i) => s + (Number(i.amount) - (Number(i.cost) || 0)),
    0
  );
  const monthExpenseTotal = filteredExpenses.reduce(
    (s, e) => s + Number(e.amount),
    0
  );
  const monthNetFlow = monthIncomeTotal - monthExpenseTotal;

  // --- FUNCIONES CRUD FULL-STACK ---
  const saveIncome = async (e) => {
    e.preventDefault();
    const amount = parseFloat(incomeForm.amount);
    const cost = parseFloat(incomeForm.cost) || 0;
    if (!amount) return;

    if (incomeForm.id) {
      const { data, error } = await supabase
        .from('incomes')
        .update({
          amount,
          cost,
          category: incomeForm.category,
          note: incomeForm.note,
          date: incomeForm.date,
        })
        .eq('id', incomeForm.id)
        .select();
      if (!error && data)
        setIncomes((prev) =>
          prev.map((i) => (i.id === incomeForm.id ? data[0] : i))
        );
    } else {
      const { data, error } = await supabase
        .from('incomes')
        .insert([
          {
            amount,
            cost,
            category: incomeForm.category,
            note: incomeForm.note,
            date: incomeForm.date,
          },
        ])
        .select();
      if (!error && data) setIncomes((prev) => [data[0], ...prev]);
    }
    setIncomeForm({
      id: null,
      amount: '',
      cost: '',
      category: INCOME_CATEGORIES[0],
      note: '',
      date: todayISO(),
    });
  };

  const saveExpense = async (e) => {
    e.preventDefault();
    const amount = parseFloat(expenseForm.amount);
    if (!amount) return;

    if (expenseForm.id) {
      const { data, error } = await supabase
        .from('expenses')
        .update({
          amount,
          category: expenseForm.category,
          note: expenseForm.note,
          date: expenseForm.date,
        })
        .eq('id', expenseForm.id)
        .select();
      if (!error && data)
        setExpenses((prev) =>
          prev.map((ex) => (ex.id === expenseForm.id ? data[0] : ex))
        );
    } else {
      const { data, error } = await supabase
        .from('expenses')
        .insert([
          {
            amount,
            category: expenseForm.category,
            note: expenseForm.note,
            date: expenseForm.date,
          },
        ])
        .select();
      if (!error && data) setExpenses((prev) => [data[0], ...prev]);
    }
    setExpenseForm({
      id: null,
      amount: '',
      category: EXPENSE_CATEGORIES[0],
      note: '',
      date: todayISO(),
    });
  };

  const saveGoal = async (e) => {
    e.preventDefault();
    const target = parseFloat(goalForm.target);
    const saved = parseFloat(goalForm.saved) || 0;
    if (!target) return;

    if (goalForm.id) {
      const { data, error } = await supabase
        .from('goals')
        .update({
          name: goalForm.name,
          target,
          saved,
          deadline: goalForm.deadline,
          storage: goalForm.storage,
        })
        .eq('id', goalForm.id)
        .select();
      if (!error && data)
        setGoals((prev) =>
          prev.map((g) => (g.id === goalForm.id ? data[0] : g))
        );
    } else {
      const { data, error } = await supabase
        .from('goals')
        .insert([
          {
            name: goalForm.name,
            target,
            saved,
            deadline: goalForm.deadline,
            storage: goalForm.storage,
          },
        ])
        .select();
      if (!error && data) setGoals((prev) => [data[0], ...prev]);
    }
    setGoalForm({
      id: null,
      name: '',
      target: '',
      saved: '',
      deadline: '',
      storage: STORAGE_OPTIONS[0],
    });
  };

  // --- LÓGICA DE MODALES PERSONALIZADOS ---
  const handleDeleteClick = (table, id, setFn) =>
    setDeleteModal({ isOpen: true, table, id, setFn });

  const confirmDelete = async () => {
    const { table, id, setFn } = deleteModal;
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (!error) setFn((prev) => prev.filter((item) => item.id !== id));
    setDeleteModal({ isOpen: false, table: null, id: null, setFn: null });
  };

  const handleAddFundsClick = (goal) =>
    setFundModal({ isOpen: true, goal, amount: '' });

  const confirmAddFunds = async (e) => {
    e.preventDefault();
    const deposit = parseFloat(fundModal.amount);
    if (isNaN(deposit) || deposit <= 0) return;

    const newSavedAmount = Number(fundModal.goal.saved) + deposit;
    const { data, error } = await supabase
      .from('goals')
      .update({ saved: newSavedAmount })
      .eq('id', fundModal.goal.id)
      .select();
    if (!error && data)
      setGoals((prev) =>
        prev.map((g) => (g.id === fundModal.goal.id ? data[0] : g))
      );

    setFundModal({ isOpen: false, goal: null, amount: '' });
  };

  if (isLoading)
    return (
      <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center text-emerald-400 font-mono space-y-3">
        <Icon.Pulse className="h-8 w-8 animate-bounce" />
        <span className="animate-pulse">Sincronizando con Supabase...</span>
      </div>
    );

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 antialiased font-sans transition-colors duration-500 relative">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        {/* Header Animado */}
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-neutral-800 pb-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-neutral-800 bg-neutral-900 shadow-lg transition-transform duration-300 hover:rotate-12 hover:scale-105">
              <Icon.Pulse className="h-6 w-6 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-neutral-50 tracking-tight">
                Wealth<span className="text-emerald-400">Pulse</span>
              </h1>
              <p className="text-xs text-neutral-500 font-mono flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>{' '}
                Cloud Sync Activo
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-neutral-900 border border-neutral-800 rounded-lg p-1.5 shadow-sm transition-all hover:border-neutral-700">
            <span className="text-xs text-neutral-400 pl-2">Periodo:</span>
            <input
              type="month"
              className="bg-transparent text-sm text-neutral-100 outline-none pr-2 font-mono cursor-pointer"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
            />
          </div>
        </header>

        {/* Tarjetas de Resumen */}
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-5 transition-all duration-300 hover:-translate-y-1 hover:border-emerald-500/30 hover:shadow-lg hover:shadow-emerald-950/20">
            <p className="text-[11px] font-medium uppercase text-neutral-500 mb-2">
              Ingresos Neto (Mes)
            </p>
            <p className="font-mono text-3xl font-semibold text-emerald-400 tracking-tight">
              {fmt.format(monthIncomeTotal)}
            </p>
          </div>
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-5 transition-all duration-300 hover:-translate-y-1 hover:border-rose-500/30 hover:shadow-lg hover:shadow-rose-950/20">
            <p className="text-[11px] font-medium uppercase text-neutral-500 mb-2">
              Gastos (Mes)
            </p>
            <p className="font-mono text-3xl font-semibold text-rose-400 tracking-tight">
              {fmt.format(monthExpenseTotal)}
            </p>
          </div>
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-5 transition-all duration-300 hover:-translate-y-1 hover:border-neutral-700 hover:shadow-lg">
            <p className="text-[11px] font-medium uppercase text-neutral-500 mb-2">
              Flujo Mensual
            </p>
            <p
              className={`font-mono text-3xl font-semibold tracking-tight ${
                monthNetFlow >= 0 ? 'text-white' : 'text-rose-500'
              }`}
            >
              {fmt.format(monthNetFlow)}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Ingresos */}
          <Section eyebrow="Motor de Ingresos" title="Registrar Entrada">
            <form onSubmit={saveIncome} className="grid grid-cols-2 gap-3">
              <Field label="Categoría">
                <select
                  className={inputCls}
                  value={incomeForm.category}
                  onChange={(e) =>
                    setIncomeForm({ ...incomeForm, category: e.target.value })
                  }
                >
                  {INCOME_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Cobro Total">
                <input
                  type="number"
                  required
                  className={inputCls}
                  value={incomeForm.amount}
                  onChange={(e) =>
                    setIncomeForm({ ...incomeForm, amount: e.target.value })
                  }
                />
              </Field>
              {(incomeForm.category === 'Reparaciones' ||
                incomeForm.category === 'Ventas') && (
                <Field label="Costo Insumo">
                  <input
                    type="number"
                    placeholder="Ej. Costo de pieza"
                    className={inputCls}
                    value={incomeForm.cost}
                    onChange={(e) =>
                      setIncomeForm({ ...incomeForm, cost: e.target.value })
                    }
                  />
                </Field>
              )}
              <Field label="Fecha">
                <input
                  type="date"
                  required
                  className={inputCls}
                  value={incomeForm.date}
                  onChange={(e) =>
                    setIncomeForm({ ...incomeForm, date: e.target.value })
                  }
                />
              </Field>
              <div className="col-span-2">
                <Field label="Nota / Detalles">
                  <input
                    type="text"
                    className={inputCls}
                    value={incomeForm.note}
                    onChange={(e) =>
                      setIncomeForm({ ...incomeForm, note: e.target.value })
                    }
                  />
                </Field>
              </div>
              <button
                type="submit"
                className="col-span-2 mt-2 rounded-xl bg-emerald-500/10 py-2.5 text-sm font-semibold text-emerald-400 border border-emerald-500/30 transition-all duration-200 hover:bg-emerald-500/20 hover:scale-[1.01] active:scale-[0.98] flex items-center justify-center gap-2"
              >
                {incomeForm.id ? (
                  'Guardar Cambios'
                ) : (
                  <>
                    <Icon.Plus className="w-4 h-4" /> Agregar en la Nube
                  </>
                )}
              </button>
            </form>
            <ul className="mt-5 space-y-2 max-h-60 overflow-y-auto pr-1">
              {filteredIncomes.map((i) => {
                const net = Number(i.amount) - (Number(i.cost) || 0);
                return (
                  <li
                    key={i.id}
                    className="flex justify-between items-center rounded-xl bg-neutral-950/60 p-3 border border-neutral-800/80 transition-all duration-200 hover:bg-neutral-900 hover:border-neutral-700"
                  >
                    <div className="text-sm">
                      <p className="text-neutral-200 font-medium">
                        {i.category}{' '}
                        {i.note && (
                          <span className="text-neutral-500 font-normal">
                            · {i.note}
                          </span>
                        )}
                      </p>
                      {Number(i.cost) > 0 && (
                        <p className="text-[10px] text-neutral-400 mt-0.5">
                          Cobro: ${i.amount} | Insumo: -${i.cost}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-sm text-emerald-400">
                        +{fmt.format(net)}
                      </span>
                      <button
                        onClick={() => setIncomeForm(i)}
                        className="text-neutral-500 hover:text-emerald-400 transition-colors active:scale-90"
                      >
                        <Icon.Edit className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() =>
                          handleDeleteClick('incomes', i.id, setIncomes)
                        }
                        className="text-neutral-500 hover:text-rose-400 transition-colors active:scale-90"
                      >
                        <Icon.Trash className="h-4 w-4" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Section>

          {/* Gastos */}
          <Section eyebrow="Tracker de Gastos" title="Registrar Salida">
            <form onSubmit={saveExpense} className="grid grid-cols-2 gap-3">
              <Field label="Categoría">
                <select
                  className={inputCls}
                  value={expenseForm.category}
                  onChange={(e) =>
                    setExpenseForm({ ...expenseForm, category: e.target.value })
                  }
                >
                  {EXPENSE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Monto">
                <input
                  type="number"
                  required
                  className={inputCls}
                  value={expenseForm.amount}
                  onChange={(e) =>
                    setExpenseForm({ ...expenseForm, amount: e.target.value })
                  }
                />
              </Field>
              <Field label="Fecha">
                <input
                  type="date"
                  required
                  className={inputCls}
                  value={expenseForm.date}
                  onChange={(e) =>
                    setExpenseForm({ ...expenseForm, date: e.target.value })
                  }
                />
              </Field>
              <Field label="Nota / Detalles">
                <input
                  type="text"
                  className={inputCls}
                  value={expenseForm.note}
                  onChange={(e) =>
                    setExpenseForm({ ...expenseForm, note: e.target.value })
                  }
                />
              </Field>
              <button
                type="submit"
                className="col-span-2 mt-2 rounded-xl bg-rose-500/10 py-2.5 text-sm font-semibold text-rose-400 border border-rose-500/30 transition-all duration-200 hover:bg-rose-500/20 hover:scale-[1.01] active:scale-[0.98] flex items-center justify-center gap-2"
              >
                {expenseForm.id ? (
                  'Guardar Cambios'
                ) : (
                  <>
                    <Icon.Plus className="w-4 h-4" /> Agregar en la Nube
                  </>
                )}
              </button>
            </form>
            <ul className="mt-5 space-y-2 max-h-60 overflow-y-auto pr-1">
              {filteredExpenses.map((e) => (
                <li
                  key={e.id}
                  className="flex justify-between items-center rounded-xl bg-neutral-950/60 p-3 border border-neutral-800/80 transition-all duration-200 hover:bg-neutral-900 hover:border-neutral-700"
                >
                  <div className="text-sm">
                    <p className="text-neutral-200 font-medium">
                      {e.category}{' '}
                      {e.note && (
                        <span className="text-neutral-500 font-normal">
                          · {e.note}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm text-rose-400">
                      -{fmt.format(e.amount)}
                    </span>
                    <button
                      onClick={() => setExpenseForm(e)}
                      className="text-neutral-500 hover:text-emerald-400 transition-colors active:scale-90"
                    >
                      <Icon.Edit className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() =>
                        handleDeleteClick('expenses', e.id, setExpenses)
                      }
                      className="text-neutral-500 hover:text-rose-400 transition-colors active:scale-90"
                    >
                      <Icon.Trash className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </Section>
        </div>

        {/* Metas */}
        <div className="mt-6">
          <Section
            eyebrow="Planificación Estratégica"
            title="Motor de Metas y Alertas"
          >
            <form
              onSubmit={saveGoal}
              className="grid grid-cols-1 gap-3 lg:grid-cols-6 mb-6"
            >
              <Field label="Objetivo">
                <input
                  type="text"
                  required
                  className={inputCls}
                  value={goalForm.name}
                  onChange={(e) =>
                    setGoalForm({ ...goalForm, name: e.target.value })
                  }
                />
              </Field>
              <Field label="Monto Meta">
                <input
                  type="number"
                  required
                  className={inputCls}
                  value={goalForm.target}
                  onChange={(e) =>
                    setGoalForm({ ...goalForm, target: e.target.value })
                  }
                />
              </Field>
              <Field label="Ahorrado">
                <input
                  type="number"
                  className={inputCls}
                  value={goalForm.saved}
                  onChange={(e) =>
                    setGoalForm({ ...goalForm, saved: e.target.value })
                  }
                />
              </Field>
              <Field label="Fecha Límite">
                <input
                  type="date"
                  required
                  className={inputCls}
                  value={goalForm.deadline}
                  onChange={(e) =>
                    setGoalForm({ ...goalForm, deadline: e.target.value })
                  }
                />
              </Field>
              <Field label="Dónde lo guardo">
                <select
                  className={inputCls}
                  value={goalForm.storage}
                  onChange={(e) =>
                    setGoalForm({ ...goalForm, storage: e.target.value })
                  }
                >
                  {STORAGE_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="flex items-end">
                <button
                  type="submit"
                  className="w-full rounded-xl bg-neutral-800 py-2.5 text-sm font-semibold text-white border border-neutral-700 transition-all duration-200 hover:bg-neutral-700 hover:scale-[1.01] active:scale-[0.98]"
                >
                  {goalForm.id ? 'Actualizar' : 'Crear Meta'}
                </button>
              </div>
            </form>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {goals.map((g) => {
                const target = Number(g.target);
                const saved = Number(g.saved);
                const pct = Math.min(100, (saved / target) * 100);
                const remaining = target - saved;

                const d1 = new Date();
                const d2 = new Date(g.deadline + 'T00:00:00');

                let monthsLeft =
                  (d2.getFullYear() - d1.getFullYear()) * 12 +
                  (d2.getMonth() - d1.getMonth());
                if (monthsLeft <= 0) monthsLeft = 1;

                const msPerWeek = 1000 * 60 * 60 * 24 * 7;
                let weeksLeft = Math.ceil(
                  (d2.getTime() - d1.getTime()) / msPerWeek
                );
                if (weeksLeft <= 0) weeksLeft = 1;

                const projectedSavings =
                  (monthNetFlow > 0 ? monthNetFlow : 0) * monthsLeft;
                const deficit = remaining - projectedSavings;
                const cutNeeded = deficit > 0 ? deficit / monthsLeft : 0;
                const weeklyNeeded = remaining / weeksLeft;

                return (
                  <div
                    key={g.id}
                    className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5 relative overflow-hidden shadow-md transition-all duration-300 hover:border-neutral-700 hover:-translate-y-0.5"
                  >
                    {deficit > 0 && remaining > 0 && (
                      <div className="absolute top-0 right-0 p-1.5 bg-rose-500/20 text-rose-400 rounded-bl-lg border-l border-b border-rose-500/30 animate-pulse">
                        <Icon.Alert className="h-4 w-4" />
                      </div>
                    )}
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex flex-col gap-1.5">
                        <h3 className="text-white font-medium flex items-center gap-2">
                          {g.name}
                        </h3>
                        {g.storage && (
                          <span className="text-[10px] w-max font-medium uppercase tracking-wider bg-neutral-800 text-neutral-400 px-2 py-0.5 rounded-md border border-neutral-700">
                            {g.storage === 'Efectivo' ? '💵' : '💳'} {g.storage}
                          </span>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setGoalForm(g)}
                          className="text-neutral-500 hover:text-emerald-400 transition-colors active:scale-90"
                        >
                          <Icon.Edit className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() =>
                            handleDeleteClick('goals', g.id, setGoals)
                          }
                          className="text-neutral-500 hover:text-rose-400 transition-colors active:scale-90"
                        >
                          <Icon.Trash className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    <div className="flex justify-between items-center font-mono text-sm mb-2 mt-4">
                      <div className="flex items-center gap-3">
                        <span className="text-neutral-300">
                          {fmt.format(saved)}{' '}
                          <span className="text-neutral-600">
                            / {fmt.format(target)}
                          </span>
                        </span>
                        {remaining > 0 && (
                          <button
                            onClick={() => handleAddFundsClick(g)}
                            className="text-[10px] font-sans font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 px-2.5 py-1 rounded border border-emerald-500/20 transition-all active:scale-95"
                          >
                            + Abonar
                          </button>
                        )}
                      </div>
                      <span className="text-emerald-400 font-semibold">
                        {pct.toFixed(0)}%
                      </span>
                    </div>

                    <div className="h-2 w-full bg-neutral-900 rounded-full overflow-hidden mb-3">
                      <div
                        className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 transition-all duration-700 ease-out"
                        style={{ width: `${pct}%` }}
                      ></div>
                    </div>

                    {remaining > 0 ? (
                      <div className="mt-4 pt-3 border-t border-neutral-800/80 space-y-3">
                        {deficit > 0 && (
                          <div className="text-rose-400 space-y-1 text-xs">
                            <p className="font-semibold tracking-wide uppercase text-[10px] flex items-center gap-1">
                              <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-ping"></span>{' '}
                              Alerta de Déficit
                            </p>
                            <p>
                              Tu flujo actual no alcanza. Recorta{' '}
                              <span className="font-mono font-bold bg-rose-500/20 px-1 rounded">
                                {fmt.format(cutNeeded)}/mes
                              </span>{' '}
                              en <b>Gustos</b> o <b>Comida</b> para lograrlo a
                              tiempo.
                            </p>
                          </div>
                        )}
                        <div className="flex items-start gap-2 text-neutral-300 bg-emerald-500/5 p-2.5 rounded-lg border border-emerald-500/10 text-xs">
                          <Icon.Target className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                          <p>
                            Plan de acción: Ahorra{' '}
                            <strong className="text-emerald-400 font-mono text-[13px]">
                              {fmt.format(weeklyNeeded)}/sem
                            </strong>{' '}
                            durante las próximas {weeksLeft} semanas para lograr
                            tu meta.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-4 pt-3 border-t border-neutral-800/80 text-xs text-emerald-400 font-medium flex items-center gap-1">
                        🎉 Meta alcanzada. ¡Felicidades!
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Section>
        </div>
      </div>

      {/* POP-UP 1: CONFIRMAR BORRADO */}
      {deleteModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4 animate-[fadeIn_0.2s_ease-out]">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 w-full max-w-sm shadow-2xl shadow-black/50 transform transition-all">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-rose-500/10 rounded-full text-rose-400">
                <Icon.Warning className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-semibold text-white">
                Eliminar Registro
              </h3>
            </div>
            <p className="text-sm text-neutral-400 mb-6">
              ¿Estás seguro de que deseas eliminar esto? Esta acción no se puede
              deshacer y se borrará permanentemente de la nube.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() =>
                  setDeleteModal({
                    isOpen: false,
                    table: null,
                    id: null,
                    setFn: null,
                  })
                }
                className="px-4 py-2 text-sm font-medium text-neutral-300 hover:text-white bg-neutral-800 hover:bg-neutral-700 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 text-sm font-medium text-rose-100 bg-rose-600 hover:bg-rose-500 rounded-lg transition-colors shadow-lg shadow-rose-900/20"
              >
                Sí, eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* POP-UP 2: ABONAR A META */}
      {fundModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4 animate-[fadeIn_0.2s_ease-out]">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 w-full max-w-sm shadow-2xl shadow-black/50 transform transition-all">
            <h3 className="text-lg font-semibold text-white mb-2">
              Abonar a "{fundModal.goal?.name}"
            </h3>
            <p className="text-xs text-neutral-400 mb-4">
              Ingresa el monto que deseas sumar a esta meta.
            </p>

            <form onSubmit={confirmAddFunds}>
              <div className="relative mb-6">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500">
                  $
                </span>
                <input
                  type="number"
                  step="0.01"
                  required
                  autoFocus
                  placeholder="0.00"
                  className={`${inputCls} pl-7 text-lg font-mono`}
                  value={fundModal.amount}
                  onChange={(e) =>
                    setFundModal({ ...fundModal, amount: e.target.value })
                  }
                />
              </div>
              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() =>
                    setFundModal({ isOpen: false, goal: null, amount: '' })
                  }
                  className="px-4 py-2 text-sm font-medium text-neutral-300 hover:text-white bg-neutral-800 hover:bg-neutral-700 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium text-emerald-100 bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors shadow-lg shadow-emerald-900/20"
                >
                  Guardar Abono
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
