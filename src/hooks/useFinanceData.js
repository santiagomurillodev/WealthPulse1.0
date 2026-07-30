import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export function useFinanceData() {
  // Inicializamos desde localStorage para carga instantánea (Offline-First)
  const [incomes, setIncomes] = useState(() => {
    const cached = localStorage.getItem('wp_incomes');
    return cached ? JSON.parse(cached) : [];
  });
  const [expenses, setExpenses] = useState(() => {
    const cached = localStorage.getItem('wp_expenses');
    return cached ? JSON.parse(cached) : [];
  });
  const [goals, setGoals] = useState(() => {
    const cached = localStorage.getItem('wp_goals');
    return cached ? JSON.parse(cached) : [];
  });
  
  const [isLoading, setIsLoading] = useState(() => !localStorage.getItem('wp_incomes'));

  const fetchAllData = async () => {
    try {
      const { data: iData } = await supabase.from('incomes').select('*').order('date', { ascending: false });
      if (iData) {
        setIncomes(iData);
        localStorage.setItem('wp_incomes', JSON.stringify(iData));
      }

      const { data: eData } = await supabase.from('expenses').select('*').order('date', { ascending: false });
      if (eData) {
        setExpenses(eData);
        localStorage.setItem('wp_expenses', JSON.stringify(eData));
      }

      const { data: gData } = await supabase.from('goals').select('*').order('deadline', { ascending: true });
      if (gData) {
        setGoals(gData);
        localStorage.setItem('wp_goals', JSON.stringify(gData));
      }
    } catch (err) {
      console.warn("Sin conexión a la nube. Usando datos en caché local.", err);
    }
  };

  useEffect(() => {
    const initData = async () => {
      await fetchAllData();
      setIsLoading(false);
    };
    initData();

    // Suscripción WebSockets en tiempo real
    const channel = supabase
      .channel('schema-db-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'incomes' }, () => fetchAllData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, () => fetchAllData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'goals' }, () => fetchAllData())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return { incomes, setIncomes, expenses, setExpenses, goals, setGoals, isLoading };
}