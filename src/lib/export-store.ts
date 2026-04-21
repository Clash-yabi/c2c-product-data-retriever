/**
 * Simple in-memory ticket store for binary exports.
 * This ensures that downloads are served via a clean GET request,
 * which browsers trust more than binary POST responses on localhost.
 */

interface ExportTicket {
  buffer: Uint8Array;
  expiry: number;
}

const exportStore = new Map<string, ExportTicket>();

// Cleanup routine: remove tickets older than 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [token, ticket] of exportStore.entries()) {
    if (now > ticket.expiry) {
      exportStore.delete(token);
    }
  }
}, 60000);

export function saveTicket(token: string, buffer: Uint8Array) {
  exportStore.set(token, {
    buffer,
    expiry: Date.now() + 300000 // 5 minutes
  });
}

export function getTicket(token: string) {
  return exportStore.get(token);
}

export function removeTicket(token: string) {
  exportStore.delete(token);
}
