export function isAiIpcReady(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof (window as { aiIPC?: unknown }).aiIPC !== 'undefined' &&
    (window as { aiIPC?: unknown }).aiIPC !== null
  );
}
