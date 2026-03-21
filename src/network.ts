const DEFAULT_BRIDGE_HOST = "::";

export function resolveBridgeHost(host: string | undefined): string {
  return host ?? DEFAULT_BRIDGE_HOST;
}

export function formatListenUrl(host: string, port: number): string {
  return `http://${formatHttpHost(host)}:${port}`;
}

function formatHttpHost(host: string): string {
  if (host.includes(":") && !host.startsWith("[")) {
    return `[${host}]`;
  }
  return host;
}
