import { randomBytes } from 'node:crypto';
import type { SessionEndpoint } from './cdp/endpoint';

const SESSION_ID_BYTES = 12;

export interface Session {
  id: string;
  endpoint: SessionEndpoint;
}

/** 런처가 아는 에이전트 세션들 */
export class SessionRegistry {
  private readonly sessions = new Map<string, Session>();

  newId(): string {
    let id: string;
    do id = randomBytes(SESSION_ID_BYTES).toString('base64url'); while (this.sessions.has(id));
    return id;
  }

  add(session: Session): void { this.sessions.set(session.id, session); }
  get(id: string): Session | undefined { return this.sessions.get(id); }
  all(): Session[] { return [...this.sessions.values()]; }
}
