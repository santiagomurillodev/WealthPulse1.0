import React, { useState, useMemo, useCallback } from 'react';
import { supabase } from './lib/supabase';
import { Icon } from './components/Icons';
import { useFinanceData } from './hooks/useFinanceData';
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts';

const INCOME_CATEGORIES = ['Salario Base', 'Reparaciones', 'Ventas', 'Extra'];
const EXPENSE_CATEGORIES = ['Comida', 'Servicios', 'Insumos Taller/Refacciones', 'Transporte', 'Gustos'];
const STORAGE_OPTIONS = ['Tarjeta', 'Efectivo', 'Cuenta de Ahorro', 'Inversión'];

// Paleta de colores para la gráfica de dona (gastos)
const EXPENSE_COLORS = {
  'Comida': '#f59e0b', // amber-500
  'Servicios': '#3b82f6', // blue-500
  'Insumos Taller/Refacciones': '#06b6d4', // cyan-500
  'Transporte': '#8b5cf6', // violet-500
  'Gustos': '#ec4899' // pink-500
};

const fmt = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 2 });
const todayISO = () => new Date().toISOString().slice(0, 10);
const currentMonthStr = () => new Date().toISOString().slice(0, 7);

const formatHumanDate = (dateStr) => {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  const date = new Date(y, m - 1, d);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return 'Hoy';
  if (date.toDateString() === yesterday.toDateString()) return 'Ayer';
  
  return new Intl.DateTimeFormat('es-MX', { weekday: 'short', day: 'numeric', month: 'short' }).format(date);
};

const Section = ({ eyebrow, title, children }) => (
  <section className="mb-6 rounded-[2rem] border border-neutral-800/40 bg-[#0d0d0d] p-5 sm:p-8 transition-all duration-300 h-full">
    <div className="mb-5 flex flex-col items-start border-b border-neutral-800/40 pb-4">
      <p className="mb-1 text-[9px] font-bold uppercase tracking-[0.25em] text-emerald-500/80">{eyebrow}</p>
      <h2 className="text-xl font-semibold text-neutral-100 tracking-tight">{title}</h2>
    </div>
    {children}
  </section>
);

const Field = ({ label, children }) => (
  <label className="block w-full">
    <span className="mb-1.5 block text-[11px] font-semibold tracking-widest text-neutral-500 uppercase">{label}</span>
    {children}
  </label>
);

const inputCls = 'w-full rounded-2xl border-none bg-neutral-900 px-4 py-3.5 text-[15px] font-medium text-neutral-200 outline-none ring-1 ring-neutral-800 transition-all duration-200 placeholder:text-neutral-600 focus:bg-neutral-800 focus:ring-2 focus:ring-emerald-500/50';

/* ------------------------------- APP PRINCIPAL ------------------------------- */
export default function App() {
  const { incomes, setIncomes, expenses, setExpenses, goals, setGoals, isLoading } = useFinanceData();
  const [selectedMonth, setSelectedMonth] = useState(currentMonthStr());
  const [activeTab, setActiveTab] = useState('resumen');

  const [incomeForm, setIncomeForm] = useState({ id: null, amount: '', cost: '', category: INCOME_CATEGORIES[0], note: '', date: todayISO() });
  const [expenseForm, setExpenseForm] = useState({ id: null, amount: '', category: EXPENSE_CATEGORIES[0], note: '', date: todayISO() });
  const [goalForm, setGoalForm] = useState({ id: null, name: '', target: '', saved: '', deadline: '', storage: STORAGE_OPTIONS[0] });

  const [deleteModal, setDeleteModal] = useState({ isOpen: false, table: null, id: null, setFn: null });
  const [fundModal, setFundModal] = useState({ isOpen: false, goal: null, amount: '' });

  const filteredIncomes = useMemo(() => incomes.filter((i) => i.date.startsWith(selectedMonth)), [incomes, selectedMonth]);
  const filteredExpenses = useMemo(() => expenses.filter((e) => e.date.startsWith(selectedMonth)), [expenses, selectedMonth]);

  const monthIncomeTotal = filteredIncomes.reduce((s, i) => s + (Number(i.amount) - (Number(i.cost) || 0)), 0);
  const monthExpenseTotal = filteredExpenses.reduce((s, e) => s + Number(e.amount), 0);
  const monthNetFlow = monthIncomeTotal - monthExpenseTotal;

  // --- CÁLCULOS HISTÓRICOS GLOBALES ---
  const historicalIncomeTotal = useMemo(() => incomes.reduce((s, i) => s + (Number(i.amount) - (Number(i.cost) || 0)), 0), [incomes]);
  const historicalExpenseTotal = useMemo(() => expenses.reduce((s, e) => s + Number(e.amount), 0), [expenses]);
  
  const capitalTotal = historicalIncomeTotal - historicalExpenseTotal;
  const totalSavedInGoals = useMemo(() => goals.reduce((s, g) => s + (Number(g.saved) || 0), 0), [goals]);
  const availableCash = capitalTotal - totalSavedInGoals;

  // --- Gráfica de Barras (Tendencia) ---
  const chartData = useMemo(() => {
    const [year, month] = selectedMonth.split('-');
    const daysInMonth = new Date(year, month, 0).getDate();
    const data = Array.from({ length: daysInMonth }, (_, i) => ({ day: i + 1, ingresos: 0, gastos: 0 }));

    filteredIncomes.forEach(inc => {
      const dayIdx = parseInt(inc.date.split('-')[2]) - 1;
      if(data[dayIdx]) data[dayIdx].ingresos += (Number(inc.amount) - (Number(inc.cost)||0));
    });
    filteredExpenses.forEach(exp => {
      const dayIdx = parseInt(exp.date.split('-')[2]) - 1;
      if(data[dayIdx]) data[dayIdx].gastos += Number(exp.amount);
    });
    return data;
  }, [filteredIncomes, filteredExpenses, selectedMonth]);

  // --- NUEVO: Gráfica de Dona (Distribución de Gastos) ---
  const expenseBreakdown = useMemo(() => {
    const breakdown = {};
    filteredExpenses.forEach(exp => {
      if (!breakdown[exp.category]) breakdown[exp.category] = 0;
      breakdown[exp.category] += Number(exp.amount);
    });
    return Object.keys(breakdown)
      .map(key => ({ name: key, value: breakdown[key] }))
      .sort((a, b) => b.value - a.value); // Ordenar de mayor a menor gasto
  }, [filteredExpenses]);

  // --- VALIDACIONES Y CRUD ---
  const saveIncome = useCallback(async (e) => {
    e.preventDefault();
    const amount = parseFloat(incomeForm.amount);
    const cost = parseFloat(incomeForm.cost) || 0;

    if (isNaN(amount) || amount <= 0) {
      alert('Por favor, ingresa un monto válido mayor a 0.');
      return;
    }
    if (cost < 0) {
      alert('El costo del insumo no puede ser negativo.');
      return;
    }

    if (incomeForm.id) {
      const { data, error } = await supabase.from('incomes').update({ amount, cost, category: incomeForm.category, note: incomeForm.note, date: incomeForm.date }).eq('id', incomeForm.id).select();
      if (!error && data) setIncomes((prev) => prev.map((i) => (i.id === incomeForm.id ? data[0] : i)));
    } else {
      const { data, error } = await supabase.from('incomes').insert([{ amount, cost, category: incomeForm.category, note: incomeForm.note, date: incomeForm.date }]).select();
      if (!error && data) setIncomes((prev) => [data[0], ...prev]);
    }
    setIncomeForm({ id: null, amount: '', cost: '', category: INCOME_CATEGORIES[0], note: '', date: todayISO() });
  }, [incomeForm]);

  const saveExpense = useCallback(async (e) => {
    e.preventDefault();
    const amount = parseFloat(expenseForm.amount);

    if (isNaN(amount) || amount <= 0) {
      alert('Por favor, ingresa un monto de gasto válido mayor a 0.');
      return;
    }

    if (expenseForm.id) {
      const { data, error } = await supabase.from('expenses').update({ amount, category: expenseForm.category, note: expenseForm.note, date: expenseForm.date }).eq('id', expenseForm.id).select();
      if (!error && data) setExpenses((prev) => prev.map((ex) => (ex.id === expenseForm.id ? data[0] : ex)));
    } else {
      const { data, error } = await supabase.from('expenses').insert([{ amount, category: expenseForm.category, note: expenseForm.note, date: expenseForm.date }]).select();
      if (!error && data) setExpenses((prev) => [data[0], ...prev]);
    }
    setExpenseForm({ id: null, amount: '', category: EXPENSE_CATEGORIES[0], note: '', date: todayISO() });
  }, [expenseForm]);

  const saveGoal = useCallback(async (e) => {
    e.preventDefault();
    const target = parseFloat(goalForm.target);
    const saved = parseFloat(goalForm.saved) || 0;

    if (isNaN(target) || target <= 0) {
      alert('La meta de capital debe ser mayor a 0.');
      return;
    }
    if (saved < 0) {
      alert('El capital ahorrado no puede ser negativo.');
      return;
    }

    if (goalForm.id) {
      const { data, error } = await supabase.from('goals').update({ name: goalForm.name, target, saved, deadline: goalForm.deadline, storage: goalForm.storage }).eq('id', goalForm.id).select();
      if (!error && data) setGoals((prev) => prev.map((g) => (g.id === goalForm.id ? data[0] : g)));
    } else {
      const { data, error } = await supabase.from('goals').insert([{ name: goalForm.name, target, saved, deadline: goalForm.deadline, storage: goalForm.storage }]).select();
      if (!error && data) setGoals((prev) => [data[0], ...prev]);
    }
    setGoalForm({ id: null, name: '', target: '', saved: '', deadline: '', storage: STORAGE_OPTIONS[0] });
  }, [goalForm]);

  const handleDeleteClick = (table, id, setFn) => setDeleteModal({ isOpen: true, table, id, setFn });
  const confirmDelete = async () => {
    const { table, id, setFn } = deleteModal;
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (!error) setFn((prev) => prev.filter((item) => item.id !== id));
    setDeleteModal({ isOpen: false, table: null, id: null, setFn: null });
  };

  const handleAddFundsClick = (goal) => setFundModal({ isOpen: true, goal, amount: '' });
  const confirmAddFunds = async (e) => {
    e.preventDefault();
    const deposit = parseFloat(fundModal.amount);
    if (isNaN(deposit) || deposit <= 0) {
      alert('Ingresa un monto de abono válido.');
      return;
    }
    const newSavedAmount = Number(fundModal.goal.saved) + deposit;
    const { data, error } = await supabase.from('goals').update({ saved: newSavedAmount }).eq('id', fundModal.goal.id).select();
    if (!error && data) setGoals((prev) => prev.map((g) => (g.id === fundModal.goal.id ? data[0] : g)));
    setFundModal({ isOpen: false, goal: null, amount: '' });
  };

  const CustomBarTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-neutral-900 border border-neutral-700 p-3 rounded-xl shadow-2xl">
          <p className="text-neutral-400 text-xs mb-1.5 font-semibold">Día {label}</p>
          {payload.map((entry, index) => (
            <p key={index} className={`text-sm font-mono font-bold ${entry.dataKey === 'ingresos' ? 'text-emerald-400' : 'text-rose-400'}`}>
              {entry.dataKey === 'ingresos' ? '+' : '-'}{fmt.format(entry.value)}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  const CustomPieTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-neutral-900 border border-neutral-700 p-3 rounded-xl shadow-2xl">
          <p className="text-neutral-400 text-xs mb-1 font-semibold">{payload[0].name}</p>
          <p className="text-sm font-mono font-bold text-white">
            {fmt.format(payload[0].value)}
          </p>
        </div>
      );
    }
    return null;
  };

  if (isLoading)
    return (
      <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center text-emerald-400 font-mono space-y-4">
        <Icon.Pulse className="h-10 w-10 animate-bounce" />
        <span className="animate-pulse tracking-widest text-sm">Cargando Sistema...</span>
      </div>
    );

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 antialiased font-sans transition-colors duration-500 relative">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 pb-28 lg:pb-8">
        
        {/* Header */}
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-neutral-800/80 pb-6">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-neutral-800 bg-gradient-to-b from-neutral-800 to-neutral-900 shadow-xl">
              <Icon.Pulse className="h-6 w-6 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-neutral-50 tracking-tight">
                Wealth<span className="text-emerald-400">Pulse</span>
              </h1>
              <p className="text-[11px] text-neutral-500 font-mono flex items-center gap-2 mt-0.5">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                SYNC REAL-TIME
              </p>
            </div>
          </div>
          <div className="flex items-center bg-neutral-900/60 border border-neutral-800 rounded-xl p-1.5 shadow-inner">
            <input type="month" className="bg-transparent text-sm font-semibold text-neutral-100 outline-none px-2 cursor-pointer" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} />
          </div>
        </header>

        {/* --- CAPITAL TOTAL HISTÓRICO --- */}
        <div className="bg-gradient-to-b from-neutral-900/50 to-neutral-900/20 border border-neutral-800/60 rounded-[2rem] p-6 sm:p-8 text-center mb-8 backdrop-blur-sm shadow-xl">
          <h2 className="text-neutral-500 text-[10px] font-bold uppercase tracking-[0.25em] mb-2 flex items-center justify-center gap-2">
             Patrimonio Total Acumulado
          </h2>
          <div className="flex items-center justify-center gap-2 mt-4">
            <p className="text-5xl sm:text-6xl font-bold text-white tracking-tighter">
              {fmt.format(capitalTotal)}
            </p>
          </div>
          
          <div className="mt-6 flex flex-wrap items-center justify-center gap-5 sm:gap-10 border-t border-neutral-800/50 pt-5">
            <div className="flex flex-col items-center">
              <span className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest mb-1">Ahorrado en Metas</span>
              <span className="text-sm font-semibold text-emerald-400">{fmt.format(totalSavedInGoals)}</span>
            </div>
            <div className="w-px h-8 bg-neutral-800/80"></div>
            <div className="flex flex-col items-center">
              <span className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest mb-1">Capital Libre</span>
              <span className="text-sm font-semibold text-neutral-300">{fmt.format(availableCash)}</span>
            </div>
          </div>
        </div>

        {/* --- SECCIÓN 1: RESUMEN Y GRÁFICAS --- */}
        <div className={`${activeTab === 'resumen' ? 'block' : 'hidden'} lg:block`}>
          
          {/* Tarjetas de flujo */}
          <div className="mb-8 grid grid-cols-1 gap-5 sm:grid-cols-3">
            <div className="rounded-3xl border border-neutral-800/60 bg-gradient-to-br from-neutral-900/50 to-neutral-950 p-6 shadow-xl">
              <p className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-3">Ingresos Neto</p>
              <p className="font-mono text-4xl font-semibold text-emerald-400 tracking-tight">{fmt.format(monthIncomeTotal)}</p>
            </div>
            <div className="rounded-3xl border border-neutral-800/60 bg-gradient-to-br from-neutral-900/50 to-neutral-950 p-6 shadow-xl">
              <p className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-3">Gastos</p>
              <p className="font-mono text-4xl font-semibold text-rose-400 tracking-tight">{fmt.format(monthExpenseTotal)}</p>
            </div>
            <div className="rounded-3xl border border-neutral-800/60 bg-gradient-to-br from-neutral-900/50 to-neutral-950 p-6 shadow-xl">
              <p className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-3">Flujo Mensual</p>
              <p className={`font-mono text-4xl font-semibold tracking-tight ${monthNetFlow >= 0 ? 'text-white' : 'text-rose-500'}`}>{fmt.format(monthNetFlow)}</p>
            </div>
          </div>

          {/* Gráficas */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            <div className="lg:col-span-2">
              <Section eyebrow="Analíticas" title="Tendencia del Mes">
                <div className="h-64 w-full mt-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                      <XAxis dataKey="day" stroke="#52525b" fontSize={12} tickLine={false} axisLine={false} />
                      <Tooltip content={<CustomBarTooltip />} cursor={{fill: '#262626', opacity: 0.4}} />
                      <Bar dataKey="ingresos" radius={[4, 4, 0, 0]}>
                        {chartData.map((entry, index) => (
                          <Cell key={`cell-inc-${index}`} fill={entry.ingresos > 0 ? '#34d399' : 'transparent'} />
                        ))}
                      </Bar>
                      <Bar dataKey="gastos" radius={[4, 4, 0, 0]}>
                        {chartData.map((entry, index) => (
                          <Cell key={`cell-exp-${index}`} fill={entry.gastos > 0 ? '#fb7185' : 'transparent'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Section>
            </div>
            
            <div className="lg:col-span-1">
              <Section eyebrow="Distribución" title="Categorías de Gasto">
                {expenseBreakdown.length > 0 ? (
                  <div className="flex flex-col items-center">
                    <div className="h-44 w-full mt-2 relative">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={expenseBreakdown}
                            innerRadius={55}
                            outerRadius={75}
                            paddingAngle={5}
                            dataKey="value"
                            stroke="none"
                          >
                            {expenseBreakdown.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={EXPENSE_COLORS[entry.name] || '#52525b'} />
                            ))}
                          </Pie>
                          <Tooltip content={<CustomPieTooltip />} />
                        </PieChart>
                      </ResponsiveContainer>
                      {/* Porcentaje en el centro */}
                      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <span className="text-2xl font-bold text-white">100%</span>
                        <span className="text-[9px] text-neutral-500 uppercase tracking-widest mt-0.5">Gastos</span>
                      </div>
                    </div>
                    
                    <div className="w-full mt-4 space-y-2.5">
                      {expenseBreakdown.map((item, idx) => {
                        const pct = monthExpenseTotal > 0 ? ((item.value / monthExpenseTotal) * 100).toFixed(1) : 0;
                        return (
                          <div key={idx} className="flex items-center justify-between border-b border-neutral-800/40 pb-2.5 last:border-0 last:pb-0">
                            <div className="flex items-center gap-2.5">
                              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: EXPENSE_COLORS[item.name] || '#52525b' }}></span>
                              <span className="text-xs font-medium text-neutral-300">{item.name}</span>
                            </div>
                            <div className="flex items-center gap-3 font-mono text-xs">
                              <span className="text-neutral-400">{fmt.format(item.value)}</span>
                              <span className="text-white font-bold w-9 text-right bg-neutral-900 px-1.5 py-0.5 rounded">{pct}%</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="h-64 flex flex-col items-center justify-center text-neutral-600 space-y-2">
                    <Icon.Wallet className="h-8 w-8 opacity-20" />
                    <span className="text-sm italic font-medium">Sin gastos este mes</span>
                  </div>
                )}
              </Section>
            </div>
          </div>
        </div>

        {/* --- SECCIÓN 2: TRANSACCIONES --- */}
        <div className={`${activeTab === 'transacciones' ? 'block' : 'hidden'} lg:block mt-8`}>
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
            
            {/* Ingresos */}
            <Section eyebrow="Motor de Ingresos" title="Registrar Entrada">
              <form onSubmit={saveIncome} className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
                <Field label="Categoría">
                  <select className={inputCls} value={incomeForm.category} onChange={(e) => setIncomeForm({ ...incomeForm, category: e.target.value })}>
                    {INCOME_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </Field>
                <Field label="Cobro Total">
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500 font-mono">$</span>
                    <input type="number" step="any" min="0.01" required className={`${inputCls} pl-8`} value={incomeForm.amount} onChange={(e) => setIncomeForm({ ...incomeForm, amount: e.target.value })} />
                  </div>
                </Field>
                {(incomeForm.category === 'Reparaciones' || incomeForm.category === 'Ventas') && (
                  <Field label="Costo Insumo (Opcional)">
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500 font-mono">$</span>
                      <input type="number" step="any" min="0" placeholder="Ej. Refacción" className={`${inputCls} pl-8`} value={incomeForm.cost} onChange={(e) => setIncomeForm({ ...incomeForm, cost: e.target.value })} />
                    </div>
                  </Field>
                )}
                <Field label="Fecha">
                  <input type="date" required className={inputCls} value={incomeForm.date} onChange={(e) => setIncomeForm({ ...incomeForm, date: e.target.value })} />
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Nota / Detalles">
                    <input type="text" placeholder="Ej. Pantalla iPhone 13" className={inputCls} value={incomeForm.note} onChange={(e) => setIncomeForm({ ...incomeForm, note: e.target.value })} />
                  </Field>
                </div>
                <button type="submit" className="sm:col-span-2 mt-2 w-full rounded-2xl bg-emerald-600 px-4 py-3.5 text-sm font-bold tracking-wide text-white shadow-lg shadow-emerald-600/20 transition-all hover:bg-emerald-500 active:scale-[0.98] flex items-center justify-center gap-2">
                  {incomeForm.id ? 'Guardar Cambios' : <><Icon.Plus className="w-5 h-5"/> Agregar en la Nube</>}
                </button>
              </form>
              
              <div className="border-t border-neutral-800/40 pt-6">
                <h3 className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 mb-4">Historial Reciente</h3>
                <ul className="space-y-3 max-h-64 overflow-y-auto pr-2">
                  {filteredIncomes.map((i) => {
                    const net = Number(i.amount) - (Number(i.cost) || 0);
                    return (
                      <li key={i.id} className="flex justify-between items-center rounded-2xl bg-neutral-900/40 p-4 border border-neutral-800/40 transition-all hover:bg-neutral-800/60">
                        <div className="text-sm">
                          <p className="text-neutral-100 font-medium">
                            {i.category} {i.note && <span className="text-neutral-500 font-normal ml-1">· {i.note}</span>}
                          </p>
                          <div className="flex gap-2 items-center mt-1">
                            <span className="text-[10px] bg-neutral-800 text-neutral-400 px-1.5 py-0.5 rounded">{formatHumanDate(i.date)}</span>
                            {Number(i.cost) > 0 && <span className="text-[11px] text-neutral-500 font-mono">Cobro: ${i.amount} | Insumo: -${i.cost}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="font-mono text-[15px] font-semibold text-emerald-400">+{fmt.format(net)}</span>
                          <div className="flex items-center gap-1.5 border-l border-neutral-800 pl-4">
                            <button onClick={() => setIncomeForm(i)} className="p-1.5 text-neutral-500 hover:text-emerald-400 hover:bg-emerald-400/10 rounded-lg transition-all"><Icon.Edit className="h-4 w-4" /></button>
                            <button onClick={() => handleDeleteClick('incomes', i.id, setIncomes)} className="p-1.5 text-neutral-500 hover:text-rose-400 hover:bg-rose-400/10 rounded-lg transition-all"><Icon.Trash className="h-4 w-4" /></button>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </Section>

            {/* Gastos */}
            <Section eyebrow="Tracker de Gastos" title="Registrar Salida">
              <form onSubmit={saveExpense} className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
                <Field label="Categoría">
                  <select className={inputCls} value={expenseForm.category} onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })}>
                    {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </Field>
                <Field label="Monto">
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500 font-mono">$</span>
                    <input type="number" step="any" min="0.01" required className={`${inputCls} pl-8`} value={expenseForm.amount} onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })} />
                  </div>
                </Field>
                <Field label="Fecha">
                  <input type="date" required className={inputCls} value={expenseForm.date} onChange={(e) => setExpenseForm({ ...expenseForm, date: e.target.value })} />
                </Field>
                <Field label="Nota / Detalles">
                  <input type="text" placeholder="Ej. Cena fin de semana" className={inputCls} value={expenseForm.note} onChange={(e) => setExpenseForm({ ...expenseForm, note: e.target.value })} />
                </Field>
                <button type="submit" className="sm:col-span-2 mt-2 w-full rounded-2xl bg-rose-600 px-4 py-3.5 text-sm font-bold tracking-wide text-white shadow-lg shadow-rose-600/20 transition-all hover:bg-rose-500 active:scale-[0.98] flex items-center justify-center gap-2">
                  {expenseForm.id ? 'Guardar Cambios' : <><Icon.Plus className="w-5 h-5"/> Agregar en la Nube</>}
                </button>
              </form>

              <div className="border-t border-neutral-800/40 pt-6">
                <h3 className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 mb-4">Historial Reciente</h3>
                <ul className="space-y-3 max-h-64 overflow-y-auto pr-2">
                  {filteredExpenses.map((e) => (
                    <li key={e.id} className="flex justify-between items-center rounded-2xl bg-neutral-900/40 p-4 border border-neutral-800/40 transition-all hover:bg-neutral-800/60">
                      <div className="text-sm">
                        <p className="text-neutral-100 font-medium">
                          {e.category} {e.note && <span className="text-neutral-500 font-normal ml-1">· {e.note}</span>}
                        </p>
                        <div className="mt-1"><span className="text-[10px] bg-neutral-800 text-neutral-400 px-1.5 py-0.5 rounded">{formatHumanDate(e.date)}</span></div>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="font-mono text-[15px] font-semibold text-rose-400">-{fmt.format(e.amount)}</span>
                        <div className="flex items-center gap-1.5 border-l border-neutral-800 pl-4">
                          <button onClick={() => setExpenseForm(e)} className="p-1.5 text-neutral-500 hover:text-emerald-400 hover:bg-emerald-400/10 rounded-lg transition-all"><Icon.Edit className="h-4 w-4" /></button>
                          <button onClick={() => handleDeleteClick('expenses', e.id, setExpenses)} className="p-1.5 text-neutral-500 hover:text-rose-400 hover:bg-rose-400/10 rounded-lg transition-all"><Icon.Trash className="h-4 w-4" /></button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </Section>
          </div>
        </div>

        {/* --- SECCIÓN 3: METAS --- */}
        <div className={`${activeTab === 'metas' ? 'block' : 'hidden'} lg:block mt-8`}>
          <Section eyebrow="Planificación Estratégica" title="Gestor de Metas de Capital">
            <form onSubmit={saveGoal} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 mb-10 border-b border-neutral-800/40 pb-8">
              <div className="sm:col-span-2">
                <Field label="Nombre del Objetivo">
                  <input type="text" required placeholder="Ej. Casa en Tlajomulco" className={inputCls} value={goalForm.name} onChange={(e) => setGoalForm({ ...goalForm, name: e.target.value })} />
                </Field>
              </div>
              <Field label="Monto Meta">
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500 font-mono">$</span>
                  <input type="number" step="any" min="0.01" required className={`${inputCls} pl-8`} value={goalForm.target} onChange={(e) => setGoalForm({ ...goalForm, target: e.target.value })} />
                </div>
              </Field>
              <Field label="Capital Actual">
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500 font-mono">$</span>
                  <input type="number" step="any" min="0" className={`${inputCls} pl-8`} value={goalForm.saved} onChange={(e) => setGoalForm({ ...goalForm, saved: e.target.value })} />
                </div>
              </Field>
              <Field label="Fecha Límite">
                <input type="date" required className={inputCls} value={goalForm.deadline} onChange={(e) => setGoalForm({ ...goalForm, deadline: e.target.value })} />
              </Field>
              <Field label="Dónde lo guardo">
                <select className={inputCls} value={goalForm.storage} onChange={(e) => setGoalForm({ ...goalForm, storage: e.target.value })}>
                  {STORAGE_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </Field>
              <div className="sm:col-span-2 lg:col-span-3 xl:col-span-6 flex justify-end mt-2">
                <button type="submit" className="w-full sm:w-auto rounded-2xl bg-white px-8 py-3.5 text-sm font-bold tracking-wide text-neutral-950 shadow-lg shadow-white/10 transition-all hover:bg-neutral-200 active:scale-[0.98]">
                  {goalForm.id ? 'Actualizar Registro' : 'Inicializar Meta'}
                </button>
              </div>
            </form>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {goals.map((g) => {
                const target = Number(g.target);
                const saved = Number(g.saved);
                const pct = Math.min(100, (saved / target) * 100);
                const remaining = target - saved;

                const d1 = new Date();
                const d2 = new Date(g.deadline + 'T00:00:00');
                const msPerWeek = 1000 * 60 * 60 * 24 * 7;
                let weeksLeft = Math.ceil((d2.getTime() - d1.getTime()) / msPerWeek);
                if (weeksLeft <= 0) weeksLeft = 1;
                
                const weeklyNeeded = remaining / weeksLeft;

                return (
                  <div key={g.id} className="group rounded-3xl border border-neutral-800/80 bg-neutral-900/30 p-6 relative overflow-hidden shadow-xl transition-all duration-300 hover:border-neutral-600 hover:-translate-y-1">
                    <div className="flex justify-between items-start mb-6">
                      <div className="flex flex-col gap-2">
                        <h3 className="text-white font-bold text-lg tracking-wide uppercase">{g.name}</h3>
                        {g.storage && (
                          <span className="text-[10px] w-max font-bold uppercase tracking-[0.1em] bg-neutral-800 text-neutral-300 px-2.5 py-1 rounded-md border border-neutral-700/50">
                            {g.storage === 'Efectivo' ? '💵' : '💳'} {g.storage}
                          </span>
                        )}
                      </div>
                      <div className="flex gap-1.5 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                        <button onClick={() => setGoalForm(g)} className="p-1.5 bg-neutral-800 text-neutral-400 hover:text-white rounded-lg transition-all"><Icon.Edit className="h-4 w-4" /></button>
                        <button onClick={() => handleDeleteClick('goals', g.id, setGoals)} className="p-1.5 bg-neutral-800 text-neutral-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all"><Icon.Trash className="h-4 w-4" /></button>
                      </div>
                    </div>

                    <div className="flex justify-between items-end font-mono mb-3 mt-4">
                      <div className="flex flex-col gap-1">
                        <span className="text-neutral-500 text-xs">Progreso</span>
                        <span className="text-neutral-100 text-lg font-medium">
                          {fmt.format(saved)} <span className="text-neutral-600 text-sm font-normal">/ {fmt.format(target)}</span>
                        </span>
                      </div>
                      <span className="text-emerald-400 font-bold text-xl">{pct.toFixed(0)}%</span>
                    </div>

                    <div className="h-2.5 w-full bg-neutral-800 rounded-full overflow-hidden mb-6 shadow-inner">
                      <div className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 transition-all duration-1000 ease-out" style={{ width: `${pct}%` }}></div>
                    </div>

                    {remaining > 0 ? (
                      <div className="pt-4 border-t border-neutral-800/50 flex items-center justify-between gap-4">
                        <div className="flex flex-col">
                          <span className="text-[10px] uppercase font-bold text-neutral-500 tracking-wider flex items-center gap-1">
                            <Icon.Target className="h-3 w-3 text-emerald-500" /> Meta Semanal
                          </span>
                          <span className="text-emerald-400 font-mono text-sm mt-0.5 font-bold">
                            {fmt.format(weeklyNeeded)}<span className="text-neutral-500 text-[10px] font-sans"> x {weeksLeft} sem</span>
                          </span>
                        </div>
                        <button onClick={() => handleAddFundsClick(g)} className="text-xs font-bold uppercase tracking-wider bg-emerald-500 text-white shadow-lg shadow-emerald-500/20 hover:bg-emerald-400 px-4 py-2.5 rounded-xl transition-all active:scale-95">
                          Abonar
                        </button>
                      </div>
                    ) : (
                      <div className="mt-2 pt-4 border-t border-neutral-800/50 text-sm text-emerald-400 font-bold flex items-center gap-2">
                        🎉 ¡Meta completada!
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Section>
        </div>
      </div>

      {/* --- NAVEGACIÓN MÓVIL SLIM --- */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-neutral-950/90 backdrop-blur-md border-t border-neutral-800/80 z-40">
        <ul className="flex justify-around items-center px-2 py-1.5 pb-safe">
          <li>
            <button onClick={() => setActiveTab('resumen')} className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-all ${activeTab === 'resumen' ? 'text-emerald-400' : 'text-neutral-500 hover:text-neutral-300'}`}>
              <Icon.Home className="h-5 w-5" />
              <span className="text-[9px] font-bold tracking-wide">Resumen</span>
            </button>
          </li>
          <li>
            <button onClick={() => setActiveTab('transacciones')} className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-all ${activeTab === 'transacciones' ? 'text-emerald-400' : 'text-neutral-500 hover:text-neutral-300'}`}>
              <Icon.Wallet className="h-5 w-5" />
              <span className="text-[9px] font-bold tracking-wide">Movimientos</span>
            </button>
          </li>
          <li>
            <button onClick={() => setActiveTab('metas')} className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-all ${activeTab === 'metas' ? 'text-emerald-400' : 'text-neutral-500 hover:text-neutral-300'}`}>
              <Icon.Target className="h-5 w-5" />
              <span className="text-[9px] font-bold tracking-wide">Metas</span>
            </button>
          </li>
        </ul>
      </nav>

      {/* MODAL BORRAR */}
      {deleteModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 w-full max-w-sm shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 bg-rose-500/10 rounded-full text-rose-400"><Icon.Warning className="h-6 w-6" /></div>
              <h3 className="text-xl font-semibold text-white tracking-tight">Eliminar Registro</h3>
            </div>
            <p className="text-sm text-neutral-400 mb-8 leading-relaxed">¿Estás seguro? Esta acción no se puede deshacer y se borrará permanentemente de la nube.</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setDeleteModal({ isOpen: false, table: null, id: null, setFn: null })} className="px-5 py-2.5 text-sm font-bold text-neutral-300 bg-neutral-800 hover:bg-neutral-700 rounded-2xl transition-colors">Cancelar</button>
              <button onClick={confirmDelete} className="px-5 py-2.5 text-sm font-bold text-white bg-rose-600 hover:bg-rose-500 rounded-2xl transition-all shadow-lg shadow-rose-600/20">Sí, eliminar</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL ABONAR */}
      {fundModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-xl font-semibold text-white tracking-tight mb-2">Abonar a "{fundModal.goal?.name}"</h3>
            <p className="text-sm text-neutral-400 mb-6">Ingresa el monto que vas a sumar a este objetivo.</p>
            <form onSubmit={confirmAddFunds}>
              <div className="relative mb-8">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500 font-mono text-xl">$</span>
                <input type="number" step="any" min="0.01" required autoFocus placeholder="0.00" className="w-full rounded-2xl border border-neutral-700 bg-neutral-950 px-4 py-4 pl-9 text-2xl font-mono text-white outline-none transition-all placeholder:text-neutral-700 focus:border-emerald-500/50 focus:ring-4 focus:ring-emerald-500/10" value={fundModal.amount} onChange={(e) => setFundModal({ ...fundModal, amount: e.target.value })} />
              </div>
              <div className="flex gap-3 justify-end">
                <button type="button" onClick={() => setFundModal({ isOpen: false, goal: null, amount: '' })} className="px-5 py-2.5 text-sm font-bold text-neutral-300 bg-neutral-800 hover:bg-neutral-700 rounded-2xl transition-colors">Cancelar</button>
                <button type="submit" className="px-5 py-2.5 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-2xl transition-all shadow-lg shadow-emerald-600/20">Confirmar Abono</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}