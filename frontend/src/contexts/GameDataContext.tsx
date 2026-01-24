/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { api } from '../services/api';
import type { IncrelutionAction, Skill } from '../types/models';

interface GameDataContextValue {
  actions: IncrelutionAction[];
  skills: Record<number, Skill>;
  loading: boolean;
  error: string | null;
}

const GameDataContext = createContext<GameDataContextValue | null>(null);

export function GameDataProvider({ children }: { children: ReactNode }) {
  const [actions, setActions] = useState<IncrelutionAction[]>([]);
  const [skills, setSkills] = useState<Record<number, Skill>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchGameData = async () => {
      try {
        const [actionsData, skillsData] = await Promise.all([
          api.getActions(),
          api.getSkills()
        ]);
        setActions(actionsData);
        setSkills(skillsData);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load game data');
        console.error('Error fetching game data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchGameData();
  }, []);

  return (
    <GameDataContext.Provider value={{ actions, skills, loading, error }}>
      {children}
    </GameDataContext.Provider>
  );
}

export function useGameData(): GameDataContextValue {
  const context = useContext(GameDataContext);
  if (!context) {
    throw new Error('useGameData must be used within a GameDataProvider');
  }
  return context;
}
