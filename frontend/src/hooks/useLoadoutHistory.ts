import { useCallback, useRef, useEffect } from 'react';
import type { LoadoutData, Loadout } from '../types/models';

const MAX_UNDO_HISTORY = 50;

interface UseLoadoutHistoryApi {
  importLoadout: (id: number, data: LoadoutData) => Promise<void>;
  getLoadout: (id: number) => Promise<Loadout>;
}

interface UseLoadoutHistoryOptions {
  loadout: Loadout | null;
  loadoutId: number | null;
  setLoadout: React.Dispatch<React.SetStateAction<Loadout | null>>;
  showToast: (message: string, type: 'success' | 'error') => void;
  api: UseLoadoutHistoryApi;
}

export function useLoadoutHistory({ loadout, loadoutId, setLoadout, showToast, api }: UseLoadoutHistoryOptions) {
  const undoStackRef = useRef<LoadoutData[]>([]);
  const redoStackRef = useRef<LoadoutData[]>([]);
  const isUndoRedoRef = useRef(false);

  // Clear history when switching loadouts
  useEffect(() => {
    undoStackRef.current = [];
    redoStackRef.current = [];
  }, [loadoutId]);

  const pushUndo = useCallback((currentData: LoadoutData) => {
    if (isUndoRedoRef.current) return;
    undoStackRef.current = [...undoStackRef.current.slice(-MAX_UNDO_HISTORY + 1), currentData];
    redoStackRef.current = [];
  }, []);

  const applyUndoRedo = useCallback(async (
    fromStack: LoadoutData[],
    toStack: LoadoutData[],
    label: string
  ) => {
    if (!loadout || !loadoutId || fromStack.length === 0) return;

    const targetData = fromStack.pop()!;
    toStack.push(loadout.data);

    isUndoRedoRef.current = true;
    setLoadout(prev => prev ? { ...prev, data: targetData, updatedAt: new Date().toISOString() } : prev);
    isUndoRedoRef.current = false;

    try {
      await api.importLoadout(loadoutId, targetData);
      showToast(label, 'success');
    } catch {
      showToast(`Failed to ${label.toLowerCase()}`, 'error');
      const loadoutData = await api.getLoadout(loadoutId);
      setLoadout(loadoutData);
    }
  }, [loadout, loadoutId, setLoadout, showToast, api]);

  const undo = useCallback(() => {
    applyUndoRedo(undoStackRef.current, redoStackRef.current, 'Undo');
  }, [applyUndoRedo]);

  const redo = useCallback(() => {
    applyUndoRedo(redoStackRef.current, undoStackRef.current, 'Redo');
  }, [applyUndoRedo]);

  return { pushUndo, undo, redo };
}
