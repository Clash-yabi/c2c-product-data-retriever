import { EventEmitter } from 'events';

// Next.js (App Router) kan in development de bestanden opnieuw inladen.
// We gebruiken een Symbol en het global object om er zeker van te zijn
// dat we maar één "Radio Toren" (EventEmitter) hebben over de hele applicatie.
const EMITTER_KEY = Symbol.for('c2c.jobEmitter');

const globalNode = global as unknown as { [key: symbol]: EventEmitter };

if (!globalNode[EMITTER_KEY]) {
  globalNode[EMITTER_KEY] = new EventEmitter();
  // De limiet wordt nu globaal geregeld in prisma.ts via EventEmitter.defaultMaxListeners
}

export const jobEmitter = globalNode[EMITTER_KEY];
