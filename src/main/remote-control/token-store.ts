import * as crypto from 'crypto';
import { JsonFile } from '../json-file';

/** How long a link keeps working before the phone has to scan a new code. */
export const TOKEN_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

/** The secret in the pairing link and when it was issued. */
export interface RemoteToken {
  token: string;
  /** Epoch ms. */
  createdAt: number;
}

/** 16 random bytes as base64url. */
const TOKEN_FORMAT = /^[A-Za-z0-9_-]{22}$/;

/**
 * The remote's token, kept in `remote-control.json` in `userData` so a link survives turning
 * the remote off and on and restarting the app, until it is 30 days old or is reset.
 * A missing, corrupt or expired record is replaced by a new token.
 */
export class RemoteTokenStore {
  private readonly file: JsonFile;

  constructor(
    filePath: string,
    private readonly now: () => number = Date.now,
  ) {
    // The token lets whoever holds it control the remote, so other local accounts must not read it.
    this.file = new JsonFile(filePath, { mode: 0o600 });
  }

  static expiresAt({ createdAt }: RemoteToken): number {
    return createdAt + TOKEN_LIFETIME_MS;
  }

  /** The stored token while it is valid, otherwise a new one, saved. */
  async current(): Promise<RemoteToken> {
    const stored = parseToken(await this.file.read());
    const age = stored ? this.now() - stored.createdAt : NaN;
    // A creation time in the future (a clock change, an edited file) would never expire.
    return stored && age >= 0 && age < TOKEN_LIFETIME_MS ? stored : this.reset();
  }

  /** Issues and saves a new token, ending the old one. */
  async reset(): Promise<RemoteToken> {
    const issued = { token: crypto.randomBytes(16).toString('base64url'), createdAt: this.now() };
    await this.file.write(issued);
    return issued;
  }
}

function parseToken(value: unknown): RemoteToken | null {
  if (typeof value !== 'object' || value === null) return null;
  const { token, createdAt } = value as Record<string, unknown>;
  return typeof token === 'string' && TOKEN_FORMAT.test(token) && typeof createdAt === 'number' && Number.isFinite(createdAt)
    ? { token, createdAt }
    : null;
}
