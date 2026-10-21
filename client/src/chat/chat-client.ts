import { Events } from "./events";
import type { RealtimeConnection } from "./connection/realtime-connection";
import type {
  AuthResult,
  DeletedResult,
  Driver,
  Message,
  MessageResult,
  MessagesResult,
  Session,
  User,
  UsersResult,
} from "./types";

type UsersHandler = (users: User[]) => void;
type MessageHandler = (message: Message) => void;
type DeletedHandler = (id: string) => void;

/**
 * The chat API the app is written against.
 *
 * Pass a Socket.IO or Phoenix connection. Register, login, presence,
 * and message send / edit / delete stay here either way.
 */
export class ChatClient {
  readonly driver: Driver;
  private user: User | null = null;
  private token: string | null = null;

  constructor(private readonly connection: RealtimeConnection) {
    this.driver = connection.driver;
  }

  get currentUser(): User | null {
    return this.user;
  }

  get sessionToken(): string | null {
    return this.token;
  }

  connect(): Promise<void> {
    return this.connection.connect();
  }

  async disconnect(): Promise<void> {
    this.user = null;
    this.token = null;
    await this.connection.disconnect();
  }

  register(username: string, password: string): Promise<Session> {
    return this.openSession(Events.register, username, password);
  }

  login(username: string, password: string): Promise<Session> {
    return this.openSession(Events.login, username, password);
  }

  listUsers(): Promise<User[]> {
    return this.connection.request<UsersResult>(Events.listUsers).then((result) => result.users);
  }

  listMessages(): Promise<Message[]> {
    return this.connection
      .request<MessagesResult>(Events.listMessages)
      .then((result) => result.messages);
  }

  sendMessage(text: string): Promise<Message> {
    this.assertSignedIn();
    return this.connection
      .request<MessageResult>(Events.send, { text })
      .then((result) => result.message);
  }

  editMessage(id: string, text: string): Promise<Message> {
    this.assertSignedIn();
    return this.connection
      .request<MessageResult>(Events.edit, { id, text })
      .then((result) => result.message);
  }

  async deleteMessage(id: string): Promise<void> {
    this.assertSignedIn();
    await this.connection.request<DeletedResult>(Events.delete, { id });
  }

  onUsers(handler: UsersHandler): () => void {
    return this.connection.subscribe(Events.usersUpdated, (payload) => {
      handler(readUsers(payload));
    });
  }

  onMessage(handler: MessageHandler): () => void {
    return this.connection.subscribe(Events.messageNew, (payload) => {
      handler(readMessage(payload));
    });
  }

  onMessageEdited(handler: MessageHandler): () => void {
    return this.connection.subscribe(Events.messageEdited, (payload) => {
      handler(readMessage(payload));
    });
  }

  onMessageDeleted(handler: DeletedHandler): () => void {
    return this.connection.subscribe(Events.messageDeleted, (payload) => {
      handler(readDeleted(payload));
    });
  }

  private async openSession(event: string, username: string, password: string): Promise<Session> {
    const auth = await this.connection.request<AuthResult>(event, { username, password });
    this.user = auth.user;
    this.token = auth.token;
    const [users, messages] = await Promise.all([this.listUsers(), this.listMessages()]);
    return { user: auth.user, token: auth.token, users, messages };
  }

  private assertSignedIn() {
    if (!this.user) throw new Error("not signed in");
  }
}

function readUsers(payload: unknown): User[] {
  if (!payload || typeof payload !== "object" || !("users" in payload)) {
    throw new Error("users payload is invalid");
  }
  const users = (payload as { users: unknown }).users;
  if (!Array.isArray(users)) throw new Error("users payload is invalid");
  return users.map(readUser);
}

function readUser(value: unknown): User {
  if (!value || typeof value !== "object") throw new Error("user payload is invalid");
  const user = value as Partial<User>;
  if (typeof user.id !== "string" || typeof user.username !== "string") {
    throw new Error("user payload is invalid");
  }
  return { id: user.id, username: user.username, online: Boolean(user.online) };
}

function readMessage(payload: unknown): Message {
  if (!payload || typeof payload !== "object") throw new Error("message payload is invalid");
  const message = payload as Partial<Message>;
  if (
    typeof message.id !== "string" ||
    typeof message.userId !== "string" ||
    typeof message.username !== "string" ||
    typeof message.text !== "string" ||
    typeof message.createdAt !== "string"
  ) {
    throw new Error("message payload is invalid");
  }
  return {
    id: message.id,
    userId: message.userId,
    username: message.username,
    text: message.text,
    createdAt: message.createdAt,
    editedAt: typeof message.editedAt === "string" ? message.editedAt : null,
  };
}

function readDeleted(payload: unknown): string {
  if (!payload || typeof payload !== "object" || !("id" in payload)) {
    throw new Error("delete payload is invalid");
  }
  const id = (payload as { id: unknown }).id;
  if (typeof id !== "string") throw new Error("delete payload is invalid");
  return id;
}
