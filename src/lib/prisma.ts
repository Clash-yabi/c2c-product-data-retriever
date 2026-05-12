import { PrismaClient } from '@prisma/client'
import { EventEmitter } from 'events';

// Verhoog de globale limiet voor alle EventEmitters (zoals Sockets en Prisma verbindingen)
EventEmitter.defaultMaxListeners = 100;
 
// Increase the limit for EventEmitter listeners to prevent false-positive warnings 
// during concurrent database/socket operations.
if (typeof process !== 'undefined') {
  process.setMaxListeners(100);
}

const prismaClientSingleton = () => {
  return new PrismaClient()
}

declare global {
  var prismaGlobal: undefined | ReturnType<typeof prismaClientSingleton>
}

export const prisma = globalThis.prismaGlobal ?? prismaClientSingleton()

if (process.env.NODE_ENV !== 'production') globalThis.prismaGlobal = prisma
