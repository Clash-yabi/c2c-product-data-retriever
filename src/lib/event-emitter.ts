import { EventEmitter } from 'events';

// Next.js (App Router) kan in development de bestanden opnieuw inladen.
// We gebruiken een Symbol en het global object om er zeker van te zijn
// dat we maar één "Radio Toren" (EventEmitter) hebben over de hele applicatie.
const EMITTER_KEY = Symbol.for('c2c.jobEmitter');

const globalNode = global as unknown as { [key: symbol]: EventEmitter };

if (!globalNode[EMITTER_KEY]) {
  globalNode[EMITTER_KEY] = new EventEmitter();
  // Bij veel gelijktijdige gebruikers kan dit omhoog, voor nu is 50 ruim voldoende.
  globalNode[EMITTER_KEY].setMaxListeners(50);
}

export const jobEmitter = globalNode[EMITTER_KEY];
