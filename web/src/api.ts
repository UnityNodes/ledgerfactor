import { RoleView } from './types';

const ROLES = ['supplier', 'buyer', 'financier', 'auditor'];

const sessionId = (): string => {
  try {
    let s = localStorage.getItem('lf_sid');
    if (!s) {
      s = 'lf' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
      localStorage.setItem('lf_sid', s);
    }
    return s;
  } catch {
    return 'lfdefault';
  }
};

export const SID = sessionId();
const H = { 'x-lf-session': SID };

export const newSession = (): void => {
  try {
    localStorage.setItem('lf_sid', 'lf' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36));
  } catch {
    /* ignore */
  }
};

export const fetchViews = async (): Promise<RoleView[]> =>
  Promise.all(
    ROLES.map(async (r) => {
      const res = await fetch(`/api/view/${r}`, { headers: H });
      if (!res.ok) throw new Error(`view ${r} -> ${res.status}`);
      return res.json() as Promise<RoleView>;
    }),
  );

export const action = async (name: string, body: object = {}): Promise<any> => {
  const res = await fetch(`/api/actions/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...H },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${name} -> ${res.status} ${await res.text()}`);
  return res.json();
};
