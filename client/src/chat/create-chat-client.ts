import { ChatClient } from "./chat-client";
import { PhoenixConnection } from "./connection/phoenix-connection";
import { SocketIoConnection } from "./connection/socketio-connection";
import type { Driver } from "./types";

export const endpoints: Record<Driver, string> = {
  "socket.io": "http://127.0.0.1:3210",
  phoenix: "http://127.0.0.1:4100/socket",
};

export async function createChatClient(driver: Driver, url = endpoints[driver]): Promise<ChatClient> {
  if (driver === "phoenix") {
    return new ChatClient(new PhoenixConnection(url));
  }
  return new ChatClient(new SocketIoConnection(url));
}
