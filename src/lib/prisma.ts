import { PrismaClient } from '@prisma/client'
 
// Increase the limit for EventEmitter listeners to prevent false-positive warnings 
// during concurrent database/socket operations.
if (typeof process !== 'undefined') {
  process.setMaxListeners(30);
}

const prismaClientSingleton = () => {
  return new PrismaClient()
}

declare global {
  var prismaGlobal: undefined | ReturnType<typeof prismaClientSingleton>
}

export const prisma = globalThis.prismaGlobal ?? prismaClientSingleton()

if (process.env.NODE_ENV !== 'production') globalThis.prismaGlobal = prisma
