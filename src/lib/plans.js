// What each plan allows (Felipe, 2026-10-30: a temporary safety net that opens the way to membership tiers).
// users.plan picks the plan; users.daily_batches overrides the daily limit for one person (migration 004: people can't
// change their own plan or limit). Set a plan in the SQL editor: UPDATE public.users SET plan = 'tester' WHERE email = '…';
//   dailyBatches      new batches of looks (3 looks, ~$0.15–0.40 each) a person may ask for in the app per day
//   instantNewOutfit  a new outfit photo makes looks wearing it right away, for the open tab (otherwise: next run)
export const PLANS = {
  free: { dailyBatches: 8, instantNewOutfit: false },
  tester: { dailyBatches: 50, instantNewOutfit: true }, // for testing the app (Felipe)
};
export const PLAN_LIMITS = Object.fromEntries(Object.entries(PLANS).map(([k, v]) => [k, v.dailyBatches]));

export function planFeatures(profile) {
  return PLANS[profile?.plan] || PLANS.free;
}

export function dailyLimit(profile) {
  if (Number.isInteger(profile?.daily_batches)) return profile.daily_batches;
  return planFeatures(profile).dailyBatches;
}
