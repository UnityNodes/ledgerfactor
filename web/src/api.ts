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

export const action = async (name: string, body: object = {}): Promise<any> => {
  const res = await fetch(`/api/actions/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${name} -> ${res.status} ${await res.text()}`);
  return res.json();
};
