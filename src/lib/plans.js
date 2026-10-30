// New batches of looks (3 looks, ~$0.15–0.40 each) a person may ask for in the app per day, by plan. A temporary
// safety net until there are membership tiers (Felipe, 2026-10-30): add plans here; users.daily_batches overrides it
// for one person (migration 004; people can't change their own plan or limit).
export const PLAN_LIMITS = { free: 8 };

export function dailyLimit(profile) {
  if (Number.isInteger(profile?.daily_batches)) return profile.daily_batches;
  return PLAN_LIMITS[profile?.plan] ?? PLAN_LIMITS.free;
}
