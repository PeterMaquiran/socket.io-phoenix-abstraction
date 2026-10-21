import { Socket, type Channel } from "phoenix";
import { errorText } from "./errors";
import { RealtimeConnection } from "./realtime-connection";

type Handler = (payload: unknown) => void;

export class PhoenixConnection extends RealtimeConnection {
  readonly driver = "phoenix" as const;
  private socket: Socket | null = null;
  private channel: Channel | null = null;
  private readonly handlers = new Map<string, Set<Handler>>();

  constructor(private readonly url: string) {
    super();
  }

  async connect(): Promise<void> {
    if (this.channel) return;

    const socket = new Socket(this.url);
    this.socket = socket;

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        socket.disconnect();
        reject(new Error("cannot reach Phoenix"));
      }, 8000);

      socket.onOpen(() => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve();
      });
      socket.connect();
    });

    const channel = socket.channel("chat:lobby", {});
    this.channel = channel;
    this.bindExisting(channel);

    await new Promise<void>((resolve, reject) => {
      channel
        .join()
        .receive("ok", () => resolve())
        .receive("error", (response: unknown) => reject(new Error(errorText(response, "join failed"))))
        .receive("timeout", () => reject(new Error("join timed out")));
    });
  }

  async disconnect(): Promise<void> {
    const channel = this.channel;
    const socket = this.socket;
    this.channel = null;
    this.socket = null;
    if (channel) {
      await new Promise<void>((resolve) => {
        channel
          .leave()
          .receive("ok", () => resolve())
          .receive("timeout", () => resolve());
        setTimeout(resolve, 500);
      });
    }
    socket?.disconnect();
  }

  request<T>(event: string, payload: object = {}): Promise<T> {
    const channel = this.channel;
    if (!channel) return Promise.reject(new Error("not connected"));

    return new Promise((resolve, reject) => {
      channel
        .push(event, payload, 8000)
        .receive("ok", (response) => resolve(response as T))
        .receive("error", (response: unknown) => reject(new Error(errorText(response))))
        .receive("timeout", () => reject(new Error("request timed out")));
    });
  }

  subscribe(event: string, handler: Handler): () => void {
    let handlers = this.handlers.get(event);
    if (!handlers) {
      handlers = new Set();
      this.handlers.set(event, handlers);
      this.channel?.on(event, (payload: unknown) => this.dispatch(event, payload));
    }
    handlers.add(handler);
    return () => {
      handlers?.delete(handler);
    };
  }

  private bindExisting(channel: Channel) {
    for (const event of this.handlers.keys()) {
      channel.on(event, (payload: unknown) => this.dispatch(event, payload));
    }
  }

  private dispatch(event: string, payload: unknown) {
    for (const handler of this.handlers.get(event) ?? []) handler(payload);
  }
}
