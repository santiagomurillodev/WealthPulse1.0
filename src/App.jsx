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

const IOS_COLORS = {
  green: '#34C759',
  red: '#FF3B30',
  blue: '#0A84FF',
  gray: '#8E8E93',
  bgCard: '#1C1C1E',
  bgRoot: '#000000',
  separator: '#38383A'
};

const EXPENSE_COLORS = {
  'Comida': '#FF9500', 
  'Servicios': '#5E5CE6', 
  'Insumos Taller/Refacciones': '#32ADE6', 
  'Transporte': '#0A84FF', 
  'Gustos': '#FF2D55'  
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

/* --- COMPONENTES UI ESTILO NATIVO DE iOS --- */
const IOSSection = ({ eyebrow, children }) => (
  <div className="mb-6 w-full">
    {eyebrow && <h2 className="text-[13px] font-semibold text-[#8E8E93] uppercase tracking-wider ml-4 mb-2">{eyebrow}</h2>}
    <div className="bg-[#1C1C1E] rounded-[20px] overflow-hidden">
      {children}
    </div>
  </div>
);

const IOSRow = ({ label, children, isLast = false, rightAlign = false }) => (
  <div className={`flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-[#1C1C1E] ${!isLast ? 'border-b border-[#38383A]' : ''} min-h-[54px]`}>
    <span className="text-[17px] text-white w-full sm:w-1/3 mb-1 sm:mb-0 font-medium">{label}</span>
    <div className={`w-full sm:w-2/3 ${rightAlign ? 'text-right' : ''}`}>
      {children}
    </div>
  </div>
);

const TrendBadge = ({ value, invertColors = false }) => {
  if (value === 0 || isNaN(value)) {
    return <span className="text-[11px] font-semibold px-2 py-0.5 rounded-lg text-[#8E8E93] bg-[#2C2C2E]">≈ 0%</span>;
  }
  const isPositive = value > 0;
  const isGood = invertColors ? !isPositive : isPositive;
  const colorCls = isGood ? 'text-[#34C759] bg-[#34C759]/10' : 'text-[#FF3B30] bg-[#FF3B30]/10';
  const icon = isPositive ? '↑' : '↓';
  
  return (
    <span className={`text-[12px] font-bold px-2 py-1 rounded-lg flex items-center gap-0.5 w-max ${colorCls}`}>
      {icon} {Math.abs(value).toFixed(1)}%
    </span>
  );
};

const inputCls = 'w-full bg-transparent text-[17px] text-white outline-none placeholder:text-[#8E8E93]';

/* ------------------------------- APP PRINCIPAL ------------------------------- */
export default function App() {
  const { incomes, setIncomes, expenses, setExpenses, goals, setGoals, isLoading } = useFinanceData();
  
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [savedPin, setSavedPin] = useState(() => localStorage.getItem('wp_pin'));
  const [pinSetupStep, setPinSetupStep] = useState(savedPin ? 'enter' : 'create'); 
  const [tempPin, setTempPin] = useState('');
  const [enteredPin, setEnteredPin] = useState('');
  const [pinError, setPinError] = useState(false);

  const [selectedMonth, setSelectedMonth] = useState(currentMonthStr());
  const [activeTab, setActiveTab] = useState('resumen');
  const [isPrivate, setIsPrivate] = useState(false);
  const mask = (val) => isPrivate ? '••••••' : fmt.format(val);

  // Estados restaurados para los acordeones
  const [showIncomesHistory, setShowIncomesHistory] = useState(false);
  const [showExpensesHistory, setShowExpensesHistory] = useState(false);

  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [qAmount, setQAmount] = useState('');
  const [qCategory, setQCategory] = useState(EXPENSE_CATEGORIES[0]);
  const [qNote, setQNote] = useState('');

  const [incomeForm, setIncomeForm] = useState({ id: null, amount: '', cost: '', category: INCOME_CATEGORIES[0], note: '', date: todayISO() });
  const [expenseForm, setExpenseForm] = useState({ id: null, amount: '', category: EXPENSE_CATEGORIES[0], note: '', date: todayISO() });
  const [goalForm, setGoalForm] = useState({ id: null, name: '', target: '', saved: '', deadline: '', storage: STORAGE_OPTIONS[0] });

  const [deleteModal, setDeleteModal] = useState({ isOpen: false, table: null, id: null, setFn: null });
  const [fundModal, setFundModal] = useState({ isOpen: false, goal: null, amount: '' });

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
        triggerPinError('Los códigos no coinciden.', 'create');
      }
    } else if (pinSetupStep === 'enter') {
      if (currentPin === savedPin) {
        setIsAuthenticated(true);
      } else {
        triggerPinError('Código incorrecto', 'enter');
      }
    }
  };

  const triggerPinError = (msg, nextStep) => {
    setPinError(true);
    setTimeout(() => {
      setEnteredPin('');
      setPinError(false);
      if (nextStep) setPinSetupStep(nextStep);
    }, 500);
  };

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

  const handleQuickExpense = async (e) => {
    e.preventDefault();
    const amount = parseFloat(qAmount);
    if (isNaN(amount) || amount <= 0) return alert('Ingresa un monto válido.');

    const { data, error } = await supabase.from('expenses').insert([{ amount, category: qCategory, note: qNote, date: todayISO() }]).select();
    if (!error && data) {
      setExpenses((prev) => [data[0], ...prev]);
      setIsQuickAddOpen(false);
      setQAmount(''); setQNote(''); setQCategory(EXPENSE_CATEGORIES[0]);
    } else alert("Error al guardar el gasto.");
  };

  const saveIncome = useCallback(async (e) => {
    e.preventDefault();
    const amount = parseFloat(incomeForm.amount);
    const cost = parseFloat(incomeForm.cost) || 0;
    if (isNaN(amount) || amount <= 0) return alert('Ingresa un monto válido.');
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

  const saveExpense = useCallback(async (e) => {
    e.preventDefault();
    const amount = parseFloat(expenseForm.amount);
    if (isNaN(amount) || amount <= 0) return alert('Ingresa un monto válido.');
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
    const { table, id, setFn } = deleteModal;
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (!error) setFn((prev) => prev.filter((item) => item.id !== id));
    setDeleteModal({ isOpen: false, table: null, id: null, setFn: null });
  };

  const handleAddFundsClick = (goal) => setFundModal({ isOpen: true, goal, amount: '' });
  const confirmAddFunds = async (e) => {
    e.preventDefault();
    const deposit = parseFloat(fundModal.amount);
    if (isNaN(deposit) || deposit <= 0) return alert('Ingresa un abono válido.');
    const newSavedAmount = Number(fundModal.goal.saved) + deposit;
    const { data, error } = await supabase.from('goals').update({ saved: newSavedAmount }).eq('id', fundModal.goal.id).select();
    if (!error && data) setGoals((prev) => prev.map((g) => (g.id === fundModal.goal.id ? data[0] : g)));
    setFundModal({ isOpen: false, goal: null, amount: '' });
  };

  const handleExportPDF = () => {
    try {
      const doc = new jsPDF();
      doc.setFontSize(22); doc.setTextColor(20, 20, 20); doc.text('WealthPulse', 14, 22);
      doc.setFontSize(14); doc.setTextColor(100, 100, 100); doc.text(`Estado de Cuenta - ${selectedMonth}`, 14, 30);
      
      doc.setFontSize(12); doc.setTextColor(0, 0, 0); doc.text('1. PATRIMONIO HISTÓRICO GLOBAL', 14, 45);
      autoTable(doc, {
        startY: 50, head: [['Capital Total Acumulado', 'Ahorrado en Metas', 'Capital Libre Disponible']],
        body: [[fmt.format(capitalTotal), fmt.format(totalSavedInGoals), fmt.format(availableCash)]],
        theme: 'grid', headStyles: { fillColor: [52, 199, 89], textColor: [255, 255, 255], fontStyle: 'bold' }, styles: { fontSize: 10, halign: 'center' }
      });

      let finalY = doc.lastAutoTable.finalY + 15;
      doc.text(`2. FLUJO DEL MES (${selectedMonth})`, 14, finalY);
      autoTable(doc, {
        startY: finalY + 5, head: [['Ingresos Netos', 'Gastos Totales', 'Flujo Neto Mensual']],
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
        startY: finalY + 5, head: [['Fecha', 'Categoría', 'Concepto', 'Cobro Bruto', 'Costo Insumo', 'Ingreso Neto']],
        body: ingresosRows.length > 0 ? ingresosRows : [['-', '-', 'Sin movimientos', '-', '-', '-']],
        theme: 'striped', headStyles: { fillColor: [52, 199, 89] }, styles: { fontSize: 9 }
      });

      finalY = doc.lastAutoTable.finalY + 15;
      if (finalY > 250) { doc.addPage(); finalY = 20; }

      doc.text('4. DESGLOSE DE GASTOS', 14, finalY);
      const gastosRows = filteredExpenses.map(e => [e.date, e.category, e.note || '-', fmt.format(e.amount)]);
      autoTable(doc, {
        startY: finalY + 5, head: [['Fecha', 'Categoría', 'Concepto', 'Monto del Gasto']],
        body: gastosRows.length > 0 ? gastosRows : [['-', '-', 'Sin movimientos', '-']],
        theme: 'striped', headStyles: { fillColor: [255, 59, 48] }, styles: { fontSize: 9 }
      });
      doc.save(`WealthPulse_${selectedMonth}.pdf`);
    } catch (error) {
      console.error("Error al exportar PDF:", error);
      alert("Error generando el documento.");
    }
  };

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-[#1C1C1E]/90 backdrop-blur-xl border border-[#38383A] p-3 rounded-[14px] shadow-2xl">
          <p className="text-[#8E8E93] text-xs font-semibold mb-1 uppercase tracking-wider">{payload[0].name || `Día ${label}`}</p>
          {payload.map((entry, index) => (
            <p key={index} className={`text-[15px] font-bold ${entry.dataKey === 'ingresos' ? 'text-[#34C759]' : entry.dataKey === 'gastos' ? 'text-[#FF3B30]' : 'text-white'}`}>
              {entry.dataKey === 'ingresos' ? '+' : entry.dataKey === 'gastos' ? '-' : ''}{mask(entry.value)}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  if (!isAuthenticated) {
    let instruction = 'Introduce tu código';
    if (pinSetupStep === 'create') instruction = 'Crea un código de 4 dígitos';
    if (pinSetupStep === 'confirm') instruction = 'Verifica tu nuevo código';

    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center p-6 font-sans">
        <div className="flex flex-col items-center max-w-[300px] w-full mt-[-10vh]">
          <h2 className="text-[22px] text-white font-medium mb-4">{instruction}</h2>
          
          <div className={`flex gap-[22px] justify-center mb-16 transition-transform duration-200 ${pinError ? 'translate-x-2' : ''}`}>
            {[...Array(4)].map((_, i) => (
              <div key={i} className={`w-[13px] h-[13px] rounded-full transition-colors duration-200 ${
                pinError ? 'bg-[#FF3B30]' : enteredPin.length > i ? 'bg-white' : 'border border-white/40'
              }`} />
            ))}
          </div>

          <div className="grid grid-cols-3 gap-x-6 gap-y-4 w-full">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
              <button key={num} onClick={() => handlePinPress(num.toString())} className="w-[75px] h-[75px] mx-auto rounded-full bg-[#333333] hover:bg-[#444444] active:bg-[#555555] text-[36px] font-normal text-white transition-colors flex items-center justify-center">
                {num}
              </button>
            ))}
            <div />
            <button onClick={() => handlePinPress('0')} className="w-[75px] h-[75px] mx-auto rounded-full bg-[#333333] hover:bg-[#444444] active:bg-[#555555] text-[36px] font-normal text-white transition-colors flex items-center justify-center">
              0
            </button>
            <button onClick={() => setEnteredPin(prev => prev.slice(0, -1))} className="w-[75px] h-[75px] mx-auto rounded-full flex items-center justify-center text-white active:bg-[#333333] transition-colors">
              <span className="text-[17px] font-semibold">Borrar</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black p-4 sm:p-6 lg:p-8 antialiased">
        <div className="max-w-7xl mx-auto space-y-8 animate-pulse pt-4">
          <div className="flex justify-between items-end">
            <div className="w-48 h-10 bg-[#1C1C1E] rounded-xl"></div>
            <div className="flex gap-2">
              <div className="w-8 h-8 bg-[#1C1C1E] rounded-full"></div>
              <div className="w-8 h-8 bg-[#1C1C1E] rounded-full"></div>
            </div>
          </div>
          <div className="w-full h-32 bg-[#1C1C1E] rounded-[20px]"></div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <div className="h-28 bg-[#1C1C1E] rounded-[20px]"></div>
            <div className="h-28 bg-[#1C1C1E] rounded-[20px]"></div>
            <div className="h-28 bg-[#1C1C1E] rounded-[20px]"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white antialiased font-sans transition-colors duration-500 relative pb-[90px]">
      
      <header className="pt-10 pb-4 px-4 sm:px-6 max-w-7xl mx-auto">
        <div className="flex justify-between items-end">
          <h1 className="text-[34px] font-bold tracking-tight leading-none">WealthPulse</h1>
          
          <div className="flex items-center gap-3">
            <button onClick={() => setIsPrivate(!isPrivate)} className="text-[#0A84FF] bg-[#0A84FF]/10 p-2 rounded-full active:opacity-70 transition-opacity">
              {isPrivate ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
              )}
            </button>
            <button onClick={handleExportPDF} className="text-[#0A84FF] font-semibold text-[17px] active:opacity-70 transition-opacity">
              Exportar
            </button>
          </div>
        </div>

        <div className="mt-4 bg-[#1C1C1E] rounded-xl p-1 shadow-sm flex items-center justify-between w-full max-w-sm">
          <input type="month" className="w-full bg-transparent text-[15px] font-semibold text-center text-white outline-none cursor-pointer py-1" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} />
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6">
        
        <div className="text-center mb-8 mt-2">
          <p className="text-[13px] text-[#8E8E93] font-semibold uppercase tracking-wider mb-1">Balance Total</p>
          <h2 className={`text-[52px] font-bold tracking-tighter leading-none ${isPrivate ? 'text-[#38383A]' : 'text-white'}`}>
            {mask(capitalTotal)}
          </h2>
          <div className="flex justify-center items-center gap-4 mt-3">
            <span className="text-[13px] text-[#8E8E93]">Metas: <span className="text-white font-medium">{mask(totalSavedInGoals)}</span></span>
            <div className="w-1 h-1 bg-[#38383A] rounded-full"></div>
            <span className="text-[13px] text-[#8E8E93]">Libre: <span className="text-white font-medium">{mask(availableCash)}</span></span>
          </div>
        </div>

        {/* --- PESTAÑA: RESUMEN --- */}
        <div className={`${activeTab === 'resumen' ? 'block' : 'hidden'}`}>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div className="bg-[#1C1C1E] rounded-[20px] p-5 flex flex-col justify-between">
              <div className="flex justify-between items-start mb-4">
                <span className="text-[15px] font-semibold text-[#8E8E93]">Ingresos</span>
                <TrendBadge value={incomeTrend} />
              </div>
              <p className={`text-[32px] font-bold tracking-tight ${isPrivate ? 'text-[#38383A]' : 'text-white'}`}>{mask(monthIncomeTotal)}</p>
            </div>
            
            <div className="bg-[#1C1C1E] rounded-[20px] p-5 flex flex-col justify-between">
              <div className="flex justify-between items-start mb-4">
                <span className="text-[15px] font-semibold text-[#8E8E93]">Gastos</span>
                <TrendBadge value={expenseTrend} invertColors={true} />
              </div>
              <p className={`text-[32px] font-bold tracking-tight ${isPrivate ? 'text-[#38383A]' : 'text-white'}`}>{mask(monthExpenseTotal)}</p>
            </div>

            <div className="bg-[#1C1C1E] rounded-[20px] p-5 flex flex-col justify-between">
              <div className="flex justify-between items-start mb-4">
                <span className="text-[15px] font-semibold text-[#8E8E93]">Flujo</span>
                <TrendBadge value={flowTrend} />
              </div>
              <p className={`text-[32px] font-bold tracking-tight ${isPrivate ? 'text-[#38383A]' : monthNetFlow >= 0 ? 'text-[#34C759]' : 'text-[#FF3B30]'}`}>{mask(monthNetFlow)}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            <div className="lg:col-span-2">
              <IOSSection eyebrow="Actividad del Mes">
                <div className="h-64 w-full p-4 pt-6">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                      <XAxis dataKey="day" stroke="#8E8E93" fontSize={11} tickLine={false} axisLine={false} />
                      <Tooltip content={<CustomTooltip />} cursor={{fill: '#2C2C2E', opacity: 0.5}} />
                      <Bar dataKey="ingresos" fill={IOS_COLORS.green} radius={[4, 4, 0, 0]} />
                      <Bar dataKey="gastos" fill={IOS_COLORS.red} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </IOSSection>
            </div>
            
            <div className="lg:col-span-1">
              <IOSSection eyebrow="Distribución">
                {expenseBreakdown.length > 0 ? (
                  <div className="p-4 flex flex-col items-center">
                    <div className="h-40 w-full relative">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={expenseBreakdown} innerRadius={50} outerRadius={70} paddingAngle={4} dataKey="value" stroke="none">
                            {expenseBreakdown.map((entry, index) => <Cell key={`cell-${index}`} fill={EXPENSE_COLORS[entry.name] || '#8E8E93'} />)}
                          </Pie>
                          <Tooltip content={<CustomTooltip />} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="w-full mt-4">
                      {expenseBreakdown.map((item, idx) => (
                        <div key={idx} className="flex justify-between items-center py-2 border-b border-[#38383A] last:border-0">
                          <div className="flex items-center gap-3">
                            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: EXPENSE_COLORS[item.name] || '#8E8E93' }}></span>
                            <span className="text-[15px] font-medium">{item.name}</span>
                          </div>
                          <span className="text-[15px] text-[#8E8E93]">{mask(item.value)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="h-40 flex items-center justify-center text-[#8E8E93] text-[15px]">Sin gastos</div>
                )}
              </IOSSection>
            </div>
          </div>
        </div>

        {/* --- PESTAÑA: TRANSACCIONES --- */}
        <div className={`${activeTab === 'transacciones' ? 'block' : 'hidden'}`}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            
            <div>
              <IOSSection eyebrow="Añadir Ingreso">
                <form onSubmit={saveIncome}>
                  <IOSRow label="Categoría"><select className={inputCls} value={incomeForm.category} onChange={(e) => setIncomeForm({ ...incomeForm, category: e.target.value })}>{INCOME_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</select></IOSRow>
                  <IOSRow label="Monto"><input type="number" step="any" min="0.01" required placeholder="$ 0.00" className={inputCls} value={incomeForm.amount} onChange={(e) => setIncomeForm({ ...incomeForm, amount: e.target.value })} /></IOSRow>
                  {(incomeForm.category === 'Reparaciones' || incomeForm.category === 'Ventas') && (
                    <IOSRow label="Costo Insumo"><input type="number" step="any" min="0" placeholder="$ 0.00 (Opcional)" className={inputCls} value={incomeForm.cost} onChange={(e) => setIncomeForm({ ...incomeForm, cost: e.target.value })} /></IOSRow>
                  )}
                  <IOSRow label="Fecha"><input type="date" required className={inputCls} value={incomeForm.date} onChange={(e) => setIncomeForm({ ...incomeForm, date: e.target.value })} /></IOSRow>
                  <IOSRow label="Nota"><input type="text" placeholder="Opcional" className={inputCls} value={incomeForm.note} onChange={(e) => setIncomeForm({ ...incomeForm, note: e.target.value })} /></IOSRow>
                  <button type="submit" className="w-full text-center text-[#0A84FF] text-[17px] font-semibold py-4 active:bg-[#2C2C2E] transition-colors">Guardar Ingreso</button>
                </form>
              </IOSSection>

              {/* Acordeón Restaurado: Historial de Ingresos */}
              <div className="mb-8">
                <button 
                  type="button" 
                  onClick={() => setShowIncomesHistory(!showIncomesHistory)}
                  className="w-full flex items-center justify-between bg-[#1C1C1E] rounded-[20px] p-4 active:bg-[#2C2C2E] transition-colors"
                >
                  <span className="text-[17px] font-semibold text-white">Historial de Ingresos</span>
                  <svg className={`w-5 h-5 text-[#8E8E93] transition-transform duration-300 ${showIncomesHistory ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </button>
                <div className={`transition-all duration-300 ease-in-out overflow-hidden ${showIncomesHistory ? 'max-h-[800px] mt-2 opacity-100' : 'max-h-0 opacity-0'}`}>
                  <div className="bg-[#1C1C1E] rounded-[20px] overflow-hidden">
                    {filteredIncomes.length === 0 ? (
                      <div className="p-4 text-center text-[#8E8E93]">No hay ingresos registrados</div>
                    ) : (
                      <div className="max-h-64 overflow-y-auto">
                        {filteredIncomes.map((i) => {
                          const net = Number(i.amount) - (Number(i.cost) || 0);
                          return (
                            <div key={i.id} className="flex justify-between items-center py-3 px-4 border-b border-[#38383A] last:border-0 active:bg-[#2C2C2E] transition-colors">
                              <div>
                                <p className="text-[17px] font-medium text-white">{i.category}</p>
                                <p className="text-[13px] text-[#8E8E93]">{i.note || formatHumanDate(i.date)}</p>
                              </div>
                              <div className="text-right flex items-center gap-3">
                                <div>
                                  <p className={`text-[17px] font-semibold ${isPrivate ? 'text-[#8E8E93]' : 'text-[#34C759]'}`}>+{mask(net)}</p>
                                  {Number(i.cost) > 0 && <p className="text-[11px] text-[#8E8E93]">C: {mask(i.cost)}</p>}
                                </div>
                                <div className="flex flex-col gap-1 border-l border-[#38383A] pl-3 ml-1">
                                  <button onClick={() => setIncomeForm(i)} className="text-[#0A84FF]"><Icon.Edit className="w-4 h-4"/></button>
                                  <button onClick={() => handleDeleteClick('incomes', i.id, setIncomes)} className="text-[#FF3B30]"><Icon.Trash className="w-4 h-4"/></button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div>
              <IOSSection eyebrow="Añadir Gasto">
                <form onSubmit={saveExpense}>
                  <IOSRow label="Categoría"><select className={inputCls} value={expenseForm.category} onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })}>{EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</select></IOSRow>
                  <IOSRow label="Monto"><input type="number" step="any" min="0.01" required placeholder="$ 0.00" className={inputCls} value={expenseForm.amount} onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })} /></IOSRow>
                  <IOSRow label="Fecha"><input type="date" required className={inputCls} value={expenseForm.date} onChange={(e) => setExpenseForm({ ...expenseForm, date: e.target.value })} /></IOSRow>
                  <IOSRow label="Nota"><input type="text" placeholder="Opcional" className={inputCls} value={expenseForm.note} onChange={(e) => setExpenseForm({ ...expenseForm, note: e.target.value })} /></IOSRow>
                  <button type="submit" className="w-full text-center text-[#0A84FF] text-[17px] font-semibold py-4 active:bg-[#2C2C2E] transition-colors">Guardar Gasto</button>
                </form>
              </IOSSection>

              {/* Acordeón Restaurado: Historial de Gastos */}
              <div className="mb-8">
                <button 
                  type="button" 
                  onClick={() => setShowExpensesHistory(!showExpensesHistory)}
                  className="w-full flex items-center justify-between bg-[#1C1C1E] rounded-[20px] p-4 active:bg-[#2C2C2E] transition-colors"
                >
                  <span className="text-[17px] font-semibold text-white">Historial de Gastos</span>
                  <svg className={`w-5 h-5 text-[#8E8E93] transition-transform duration-300 ${showExpensesHistory ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </button>
                <div className={`transition-all duration-300 ease-in-out overflow-hidden ${showExpensesHistory ? 'max-h-[800px] mt-2 opacity-100' : 'max-h-0 opacity-0'}`}>
                  <div className="bg-[#1C1C1E] rounded-[20px] overflow-hidden">
                    {filteredExpenses.length === 0 ? (
                      <div className="p-4 text-center text-[#8E8E93]">No hay gastos registrados</div>
                    ) : (
                      <div className="max-h-64 overflow-y-auto">
                        {filteredExpenses.map((e) => (
                          <div key={e.id} className="flex justify-between items-center py-3 px-4 border-b border-[#38383A] last:border-0 active:bg-[#2C2C2E] transition-colors">
                            <div>
                              <p className="text-[17px] font-medium text-white">{e.category}</p>
                              <p className="text-[13px] text-[#8E8E93]">{e.note || formatHumanDate(e.date)}</p>
                            </div>
                            <div className="text-right flex items-center gap-3">
                              <p className={`text-[17px] font-semibold ${isPrivate ? 'text-[#8E8E93]' : 'text-white'}`}>-{mask(e.amount)}</p>
                              <div className="flex flex-col gap-1 border-l border-[#38383A] pl-3 ml-1">
                                <button onClick={() => setExpenseForm(e)} className="text-[#0A84FF]"><Icon.Edit className="w-4 h-4"/></button>
                                <button onClick={() => handleDeleteClick('expenses', e.id, setExpenses)} className="text-[#FF3B30]"><Icon.Trash className="w-4 h-4"/></button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* --- PESTAÑA: METAS --- */}
        <div className={`${activeTab === 'metas' ? 'block' : 'hidden'}`}>
          <IOSSection eyebrow="Nueva Meta">
            <form onSubmit={saveGoal}>
              <IOSRow label="Objetivo"><input type="text" required placeholder="Ej. Enganche" className={inputCls} value={goalForm.name} onChange={(e) => setGoalForm({ ...goalForm, name: e.target.value })} /></IOSRow>
              <IOSRow label="Meta Total"><input type="number" step="any" min="0.01" required placeholder="$ 0.00" className={inputCls} value={goalForm.target} onChange={(e) => setGoalForm({ ...goalForm, target: e.target.value })} /></IOSRow>
              <IOSRow label="Guardado"><input type="number" step="any" min="0" placeholder="$ 0.00" className={inputCls} value={goalForm.saved} onChange={(e) => setGoalForm({ ...goalForm, saved: e.target.value })} /></IOSRow>
              <IOSRow label="Fecha"><input type="date" required className={inputCls} value={goalForm.deadline} onChange={(e) => setGoalForm({ ...goalForm, deadline: e.target.value })} /></IOSRow>
              <IOSRow label="Ubicación"><select className={inputCls} value={goalForm.storage} onChange={(e) => setGoalForm({ ...goalForm, storage: e.target.value })}>{STORAGE_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}</select></IOSRow>
              <button type="submit" className="w-full text-center text-[#0A84FF] text-[17px] font-semibold py-4 active:bg-[#2C2C2E] transition-colors">Crear Meta</button>
            </form>
          </IOSSection>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
            {goals.map((g) => {
              const target = Number(g.target); const saved = Number(g.saved);
              const pct = Math.min(100, (saved / target) * 100);
              return (
                <div key={g.id} className="bg-[#1C1C1E] rounded-[20px] p-5">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-[17px] font-semibold text-white">{g.name}</h3>
                      <p className="text-[13px] text-[#8E8E93]">{g.storage}</p>
                    </div>
                    <button onClick={() => handleDeleteClick('goals', g.id, setGoals)} className="text-[#FF3B30]"><Icon.Trash className="w-4 h-4"/></button>
                  </div>
                  
                  <div className="flex justify-between items-end mb-2">
                    <span className="text-[15px] font-semibold text-white">{mask(saved)} <span className="text-[#8E8E93] text-[13px] font-normal">de {mask(target)}</span></span>
                    <span className="text-[15px] font-bold text-[#34C759]">{pct.toFixed(0)}%</span>
                  </div>
                  
                  <div className="h-2 w-full bg-[#2C2C2E] rounded-full overflow-hidden mb-4">
                    <div className="h-full bg-[#34C759] transition-all" style={{ width: `${pct}%` }}></div>
                  </div>
                  
                  <button onClick={() => handleAddFundsClick(g)} className="w-full bg-[#2C2C2E] hover:bg-[#38383A] active:bg-[#48484A] text-[#0A84FF] text-[15px] font-semibold py-2.5 rounded-[12px] transition-colors">
                    Abonar
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </main>

      {/* --- NAVEGACIÓN MÓVIL (UITabBar Native Style) --- */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-[#121212]/80 backdrop-blur-2xl border-t border-white/10 z-40">
        <ul className="flex justify-around items-center h-[83px] pb-safe pt-2 px-2">
          <li className="flex-1">
            <button onClick={() => setActiveTab('resumen')} className={`w-full flex flex-col items-center gap-1 ${activeTab === 'resumen' ? 'text-[#0A84FF]' : 'text-[#8E8E93]'}`}>
              <Icon.Home className="h-6 w-6" />
              <span className="text-[10px] font-medium">Resumen</span>
            </button>
          </li>
          <li className="flex-1">
            <button onClick={() => setActiveTab('transacciones')} className={`w-full flex flex-col items-center gap-1 ${activeTab === 'transacciones' ? 'text-[#0A84FF]' : 'text-[#8E8E93]'}`}>
              <Icon.Wallet className="h-6 w-6" />
              <span className="text-[10px] font-medium">Historial</span>
            </button>
          </li>
          <li className="flex-1">
            <button onClick={() => setIsQuickAddOpen(true)} className="w-full flex flex-col items-center gap-1 text-[#8E8E93] active:text-white transition-colors">
              <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <span className="text-[10px] font-medium">Rápido</span>
            </button>
          </li>
          <li className="flex-1">
            <button onClick={() => setActiveTab('metas')} className={`w-full flex flex-col items-center gap-1 ${activeTab === 'metas' ? 'text-[#0A84FF]' : 'text-[#8E8E93]'}`}>
              <Icon.Target className="h-6 w-6" />
              <span className="text-[10px] font-medium">Metas</span>
            </button>
          </li>
        </ul>
      </nav>

      {/* --- BOTTOM SHEET MODAL (Gasto Rápido iOS) --- */}
      <div className={`fixed inset-0 z-50 transition-opacity duration-300 ${isQuickAddOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setIsQuickAddOpen(false)}></div>
        
        <div className={`absolute bottom-0 left-0 right-0 bg-[#1C1C1E] rounded-t-[32px] p-6 pb-12 transition-transform duration-300 transform ${isQuickAddOpen ? 'translate-y-0' : 'translate-y-full'}`}>
          <div className="w-12 h-1.5 bg-[#48484A] rounded-full mx-auto mb-6"></div>
          <h3 className="text-[20px] font-bold text-white tracking-tight mb-6 text-center">Gasto Rápido</h3>
          
          <form onSubmit={handleQuickExpense} className="flex flex-col gap-4">
            <div className="bg-[#2C2C2E] rounded-[16px] overflow-hidden">
              <div className="flex items-center px-4 py-3 border-b border-[#38383A]">
                <span className="text-[#8E8E93] text-[17px] mr-2">$</span>
                <input type="number" step="any" min="0.01" required autoFocus placeholder="0.00" className="w-full bg-transparent text-[22px] font-semibold text-white outline-none" value={qAmount} onChange={(e) => setQAmount(e.target.value)} />
              </div>
              <div className="px-4 py-3 border-b border-[#38383A]">
                <select className="w-full bg-transparent text-[17px] text-white outline-none" value={qCategory} onChange={(e) => setQCategory(e.target.value)}>
                  {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="px-4 py-3">
                <input type="text" placeholder="Nota opcional" className="w-full bg-transparent text-[17px] text-white outline-none placeholder:text-[#8E8E93]" value={qNote} onChange={(e) => setQNote(e.target.value)} />
              </div>
            </div>
            
            <button type="submit" className="mt-2 w-full bg-[#0A84FF] text-white text-[17px] font-semibold py-4 rounded-[14px] active:bg-[#0A84FF]/80 transition-colors">
              Guardar
            </button>
          </form>
        </div>
      </div>

      {/* MODALES CLÁSICOS */}
      {deleteModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-md px-4">
          <div className="bg-[#1C1C1E] rounded-[20px] w-full max-w-[270px] text-center overflow-hidden">
            <div className="p-6">
              <h3 className="text-[17px] font-semibold text-white mb-1">Eliminar Registro</h3>
              <p className="text-[13px] text-[#8E8E93]">Esta acción no se puede deshacer.</p>
            </div>
            <div className="border-t border-[#38383A] flex flex-col">
              <button onClick={confirmDelete} className="py-3 text-[17px] text-[#FF3B30] font-normal border-b border-[#38383A] active:bg-[#2C2C2E]">Eliminar</button>
              <button onClick={() => setDeleteModal({ isOpen: false, table: null, id: null, setFn: null })} className="py-3 text-[17px] text-[#0A84FF] font-semibold active:bg-[#2C2C2E]">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {fundModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-md px-4">
          <div className="bg-[#1C1C1E] rounded-[20px] p-6 w-full max-w-sm">
            <h3 className="text-[20px] font-bold text-white mb-4 text-center">Abonar a Meta</h3>
            <form onSubmit={confirmAddFunds}>
              <div className="bg-[#2C2C2E] rounded-[14px] flex items-center px-4 py-3 mb-6">
                <span className="text-[#8E8E93] text-[17px] mr-2">$</span>
                <input type="number" step="any" min="0.01" required autoFocus placeholder="0.00" className="w-full bg-transparent text-[22px] font-semibold text-white outline-none" value={fundModal.amount} onChange={(e) => setFundModal({ ...fundModal, amount: e.target.value })} />
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setFundModal({ isOpen: false, goal: null, amount: '' })} className="flex-1 py-3 text-[17px] text-[#0A84FF] font-semibold bg-[#2C2C2E] rounded-[14px] active:bg-[#38383A]">Cancelar</button>
                <button type="submit" className="flex-1 py-3 text-[17px] text-white font-semibold bg-[#0A84FF] rounded-[14px] active:bg-[#0A84FF]/80">Abonar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}