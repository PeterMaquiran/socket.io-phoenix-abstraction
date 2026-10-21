import { io, type Socket } from "socket.io-client";
import { errorText } from "./errors";
import { RealtimeConnection } from "./realtime-connection";

type Handler = (payload: unknown) => void;

export class SocketIoConnection extends RealtimeConnection {
  readonly driver = "socket.io" as const;
  private socket: Socket | null = null;
  private readonly handlers = new Map<string, Set<Handler>>();

  constructor(private readonly url: string) {
    super();
  }

  connect(): Promise<void> {
    if (this.socket?.connected) return Promise.resolve();

    return new Promise((resolve, reject) => {
      const socket = io(this.url, {
        transports: ["websocket"],
        timeout: 8000,
      });
      this.socket = socket;
      this.bindExisting(socket);

      const timer = setTimeout(() => {
        cleanup();
        socket.disconnect();
        reject(new Error("connection timed out"));
      }, 8000);

      const onConnect = () => {
        cleanup();
        resolve();
      };

      const onError = (error: unknown) => {
        cleanup();
        socket.disconnect();
        reject(new Error(errorText(error, "cannot reach Socket.IO")));
      };

      const cleanup = () => {
        clearTimeout(timer);
        socket.off("connect", onConnect);
        socket.off("connect_error", onError);
      };

      socket.on("connect", onConnect);
      socket.on("connect_error", onError);
    });
  }

  async disconnect(): Promise<void> {
    const socket = this.socket;
    this.socket = null;
    if (!socket) return;
    await new Promise<void>((resolve) => {
      socket.once("disconnect", () => resolve());
      socket.disconnect();
      setTimeout(resolve, 500);
    });
  }

  request<T>(event: string, payload: object = {}): Promise<T> {
    const socket = this.socket;
    if (!socket?.connected) return Promise.reject(new Error("not connected"));

    return new Promise((resolve, reject) => {
      socket.timeout(8000).emit(event, payload, (error: unknown, response: unknown) => {
        if (error) {
          reject(new Error(errorText(error, "request timed out")));
          return;
        }
        if (response && typeof response === "object" && "error" in response && response.error) {
          reject(new Error(errorText(response)));
          return;
        }
        resolve(response as T);
      });
    });
  }

  subscribe(event: string, handler: Handler): () => void {
    let handlers = this.handlers.get(event);
    if (!handlers) {
      handlers = new Set();
      this.handlers.set(event, handlers);
      this.socket?.on(event, (payload: unknown) => this.dispatch(event, payload));
    }
    handlers.add(handler);
    return () => {
      handlers?.delete(handler);
    };
  }

  private bindExisting(socket: Socket) {
    for (const event of this.handlers.keys()) {
      socket.on(event, (payload: unknown) => this.dispatch(event, payload));
    }
  }

  private dispatch(event: string, payload: unknown) {
    for (const handler of this.handlers.get(event) ?? []) handler(payload);
  }
}
