import type { Driver } from "../types";

/**
 * The seam between ChatClient and a realtime driver.
 * Socket.IO and Phoenix each extend this class.
 * Chat features do not.
 */
export abstract class RealtimeConnection {
  abstract readonly driver: Driver;

  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract request<T>(event: string, payload?: object): Promise<T>;
  abstract subscribe(event: string, handler: (payload: unknown) => void): () => void;
}
