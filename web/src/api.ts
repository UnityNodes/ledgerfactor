import { RoleView } from './types';

const ROLES = ['supplier', 'buyer', 'financier', 'auditor'];

export const fetchViews = async (): Promise<RoleView[]> =>
  Promise.all(
    ROLES.map(async (r) => {
      const res = await fetch(`/api/view/${r}`);
      if (!res.ok) throw new Error(`view ${r} -> ${res.status}`);
      return res.json() as Promise<RoleView>;
    }),
  );

export const scoreInvoice = async (amount: number, tenorDays: number, priorBook = 0) => {
  const res = await fetch('/api/score', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount, tenorDays, priorBook }),
  });
  if (!res.ok) throw new Error(`score -> ${res.status}`);
  return res.json();
};
