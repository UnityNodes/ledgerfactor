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

const post = async (path: string, body: object): Promise<any> => {
  const res = await fetch(`/api/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...H },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${await res.text()}`);
  return res.json();
};

export const action = (name: string, body: object = {}): Promise<any> => post(`actions/${name}`, body);

// ---- Veild sealed-bid auction ----
export const openAuction = (amount: number, description: string): Promise<any> => post('auction/open', { amount, description });
export const bidAuction = (invoiceCid: string, bidderKey: string, amount: number): Promise<any> =>
  post('auction/bid', { invoiceCid, bidderKey, amount });
export const closeAuction = (amount: number): Promise<any> => post('auction/close', { amount });
export const resetAuction = (): Promise<any> => post('auction/reset', {});
export const viewAuction = async (viewer: string): Promise<import('./types').AuctionView> => {
  const res = await fetch(`/api/auction/view/${viewer}`, { headers: H });
  if (!res.ok) throw new Error(`auction view ${viewer} -> ${res.status}`);
  return res.json();
};
