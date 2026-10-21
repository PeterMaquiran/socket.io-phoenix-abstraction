import { createServer } from "node:http";
import { Server, type Socket } from "socket.io";
import { Store } from "./store.js";

const port = 3210;
const store = new Store();
const httpServer = createServer();
const io = new Server(httpServer, {
  cors: { origin: "*" },
});

io.on("connection", (socket) => {
  on(socket, "auth:register", (payload) => signIn(socket, store.register(field(payload, "username"), field(payload, "password"))));
  on(socket, "auth:login", (payload) => signIn(socket, store.login(field(payload, "username"), field(payload, "password"))));
  on(socket, "users:list", () => {
    requireUser(socket);
    return { users: store.listUsers() };
  });
  on(socket, "messages:list", () => {
    requireUser(socket);
    return { messages: store.listMessages() };
  });
  on(socket, "message:send", (payload) => {
    const message = store.send(requireUser(socket), field(payload, "text"));
    io.emit("message:new", message);
    return { message };
  });
  on(socket, "message:edit", (payload) => {
    const message = store.edit(requireUser(socket), field(payload, "id"), field(payload, "text"));
    io.emit("message:edited", message);
    return { message };
  });
  on(socket, "message:delete", (payload) => {
    const id = store.delete(requireUser(socket), field(payload, "id"));
    io.emit("message:deleted", { id });
    return { id };
  });

  socket.on("disconnect", () => {
    const userId = socket.data.userId as string | undefined;
    if (!userId) return;
    store.disconnect(userId);
    io.emit("users:updated", { users: store.listUsers() });
  });
});

httpServer.listen(port, "127.0.0.1", () => {
  console.log(`socket.io chat listening on http://127.0.0.1:${port}`);
});

function signIn(socket: Socket, result: { user: { id: string }; token: string }) {
  const previous = socket.data.userId as string | undefined;
  if (previous && previous !== result.user.id) store.disconnect(previous);
  if (previous !== result.user.id) {
    store.connect(result.user.id);
    socket.data.userId = result.user.id;
  }
  const user = store.getUser(result.user.id);
  io.emit("users:updated", { users: store.listUsers() });
  return { user, token: result.token };
}

function requireUser(socket: Socket): string {
  const userId = socket.data.userId as string | undefined;
  if (!userId) throw new Error("not authenticated");
  return userId;
}

function on(socket: Socket, event: string, handle: (payload: unknown) => unknown) {
  socket.on(event, (payload: unknown, ack?: (body: unknown) => void) => {
    try {
      ack?.(handle(payload));
    } catch (error) {
      ack?.({ error: error instanceof Error ? error.message : "request failed" });
    }
  });
}

function field(payload: unknown, key: string): unknown {
  if (!payload || typeof payload !== "object" || !(key in payload)) return undefined;
  return (payload as Record<string, unknown>)[key];
}
