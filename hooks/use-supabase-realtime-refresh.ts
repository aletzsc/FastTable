import { useFocusEffect } from 'expo-router';
import { useCallback, useRef } from 'react';

import { supabase } from '@/lib/supabase';

const DEBOUNCE_MS = 400;

/** Mesero / anfitrión — panel principal */
export const REALTIME_WORKER_DASHBOARD = [
  'mesas',
  'fila_espera',
  'solicitudes_servicio',
  'reservas_mesa',
] as const;

/** Cocina y gerente (pedidos + carta) */
export const REALTIME_KITCHEN = ['pedidos_cocina', 'items_menu'] as const;

/** Pantalla reservas del personal */
export const REALTIME_WORKER_RESERVATIONS = ['reservas_mesa', 'mesas'] as const;

/** Panel gerente (stats agregados) */
export const REALTIME_GERENTE = ['pedidos_cocina', 'items_menu', 'personal', 'reportes_problema'] as const;

/** Comensal — mesas en pestaña Salón (+ reservas propias) */
export const REALTIME_TABLES_SCREEN = ['mesas', 'reservas_mesa'] as const;

/** Comensal — fila virtual */
export const REALTIME_QUEUE_TAB = ['fila_espera'] as const;

/** Comensal — menú + cuenta (pedidos) */
export const REALTIME_MENU_COMENSAL = ['items_menu', 'pedidos_cocina'] as const;

/**
 * Mientras la pantalla está enfocada, escucha cambios en Postgres (Supabase Realtime)
 * y vuelve a cargar datos sin pull-to-refresh. Requiere que las tablas estén en
 * `supabase_realtime` (incluido en `supabase/01_reconstruir_db.sql`).
 */
export function useSupabaseRealtimeRefresh(
  tableNames: readonly string[],
  onReload: () => void | Promise<void>,
  enabled: boolean,
) {
  const reloadRef = useRef(onReload);
  reloadRef.current = onReload;
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tablesRef = useRef(tableNames);
  tablesRef.current = tableNames;
  const tablesKey = tableNames.join(',');

  useFocusEffect(
    useCallback(() => {
      if (!enabled || tablesRef.current.length === 0) {
        return undefined;
      }

      const scheduleReload = () => {
        if (debounceTimer.current) clearTimeout(debounceTimer.current);
        debounceTimer.current = setTimeout(() => {
          debounceTimer.current = null;
          void Promise.resolve(reloadRef.current());
        }, DEBOUNCE_MS);
      };

      const channel = supabase.channel(`rt:${tablesKey}:${Date.now()}`);
      for (const table of tablesRef.current) {
        channel.on('postgres_changes', { event: '*', schema: 'public', table }, scheduleReload);
      }
      channel.subscribe();

      return () => {
        if (debounceTimer.current) {
          clearTimeout(debounceTimer.current);
          debounceTimer.current = null;
        }
        void supabase.removeChannel(channel);
      };
    }, [enabled, tablesKey]),
  );
}
