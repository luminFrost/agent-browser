import { EventEmitter } from 'node:events';
import type { Readable, Writable } from 'node:stream';

/** CDP 메시지 하나. 응답은 id, 이벤트는 method를 가진다. */
export interface CdpMessage {
  id?: number;
  method?: string;
  params?: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: { code: number; message: string };
  sessionId?: string;
}

/**
 * `--remote-debugging-pipe`의 fd 3(쓰기)·fd 4(읽기)에 붙는 클라이언트.
 * 메시지는 JSON 뒤에 NUL(\0) 하나로 구분된다.
 * 'message' 이벤트로 받은 모든 메시지(자기 요청의 응답 포함)를 내보낸다. 중계기가 이 이벤트를 쓴다.
 */
export class CdpPipe extends EventEmitter {
  private nextId = 1;
  private buffer = '';
  private readonly pending = new Map<number, { resolve: (r: Record<string, unknown>) => void; reject: (e: Error) => void }>();

  constructor(private readonly out: Writable, input: Readable) {
    super();
    input.on('data', (chunk: Buffer) => this.onData(chunk));
    input.on('close', () => {
      for (const p of this.pending.values()) p.reject(new Error('CDP 파이프가 닫혔다'));
      this.pending.clear();
      this.emit('close');
    });
  }

  /** 원본 메시지를 그대로 보낸다(중계기용). id는 호출자가 책임진다. */
  sendRaw(message: CdpMessage): void {
    this.out.write(JSON.stringify(message) + '\0');
  }

  /** 앱 자신이 쓰는 요청. 런처 내부용 id 공간(음수)을 써서 중계되는 클라이언트 id와 겹치지 않게 한다. */
  send(method: string, params: Record<string, unknown> = {}, sessionId?: string): Promise<Record<string, unknown>> {
    const id = -this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.sendRaw({ id, method, params, ...(sessionId ? { sessionId } : {}) });
    });
  }

  private onData(chunk: Buffer): void {
    this.buffer += chunk.toString('utf8');
    let end: number;
    while ((end = this.buffer.indexOf('\0')) >= 0) {
      const text = this.buffer.slice(0, end);
      this.buffer = this.buffer.slice(end + 1);
      const message = JSON.parse(text) as CdpMessage;
      const waiter = message.id !== undefined ? this.pending.get(message.id) : undefined;
      if (waiter && message.id !== undefined) {
        this.pending.delete(message.id);
        if (message.error) waiter.reject(new Error(`${message.error.message} (${message.error.code})`));
        else waiter.resolve(message.result ?? {});
        continue;
      }
      this.emit('message', message);
    }
  }
}
