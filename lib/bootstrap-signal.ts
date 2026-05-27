// Tiny pub/sub used by the root index screen to tell the root layout that the
// session has been hydrated and the JS splash overlay can be torn down.
// Lives outside React because the signal needs to survive remounts and be
// callable from anywhere (including async finally blocks).

let ready = false;
const listeners = new Set<() => void>();

export function markBootstrapReady(): void {
  if (ready) return;
  ready = true;
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      // Listener errors must not break the splash hand-off.
    }
  }
  listeners.clear();
}

export function subscribeBootstrap(listener: () => void): () => void {
  if (ready) {
    listener();
    return () => undefined;
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function isBootstrapReady(): boolean {
  return ready;
}
