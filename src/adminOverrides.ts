export const OVERRIDES_KEY = "kaeltetechnik_admin_v1";

export type AdminOverride = { question?: string; answer?: string; explanation?: string };
export type AdminOverrides = Record<number, AdminOverride>;

export function loadAdminOverrides(): AdminOverrides {
  try {
    const raw = localStorage.getItem(OVERRIDES_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

export function saveAdminOverrides(ov: AdminOverrides): void {
  localStorage.setItem(OVERRIDES_KEY, JSON.stringify(ov));
}
