import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { supabase } from './lib/supabase';
import { Icon } from './components/Icons';
import { useFinanceData } from './hooks/useFinanceData';
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts';

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const INCOME_CATEGORIES = ['Salario Base', 'Reparaciones', 'Ventas', 'Extra'];
const EXPENSE_CATEGORIES = ['Comida', 'Servicios', 'Insumos Taller/Refacciones', 'Transporte', 'Gustos'];
const STORAGE_OPTIONS = ['Tarjeta', 'Efectivo', 'Cuenta de Ahorro', 'Inversión'];

const EXPENSE_COLORS = {
  'Comida': '#f59e0b',
  'Servicios': '#3b82f6',
  'Insumos Taller/Refacciones': '#06b6d4',
  'Transporte': '#8b5cf6',
  'Gustos': '#ec4899'
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

const TrendBadge = ({ value, invertColors = false }) => {
  if (value === 0 || isNaN(value)) {
    return <span className="text-[9px] font-bold px-1.5 py-0.5 rounded text-neutral-500 bg-neutral-800/50 uppercase tracking-wide">≈ 0% vs mes ant.</span>;
  }
  const isPositive = value > 0;
  const isGood = invertColors ? !isPositive : isPositive;
  const colorCls = isGood ? 'text-emerald-400 bg-emerald-400/10' : 'text-rose-400 bg-rose-400/10';
  const icon = isPositive ? '↑' : '↓';
  
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-0.5 w-max ${colorCls}`}>
      {icon} {Math.abs(value).toFixed(1)}% <span className="opacity-70 font-medium">vs ant.</span>
    </span>
  );
};

const inputCls = 'w-full rounded-2xl border-none bg-neutral-900 px-4 py-3.5 text-[15px] font-medium text-neutral-200 outline-none ring-1 ring-neutral-800 transition-all duration-200 placeholder:text-neutral-600 focus:bg-neutral-800 focus:ring-2 focus:ring-emerald-500/50';

/* ------------------------------- APP PRINCIPAL ------------------------------- */
export default function App() {
  const { incomes, setIncomes, expenses, setExpenses, goals, setGoals, isLoading } = useFinanceData();
  
  // --- ESTADOS DE SEGURIDAD (PIN LOCK) ---
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [savedPin, setSavedPin] = useState(() => localStorage.getItem('wp_pin'));
  const [pinSetupStep, setPinSetupStep] = useState(savedPin ? 'enter' : 'create'); 
  const [tempPin, setTempPin] = useState('');
  const [enteredPin, setEnteredPin] = useState('');
  const [pinError, setPinError] = useState(false);

  // --- ESTADOS DE LA APP ---
  const [selectedMonth, setSelectedMonth] = useState(currentMonthStr());
  const [activeTab, setActiveTab] = useState('resumen');
  const [isPrivate, setIsPrivate] = useState(false);
  const mask = (val) => isPrivate ? '••••••' : fmt.format(val);

  const [showIncomesHistory, setShowIncomesHistory] = useState(false);
  const [showExpensesHistory, setShowExpensesHistory] = useState(false);

  // --- ESTADOS DE GASTO RÁPIDO (BOTTOM SHEET) ---
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [qAmount, setQAmount] = useState('');
  const [qCategory, setQCategory] = useState(EXPENSE_CATEGORIES[0]);
  const [qNote, setQNote] = useState('');

  const [incomeForm, setIncomeForm] = useState({ id: null, amount: '', cost: '', category: INCOME_CATEGORIES[0], note: '', date: todayISO() });
  const [expenseForm, setExpenseForm] = useState({ id: null, amount: '', category: EXPENSE_CATEGORIES[0], note: '', date: todayISO() });
  const [goalForm, setGoalForm] = useState({ id: null, name: '', target: '', saved: '', deadline: '', storage: STORAGE_OPTIONS[0] });

  const [deleteModal, setDeleteModal] = useState({ isOpen: false, table: null, id: null, setFn: null });
  const [fundModal, setFundModal] = useState({ isOpen: false, goal: null, amount: '' });

  // --- LÓGICA DE SEGURIDAD (PIN) ---
  const handlePinPress = useCallback((digit) => {
    if (enteredPin.length < 4) {
      const newPin = enteredPin + digit;
      setEnteredPin(newPin);
      if (newPin.length === 4) {
        setTimeout(() => processPin(newPin), 150);
      }
    }
  }, [enteredPin, pinSetupStep, tempPin, savedPin]);

  const processPin = (currentPin) => {
    if (pinSetupStep === 'create') {
      setTempPin(currentPin);
      setEnteredPin('');
      setPinSetupStep('confirm');
    } else if (pinSetupStep === 'confirm') {
      if (currentPin === tempPin) {
        localStorage.setItem('wp_pin', currentPin);
        setSavedPin(currentPin);
        setIsAuthenticated(true);
      } else {
        triggerPinError('Los códigos no coinciden. Intenta de nuevo.', 'create');
      }
    } else if (pinSetupStep === 'enter') {
      if (currentPin === savedPin) {
        setIsAuthenticated(true);
      } else {
        triggerPinError('Código incorrecto.', 'enter');
      }
    }
  };

  const triggerPinError = (msg, nextStep) => {
    setPinError(true);
    setTimeout(() => {
      setEnteredPin('');
      setPinError(false);
      if (nextStep) setPinSetupStep(nextStep);
    }, 600);
  };

  // --- DATOS FINANCIEROS Y MATEMÁTICAS ---
  const filteredIncomes = useMemo(() => incomes.filter((i) => i.date.startsWith(selectedMonth)), [incomes, selectedMonth]);
  const filteredExpenses = useMemo(() => expenses.filter((e) => e.date.startsWith(selectedMonth)), [expenses, selectedMonth]);

  const monthIncomeTotal = filteredIncomes.reduce((s, i) => s + (Number(i.amount) - (Number(i.cost) || 0)), 0);
  const monthExpenseTotal = filteredExpenses.reduce((s, e) => s + Number(e.amount), 0);
  const monthNetFlow = monthIncomeTotal - monthExpenseTotal;

  const prevMonthStr = useMemo(() => {
    const [y, m] = selectedMonth.split('-');
    const d = new Date(y, parseInt(m) - 1, 1);
    d.setMonth(d.getMonth() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }, [selectedMonth]);

  const prevFilteredIncomes = useMemo(() => incomes.filter((i) => i.date.startsWith(prevMonthStr)), [incomes, prevMonthStr]);
  const prevFilteredExpenses = useMemo(() => expenses.filter((e) => e.date.startsWith(prevMonthStr)), [expenses, prevMonthStr]);

  const prevMonthIncomeTotal = prevFilteredIncomes.reduce((s, i) => s + (Number(i.amount) - (Number(i.cost) || 0)), 0);
  const prevMonthExpenseTotal = prevFilteredExpenses.reduce((s, e) => s + Number(e.amount), 0);
  const prevMonthNetFlow = prevMonthIncomeTotal - prevMonthExpenseTotal;

  const calcTrend = (current, prev) => {
    if (prev === 0) return 0;
    return ((current - prev) / Math.abs(prev)) * 100;
  };

  const incomeTrend = calcTrend(monthIncomeTotal, prevMonthIncomeTotal);
  const expenseTrend = calcTrend(monthExpenseTotal, prevMonthExpenseTotal);
  const flowTrend = calcTrend(monthNetFlow, prevMonthNetFlow);

  const historicalIncomeTotal = useMemo(() => incomes.reduce((s, i) => s + (Number(i.amount) - (Number(i.cost) || 0)), 0), [incomes]);
  const historicalExpenseTotal = useMemo(() => expenses.reduce((s, e) => s + Number(e.amount), 0), [expenses]);
  
  const capitalTotal = historicalIncomeTotal - historicalExpenseTotal;
  const totalSavedInGoals = useMemo(() => goals.reduce((s, g) => s + (Number(g.saved) || 0), 0), [goals]);
  const availableCash = capitalTotal - totalSavedInGoals;

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

  const expenseBreakdown = useMemo(() => {
    const breakdown = {};
    filteredExpenses.forEach(exp => {
      if (!breakdown[exp.category]) breakdown[exp.category] = 0;
      breakdown[exp.category] += Number(exp.amount);
    });
    return Object.keys(breakdown)
      .map(key => ({ name: key, value: breakdown[key] }))
      .sort((a, b) => b.value - a.value);
  }, [filteredExpenses]);

  // --- CRUD FUNCTIONS ---
  const handleQuickExpense = async (e) => {
    e.preventDefault();
    const amount = parseFloat(qAmount);
    if (isNaN(amount) || amount <= 0) return alert('Por favor, ingresa un monto válido.');

    const { data, error } = await supabase.from('expenses').insert([{ amount, category: qCategory, note: qNote, date: todayISO() }]).select();
    if (!error && data) {
      setExpenses((prev) => [data[0], ...prev]);
      setIsQuickAddOpen(false);
      setQAmount('');
      setQNote('');
      setQCategory(EXPENSE_CATEGORIES[0]);
    } else {
      alert("Error al guardar el gasto rápido.");
    }
  };

  const saveIncome = useCallback(async (e) => {
    e.preventDefault();
    const amount = parseFloat(incomeForm.amount);
    const cost = parseFloat(incomeForm.cost) || 0;
    if (isNaN(amount) || amount <= 0) return alert('Por favor, ingresa un monto válido mayor a 0.');
    if (cost < 0) return alert('El costo del insumo no puede ser negativo.');
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
    if (isNaN(amount) || amount <= 0) return alert('Por favor, ingresa un monto de gasto válido mayor a 0.');
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
    if (isNaN(target) || target <= 0) return alert('La meta de capital debe ser mayor a 0.');
    if (saved < 0) return alert('El capital ahorrado no puede ser negativo.');
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
    if (isNaN(deposit) || deposit <= 0) return alert('Ingresa un monto válido.');
    const newSavedAmount = Number(fundModal.goal.saved) + deposit;
    const { data, error } = await supabase.from('goals').update({ saved: newSavedAmount }).eq('id', fundModal.goal.id).select();
    if (!error && data) setGoals((prev) => prev.map((g) => (g.id === fundModal.goal.id ? data[0] : g)));
    setFundModal({ isOpen: false, goal: null, amount: '' });
  };

  const handleExportPDF = () => {
    try {
      const doc = new jsPDF();
      doc.setFontSize(22);
      doc.setTextColor(20, 20, 20);
      doc.text('WealthPulse', 14, 22);
      doc.setFontSize(14);
      doc.setTextColor(100, 100, 100);
      doc.text(`Estado de Cuenta - ${selectedMonth}`, 14, 30);
      doc.setFontSize(12);
      doc.setTextColor(0, 0, 0);
      doc.text('1. PATRIMONIO HISTÓRICO GLOBAL', 14, 45);
      
      autoTable(doc, {
        startY: 50,
        head: [['Capital Total Acumulado', 'Ahorrado en Metas', 'Capital Libre Disponible']],
        body: [[fmt.format(capitalTotal), fmt.format(totalSavedInGoals), fmt.format(availableCash)]],
        theme: 'grid',
        headStyles: { fillColor: [52, 211, 153], textColor: [255, 255, 255], fontStyle: 'bold' },
        styles: { fontSize: 10, halign: 'center' }
      });

      let finalY = doc.lastAutoTable.finalY + 15;
      doc.text(`2. FLUJO DEL MES (${selectedMonth})`, 14, finalY);

      autoTable(doc, {
        startY: finalY + 5,
        head: [['Ingresos Netos', 'Gastos Totales', 'Flujo Neto Mensual']],
        body: [[fmt.format(monthIncomeTotal), fmt.format(monthExpenseTotal), fmt.format(monthNetFlow)]],
        theme: 'grid',
        headStyles: { fillColor: [38, 38, 38], textColor: [255, 255, 255] },
        styles: { fontSize: 10, halign: 'center' }
      });

      finalY = doc.lastAutoTable.finalY + 15;
      doc.text('3. DESGLOSE DE INGRESOS', 14, finalY);
      
      const ingresosRows = filteredIncomes.map(i => [
        i.date, i.category, i.note || '-', fmt.format(i.amount),
        Number(i.cost) > 0 ? fmt.format(i.cost) : '-', fmt.format(Number(i.amount) - (Number(i.cost) || 0))
      ]);

      autoTable(doc, {
        startY: finalY + 5,
        head: [['Fecha', 'Categoría', 'Concepto / Nota', 'Cobro Bruto', 'Costo Insumo', 'Ingreso Neto']],
        body: ingresosRows.length > 0 ? ingresosRows : [['-', '-', 'Sin movimientos este mes', '-', '-', '-']],
        theme: 'striped',
        headStyles: { fillColor: [52, 211, 153] },
        styles: { fontSize: 9 }
      });

      finalY = doc.lastAutoTable.finalY + 15;
      if (finalY > 250) { doc.addPage(); finalY = 20; }

      doc.text('4. DESGLOSE DE GASTOS', 14, finalY);
      const gastosRows = filteredExpenses.map(e => [e.date, e.category, e.note || '-', fmt.format(e.amount)]);

      autoTable(doc, {
        startY: finalY + 5,
        head: [['Fecha', 'Categoría', 'Concepto / Nota', 'Monto del Gasto']],
        body: gastosRows.length > 0 ? gastosRows : [['-', '-', 'Sin movimientos este mes', '-']],
        theme: 'striped',
        headStyles: { fillColor: [244, 63, 94] },
        styles: { fontSize: 9 }
      });
      doc.save(`WealthPulse_Reporte_${selectedMonth}.pdf`);
    } catch (error) {
      console.error("Error al exportar PDF:", error);
      alert("Hubo un error generando el documento.");
    }
  };

  const CustomBarTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-neutral-900 border border-neutral-700 p-3 rounded-xl shadow-2xl">
          <p className="text-neutral-400 text-xs mb-1.5 font-semibold">Día {label}</p>
          {payload.map((entry, index) => (
            <p key={index} className={`text-sm font-mono font-bold ${entry.dataKey === 'ingresos' ? 'text-emerald-400' : 'text-rose-400'}`}>
              {entry.dataKey === 'ingresos' ? '+' : '-'}{mask(entry.value)}
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
            {mask(payload[0].value)}
          </p>
        </div>
      );
    }
    return null;
  };

  // --- RENDER 1: PANTALLA DE BLOQUEO (PIN LOCK) ---
  if (!isAuthenticated) {
    let instruction = 'Ingresa tu PIN';
    if (pinSetupStep === 'create') instruction = 'Crea un PIN de 4 dígitos';
    if (pinSetupStep === 'confirm') instruction = 'Confirma tu nuevo PIN';

    return (
      <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center p-6 antialiased font-sans">
        <div className="flex flex-col items-center max-w-sm w-full animate-fade-in-up">
          <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-neutral-800 to-neutral-900 shadow-2xl border border-neutral-700/50 flex items-center justify-center mb-8">
            <svg className="w-8 h-8 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          
          <h2 className="text-2xl font-bold text-white mb-2 tracking-tight">WealthPulse</h2>
          <p className="text-neutral-500 text-sm font-medium mb-10 h-5 transition-all">{instruction}</p>

          {/* Dots Indicator */}
          <div className={`flex gap-4 justify-center mb-12 transition-transform duration-200 ${pinError ? 'translate-x-2' : ''}`}>
            {[...Array(4)].map((_, i) => (
              <div key={i} className={`w-3.5 h-3.5 rounded-full transition-colors duration-300 ${
                pinError ? 'bg-rose-500' : enteredPin.length > i ? 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.5)]' : 'bg-neutral-800'
              }`} />
            ))}
          </div>

          {/* Keypad */}
          <div className="grid grid-cols-3 gap-5 w-full max-w-[280px]">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
              <button key={num} onClick={() => handlePinPress(num.toString())} className="w-20 h-20 mx-auto rounded-full bg-neutral-900/60 border border-neutral-800/40 text-2xl font-light text-white hover:bg-neutral-800 active:bg-neutral-700 active:scale-95 transition-all backdrop-blur-md flex items-center justify-center">
                {num}
              </button>
            ))}
            <div />
            <button onClick={() => handlePinPress('0')} className="w-20 h-20 mx-auto rounded-full bg-neutral-900/60 border border-neutral-800/40 text-2xl font-light text-white hover:bg-neutral-800 active:bg-neutral-700 active:scale-95 transition-all backdrop-blur-md flex items-center justify-center">
              0
            </button>
            <button onClick={() => setEnteredPin(prev => prev.slice(0, -1))} className="w-20 h-20 mx-auto rounded-full flex items-center justify-center text-neutral-500 hover:text-white hover:bg-neutral-900/30 active:scale-95 transition-all">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 12l6.414 6.414a2 2 0 001.414.586H19a2 2 0 002-2V7a2 2 0 00-2-2h-8.172a2 2 0 00-1.414.586L3 12z" /></svg>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- RENDER 2: SKELETONS (CARGA FANTASMA AL ESTILO APPLE) ---
  if (isLoading) {
    return (
      <div className="min-h-screen bg-neutral-950 p-4 sm:p-6 lg:p-8 antialiased">
        <div className="max-w-7xl mx-auto space-y-8 animate-pulse">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-5 border-b border-neutral-800/80 pb-6">
            <div className="flex gap-4 items-center">
              <div className="w-12 h-12 bg-neutral-900 rounded-2xl"></div>
              <div className="space-y-2">
                <div className="w-32 h-6 bg-neutral-900 rounded"></div>
                <div className="w-20 h-3 bg-neutral-900 rounded"></div>
              </div>
            </div>
          </div>
          <div className="w-full h-56 bg-gradient-to-b from-neutral-900/50 to-neutral-900/10 rounded-[2rem] border border-neutral-800/40"></div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <div className="h-36 bg-neutral-900/40 rounded-3xl border border-neutral-800/40"></div>
            <div className="h-36 bg-neutral-900/40 rounded-3xl border border-neutral-800/40"></div>
            <div className="h-36 bg-neutral-900/40 rounded-3xl border border-neutral-800/40"></div>
          </div>
        </div>
      </div>
    );
  }

  // --- RENDER 3: APLICACIÓN PRINCIPAL ---
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 antialiased font-sans transition-colors duration-500 relative">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 pb-32 lg:pb-8">
        
        {/* CABECERA (PDF REGRESA AQUÍ) */}
        <header className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-5 border-b border-neutral-800/80 pb-6">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-neutral-800 bg-gradient-to-b from-neutral-800 to-neutral-900 shadow-xl flex-shrink-0">
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
          
          <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto mt-2 sm:mt-0">
            <div className="flex items-center flex-1 sm:flex-none bg-neutral-900/60 border border-neutral-800 rounded-xl p-1.5 shadow-inner">
              <input 
                type="month" 
                className="w-full bg-transparent text-sm font-semibold text-neutral-100 outline-none px-2 cursor-pointer text-center sm:text-left" 
                value={selectedMonth} 
                onChange={(e) => setSelectedMonth(e.target.value)} 
              />
            </div>
            
            {/* Botón PDF restaurado y responsive */}
            <button 
              onClick={handleExportPDF}
              className="flex items-center justify-center gap-1.5 bg-neutral-800 text-neutral-300 hover:text-white hover:bg-emerald-600 px-4 py-2.5 rounded-xl transition-all shadow-md active:scale-95 border border-neutral-700/50"
            >
              <svg className="w-5 h-5 text-emerald-500 hover:text-white transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              <span className="hidden sm:inline text-xs font-bold tracking-wide">Exportar</span>
              {/* En móvil, mostramos solo la palabra PDF debajo o junto al ícono */}
              <span className="sm:hidden font-mono uppercase tracking-widest text-[10px] mt-0.5">PDF</span>
            </button>
          </div>
        </header>

        {/* --- CAPITAL TOTAL HISTÓRICO --- */}
        <div className="bg-gradient-to-b from-neutral-900/50 to-neutral-900/20 border border-neutral-800/60 rounded-[2rem] p-6 sm:p-8 text-center mb-8 backdrop-blur-sm shadow-xl">
          <h2 className="text-neutral-500 text-[10px] font-bold uppercase tracking-[0.25em] mb-2 flex items-center justify-center gap-2">
             Patrimonio Total Acumulado
          </h2>
          <div className="flex items-center justify-center gap-2 mt-4">
            <p className={`text-5xl sm:text-6xl font-bold tracking-tighter ${isPrivate ? 'text-neutral-600' : 'text-white'}`}>
              {mask(capitalTotal)}
            </p>
          </div>
          
          <div className="mt-6 flex flex-wrap items-center justify-center gap-5 sm:gap-10 border-t border-neutral-800/50 pt-5">
            <div className="flex flex-col items-center">
              <span className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest mb-1">Ahorrado en Metas</span>
              <span className="text-sm font-semibold text-emerald-400">{mask(totalSavedInGoals)}</span>
            </div>
            <div className="w-px h-8 bg-neutral-800/80"></div>
            <div className="flex flex-col items-center">
              <span className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest mb-1">Capital Libre</span>
              <span className="text-sm font-semibold text-neutral-300">{mask(availableCash)}</span>
            </div>
          </div>
        </div>

        {/* --- SECCIÓN 1: RESUMEN Y GRÁFICAS --- */}
        <div className={`${activeTab === 'resumen' ? 'block' : 'hidden'} lg:block`}>
          
          <div className="mb-8 grid grid-cols-1 gap-5 sm:grid-cols-3">
            <div className="rounded-3xl border border-neutral-800/60 bg-gradient-to-br from-neutral-900/50 to-neutral-950 p-6 shadow-xl flex flex-col justify-between">
              <div className="flex justify-between items-start mb-3">
                <p className="text-xs font-bold uppercase tracking-wider text-neutral-500">Ingresos Neto</p>
                <TrendBadge value={incomeTrend} />
              </div>
              <p className={`font-mono text-4xl font-semibold tracking-tight ${isPrivate ? 'text-neutral-600' : 'text-emerald-400'}`}>
                {mask(monthIncomeTotal)}
              </p>
            </div>
            
            <div className="rounded-3xl border border-neutral-800/60 bg-gradient-to-br from-neutral-900/50 to-neutral-950 p-6 shadow-xl flex flex-col justify-between">
              <div className="flex justify-between items-start mb-3">
                <p className="text-xs font-bold uppercase tracking-wider text-neutral-500">Gastos</p>
                <TrendBadge value={expenseTrend} invertColors={true} />
              </div>
              <p className={`font-mono text-4xl font-semibold tracking-tight ${isPrivate ? 'text-neutral-600' : 'text-rose-400'}`}>
                {mask(monthExpenseTotal)}
              </p>
            </div>

            <div className="rounded-3xl border border-neutral-800/60 bg-gradient-to-br from-neutral-900/50 to-neutral-950 p-6 shadow-xl flex flex-col justify-between">
              <div className="flex justify-between items-start mb-3">
                <p className="text-xs font-bold uppercase tracking-wider text-neutral-500">Flujo Mensual</p>
                <TrendBadge value={flowTrend} />
              </div>
              <p className={`font-mono text-4xl font-semibold tracking-tight ${isPrivate ? 'text-neutral-600' : (monthNetFlow >= 0 ? 'text-white' : 'text-rose-500')}`}>
                {mask(monthNetFlow)}
              </p>
            </div>
          </div>

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
                              <span className="text-neutral-400">{mask(item.value)}</span>
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
              
              <div className="border-t border-neutral-800/40 pt-4">
                <button type="button" onClick={() => setShowIncomesHistory(!showIncomesHistory)} className="w-full flex items-center justify-between py-2 group focus:outline-none">
                  <h3 className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 group-hover:text-emerald-400 transition-colors">Historial Reciente</h3>
                  <svg className={`w-4 h-4 text-neutral-500 group-hover:text-emerald-400 transition-transform duration-300 ${showIncomesHistory ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </button>

                <div className={`transition-all duration-300 ease-in-out overflow-hidden ${showIncomesHistory ? 'max-h-[800px] opacity-100 mt-4' : 'max-h-0 opacity-0'}`}>
                  <ul className="space-y-3 overflow-y-auto pr-2 max-h-64">
                    {filteredIncomes.map((i) => {
                      const net = Number(i.amount) - (Number(i.cost) || 0);
                      return (
                        <li key={i.id} className="flex justify-between items-center rounded-2xl bg-neutral-900/40 p-4 border border-neutral-800/40 transition-all hover:bg-neutral-800/60">
                          <div className="text-sm">
                            <p className="text-neutral-100 font-medium">{i.category} {i.note && <span className="text-neutral-500 font-normal ml-1">· {i.note}</span>}</p>
                            <div className="flex gap-2 items-center mt-1">
                              <span className="text-[10px] bg-neutral-800 text-neutral-400 px-1.5 py-0.5 rounded">{formatHumanDate(i.date)}</span>
                              {Number(i.cost) > 0 && <span className="text-[11px] text-neutral-500 font-mono">Cobro: {mask(i.amount)}</span>}
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <span className={`font-mono text-[15px] font-semibold ${isPrivate ? 'text-neutral-600' : 'text-emerald-400'}`}>+{mask(net)}</span>
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

              <div className="border-t border-neutral-800/40 pt-4">
                <button type="button" onClick={() => setShowExpensesHistory(!showExpensesHistory)} className="w-full flex items-center justify-between py-2 group focus:outline-none">
                  <h3 className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 group-hover:text-rose-400 transition-colors">Historial Reciente</h3>
                  <svg className={`w-4 h-4 text-neutral-500 group-hover:text-rose-400 transition-transform duration-300 ${showExpensesHistory ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </button>

                <div className={`transition-all duration-300 ease-in-out overflow-hidden ${showExpensesHistory ? 'max-h-[800px] opacity-100 mt-4' : 'max-h-0 opacity-0'}`}>
                  <ul className="space-y-3 overflow-y-auto pr-2 max-h-64">
                    {filteredExpenses.map((e) => (
                      <li key={e.id} className="flex justify-between items-center rounded-2xl bg-neutral-900/40 p-4 border border-neutral-800/40 transition-all hover:bg-neutral-800/60">
                        <div className="text-sm">
                          <p className="text-neutral-100 font-medium">{e.category} {e.note && <span className="text-neutral-500 font-normal ml-1">· {e.note}</span>}</p>
                          <div className="mt-1"><span className="text-[10px] bg-neutral-800 text-neutral-400 px-1.5 py-0.5 rounded">{formatHumanDate(e.date)}</span></div>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className={`font-mono text-[15px] font-semibold ${isPrivate ? 'text-neutral-600' : 'text-rose-400'}`}>-{mask(e.amount)}</span>
                          <div className="flex items-center gap-1.5 border-l border-neutral-800 pl-4">
                            <button onClick={() => setExpenseForm(e)} className="p-1.5 text-neutral-500 hover:text-emerald-400 hover:bg-emerald-400/10 rounded-lg transition-all"><Icon.Edit className="h-4 w-4" /></button>
                            <button onClick={() => handleDeleteClick('expenses', e.id, setExpenses)} className="p-1.5 text-neutral-500 hover:text-rose-400 hover:bg-rose-400/10 rounded-lg transition-all"><Icon.Trash className="h-4 w-4" /></button>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
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
                          {mask(saved)} <span className="text-neutral-600 text-sm font-normal">/ {mask(target)}</span>
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
                          <span className={`font-mono text-sm mt-0.5 font-bold ${isPrivate ? 'text-neutral-600' : 'text-emerald-400'}`}>
                            {mask(weeklyNeeded)}<span className="text-neutral-500 text-[10px] font-sans"> x {weeksLeft} sem</span>
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

      {/* --- NUEVA NAVEGACIÓN MÓVIL (DISEÑO APPLE PAY) --- */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-neutral-950/90 backdrop-blur-xl border-t border-neutral-800/80 z-40 h-[72px]">
        
        {/* Botón Flotante Central (FAB) con Recorte */}
        <div className="absolute left-1/2 -top-7 -translate-x-1/2 bg-neutral-950 p-2 rounded-full">
          <button 
            onClick={() => setIsQuickAddOpen(true)} 
            className="flex items-center justify-center w-[56px] h-[56px] bg-emerald-500 hover:bg-emerald-400 rounded-full shadow-[0_0_20px_rgba(16,185,129,0.4)] text-white transition-transform active:scale-90"
          >
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>

        {/* Iconos Laterales simétricos */}
        <ul className="flex justify-between items-center h-full px-4 pb-safe">
          <div className="flex w-[42%] justify-between px-2">
            <button onClick={() => setActiveTab('resumen')} className={`flex flex-col items-center transition-all ${activeTab === 'resumen' ? 'text-emerald-400' : 'text-neutral-500 hover:text-neutral-300'}`}>
              <Icon.Home className="h-6 w-6 mb-0.5" />
              <span className="text-[9px] font-bold tracking-wide">Resumen</span>
            </button>
            <button onClick={() => setActiveTab('transacciones')} className={`flex flex-col items-center transition-all ${activeTab === 'transacciones' ? 'text-emerald-400' : 'text-neutral-500 hover:text-neutral-300'}`}>
              <Icon.Wallet className="h-6 w-6 mb-0.5" />
              <span className="text-[9px] font-bold tracking-wide">Tracker</span>
            </button>
          </div>
          
          <div className="flex w-[42%] justify-between px-2">
            <button onClick={() => setActiveTab('metas')} className={`flex flex-col items-center transition-all ${activeTab === 'metas' ? 'text-emerald-400' : 'text-neutral-500 hover:text-neutral-300'}`}>
              <Icon.Target className="h-6 w-6 mb-0.5" />
              <span className="text-[9px] font-bold tracking-wide">Metas</span>
            </button>
            {/* Ocultar Montos en menú inferior */}
            <button onClick={() => setIsPrivate(!isPrivate)} className={`flex flex-col items-center transition-all ${isPrivate ? 'text-emerald-400' : 'text-neutral-500 hover:text-neutral-300'}`}>
              {isPrivate ? (
                <svg className="w-6 h-6 mb-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
              ) : (
                <svg className="w-6 h-6 mb-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
              )}
              <span className="text-[9px] font-bold tracking-wide">Ocultar</span>
            </button>
          </div>
        </ul>
      </nav>

      {/* --- BOTTOM SHEET MODAL (CAPTURA RÁPIDA) --- */}
      <div className={`fixed inset-0 z-50 transition-opacity duration-300 ${isQuickAddOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
        {/* Capa de desenfoque trasera */}
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setIsQuickAddOpen(false)}></div>
        
        {/* Tarjeta deslizable */}
        <div className={`absolute bottom-0 left-0 right-0 bg-neutral-900 border-t border-neutral-800 rounded-t-[2.5rem] p-6 pb-safe transition-transform duration-300 transform ${isQuickAddOpen ? 'translate-y-0' : 'translate-y-full'}`}>
          <div className="w-12 h-1.5 bg-neutral-700 rounded-full mx-auto mb-6"></div>
          <h3 className="text-xl font-bold text-white tracking-tight mb-6 text-center">Gasto Rápido</h3>
          
          <form onSubmit={handleQuickExpense} className="flex flex-col gap-4">
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500 font-mono text-xl">$</span>
              <input type="number" step="any" min="0.01" required autoFocus placeholder="0.00" className="w-full rounded-2xl border border-neutral-700 bg-neutral-950 px-4 py-4 pl-9 text-2xl font-mono text-white outline-none transition-all focus:border-emerald-500/50" value={qAmount} onChange={(e) => setQAmount(e.target.value)} />
            </div>

            <select className="w-full rounded-2xl border border-neutral-700 bg-neutral-950 px-4 py-3.5 text-sm font-medium text-white outline-none focus:border-emerald-500/50" value={qCategory} onChange={(e) => setQCategory(e.target.value)}>
              {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>

            <input type="text" placeholder="¿En qué gastaste? (Opcional)" className="w-full rounded-2xl border border-neutral-700 bg-neutral-950 px-4 py-3.5 text-sm font-medium text-white outline-none placeholder:text-neutral-600 focus:border-emerald-500/50" value={qNote} onChange={(e) => setQNote(e.target.value)} />
            
            <button type="submit" className="mt-2 w-full rounded-2xl bg-emerald-600 px-4 py-4 text-sm font-bold tracking-wide text-white shadow-lg shadow-emerald-600/20 active:scale-[0.98] transition-all">
              Guardar Gasto
            </button>
          </form>
        </div>
      </div>

      {/* MODALES CLÁSICOS */}
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