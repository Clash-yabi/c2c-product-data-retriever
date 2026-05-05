import { EventEmitter } from 'events';

// Next.js (App Router) kan in development de bestanden opnieuw inladen.
// We gebruiken een Symbol en het global object om er zeker van te zijn
// dat we maar één "Radio Toren" (EventEmitter) hebben over de hele applicatie.
const EMITTER_KEY = Symbol.for('c2c.jobEmitter');

const globalAny = global as any;

if (!globalAny[EMITTER_KEY]) {
  globalAny[EMITTER_KEY] = new EventEmitter();
  // Bij veel gelijktijdige gebruikers kan dit omhoog, voor nu is 50 ruim voldoende.
  globalAny[EMITTER_KEY].setMaxListeners(50);
}

export const jobEmitter = globalAny[EMITTER_KEY] as EventEmitter;
