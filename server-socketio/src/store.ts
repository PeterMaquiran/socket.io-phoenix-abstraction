import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export type User = {
  id: string;
  username: string;
  online: boolean;
};

export type Message = {
  id: string;
  userId: string;
  username: string;
  text: string;
  createdAt: string;
  editedAt: string | null;
};

type StoredUser = {
  id: string;
  username: string;
  salt: Buffer;
  passwordHash: Buffer;
};

const usernamePattern = /^[A-Za-z0-9_]{2,20}$/;

export class Store {
  private readonly usersByName = new Map<string, StoredUser>();
  private readonly usersById = new Map<string, StoredUser>();
  private readonly messages: Message[] = [];
  private readonly online = new Map<string, number>();

  register(username: unknown, password: unknown): { user: User; token: string } {
    const name = cleanUsername(username);
    const secret = cleanPassword(password);
    const key = name.toLowerCase();
    if (this.usersByName.has(key)) throw new Error("username taken");

    const salt = randomBytes(16);
    const user: StoredUser = {
      id: randomBytes(8).toString("hex"),
      username: name,
      salt,
      passwordHash: scryptSync(secret, salt, 32),
    };
    this.usersByName.set(key, user);
    this.usersById.set(user.id, user);
    return { user: this.toUser(user), token: randomBytes(16).toString("hex") };
  }

  login(username: unknown, password: unknown): { user: User; token: string } {
    const name = typeof username === "string" ? username.trim() : "";
    const secret = typeof password === "string" ? password : "";
    const user = this.usersByName.get(name.toLowerCase());
    const salt = user?.salt ?? randomBytes(16);
    const actual = user?.passwordHash ?? randomBytes(32);
    const candidate = scryptSync(secret, salt, 32);
    const matches = user !== undefined && timingSafeEqual(actual, candidate);
    if (!matches || !user) throw new Error("invalid username or password");
    return { user: this.toUser(user), token: randomBytes(16).toString("hex") };
  }

  connect(userId: string) {
    this.online.set(userId, (this.online.get(userId) ?? 0) + 1);
  }

  disconnect(userId: string) {
    const next = (this.online.get(userId) ?? 0) - 1;
    if (next <= 0) this.online.delete(userId);
    else this.online.set(userId, next);
  }

  listUsers(): User[] {
    return [...this.usersById.values()]
      .map((user) => this.toUser(user))
      .sort((a, b) => a.username.localeCompare(b.username));
  }

  getUser(userId: string): User {
    const user = this.usersById.get(userId);
    if (!user) throw new Error("not authenticated");
    return this.toUser(user);
  }

  listMessages(): Message[] {
    return this.messages.map((message) => ({ ...message }));
  }

  send(userId: string, text: unknown): Message {
    const user = this.requiredUser(userId);
    const body = cleanText(text);
    const message: Message = {
      id: randomBytes(8).toString("hex"),
      userId: user.id,
      username: user.username,
      text: body,
      createdAt: new Date().toISOString(),
      editedAt: null,
    };
    this.messages.push(message);
    return { ...message };
  }

  edit(userId: string, id: unknown, text: unknown): Message {
    const message = this.ownedMessage(userId, id);
    message.text = cleanText(text);
    message.editedAt = new Date().toISOString();
    return { ...message };
  }

  delete(userId: string, id: unknown): string {
    const message = this.ownedMessage(userId, id);
    const index = this.messages.findIndex((item) => item.id === message.id);
    this.messages.splice(index, 1);
    return message.id;
  }

  private ownedMessage(userId: string, id: unknown): Message {
    this.requiredUser(userId);
    if (typeof id !== "string" || !id) throw new Error("message not found");
    const message = this.messages.find((item) => item.id === id);
    if (!message) throw new Error("message not found");
    if (message.userId !== userId) throw new Error("you can only change your own messages");
    return message;
  }

  private requiredUser(userId: string): StoredUser {
    const user = this.usersById.get(userId);
    if (!user) throw new Error("not authenticated");
    return user;
  }

  private toUser(user: StoredUser): User {
    return {
      id: user.id,
      username: user.username,
      online: (this.online.get(user.id) ?? 0) > 0,
    };
  }
}

function cleanUsername(value: unknown): string {
  const username = typeof value === "string" ? value.trim() : "";
  if (!usernamePattern.test(username)) {
    throw new Error("username must be 2-20 letters, numbers, or underscores");
  }
  return username;
}

function cleanPassword(value: unknown): string {
  const password = typeof value === "string" ? value : "";
  if (password.length < 4 || password.length > 72) {
    throw new Error("password must be 4-72 characters");
  }
  return password;
}

function cleanText(value: unknown): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new Error("message cannot be empty");
  if (text.length > 2000) throw new Error("message is too long");
  return text;
}
