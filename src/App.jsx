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
  'Comida': '#F59E0B', 
  'Servicios': '#8B5CF6', 
  'Insumos Taller/Refacciones': '#06B6D4', 
  'Transporte': '#3B82F6', 
  'Gustos': '#EC4899'  
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

/* --- ESTILOS GLOBALES (Fix de bandas laterales en PC y Fechas en iOS) --- */
const GlobalStyles = () => (
  <style>{`
    /* RESET AGRESIO VITE: Elimina las bandas laterales grises en PC */
    html, body, #root {
      margin: 0 !important;
      padding: 0 !important;
      max-width: 100% !important;
      width: 100% !important;
      background-color: #000000 !important;
      overflow-x: hidden;
    }

    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
    ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
    * { scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.1) transparent; }
    
    /* Forzar alineación izquierda estricta en iOS Safari para fechas */
    input[type="date"], input[type="month"] {
      text-align: left !important;
      -webkit-appearance: none;
      display: block;
      width: 100%;
    }
    input[type="date"]::-webkit-date-and-time-value, 
    input[type="month"]::-webkit-date-and-time-value {
      text-align: left !important;
    }
    input[type="date"]::-webkit-calendar-picker-indicator,
    input[type="month"]::-webkit-calendar-picker-indicator {
      filter: invert(1);
      opacity: 0.6;
    }
  `}</style>
);

/* --- COMPONENTES LIQUID GLASS --- */
const GlassCard = ({ children, className = '' }) => (
  <div className={`bg-white/[0.04] backdrop-blur-[40px] border border-white/[0.08] shadow-[0_8px_32px_0_rgba(0,0,0,0.3)] rounded-[32px] ${className}`}>
    {children}
  </div>
);

const GlassInput = (props) => (
  <input 
    {...props} 
    className={`w-full bg-black/20 backdrop-blur-xl border border-white/10 rounded-[20px] px-5 py-4 text-[17px] text-white outline-none placeholder:text-white/40 focus:border-emerald-500/50 focus:bg-white/[0.05] transition-all shadow-[inset_0_2px_10px_rgba(0,0,0,0.2)] ${props.className || ''}`}
  />
);

const GlassSelect = (props) => (
  <select 
    {...props} 
    className={`w-full bg-black/20 backdrop-blur-xl border border-white/10 rounded-[20px] px-5 py-4 text-[17px] text-white outline-none focus:border-emerald-500/50 focus:bg-white/[0.05] transition-all shadow-[inset_0_2px_10px_rgba(0,0,0,0.2)] appearance-none ${props.className || ''}`}
  >
    {props.children}
  </select>
);

const GlassButton = ({ children, onClick, type = "button", variant = 'primary', className = '' }) => {
  const baseStyle = "w-full rounded-[20px] px-5 py-4 text-[17px] font-bold tracking-wide transition-all active:scale-[0.97] flex justify-center items-center gap-2";
  const variants = {
    primary: "bg-emerald-500 text-black shadow-[0_0_20px_rgba(52,211,153,0.3)] hover:shadow-[0_0_30px_rgba(52,211,153,0.5)] border border-emerald-400",
    danger: "bg-rose-500 text-white shadow-[0_0_20px_rgba(244,63,94,0.3)] border border-rose-400",
    glass: "bg-white/10 backdrop-blur-md text-white border border-white/10 hover:bg-white/20"
  };
  return <button type={type} onClick={onClick} className={`${baseStyle} ${variants[variant]} ${className}`}>{children}</button>;
};

const TrendBadge = ({ value, invertColors = false }) => {
  if (value === 0 || isNaN(value)) return <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full text-white/50 bg-white/5 border border-white/10 backdrop-blur-md">≈ 0%</span>;
  const isPositive = value > 0;
  const isGood = invertColors ? !isPositive : isPositive;
  const colorCls = isGood ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' : 'text-rose-400 bg-rose-500/10 border-rose-500/20';
  const icon = isPositive ? '↑' : '↓';
  return (
    <span className={`text-[12px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1 w-max border backdrop-blur-md shadow-inner ${colorCls}`}>
      {icon} {Math.abs(value).toFixed(1)}%
    </span>
  );
};

/* ------------------------------- APP PRINCIPAL ------------------------------- */
export default function App() {
  const { incomes, setIncomes, expenses, setExpenses, goals, setGoals, isLoading } = useFinanceData();
  
  // ESTADOS DE SEGURIDAD
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [savedPin, setSavedPin] = useState(() => localStorage.getItem('wp_pin'));
  const [pinSetupStep, setPinSetupStep] = useState(savedPin ? 'enter' : 'create'); 
  const [tempPin, setTempPin] = useState('');
  const [enteredPin, setEnteredPin] = useState('');
  const [pinError, setPinError] = useState(false);

  // ESTADOS GLOBALES
  const [selectedMonth, setSelectedMonth] = useState(currentMonthStr());
  const [activeTab, setActiveTab] = useState('resumen');
  const [isPrivate, setIsPrivate] = useState(false);
  const mask = (val) => isPrivate ? '••••••' : fmt.format(val);

  const [showIncomesHistory, setShowIncomesHistory] = useState(false);
  const [showExpensesHistory, setShowExpensesHistory] = useState(false);
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);

  // ESTADOS FORMULARIOS
  const [qAmount, setQAmount] = useState('');
  const [qCategory, setQCategory] = useState(EXPENSE_CATEGORIES[0]);
  const [qNote, setQNote] = useState('');

  const [incomeForm, setIncomeForm] = useState({ id: null, amount: '', cost: '', category: INCOME_CATEGORIES[0], note: '', date: todayISO() });
  const [expenseForm, setExpenseForm] = useState({ id: null, amount: '', category: EXPENSE_CATEGORIES[0], note: '', date: todayISO() });
  const [goalForm, setGoalForm] = useState({ id: null, name: '', target: '', saved: '', deadline: '', storage: STORAGE_OPTIONS[0] });

  const [deleteModal, setDeleteModal] = useState({ isOpen: false, table: null, id: null, setFn: null });
  const [fundModal, setFundModal] = useState({ isOpen: false, goal: null, amount: '' });

  // LOGICA PIN
  const handlePinPress = useCallback((digit) => {
    if (enteredPin.length < 4) {
      const newPin = enteredPin + digit;
      setEnteredPin(newPin);
      if (newPin.length === 4) setTimeout(() => processPin(newPin), 10);
    }
  }, [enteredPin, pinSetupStep, tempPin, savedPin]);

  const processPin = (currentPin) => {
    if (pinSetupStep === 'create') {
      setTempPin(currentPin); setEnteredPin(''); setPinSetupStep('confirm');
    } else if (pinSetupStep === 'confirm') {
      if (currentPin === tempPin) {
        localStorage.setItem('wp_pin', currentPin); setSavedPin(currentPin); setIsAuthenticated(true);
      } else triggerPinError();
    } else if (pinSetupStep === 'enter') {
      if (currentPin === savedPin) setIsAuthenticated(true);
      else triggerPinError();
    }
  };

  const triggerPinError = () => {
    setPinError(true);
    setTimeout(() => { setEnteredPin(''); setPinError(false); }, 400);
  };

  // DATOS MATEMÁTICOS Y FILTROS
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

  const calcTrend = (current, prev) => prev === 0 ? 0 : ((current - prev) / Math.abs(prev)) * 100;
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
    filteredIncomes.forEach(inc => { const dayIdx = parseInt(inc.date.split('-')[2]) - 1; if(data[dayIdx]) data[dayIdx].ingresos += (Number(inc.amount) - (Number(inc.cost)||0)); });
    filteredExpenses.forEach(exp => { const dayIdx = parseInt(exp.date.split('-')[2]) - 1; if(data[dayIdx]) data[dayIdx].gastos += Number(exp.amount); });
    return data;
  }, [filteredIncomes, filteredExpenses, selectedMonth]);

  const expenseBreakdown = useMemo(() => {
    const breakdown = {};
    filteredExpenses.forEach(exp => { if (!breakdown[exp.category]) breakdown[exp.category] = 0; breakdown[exp.category] += Number(exp.amount); });
    return Object.keys(breakdown).map(key => ({ name: key, value: breakdown[key] })).sort((a, b) => b.value - a.value);
  }, [filteredExpenses]);

  // CRUD GASTO RÁPIDO
  const handleQuickExpense = async (e) => {
    e.preventDefault(); const amount = parseFloat(qAmount);
    if (isNaN(amount) || amount <= 0) return alert('Monto inválido.');
    const { data, error } = await supabase.from('expenses').insert([{ amount, category: qCategory, note: qNote, date: todayISO() }]).select();
    if (!error && data) { setExpenses((prev) => [data[0], ...prev]); setIsQuickAddOpen(false); setQAmount(''); setQNote(''); setQCategory(EXPENSE_CATEGORIES[0]); }
  };

  // CRUD INGRESOS
  const saveIncome = useCallback(async (e) => {
    e.preventDefault(); const amount = parseFloat(incomeForm.amount); const cost = parseFloat(incomeForm.cost) || 0;
    if (isNaN(amount) || amount <= 0) return alert('Monto inválido.');
    if (cost < 0) return alert('Costo inválido.');
    
    if (incomeForm.id) {
      const { data, error } = await supabase.from('incomes').update({ amount, cost, category: incomeForm.category, note: incomeForm.note, date: incomeForm.date }).eq('id', incomeForm.id).select();
      if (!error && data) setIncomes((prev) => prev.map((i) => (i.id === incomeForm.id ? data[0] : i)));
    } else {
      const { data, error } = await supabase.from('incomes').insert([{ amount, cost, category: incomeForm.category, note: incomeForm.note, date: incomeForm.date }]).select();
      if (!error && data) setIncomes((prev) => [data[0], ...prev]);
    }
    setIncomeForm({ id: null, amount: '', cost: '', category: INCOME_CATEGORIES[0], note: '', date: todayISO() });
  }, [incomeForm]);

  // CRUD GASTOS
  const saveExpense = useCallback(async (e) => {
    e.preventDefault(); const amount = parseFloat(expenseForm.amount);
    if (isNaN(amount) || amount <= 0) return alert('Monto inválido.');
    if (expenseForm.id) {
      const { data, error } = await supabase.from('expenses').update({ amount, category: expenseForm.category, note: expenseForm.note, date: expenseForm.date }).eq('id', expenseForm.id).select();
      if (!error && data) setExpenses((prev) => prev.map((ex) => (ex.id === expenseForm.id ? data[0] : ex)));
    } else {
      const { data, error } = await supabase.from('expenses').insert([{ amount, category: expenseForm.category, note: expenseForm.note, date: expenseForm.date }]).select();
      if (!error && data) setExpenses((prev) => [data[0], ...prev]);
    }
    setExpenseForm({ id: null, amount: '', category: EXPENSE_CATEGORIES[0], note: '', date: todayISO() });
  }, [expenseForm]);

  // CRUD METAS
  const saveGoal = useCallback(async (e) => {
    e.preventDefault(); const target = parseFloat(goalForm.target); const saved = parseFloat(goalForm.saved) || 0;
    if (isNaN(target) || target <= 0) return alert('Meta inválida.');
    if (saved < 0) return alert('Ahorro inválido.');
    
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
    const { table, id, setFn } = deleteModal; const { error } = await supabase.from(table).delete().eq('id', id);
    if (!error) setFn((prev) => prev.filter((item) => item.id !== id));
    setDeleteModal({ isOpen: false, table: null, id: null, setFn: null });
  };

  const handleAddFundsClick = (goal) => setFundModal({ isOpen: true, goal, amount: '' });
  const confirmAddFunds = async (e) => {
    e.preventDefault(); const deposit = parseFloat(fundModal.amount);
    if (isNaN(deposit) || deposit <= 0) return alert('Monto inválido.');
    const newSavedAmount = Number(fundModal.goal.saved) + deposit;
    const { data, error } = await supabase.from('goals').update({ saved: newSavedAmount }).eq('id', fundModal.goal.id).select();
    if (!error && data) setGoals((prev) => prev.map((g) => (g.id === fundModal.goal.id ? data[0] : g)));
    setFundModal({ isOpen: false, goal: null, amount: '' });
  };

  // SOLUCIÓN PDF: Restauradas las 4 tablas
  const handleExportPDF = () => {
    try {
      const doc = new jsPDF();
      doc.setFontSize(22); doc.setTextColor(20, 20, 20); doc.text('WealthPulse', 14, 22);
      doc.setFontSize(14); doc.setTextColor(100, 100, 100); doc.text(`Estado de Cuenta - ${selectedMonth}`, 14, 30);
      
      doc.setFontSize(12); doc.setTextColor(0, 0, 0); doc.text('1. PATRIMONIO GLOBAL', 14, 45);
      autoTable(doc, {
        startY: 50, head: [['Capital Total', 'Ahorrado en Metas', 'Capital Libre']],
        body: [[fmt.format(capitalTotal), fmt.format(totalSavedInGoals), fmt.format(availableCash)]],
        theme: 'grid', headStyles: { fillColor: [52, 199, 89], textColor: [255, 255, 255] }, styles: { fontSize: 10, halign: 'center' }
      });

      let finalY = doc.lastAutoTable.finalY + 15;
      doc.text(`2. FLUJO DEL MES (${selectedMonth})`, 14, finalY);
      autoTable(doc, {
        startY: finalY + 5, head: [['Ingresos Netos', 'Gastos Totales', 'Flujo Neto']],
        body: [[fmt.format(monthIncomeTotal), fmt.format(monthExpenseTotal), fmt.format(monthNetFlow)]],
        theme: 'grid', headStyles: { fillColor: [28, 28, 30], textColor: [255, 255, 255] }, styles: { fontSize: 10, halign: 'center' }
      });

      finalY = doc.lastAutoTable.finalY + 15;
      doc.text('3. DESGLOSE DE INGRESOS', 14, finalY);
      const ingresosRows = filteredIncomes.map(i => [
        i.date, i.category, i.note || '-', fmt.format(i.amount),
        Number(i.cost) > 0 ? fmt.format(i.cost) : '-', fmt.format(Number(i.amount) - (Number(i.cost) || 0))
      ]);
      autoTable(doc, {
        startY: finalY + 5, head: [['Fecha', 'Categoría', 'Nota', 'Cobro Bruto', 'Costo', 'Neto']],
        body: ingresosRows.length > 0 ? ingresosRows : [['-', '-', 'Sin ingresos', '-', '-', '-']],
        theme: 'striped', headStyles: { fillColor: [52, 199, 89] }, styles: { fontSize: 9 }
      });

      finalY = doc.lastAutoTable.finalY + 15;
      if (finalY > 250) { doc.addPage(); finalY = 20; }
      doc.text('4. DESGLOSE DE GASTOS', 14, finalY);
      const gastosRows = filteredExpenses.map(e => [e.date, e.category, e.note || '-', fmt.format(e.amount)]);
      autoTable(doc, {
        startY: finalY + 5, head: [['Fecha', 'Categoría', 'Nota', 'Monto']],
        body: gastosRows.length > 0 ? gastosRows : [['-', '-', 'Sin gastos', '-']],
        theme: 'striped', headStyles: { fillColor: [255, 59, 48] }, styles: { fontSize: 9 }
      });

      doc.save(`WealthPulse_${selectedMonth}.pdf`);
    } catch (error) { 
      console.error(error); alert("Error al exportar el PDF."); 
    }
  };

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-black/60 backdrop-blur-3xl border border-white/10 p-4 rounded-[20px] shadow-2xl">
          <p className="text-white/60 text-xs font-bold mb-2 uppercase tracking-widest">{payload[0].name || `Día ${label}`}</p>
          {payload.map((entry, index) => (
            <p key={index} className={`text-[17px] font-bold tracking-wide ${entry.dataKey === 'ingresos' ? 'text-emerald-400' : entry.dataKey === 'gastos' ? 'text-rose-400' : 'text-white'}`}>
              {entry.dataKey === 'ingresos' ? '+' : entry.dataKey === 'gastos' ? '-' : ''}{mask(entry.value)}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  // --- RENDER 1: PANTALLA PIN ---
  if (!isAuthenticated) {
    let instruction = pinSetupStep === 'create' ? 'Crea un PIN' : pinSetupStep === 'confirm' ? 'Confirma el PIN' : 'Desbloquear WealthPulse';
    return (
      <main className="relative min-h-screen bg-black flex flex-col items-center justify-center p-6 overflow-hidden font-sans">
        <GlobalStyles />
        <div className="absolute top-[-10%] left-[-10%] w-[60vw] h-[60vw] bg-emerald-500/20 rounded-full blur-[100px] pointer-events-none"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[70vw] h-[70vw] bg-blue-500/20 rounded-full blur-[120px] pointer-events-none"></div>
        
        <div className="relative z-10 w-full max-w-[320px] flex flex-col items-center">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(52,211,153,0.4)]">
            <Icon.Pulse className="h-8 w-8 text-black" />
          </div>
          <h2 className="text-[22px] text-white font-bold tracking-tight mb-8 text-center">{instruction}</h2>
          
          <div className={`flex gap-5 justify-center mb-12 transition-transform duration-200 ${pinError ? 'translate-x-3' : ''}`}>
            {[...Array(4)].map((_, i) => (
              <div key={i} className={`w-4 h-4 rounded-full transition-all duration-300 ${pinError ? 'bg-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.6)]' : enteredPin.length > i ? 'bg-emerald-400 shadow-[0_0_15px_rgba(52,211,153,0.6)] scale-110' : 'bg-white/10 border border-white/20'}`} />
            ))}
          </div>

          <div className="grid grid-cols-3 gap-x-6 gap-y-5 w-full">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
              <button key={num} onClick={() => handlePinPress(num.toString())} className="w-[76px] h-[76px] mx-auto rounded-full bg-white/5 hover:bg-white/10 active:bg-white/20 border border-white/10 text-[32px] font-light text-white transition-all backdrop-blur-md flex items-center justify-center shadow-[inset_0_2px_4px_rgba(255,255,255,0.1)]">
                {num}
              </button>
            ))}
            <div />
            <button onClick={() => handlePinPress('0')} className="w-[76px] h-[76px] mx-auto rounded-full bg-white/5 hover:bg-white/10 active:bg-white/20 border border-white/10 text-[32px] font-light text-white transition-all backdrop-blur-md flex items-center justify-center shadow-[inset_0_2px_4px_rgba(255,255,255,0.1)]">0</button>
            <button onClick={() => setEnteredPin(prev => prev.slice(0, -1))} className="w-[76px] h-[76px] mx-auto rounded-full flex items-center justify-center text-white/50 hover:text-white active:scale-95 transition-all">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 12l6.414 6.414a2 2 0 001.414.586H19a2 2 0 002-2V7a2 2 0 00-2-2h-8.172a2 2 0 00-1.414.586L3 12z" /></svg>
            </button>
          </div>
        </div>
      </main>
    );
  }

  // --- RENDER 2: SKELETONS ---
  if (isLoading) {
    return (
      <main className="relative min-h-screen bg-black overflow-hidden p-6 font-sans">
        <GlobalStyles />
        <div className="absolute top-[-20%] left-[-10%] w-[70vw] h-[70vw] bg-emerald-600/10 rounded-full blur-[140px] pointer-events-none"></div>
        <div className="absolute bottom-[10%] right-[-20%] w-[80vw] h-[80vw] bg-blue-600/10 rounded-full blur-[150px] pointer-events-none"></div>
        
        <div className="relative z-10 max-w-7xl mx-auto space-y-8 pt-6">
          <div className="flex justify-between items-end">
            <div className="w-48 h-10 bg-white/5 backdrop-blur-md rounded-xl animate-pulse"></div>
            <div className="flex gap-3">
              <div className="w-10 h-10 bg-white/5 backdrop-blur-md rounded-full animate-pulse"></div>
              <div className="w-10 h-10 bg-white/5 backdrop-blur-md rounded-full animate-pulse"></div>
            </div>
          </div>
          <div className="w-full h-40 bg-white/5 backdrop-blur-md rounded-[32px] animate-pulse"></div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <div className="h-32 bg-white/5 backdrop-blur-md rounded-[32px] animate-pulse"></div>
            <div className="h-32 bg-white/5 backdrop-blur-md rounded-[32px] animate-pulse"></div>
            <div className="h-32 bg-white/5 backdrop-blur-md rounded-[32px] animate-pulse"></div>
          </div>
        </div>
      </main>
    );
  }

  // --- RENDER 3: APP PRINCIPAL ---
  return (
    <main className="relative min-h-screen bg-black text-white font-sans overflow-x-hidden pb-[120px]">
      <GlobalStyles />
      
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-[-20%] left-[-10%] w-[70vw] h-[70vw] bg-emerald-600/10 rounded-full blur-[140px] mix-blend-screen"></div>
        <div className="absolute bottom-[10%] right-[-20%] w-[80vw] h-[80vw] bg-blue-600/10 rounded-full blur-[150px] mix-blend-screen"></div>
        <div className="absolute top-[40%] left-[20%] w-[50vw] h-[50vw] bg-purple-600/10 rounded-full blur-[120px] mix-blend-screen"></div>
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 pt-10">
        
        {/* CABECERA */}
        <header className="flex flex-col gap-6 mb-10">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h1 className="text-[36px] sm:text-[44px] font-extrabold tracking-tighter leading-none bg-clip-text text-transparent bg-gradient-to-br from-white via-white to-white/50 mb-1">
                WealthPulse
              </h1>
              <p className="text-[13px] text-emerald-400 font-mono tracking-widest uppercase flex items-center gap-2">
                <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span></span>
                Real-Time Sync
              </p>
            </div>
            
            <div className="hidden sm:flex bg-white/5 backdrop-blur-xl border border-white/10 rounded-full p-1.5 shadow-inner">
              <button onClick={() => setActiveTab('resumen')} className={`px-6 py-2 rounded-full text-[14px] font-bold transition-all ${activeTab === 'resumen' ? 'bg-white/10 text-white shadow-md' : 'text-white/40 hover:text-white/80'}`}>Resumen</button>
              <button onClick={() => setActiveTab('transacciones')} className={`px-6 py-2 rounded-full text-[14px] font-bold transition-all ${activeTab === 'transacciones' ? 'bg-white/10 text-white shadow-md' : 'text-white/40 hover:text-white/80'}`}>Tracker</button>
              <button onClick={() => setActiveTab('metas')} className={`px-6 py-2 rounded-full text-[14px] font-bold transition-all ${activeTab === 'metas' ? 'bg-white/10 text-white shadow-md' : 'text-white/40 hover:text-white/80'}`}>Metas</button>
            </div>
          </div>

          <div className="flex flex-row items-center gap-3 w-full sm:justify-end">
            <div className="relative flex items-center bg-black/20 backdrop-blur-xl border border-white/10 rounded-[16px] px-4 py-3 shadow-[inset_0_2px_10px_rgba(0,0,0,0.2)] flex-1 sm:flex-none sm:w-auto w-full">
              <input 
                type="month" 
                className="w-full bg-transparent text-[15px] font-semibold text-white outline-none cursor-pointer" 
                value={selectedMonth} 
                onChange={(e) => setSelectedMonth(e.target.value.slice(0, 7))} 
              />
            </div>
            <GlassButton variant="glass" className="!w-auto !p-3 !rounded-[16px]" onClick={() => setIsPrivate(!isPrivate)}>
              {isPrivate ? <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg> 
              : <svg className="w-5 h-5 text-white/70" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>}
            </GlassButton>
            <GlassButton variant="glass" className="!w-auto !p-3 !rounded-[16px]" onClick={handleExportPDF}>
              <svg className="w-5 h-5 text-white/70" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            </GlassButton>
            <GlassButton variant="primary" className="hidden sm:flex !w-auto !py-3 !px-5 !rounded-[16px] ml-4" onClick={() => setIsQuickAddOpen(true)}>
              <Icon.Plus className="w-5 h-5"/> Gasto Rápido
            </GlassButton>
          </div>
        </header>

        {/* BALANCE TOTAL */}
        <div className="text-center mb-10">
          <p className="text-[12px] text-white/50 font-bold uppercase tracking-[0.2em] mb-2">Patrimonio Global</p>
          <h2 className="text-[60px] sm:text-[80px] font-extrabold tracking-tighter leading-none bg-clip-text text-transparent bg-gradient-to-b from-white to-white/60 drop-shadow-2xl">
            {mask(capitalTotal)}
          </h2>
          <div className="flex justify-center items-center gap-6 mt-6 bg-white/5 backdrop-blur-xl border border-white/10 rounded-full w-max mx-auto px-6 py-2">
            <span className="text-[14px] text-white/60 font-medium">Metas <span className="text-white ml-1">{mask(totalSavedInGoals)}</span></span>
            <div className="w-1 h-1 bg-white/20 rounded-full"></div>
            <span className="text-[14px] text-white/60 font-medium">Libre <span className="text-emerald-400 ml-1">{mask(availableCash)}</span></span>
          </div>
        </div>

        {/* PESTAÑA: RESUMEN */}
        <div className={`${activeTab === 'resumen' ? 'block' : 'hidden'} animate-fade-in`}>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-8">
            <GlassCard className="p-6 flex flex-col justify-between hover:bg-white/[0.06] transition-colors">
              <div className="flex justify-between items-start mb-4">
                <span className="text-[13px] font-bold text-white/50 uppercase tracking-wider">Ingresos</span>
                <TrendBadge value={incomeTrend} />
              </div>
              <p className={`text-left text-[36px] font-bold tracking-tighter ${isPrivate ? 'text-white/40' : 'text-emerald-400 drop-shadow-[0_0_15px_rgba(52,211,153,0.3)]'}`}>{mask(monthIncomeTotal)}</p>
            </GlassCard>
            
            <GlassCard className="p-6 flex flex-col justify-between hover:bg-white/[0.06] transition-colors">
              <div className="flex justify-between items-start mb-4">
                <span className="text-[13px] font-bold text-white/50 uppercase tracking-wider">Gastos</span>
                <TrendBadge value={expenseTrend} invertColors={true} />
              </div>
              <p className={`text-left text-[36px] font-bold tracking-tighter ${isPrivate ? 'text-white/40' : 'text-rose-400 drop-shadow-[0_0_15px_rgba(244,63,94,0.3)]'}`}>{mask(monthExpenseTotal)}</p>
            </GlassCard>

            <GlassCard className="p-6 flex flex-col justify-between hover:bg-white/[0.06] transition-colors">
              <div className="flex justify-between items-start mb-4">
                <span className="text-[13px] font-bold text-white/50 uppercase tracking-wider">Flujo</span>
                <TrendBadge value={flowTrend} />
              </div>
              <p className={`text-left text-[36px] font-bold tracking-tighter ${isPrivate ? 'text-white/40' : monthNetFlow >= 0 ? 'text-white' : 'text-rose-500'}`}>{mask(monthNetFlow)}</p>
            </GlassCard>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            <GlassCard className="lg:col-span-2 p-6">
              <h3 className="text-[15px] font-bold text-white/60 uppercase tracking-widest mb-6">Tendencia del Mes</h3>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                    <XAxis dataKey="day" stroke="#ffffff40" fontSize={12} tickLine={false} axisLine={false} />
                    <Tooltip content={<CustomTooltip />} cursor={{fill: '#ffffff10'}} />
                    <Bar dataKey="ingresos" fill="#34C759" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="gastos" fill="#FF3B30" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </GlassCard>
            
            <GlassCard className="lg:col-span-1 p-6 flex flex-col items-center">
              <h3 className="text-[15px] font-bold text-white/60 uppercase tracking-widest w-full text-left mb-2">Distribución</h3>
              {expenseBreakdown.length > 0 ? (
                <>
                  <div className="h-48 w-full relative">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={expenseBreakdown} innerRadius={60} outerRadius={85} paddingAngle={6} dataKey="value" stroke="none">
                          {expenseBreakdown.map((entry, index) => <Cell key={`cell-${index}`} fill={EXPENSE_COLORS[entry.name] || '#8E8E93'} style={{filter: `drop-shadow(0px 4px 10px ${EXPENSE_COLORS[entry.name]}60)`}} />)}
                        </Pie>
                        <Tooltip content={<CustomTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="w-full mt-2 space-y-3">
                    {expenseBreakdown.map((item, idx) => (
                      <div key={idx} className="flex justify-between items-center bg-white/5 p-3 rounded-2xl border border-white/5">
                        <div className="flex items-center gap-3">
                          <span className="w-3.5 h-3.5 rounded-full shadow-lg" style={{ backgroundColor: EXPENSE_COLORS[item.name], boxShadow: `0 0 10px ${EXPENSE_COLORS[item.name]}` }}></span>
                          <span className="text-[15px] font-medium text-white/90">{item.name}</span>
                        </div>
                        <span className="text-[15px] font-bold">{mask(item.value)}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="h-full flex items-center justify-center text-white/40">Sin gastos</div>
              )}
            </GlassCard>
          </div>
        </div>

        {/* PESTAÑA: TRANSACCIONES */}
        <div className={`${activeTab === 'transacciones' ? 'block' : 'hidden'} animate-fade-in`}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            <div className="space-y-6">
              <GlassCard className="overflow-hidden">
                <div className="p-6">
                  <h3 className="text-[15px] font-bold text-white/60 uppercase tracking-widest mb-6">Nuevo Ingreso</h3>
                  <form onSubmit={saveIncome} className="space-y-4">
                    <GlassSelect value={incomeForm.category} onChange={(e) => setIncomeForm({ ...incomeForm, category: e.target.value })}>{INCOME_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</GlassSelect>
                    <div className="relative">
                      <span className="absolute left-5 top-1/2 -translate-y-1/2 text-white/40 text-[18px]">$</span>
                      <GlassInput type="number" step="any" min="0.01" required placeholder="0.00" className="pl-9 text-[22px] font-semibold" value={incomeForm.amount} onChange={(e) => setIncomeForm({ ...incomeForm, amount: e.target.value })} />
                    </div>
                    {(incomeForm.category === 'Reparaciones' || incomeForm.category === 'Ventas') && (
                      <GlassInput type="number" step="any" min="0" placeholder="Costo insumo (Opcional)" value={incomeForm.cost} onChange={(e) => setIncomeForm({ ...incomeForm, cost: e.target.value })} />
                    )}
                    <GlassInput type="date" required value={incomeForm.date} onChange={(e) => setIncomeForm({ ...incomeForm, date: e.target.value })} />
                    <GlassInput type="text" placeholder="Nota opcional" value={incomeForm.note} onChange={(e) => setIncomeForm({ ...incomeForm, note: e.target.value })} />
                    <GlassButton type="submit" variant="primary" className="mt-2">Guardar Ingreso</GlassButton>
                  </form>
                </div>
                
                <div className="border-t border-white/10 bg-white/[0.02]">
                  <button type="button" onClick={() => setShowIncomesHistory(!showIncomesHistory)} className="w-full p-6 flex justify-between items-center hover:bg-white/5 transition-colors">
                    <h3 className="text-[14px] font-bold text-white uppercase tracking-widest">Ver Historial de Ingresos</h3>
                    <svg className={`w-5 h-5 text-white/50 transition-transform duration-300 ${showIncomesHistory ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </button>
                  <div className={`transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${showIncomesHistory ? 'max-h-[800px] opacity-100' : 'max-h-0 opacity-0'}`}>
                    <div className="px-4 pb-4">
                      {filteredIncomes.length === 0 ? <p className="text-center text-white/40 py-4">Vacio</p> : filteredIncomes.map((i) => {
                        const net = Number(i.amount) - (Number(i.cost) || 0);
                        return (
                          <div key={i.id} className="flex flex-col sm:flex-row justify-between sm:items-center p-4 sm:p-5 bg-white/[0.03] rounded-[24px] mb-3 border border-white/5 hover:bg-white/[0.08] transition-colors relative">
                            <div className="flex items-start sm:items-center gap-4 mb-3 sm:mb-0">
                              <div className="mt-1 sm:mt-0 w-3 h-3 rounded-full shadow-lg flex-shrink-0" style={{ backgroundColor: '#34D399', boxShadow: '0 0 10px #34D399' }}></div>
                              <div>
                                <p className="text-[17px] font-bold text-white/90 leading-tight">{i.category}</p>
                                <p className="text-[13px] text-white/50 mt-0.5">{formatHumanDate(i.date)} {i.note && `• ${i.note}`}</p>
                              </div>
                            </div>
                            <div className="flex items-center justify-between sm:justify-end pl-7 sm:pl-0 w-full sm:w-auto gap-4">
                              <div className="text-left sm:text-right">
                                <p className={`text-[18px] font-bold ${isPrivate ? 'text-white/40' : 'text-emerald-400'}`}>+{mask(net)}</p>
                                {Number(i.cost) > 0 && <p className="text-[11px] text-white/40 font-mono mt-0.5">Costo: {mask(i.cost)}</p>}
                              </div>
                              <div className="flex gap-2 border-l border-white/10 pl-4">
                                <button onClick={() => setIncomeForm(i)} className="p-2.5 bg-white/5 rounded-full hover:bg-white/10 text-white/70 transition-colors"><Icon.Edit className="w-4 h-4"/></button>
                                <button onClick={() => handleDeleteClick('incomes', i.id, setIncomes)} className="p-2.5 bg-rose-500/10 rounded-full hover:bg-rose-500/20 text-rose-400 transition-colors"><Icon.Trash className="w-4 h-4"/></button>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </GlassCard>
            </div>

            <div className="space-y-6">
              <GlassCard className="overflow-hidden">
                <div className="p-6">
                  <h3 className="text-[15px] font-bold text-white/60 uppercase tracking-widest mb-6">Nuevo Gasto</h3>
                  <form onSubmit={saveExpense} className="space-y-4">
                    <GlassSelect value={expenseForm.category} onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })}>{EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</GlassSelect>
                    <div className="relative">
                      <span className="absolute left-5 top-1/2 -translate-y-1/2 text-white/40 text-[18px]">$</span>
                      <GlassInput type="number" step="any" min="0.01" required placeholder="0.00" className="pl-9 text-[22px] font-semibold" value={expenseForm.amount} onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })} />
                    </div>
                    <GlassInput type="date" required value={expenseForm.date} onChange={(e) => setExpenseForm({ ...expenseForm, date: e.target.value })} />
                    <GlassInput type="text" placeholder="Nota opcional" value={expenseForm.note} onChange={(e) => setExpenseForm({ ...expenseForm, note: e.target.value })} />
                    <GlassButton type="submit" variant="danger" className="mt-2">Guardar Gasto</GlassButton>
                  </form>
                </div>
                
                <div className="border-t border-white/10 bg-white/[0.02]">
                  <button type="button" onClick={() => setShowExpensesHistory(!showExpensesHistory)} className="w-full p-6 flex justify-between items-center hover:bg-white/5 transition-colors">
                    <h3 className="text-[14px] font-bold text-white uppercase tracking-widest">Ver Historial de Gastos</h3>
                    <svg className={`w-5 h-5 text-white/50 transition-transform duration-300 ${showExpensesHistory ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </button>
                  <div className={`transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${showExpensesHistory ? 'max-h-[800px] opacity-100' : 'max-h-0 opacity-0'}`}>
                    <div className="px-4 pb-4">
                      {filteredExpenses.length === 0 ? <p className="text-center text-white/40 py-4">Vacio</p> : filteredExpenses.map((e) => (
                        <div key={e.id} className="flex flex-col sm:flex-row justify-between sm:items-center p-4 sm:p-5 bg-white/[0.03] rounded-[24px] mb-3 border border-white/5 hover:bg-white/[0.08] transition-colors relative">
                          <div className="flex items-start sm:items-center gap-4 mb-3 sm:mb-0">
                            <div className="mt-1 sm:mt-0 w-3 h-3 rounded-full shadow-lg flex-shrink-0" style={{ backgroundColor: EXPENSE_COLORS[e.category] || '#8E8E93', boxShadow: `0 0 10px ${EXPENSE_COLORS[e.category] || '#8E8E93'}` }}></div>
                            <div>
                              <p className="text-[17px] font-bold text-white/90 leading-tight">{e.category}</p>
                              <p className="text-[13px] text-white/50 mt-0.5">{formatHumanDate(e.date)} {e.note && `• ${e.note}`}</p>
                            </div>
                          </div>
                          <div className="flex items-center justify-between sm:justify-end pl-7 sm:pl-0 w-full sm:w-auto gap-4">
                            <div className="text-left sm:text-right">
                              <p className={`text-[18px] font-bold ${isPrivate ? 'text-white/40' : 'text-rose-400'}`}>-{mask(e.amount)}</p>
                            </div>
                            <div className="flex gap-2 border-l border-white/10 pl-4">
                              <button onClick={() => setExpenseForm(e)} className="p-2.5 bg-white/5 rounded-full hover:bg-white/10 text-white/70 transition-colors"><Icon.Edit className="w-4 h-4"/></button>
                              <button onClick={() => handleDeleteClick('expenses', e.id, setExpenses)} className="p-2.5 bg-rose-500/10 rounded-full hover:bg-rose-500/20 text-rose-400 transition-colors"><Icon.Trash className="w-4 h-4"/></button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </GlassCard>
            </div>
          </div>
        </div>

        {/* PESTAÑA: METAS */}
        <div className={`${activeTab === 'metas' ? 'block' : 'hidden'} animate-fade-in`}>
          <GlassCard className="p-6 mb-8">
            <h3 className="text-[15px] font-bold text-white/60 uppercase tracking-widest mb-6">Planificación</h3>
            <form onSubmit={saveGoal} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <GlassInput type="text" required placeholder="Nombre (Ej. Enganche)" value={goalForm.name} onChange={(e) => setGoalForm({ ...goalForm, name: e.target.value })} />
              <GlassInput type="number" step="any" min="0.01" required placeholder="Meta Total ($)" value={goalForm.target} onChange={(e) => setGoalForm({ ...goalForm, target: e.target.value })} />
              <GlassInput type="number" step="any" min="0" placeholder="Ahorro Actual ($)" value={goalForm.saved} onChange={(e) => setGoalForm({ ...goalForm, saved: e.target.value })} />
              <GlassInput type="date" required value={goalForm.deadline} onChange={(e) => setGoalForm({ ...goalForm, deadline: e.target.value })} />
              <GlassSelect className="sm:col-span-2" value={goalForm.storage} onChange={(e) => setGoalForm({ ...goalForm, storage: e.target.value })}>{STORAGE_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}</GlassSelect>
              <div className="sm:col-span-2 mt-2">
                <GlassButton type="submit" variant="glass">Inicializar Meta</GlassButton>
              </div>
            </form>
          </GlassCard>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {goals.map((g) => {
              const target = Number(g.target); const saved = Number(g.saved);
              const pct = Math.min(100, (saved / target) * 100);
              const remaining = target - saved;

              const d1 = new Date();
              const d2 = new Date(g.deadline + 'T00:00:00');
              const msPerWeek = 1000 * 60 * 60 * 24 * 7;
              let weeksLeft = Math.ceil((d2.getTime() - d1.getTime()) / msPerWeek);
              if (weeksLeft <= 0) weeksLeft = 1;
              const weeklyNeeded = remaining / weeksLeft;

              return (
                <GlassCard key={g.id} className="p-6 flex flex-col justify-between hover:bg-white/[0.06] transition-all group">
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <h3 className="text-[20px] font-bold text-white tracking-tight">{g.name}</h3>
                      <p className="text-[13px] text-white/50 font-medium bg-white/5 px-3 py-1 rounded-full w-max mt-2 border border-white/5">{g.storage}</p>
                    </div>
                    <button onClick={() => handleDeleteClick('goals', g.id, setGoals)} className="text-white/20 hover:text-rose-400 transition-colors p-2"><Icon.Trash className="w-5 h-5"/></button>
                  </div>
                  
                  <div>
                    <div className="flex justify-between items-end mb-3">
                      <span className="text-[17px] font-bold text-white">{mask(saved)} <span className="text-white/40 text-[14px] font-normal">/ {mask(target)}</span></span>
                      <span className="text-[17px] font-bold text-emerald-400 drop-shadow-[0_0_10px_rgba(52,211,153,0.5)]">{pct.toFixed(0)}%</span>
                    </div>
                    
                    <div className="h-3 w-full bg-black/40 rounded-full overflow-hidden mb-6 shadow-inner border border-white/5">
                      <div className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 shadow-[0_0_10px_rgba(52,211,153,0.8)] transition-all duration-1000" style={{ width: `${pct}%` }}></div>
                    </div>
                    
                    {remaining > 0 && (
                      <div className="flex justify-between items-center mb-4 bg-black/20 rounded-[16px] p-3 border border-white/5">
                        <div className="flex flex-col">
                          <span className="text-[11px] text-white/50 font-semibold uppercase tracking-wider mb-0.5">Meta Semanal</span>
                          <span className={`text-[15px] font-bold tracking-wide ${isPrivate ? 'text-white/40' : 'text-emerald-400'}`}>
                            {mask(weeklyNeeded)} <span className="text-white/40 text-[11px] font-normal tracking-normal ml-1">x {weeksLeft} sem</span>
                          </span>
                        </div>
                      </div>
                    )}
                    
                    <GlassButton variant="glass" onClick={() => handleAddFundsClick(g)} className="!py-3 text-[15px] !rounded-[16px] text-emerald-400">
                      Abonar Fondos
                    </GlassButton>
                  </div>
                </GlassCard>
              );
            })}
          </div>
        </div>
      </div>

      {/* --- NAVEGACIÓN INFERIOR --- */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-black/80 backdrop-blur-2xl border-t border-white/10" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <ul className="flex justify-around items-center h-[72px] px-2 pt-1">
          <li className="flex-1 flex justify-center">
            <button onClick={() => setActiveTab('resumen')} className={`flex flex-col items-center gap-1.5 transition-all ${activeTab === 'resumen' ? 'text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]' : 'text-white/40 hover:text-white/80'}`}>
              <Icon.Home className="w-6 h-6" />
              <span className="text-[10px] font-semibold">Resumen</span>
            </button>
          </li>
          <li className="flex-1 flex justify-center">
            <button onClick={() => setActiveTab('transacciones')} className={`flex flex-col items-center gap-1.5 transition-all ${activeTab === 'transacciones' ? 'text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]' : 'text-white/40 hover:text-white/80'}`}>
              <Icon.Wallet className="w-6 h-6" />
              <span className="text-[10px] font-semibold">Tracker</span>
            </button>
          </li>
          <li className="flex-1 flex justify-center">
            <button onClick={() => setActiveTab('metas')} className={`flex flex-col items-center gap-1.5 transition-all ${activeTab === 'metas' ? 'text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]' : 'text-white/40 hover:text-white/80'}`}>
              <Icon.Target className="w-6 h-6" />
              <span className="text-[10px] font-semibold">Metas</span>
            </button>
          </li>
          <li className="flex-1 flex justify-center">
            <button onClick={() => setIsQuickAddOpen(true)} className="flex flex-col items-center gap-1 transition-all text-emerald-400 active:scale-95">
              <div className="bg-emerald-500/20 rounded-full p-1.5 border border-emerald-500/30 shadow-[0_0_15px_rgba(52,211,153,0.2)]">
                <Icon.Plus className="w-5 h-5" />
              </div>
              <span className="text-[10px] font-semibold">Rápido</span>
            </button>
          </li>
        </ul>
      </nav>

      {/* --- MODAL GASTO RÁPIDO --- */}
      <div className={`fixed inset-0 z-50 transition-all duration-500 ${isQuickAddOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
        <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={() => setIsQuickAddOpen(false)}></div>
        
        <div className={`absolute bottom-0 left-0 right-0 bg-white/[0.08] backdrop-blur-[60px] border-t border-white/[0.15] shadow-[0_-20px_40px_rgba(0,0,0,0.5)] rounded-t-[40px] p-6 transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${isQuickAddOpen ? 'translate-y-0' : 'translate-y-full'}`} style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)' }}>
          <div className="w-14 h-1.5 bg-white/20 rounded-full mx-auto mb-8 shadow-inner"></div>
          <h3 className="text-[24px] font-bold text-white tracking-tight mb-8 text-center drop-shadow-md">Gasto Rápido</h3>
          
          <form onSubmit={handleQuickExpense} className="flex flex-col gap-5 max-w-sm mx-auto mb-6">
            <div className="relative">
              <span className="absolute left-6 top-1/2 -translate-y-1/2 text-white/50 text-[24px] font-light">$</span>
              <input type="number" step="any" min="0.01" required autoFocus placeholder="0.00" className="w-full bg-black/30 backdrop-blur-2xl border border-white/10 rounded-[24px] px-6 py-6 pl-12 text-[36px] font-bold text-white outline-none focus:border-rose-500/50 shadow-inner" value={qAmount} onChange={(e) => setQAmount(e.target.value)} />
            </div>

            <GlassSelect className="!py-5 !rounded-[24px] !text-[18px]" value={qCategory} onChange={(e) => setQCategory(e.target.value)}>
              {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </GlassSelect>

            <GlassInput className="!py-5 !rounded-[24px] !text-[18px]" type="text" placeholder="Nota opcional" value={qNote} onChange={(e) => setQNote(e.target.value)} />
            
            <GlassButton type="submit" variant="danger" className="!py-5 !rounded-[24px] !text-[18px] mt-4 shadow-[0_0_30px_rgba(244,63,94,0.4)]">
              Confirmar Gasto
            </GlassButton>
          </form>
        </div>
      </div>

      {/* MODALES CLÁSICOS */}
      {deleteModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={() => setDeleteModal({ isOpen: false, table: null, id: null, setFn: null })}></div>
          <GlassCard className="relative z-10 w-full max-w-[320px] p-6 text-center border-t-white/20 border-l-white/20">
            <div className="w-16 h-16 rounded-full bg-rose-500/20 mx-auto flex items-center justify-center mb-4 border border-rose-500/30">
              <Icon.Warning className="w-8 h-8 text-rose-400" />
            </div>
            <h3 className="text-[20px] font-bold text-white mb-2">¿Eliminar Registro?</h3>
            <p className="text-[15px] text-white/50 mb-8">Esta acción es permanente y se borrará de la base de datos.</p>
            <div className="flex gap-3">
              <GlassButton variant="glass" onClick={() => setDeleteModal({ isOpen: false, table: null, id: null, setFn: null })}>Cancelar</GlassButton>
              <GlassButton variant="danger" onClick={confirmDelete}>Eliminar</GlassButton>
            </div>
          </GlassCard>
        </div>
      )}

      {fundModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={() => setFundModal({ isOpen: false, goal: null, amount: '' })}></div>
          <GlassCard className="relative z-10 w-full max-w-[340px] p-8 border-t-white/20 border-l-white/20">
            <h3 className="text-[22px] font-bold text-white mb-2 text-center drop-shadow-md">Abonar Fondos</h3>
            <p className="text-[15px] text-white/50 mb-6 text-center">Para: <span className="text-white font-semibold">{fundModal.goal?.name}</span></p>
            <form onSubmit={confirmAddFunds} className="space-y-6">
              <div className="relative">
                <span className="absolute left-5 top-1/2 -translate-y-1/2 text-white/50 text-[20px] font-light">$</span>
                <input type="number" step="any" min="0.01" required autoFocus placeholder="0.00" className="w-full bg-black/30 backdrop-blur-xl border border-white/10 rounded-[20px] px-5 py-5 pl-10 text-[28px] font-bold text-emerald-400 outline-none focus:border-emerald-500/50 shadow-inner" value={fundModal.amount} onChange={(e) => setFundModal({ ...fundModal, amount: e.target.value })} />
              </div>
              <div className="flex gap-3">
                <GlassButton variant="glass" onClick={() => setFundModal({ isOpen: false, goal: null, amount: '' })}>Cancelar</GlassButton>
                <GlassButton type="submit" variant="primary">Abonar</GlassButton>
              </div>
            </form>
          </GlassCard>
        </div>
      )}
    </div>
  );
}