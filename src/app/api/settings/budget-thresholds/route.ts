import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { settings } from '@/lib/db/schema';
import { withValidation } from '@/lib/api/validation';

const KEYS = {
  falWarning: 'budget_threshold_fal_warning',
  falCritical: 'budget_threshold_fal_critical',
  orWarning: 'budget_threshold_or_warning',
  orCritical: 'budget_threshold_or_critical',
} as const;

const DEFAULTS = {
  fal: { warning: 50, critical: 100 },
  openRouter: { warning: 5, critical: 1 },
};

function readThresholds() {
  const rows = db.select().from(settings).all();
  const map = new Map(rows.map((r) => [r.key, r.value]));

  return {
    fal: {
      warning: Number(map.get(KEYS.falWarning)) || DEFAULTS.fal.warning,
      critical: Number(map.get(KEYS.falCritical)) || DEFAULTS.fal.critical,
    },
    openRouter: {
      warning: Number(map.get(KEYS.orWarning)) || DEFAULTS.openRouter.warning,
      critical: Number(map.get(KEYS.orCritical)) || DEFAULTS.openRouter.critical,
    },
  };
}

function upsert(key: string, value: number) {
  db.insert(settings)
    .values({ key, value: String(value) })
    .onConflictDoUpdate({ target: settings.key, set: { value: String(value) } })
    .run();
}

export async function GET() {
  return NextResponse.json(readThresholds());
}

const thresholdsSchema = z
  .object({
    fal: z.object({ warning: z.number().min(0), critical: z.number().min(0) }),
    openRouter: z.object({ warning: z.number().min(0), critical: z.number().min(0) }),
  })
  .strict();

export const PUT = withValidation(thresholdsSchema, async (_request, body) => {
  upsert(KEYS.falWarning, body.fal.warning);
  upsert(KEYS.falCritical, body.fal.critical);
  upsert(KEYS.orWarning, body.openRouter.warning);
  upsert(KEYS.orCritical, body.openRouter.critical);

  return NextResponse.json(readThresholds());
});
