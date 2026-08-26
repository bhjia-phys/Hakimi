/**
 *   GET /v1/provider-usage?provider=<id>
 *
 * Query/response schemas for the full provider usage route. The response is a
 * `{ providers: [...] }` list so every outcome (ok / error / unsupported) of
 * every queried usage provider is reported in one round trip. Field mapping is
 * snake_case, mirroring `GET /oauth/usage`'s `toWireUsage` (see
 * `routes/oauth.ts`); the projection itself lives in `routes/providerUsage.ts`.
 */

import { z } from 'zod';

export const providerUsageQuerySchema = z.object({
  provider: z.string().min(1).optional(),
});
export type ProviderUsageQuery = z.infer<typeof providerUsageQuerySchema>;

const providerUsageWindowSchema = z.object({
  duration: z.number().int(),
  unit: z.enum(['minute', 'hour', 'day', 'week']),
});

const providerUsageRowSchema = z.object({
  name: z.string().optional(),
  window: providerUsageWindowSchema.optional(),
  used: z.number().int(),
  limit: z.number().int(),
  reset_at: z.string().optional(),
});
export type ProviderUsageRow = z.infer<typeof providerUsageRowSchema>;

const providerExtraUsageSchema = z.object({
  balance_cents: z.number().int(),
  total_cents: z.number().int(),
  monthly_charge_limit_enabled: z.boolean(),
  monthly_charge_limit_cents: z.number().int(),
  monthly_used_cents: z.number().int(),
  currency: z.string(),
});
export type ProviderExtraUsage = z.infer<typeof providerExtraUsageSchema>;

const providerUsageOkSchema = z.object({
  provider: z.string(),
  kind: z.literal('ok'),
  summary: providerUsageRowSchema.nullable(),
  limits: z.array(providerUsageRowSchema),
  extra_usage: providerExtraUsageSchema.nullable(),
});
export type ProviderUsageOk = z.infer<typeof providerUsageOkSchema>;

const providerUsageErrorSchema = z.object({
  provider: z.string(),
  kind: z.literal('error'),
  message: z.string(),
  status: z.number().int().optional(),
});
export type ProviderUsageError = z.infer<typeof providerUsageErrorSchema>;

const providerUsageUnsupportedSchema = z.object({
  provider: z.string(),
  kind: z.literal('unsupported'),
  message: z.string(),
  status: z.number().int().optional(),
});
export type ProviderUsageUnsupported = z.infer<typeof providerUsageUnsupportedSchema>;

export const providerUsageItemSchema = z.discriminatedUnion('kind', [
  providerUsageOkSchema,
  providerUsageErrorSchema,
  providerUsageUnsupportedSchema,
]);
export type ProviderUsageItem = z.infer<typeof providerUsageItemSchema>;

export const providerUsageResponseSchema = z.object({
  providers: z.array(providerUsageItemSchema),
});
export type ProviderUsageResponse = z.infer<typeof providerUsageResponseSchema>;