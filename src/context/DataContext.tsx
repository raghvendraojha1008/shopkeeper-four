import React, { createContext, useContext, ReactNode, useMemo } from 'react';
import { QueryClient, QueryClientProvider, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiService } from '../services/api';
import { Party, InventoryItem, WasteEntry } from '../types/models';

// Per-collection stale windows (ms).
// High-churn data (ledger, transactions, waste) use a short window.
// Low-churn reference data (parties, inventory) can be cached longer.
const STALE = {
  SHORT:  1000 * 60 * 2,   // 2 min  — transactions, ledger, waste
  MEDIUM: 1000 * 60 * 10,  // 10 min — inventory
  LONG:   1000 * 60 * 20,  // 20 min — parties (rarely change)
} as const;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: STALE.SHORT,
      gcTime: 1000 * 60 * 60,  // keep unused data in memory for 1 hour
      retry: 2,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true, // re-sync when network comes back
    },
  },
});

interface DataContextType {
  useParties: (userId: string) => {
    data: Party[];
    isLoading: boolean;
    refetch: () => void;
  };
  useInventory: (userId: string) => {
    data: InventoryItem[];
    isLoading: boolean;
    refetch: () => void;
  };
  useLowStockItems: (userId: string) => {
    data: InventoryItem[];
    isLoading: boolean;
  };
  useTransactions: (userId: string) => {
    data: any[];
    isLoading: boolean;
    refetch: () => void;
    setData: (updater: (old: any[]) => any[]) => void;
  };
  useLedger: (userId: string) => {
    data: any[];
    isLoading: boolean;
    refetch: () => void;
    setData: (updater: (old: any[]) => any[]) => void;
  };
  useWaste: (userId: string) => {
    data: WasteEntry[];
    isLoading: boolean;
    refetch: () => void;
    setData: (updater: (old: WasteEntry[]) => WasteEntry[]) => void;
  };
  invalidateAll: (userId: string) => void;
}

const DataContext = createContext<DataContextType | null>(null);

// Hooks for cached data access
const usePartiesQuery = (userId: string) => {
  return useQuery({
    queryKey: ['parties', userId],
    queryFn: async () => {
      if (!userId) return [];
      const snap = await ApiService.getAll(userId, 'parties');
      return snap.docs.map(d => ({ id: d.id, ...d.data() })) as Party[];
    },
    enabled: !!userId,
    staleTime: STALE.LONG,
  });
};

const useInventoryQuery = (userId: string) => {
  return useQuery({
    queryKey: ['inventory', userId],
    queryFn: async () => {
      if (!userId) return [];
      const snap = await ApiService.getAll(userId, 'inventory');
      return snap.docs.map(d => ({ id: d.id, ...d.data() })) as InventoryItem[];
    },
    enabled: !!userId,
    staleTime: STALE.MEDIUM,
  });
};

const useTransactionsQuery = (userId: string) => {
  return useQuery({
    queryKey: ['transactions', userId],
    queryFn: async () => {
      if (!userId) return [];
      const snap = await ApiService.getAll(userId, 'transactions');
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
      data.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      return data;
    },
    enabled: !!userId,
    staleTime: STALE.SHORT,
  });
};

const useLedgerQuery = (userId: string) => {
  return useQuery({
    queryKey: ['ledger', userId],
    queryFn: async () => {
      if (!userId) return [];
      const snap = await ApiService.getAll(userId, 'ledger_entries');
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
      data.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      return data;
    },
    enabled: !!userId,
    staleTime: STALE.SHORT,
  });
};

const useWasteQuery = (userId: string) => {
  return useQuery({
    queryKey: ['waste', userId],
    queryFn: async () => {
      if (!userId) return [];
      const snap = await ApiService.getAll(userId, 'waste_entries');
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() })) as WasteEntry[];
      data.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      return data;
    },
    enabled: !!userId,
    staleTime: STALE.SHORT,
  });
};

// FIX 4: Rules of Hooks — hooks cannot be called inside object method bodies.
// Pattern: expose stable hook functions via context; consumers call them at top level.
// The context now holds the hook functions themselves (references), not their results.
// Each consumer calls e.g. const { data } = useParties(uid) at the TOP of their component.

// Top-level custom hooks (safe — called at top of component, not inside object methods)
export const useParties = (userId: string) => {
  const { data, isLoading, refetch } = usePartiesQuery(userId);
  return { data: data || [], isLoading, refetch };
};

export const useInventory = (userId: string) => {
  const { data, isLoading, refetch } = useInventoryQuery(userId);
  return { data: data || [], isLoading, refetch };
};

export const useLowStockItems = (userId: string) => {
  const { data, isLoading } = useInventoryQuery(userId);
  const lowStock = (data || []).filter(
    (item) => Number(item.current_stock) <= Number(item.min_stock || 0) && Number(item.min_stock) > 0
  );
  return { data: lowStock, isLoading };
};

export const useTransactions = (userId: string) => {
  const { data, isLoading, refetch } = useTransactionsQuery(userId);
  return {
    data: data || [],
    isLoading,
    refetch,
    setData: (updater: (old: any[]) => any[]) => {
      queryClient.setQueryData(['transactions', userId], (old: any[] = []) => updater(old));
    },
  };
};

export const useLedger = (userId: string) => {
  const { data, isLoading, refetch } = useLedgerQuery(userId);
  return {
    data: data || [],
    isLoading,
    refetch,
    setData: (updater: (old: any[]) => any[]) => {
      queryClient.setQueryData(['ledger', userId], (old: any[] = []) => updater(old));
    },
  };
};

export const useWaste = (userId: string) => {
  const { data, isLoading, refetch } = useWasteQuery(userId);
  return {
    data: data || [],
    isLoading,
    refetch,
    setData: (updater: (old: WasteEntry[]) => WasteEntry[]) => {
      queryClient.setQueryData(['waste', userId], (old: WasteEntry[] = []) => updater(old));
    },
  };
};

export const invalidateAll = (userId: string) => {
  queryClient.invalidateQueries({ queryKey: ['parties', userId] });
  queryClient.invalidateQueries({ queryKey: ['inventory', userId] });
  queryClient.invalidateQueries({ queryKey: ['ledger', userId] });
  queryClient.invalidateQueries({ queryKey: ['transactions', userId] });
  queryClient.invalidateQueries({ queryKey: ['waste', userId] });
};

export const DataProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Stable object reference — hooks are module-level functions so this never changes.
  // useMemo avoids re-creating the object on every DataProvider render.
  const value = useMemo<DataContextType>(() => ({
    useParties,
    useInventory,
    useLowStockItems,
    useTransactions,
    useLedger,
    useWaste,
    invalidateAll,
  }), []);

  return (
    <QueryClientProvider client={queryClient}>
      <DataContext.Provider value={value}>{children}</DataContext.Provider>
    </QueryClientProvider>
  );
};

export const useData = () => {
  const context = useContext(DataContext);
  if (!context) throw new Error('useData must be used within DataProvider');
  return context;
};

// Export query client for manual invalidation
export { queryClient };







