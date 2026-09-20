import { createServer, type Server } from 'node:http';
import { type AddressInfo } from 'node:net';

interface Answer {
  status: number;
  body: unknown;
}

/**
 * A stand-in for Valhalla: answers /route and /status like the engine, so
 * tests exercise the real client. Queue an error with `failNext`.
 */
export class FakeValhalla {
  readonly routeRequests: Record<string, unknown>[] = [];
  private next?: Answer;
  private server?: Server;
  url = '';

  async start(): Promise<void> {
    this.server = createServer((req, res) => {
      let raw = '';
      req.on('data', (chunk: Buffer) => (raw += chunk.toString()));
      req.on('end', () => {
        const answer = this.answer(req.url ?? '', raw);
        res.statusCode = answer.status;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(answer.body));
      });
    });
    await new Promise<void>((resolve) => this.server!.listen(0, '127.0.0.1', resolve));
    this.url = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
  }

  async stop(): Promise<void> {
    await new Promise((resolve) => this.server?.close(resolve));
  }

  env(): Record<string, string> {
    return { VALHALLA_URL: this.url };
  }

  reset(): void {
    this.routeRequests.length = 0;
    this.next = undefined;
  }

  /** The next request gets this Valhalla error, e.g. 171 "No suitable edges near location". */
  failNext(errorCode: number, error: string): void {
    this.next = {
      status: 400,
      body: { error_code: errorCode, error, status_code: 400, status: 'Bad Request' },
    };
  }

  private answer(url: string, raw: string): Answer {
    const queued = this.next;
    this.next = undefined;
    if (queued) return queued;
    if (url === '/status') {
      return { status: 200, body: { version: '3.8.3', tileset_last_modified: 1_758_000_000 } };
    }
    if (url === '/route') {
      this.routeRequests.push(JSON.parse(raw) as Record<string, unknown>);
      // polyline6 of (59.9343, 30.3351) -> (59.939, 30.3158).
      const leg = { shape: 'wdbiqBwfozx@wdHfud@', summary: { length: 1.4235, time: 1024.6 } };
      return {
        status: 200,
        body: { trip: { legs: [leg], summary: leg.summary, status: 0, units: 'kilometers' } },
      };
    }
    return { status: 404, body: { error_code: 106, error: 'Try any of: /route /status' } };
  }
}
