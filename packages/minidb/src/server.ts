// src/server.ts
//
// A minimal RESP (REdis Serialization Protocol) TCP front-end for MiniDb, so
// existing Redis clients (redis-cli, ioredis, ...) can talk to it.

import net from 'node:net';
import type { Socket } from 'node:net';
import { MiniDb } from './index.js';

const CRLF = '\r\n';
const NIL = `$-1${CRLF}`;

const reply = {
  ok: () => `+OK${CRLF}`,
  pong: () => `+PONG${CRLF}`,
  int: (n: number) => `:${n}${CRLF}`,
  err: (m: string) => `-ERR ${m}${CRLF}`,
  // Bulk replies carry raw bytes. Build a Buffer so non-ASCII / binary values
  // are written verbatim instead of being re-encoded as UTF-8 (which corrupted
  // them and desynced the protocol when `socket.write(string)` defaulted to
  // utf8).
  bulk: (v: unknown): Buffer => {
    if (v === undefined || v === null) return Buffer.from(NIL);
    const b = Buffer.isBuffer(v) ? v : Buffer.from(String(v as string));
    return Buffer.concat([Buffer.from(`$${b.length}${CRLF}`), b, Buffer.from(CRLF)]);
  },
  array: (items: unknown[]): Buffer => {
    const parts: Buffer[] = [Buffer.from(`*${items.length}${CRLF}`)];
    for (const it of items) parts.push(reply.bulk(it));
    return Buffer.concat(parts);
  },
};

class RespParser {
  private buf: Buffer = Buffer.alloc(0);
  private readonly maxBuf: number;
  // An oversized bulk's declared payload (+ trailing CRLF) still to consume
  // verbatim after its `$N\r\n` header was rejected: the bytes are counted
  // off, never parsed, so arbitrary CRLF / `*` / `$` content inside them
  // cannot surface as a command.
  private discardBulk = 0;
  // Remaining args of an aborted array frame to skip: each `$M\r\n` header is
  // parsed (headers are tiny) and its M+2 payload bytes are counted off.
  private discardArgs = 0;
  // An oversized inline command line: consume bytes until the next CRLF
  // (inline commands are line-based, so the line end is the frame end).
  private discardInline = false;

  constructor({ maxBuf = 64 * 1024 * 1024 }: { maxBuf?: number } = {}) {
    this.maxBuf = maxBuf;
  }

  *feed(chunk: Buffer): Generator<Buffer[]> {
    let work = this.buf.length === 0 ? chunk : Buffer.concat([this.buf, chunk]);
    this.buf = Buffer.alloc(0);
    let pos = 0;

    while (pos < work.length) {
      if (this.discardBulk > 0) {
        const take = Math.min(this.discardBulk, work.length - pos);
        this.discardBulk -= take;
        pos += take;
        continue;
      }
      if (this.discardArgs > 0) {
        if (work[pos] !== 0x24 /* '$' */) {
          // The aborted frame's remainder is not an argument header — stop
          // skipping and resume normal parsing (best effort on a malformed
          // stream; the size backstop still bounds the buffer).
          this.discardArgs = 0;
          continue;
        }
        const end = work.indexOf(CRLF, pos + 1);
        if (end === -1) {
          this.buf = work.subarray(pos);
          return;
        }
        const len = Number(work.subarray(pos + 1, end).toString());
        this.discardArgs -= 1;
        this.discardBulk = len + 2;
        pos = end + 2;
        continue;
      }
      if (this.discardInline) {
        const end = work.indexOf(CRLF, pos);
        if (end === -1) return; // keep dropping bytes until the line ends
        this.discardInline = false;
        pos = end + 2;
        continue;
      }

      if (work[pos] !== 0x2a /* '*' */) {
        const end = work.indexOf(CRLF, pos);
        if (end === -1) {
          if (work.length - pos > this.maxBuf) {
            this.discardInline = true;
            throw new Error(`RESP request too large (>${this.maxBuf} bytes)`);
          }
          this.buf = work.subarray(pos);
          return;
        }
        const line = work.subarray(pos, end).toString();
        pos = end + 2;
        yield line.split(' ').filter(Boolean).map((s) => Buffer.from(s));
        continue;
      }

      // RESP array: `*<argc>\r\n` followed by `<argc>` bulk arguments.
      let p = pos + 1;
      let end = work.indexOf(CRLF, p);
      if (end === -1) {
        if (work.length - pos > this.maxBuf) {
          this.discardInline = true;
          throw new Error(`RESP request too large (>${this.maxBuf} bytes)`);
        }
        this.buf = work.subarray(pos);
        return;
      }
      const argc = Number(work.subarray(p, end).toString());
      p = end + 2;
      const args: Buffer[] = [];
      for (let i = 0; i < argc; i++) {
        if (p >= work.length) {
          if (work.length - pos > this.maxBuf) {
            // The buffered prefix alone already exceeds the cap: reject and
            // skip the frame's remaining args by their length prefixes (the
            // next bytes to arrive are arg i's `$M\r\n` header).
            this.discardArgs = argc - i;
            this.buf = Buffer.alloc(0);
            throw new Error(`RESP request too large (>${this.maxBuf} bytes)`);
          }
          this.buf = work.subarray(pos);
          return;
        }
        if (work[p] !== 0x24 /* '$' */) {
          if (work.length - pos > this.maxBuf) {
            this.discardArgs = argc - i;
            this.buf = work.subarray(p);
            throw new Error(`RESP request too large (>${this.maxBuf} bytes)`);
          }
          this.buf = work.subarray(pos);
          return;
        }
        p++;
        end = work.indexOf(CRLF, p);
        if (end === -1) {
          if (work.length - pos > this.maxBuf) {
            // The `$` of arg i is consumed but its length header is pending;
            // retain from the `$` so the skip pass can still read the length.
            this.discardArgs = argc - i;
            this.buf = work.subarray(p - 1);
            throw new Error(`RESP request too large (>${this.maxBuf} bytes)`);
          }
          this.buf = work.subarray(pos);
          return;
        }
        const len = Number(work.subarray(p, end).toString());
        p = end + 2;
        if (len > this.maxBuf) {
          // Reject at the length prefix, before any payload is buffered: the
          // frame is dead, so consume its declared payload + CRLF verbatim
          // and skip any remaining args by their own length prefixes.
          this.discardBulk = len + 2;
          this.discardArgs = argc - i - 1;
          this.buf = work.subarray(p);
          throw new Error(`RESP request too large (>${this.maxBuf} bytes)`);
        }
        if (work.length - p < len + 2) {
          if (work.length - pos > this.maxBuf) {
            // Over the cap mid-payload: the bytes already buffered are
            // dropped, the rest of this bulk is counted off, then the
            // remaining args are skipped.
            this.discardBulk = len + 2 - (work.length - p);
            this.discardArgs = argc - i - 1;
            this.buf = Buffer.alloc(0);
            throw new Error(`RESP request too large (>${this.maxBuf} bytes)`);
          }
          this.buf = work.subarray(pos);
          return;
        }
        args.push(work.subarray(p, p + len));
        p += len + 2;
      }
      pos = p;
      yield args;
    }
  }
}

async function handle(db: MiniDb<string>, args: Buffer[]): Promise<string | Buffer | null> {
  const cmd = args[0]!.toString().toUpperCase();
  const S = (i: number): string | undefined => (args[i] === undefined ? undefined : args[i]!.toString());

  switch (cmd) {
    case 'PING':
      return args[1] ? reply.bulk(S(1)) : reply.pong();
    case 'ECHO':
      return reply.bulk(S(1));
    case 'GET': {
      const v = db.get(S(1)!);
      return reply.bulk(v === undefined ? null : v);
    }
    case 'SET': {
      const key = S(1)!;
      const val = S(2)!;
      let ttl: number | undefined;
      for (let i = 3; i < args.length; i++) {
        const opt = S(i)!.toUpperCase();
        if (opt === 'EX') ttl = Number(S(++i)) * 1000;
        else if (opt === 'PX') ttl = Number(S(++i));
      }
      await db.set(key, val, ttl ? { ttl } : {});
      return reply.ok();
    }
    case 'DEL': {
      let n = 0;
      for (let i = 1; i < args.length; i++) if (await db.del(S(i)!)) n++;
      return reply.int(n);
    }
    case 'EXISTS':
      return reply.int(db.has(S(1)!) ? 1 : 0);
    case 'MGET': {
      const out: unknown[] = [];
      for (let i = 1; i < args.length; i++) {
        const v = db.get(S(i)!);
        out.push(v === undefined ? null : v);
      }
      return reply.array(out);
    }
    case 'MSET': {
      const entries: (readonly [string, string])[] = [];
      for (let i = 1; i + 1 < args.length; i += 2) entries.push([S(i)!, S(i + 1)!]);
      await db.mset(entries); // atomic batch (single WAL frame), like Redis MSET
      return reply.ok();
    }
    case 'TTL':
      return reply.int(Math.trunc(db.ttl(S(1)!) / 1000));
    case 'DBSIZE':
      return reply.int(db.size);
    case 'COMPACT':
      await db.compact();
      return reply.ok();
    case 'INFO':
      return reply.bulk(`minidb_version:0.0.1${CRLF}keys:${db.size}${CRLF}compactions:${db.stats.compactions}${CRLF}`);
    case 'QUIT':
      return null;
    default:
      return reply.err(`unknown command '${cmd}'`);
  }
}

export interface ServerOptions {
  dir: string;
  port?: number;
  host?: string;
  fsyncPolicy?: 'always' | 'everysec' | 'no';
}

export interface ServerHandle {
  server: net.Server;
  db: MiniDb<string>;
  close: () => Promise<void>;
  port: number;
  host: string;
}

export async function startServer({ dir, port = 6379, host = '127.0.0.1', fsyncPolicy = 'everysec' }: ServerOptions): Promise<ServerHandle> {
  const db = (await MiniDb.open({ dir, valueCodec: 'string', fsyncPolicy })) as MiniDb<string>;
  const server = net.createServer((socket: Socket) => {
    const parser = new RespParser();
    // Serialize per-connection processing: a new chunk's commands are queued
    // behind the previous chunk's in-flight work, so replies always leave in
    // request order. Without this, a slow command in one packet (e.g. SET with
    // fsync 'always') let replies from the next packet overtake it, breaking
    // pipelined clients.
    let queue: Promise<void> = Promise.resolve();
    // A client that resets the connection while a large reply is being written
    // makes the next write fail with EPIPE/ECONNRESET. Without an 'error'
    // listener that event becomes an uncaught exception and takes the whole
    // process down, so swallow it: the connection is dead either way, and the
    // queued work below skips further writes to it.
    socket.on('error', () => {});
    // Never write to a destroyed socket: write-after-destroy would just
    // surface as another 'error' event on the dead connection.
    const send = (res: string | Buffer): void => {
      if (!socket.destroyed) socket.write(res);
    };
    socket.on('data', (chunk: Buffer) => {
      queue = queue.then(async () => {
        try {
          for (const args of parser.feed(chunk)) {
            if (socket.destroyed) return;
            let res: string | Buffer | null;
            try {
              res = await handle(db, args);
            } catch (e) {
              // One failing command must not starve the replies of the
              // commands already parsed from the same chunk.
              res = reply.err((e as Error).message);
            }
            if (res === null) {
              socket.end();
              return;
            }
            send(res);
          }
        } catch (e) {
          // Parser-level failure (e.g. oversized request): the parser has
          // already entered its discard state, so the connection can keep
          // serving new commands once the oversized frame's bytes have been
          // consumed.
          send(reply.err((e as Error).message));
        }
      });
    });
  });

  await new Promise<void>((resolve) => server.listen(port, host, resolve));
  const actualPort = (server.address() as net.AddressInfo).port;

  const close = async (): Promise<void> => {
    server.close();
    await db.close();
  };
  process.on('SIGINT', () => {
    void close().then(() => process.exit(0));
  });
  return { server, db, close, port: actualPort, host };
}

// Run directly: node --import tsx src/server.ts --dir ./data --port 6379
if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const arg = (name: string, def: string): string => {
    const i = argv.indexOf(`--${name}`);
    return i === -1 ? def : argv[i + 1]!;
  };
  const dir = arg('dir', './data');
  const port = Number(arg('port', '6379'));
  const fsyncPolicy = arg('fsync', 'everysec') as 'always' | 'everysec' | 'no';
  const { host, port: p } = await startServer({ dir, port, fsyncPolicy });
  console.log(`minidb RESP server listening on ${host}:${p} (dir=${dir}, fsync=${fsyncPolicy})`);
}
