declare module "phoenix" {
  export class Socket {
    constructor(url: string, options?: object);
    connect(): void;
    disconnect(callback?: () => void): void;
    channel(topic: string, params?: object): Channel;
    onOpen(callback: () => void): void;
    onError(callback: () => void): void;
  }

  export class Channel {
    join(timeout?: number): Push;
    leave(timeout?: number): Push;
    push(event: string, payload?: object, timeout?: number): Push;
    on(event: string, callback: (payload: unknown) => void): number;
  }

  export class Push {
    receive(status: string, callback: (response: unknown) => void): Push;
  }
}
