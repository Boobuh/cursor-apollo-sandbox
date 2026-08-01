/** Minimal shapes for relay unit tests (no DOM). */
export interface SandboxRelayMessageEvent {
  origin: string;
  data: unknown;
  source: SandboxRelayMessageSource | null;
}

export interface SandboxRelayMessageSource {
  postMessage(message: unknown, targetOrigin: string): void;
}

export interface SandboxRelayFetchResponse {
  status: number;
  json(): Promise<unknown>;
  headers: {
    forEach(callback: (value: string, key: string) => void): void;
  };
}

export type SandboxRelayHandleRequest = (
  url: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    credentials?: "include" | "omit" | "same-origin";
  }
) => Promise<SandboxRelayFetchResponse>;

export interface SandboxRelayContext {
  graphqlEndpoint: string;
  capturedHeaders: Record<string, string>;
  parentHref: string;
  handleRequest: SandboxRelayHandleRequest;
  markSchemaReady: () => void;
}

export type SandboxRelayPostResult =
  | { handled: false }
  | { handled: true; outbound: Record<string, unknown> };
