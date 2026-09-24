'use client';

/**
 * The time step's data: the open slots for one day, and the one picked.
 *
 * Only fetches — the rules for what counts as open live behind
 * /api/availability, where the database can enforce them.
 */
import { useCallback, useState } from 'react';

export interface Slot {
  startsAt: string;
  endsAt: string;
  durationMin: number;
  staffResourceId: string | null;
}

export function useAvailabilitySlots({
  tenantId,
  serviceIds,
  staffId,
}: {
  tenantId: string;
  serviceIds: string[];
  staffId: string | null;
}) {
  const [slots, setSlots] = useState<Slot[]>([]);
  /** The shop has no staff/seats or no hours — no day will ever have a slot. */
  const [setupIncomplete, setSetupIncomplete] = useState(false);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSlots = useCallback(
    async (forDate: string) => {
      if (serviceIds.length === 0) return;
      setLoadingSlots(true);
      setError(null);
      setSlot(null);
      try {
        const params = new URLSearchParams({
          tenantId,
          date: forDate,
          serviceIds: serviceIds.join(','),
        });
        if (staffId) params.set('resourceId', staffId);

        const response = await fetch(`/api/availability?${params}`);
        if (!response.ok) throw new Error('load failed');
        const body = (await response.json()) as { slots: Slot[]; setupIncomplete?: boolean };
        setSlots(body.slots);
        setSetupIncomplete(Boolean(body.setupIncomplete));
      } catch {
        setError('โหลดเวลาว่างไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
        setSlots([]);
        setSetupIncomplete(false);
      } finally {
        setLoadingSlots(false);
      }
    },
    [tenantId, serviceIds, staffId],
  );

  return { slots, setupIncomplete, slot, setSlot, loadingSlots, error, loadSlots };
}
