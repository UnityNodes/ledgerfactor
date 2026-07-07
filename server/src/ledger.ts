import { createHmac } from 'node:crypto';

const JSON_API = process.env.JSON_API ?? 'http://localhost:7575';
const LEDGER_ID = process.env.LEDGER_ID ?? 'sandbox';
const APP_ID = 'ledgerfactor';
const SECRET = process.env.LF_JWT_SECRET ?? 'ledgerfactor-dev-secret';

const PACKAGE_ID = process.env.LF_PACKAGE_ID ?? '';

export const templateId = (entity: string): string =>
  `${PACKAGE_ID ? PACKAGE_ID + ':' : ''}LedgerFactor:${entity}`;

const b64url = (input: string): string => Buffer.from(input).toString('base64url');

const signJwt = (claims: object): string => {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify(claims));
  const data = `${header}.${payload}`;
  const sig = createHmac('sha256', SECRET).update(data).digest('base64url');
  return `${data}.${sig}`;
};

export const partyToken = (parties: string[]): string =>
  signJwt({
    'https://daml.com/ledger-api': {
      ledgerId: LEDGER_ID,
      applicationId: APP_ID,
      actAs: parties,
      readAs: parties,
    },
  });

export const adminToken = (): string =>
  signJwt({
    'https://daml.com/ledger-api': {
      ledgerId: LEDGER_ID,
      applicationId: APP_ID,
      admin: true,
      actAs: [],
      readAs: [],
    },
  });

const call = async (path: string, token: string, body?: unknown): Promise<any> => {
  const res = await fetch(`${JSON_API}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || (typeof json.status === 'number' && json.status >= 400)) {
    throw new Error(`JSON API ${path} -> ${res.status} ${JSON.stringify(json)}`);
  }
  return json;
};

export interface Contract<T = Record<string, unknown>> {
  contractId: string;
  templateId: string;
  payload: T;
}

export const allocateParty = async (hint: string): Promise<string> => {
  const r = await call('/v1/parties/allocate', adminToken(), { identifierHint: hint });
  return r.result.identifier as string;
};

export const listParties = async (): Promise<{ identifier: string }[]> => {
  const r = await call('/v1/parties', adminToken());
  return (r.result ?? []) as { identifier: string }[];
};

export const create = async (party: string, entity: string, payload: object): Promise<Contract> => {
  const r = await call('/v1/create', partyToken([party]), { templateId: templateId(entity), payload });
  return r.result as Contract;
};

export const exercise = async (
  party: string,
  entity: string,
  contractId: string,
  choice: string,
  argument: object = {},
): Promise<any> => {
  const r = await call('/v1/exercise', partyToken([party]), {
    templateId: templateId(entity),
    contractId,
    choice,
    argument,
  });
  return r.result.exerciseResult;
};

export const query = async (party: string, entities: string[]): Promise<Contract[]> => {
  const r = await call('/v1/query', partyToken([party]), {
    templateIds: entities.map(templateId),
  });
  return r.result as Contract[];
};

export const healthy = async (): Promise<boolean> => {
  try {
    const res = await fetch(`${JSON_API}/readyz`);
    return res.ok;
  } catch {
    return false;
  }
};
