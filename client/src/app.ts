import { createChatClient } from "./chat/create-chat-client";
import type { ChatClient } from "./chat/chat-client";
import type { Driver, Message, User } from "./chat/types";

const storageKey = "relay.driver";

export class RelayApp {
  private chat: ChatClient | null = null;
  private driver: Driver = "socket.io";
  private me: User | null = null;
  private users: User[] = [];
  private messages: Message[] = [];
  private editingId: string | null = null;
  private status = "Connecting";
  private error = "";
  private busy = false;

  constructor(private readonly root: HTMLElement) {}

  async start() {
    this.driver = readDriver();
    this.renderShell();
    await this.boot();
  }

  private async boot() {
    const previous = this.chat;
    this.chat = null;
    this.me = null;
    this.users = [];
    this.messages = [];
    this.editingId = null;
    this.error = "";
    this.status = "Connecting";
    this.renderBody();
    await previous?.disconnect();

    const chat = await createChatClient(this.driver);
    this.chat = chat;
    chat.onUsers((users) => {
      if (!this.me || this.chat !== chat) return;
      this.users = users;
      this.renderPeople();
    });
    chat.onMessage((message) => this.upsert(chat, message));
    chat.onMessageEdited((message) => this.upsert(chat, message));
    chat.onMessageDeleted((id) => {
      if (this.chat !== chat) return;
      this.messages = this.messages.filter((message) => message.id !== id);
      if (this.editingId === id) this.editingId = null;
      this.renderMessages();
    });

    try {
      await chat.connect();
      if (this.chat !== chat) return;
      this.status = "Connected";
      this.renderBody();
    } catch (error) {
      if (this.chat !== chat) return;
      this.status = "Offline";
      this.error = error instanceof Error ? error.message : "connection failed";
      this.renderBody();
    }
  }

  private upsert(chat: ChatClient, message: Message) {
    if (this.chat !== chat || !this.me) return;
    const index = this.messages.findIndex((item) => item.id === message.id);
    if (index === -1) this.messages.push(message);
    else this.messages[index] = message;
    this.messages.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    this.renderMessages();
  }

  private renderShell() {
    this.root.replaceChildren();
    const header = el("header", "top");
    const brand = el("div", "brand");
    brand.append(el("p", "eyebrow", "Relay"), el("h1", "title", "One chat client, two drivers"));
    const driverField = el("label", "driver");
    driverField.append(document.createTextNode("Transport"));
    const select = document.createElement("select");
    select.innerHTML = `<option value="socket.io">Socket.IO</option><option value="phoenix">Phoenix</option>`;
    select.value = this.driver;
    select.addEventListener("change", () => {
      const next = select.value === "phoenix" ? "phoenix" : "socket.io";
      if (next === this.driver) return;
      this.driver = next;
      localStorage.setItem(storageKey, next);
      void this.boot();
    });
    driverField.append(select);
    header.append(brand, driverField);
    const alert = el("p", "alert");
    alert.hidden = true;
    this.root.append(header, el("p", "status"), alert, el("div", "stage"));
  }

  private stage(): HTMLElement {
    const stage = this.root.querySelector(".stage");
    if (!stage) throw new Error("missing stage");
    return stage as HTMLElement;
  }

  private renderBody() {
    this.renderStatus();
    this.renderAlert();
    const stage = this.stage();
    stage.replaceChildren();
    stage.append(this.me ? this.room() : this.authCard());
  }

  private renderStatus() {
    const line = this.root.querySelector(".status");
    if (!line) return;
    line.replaceChildren(el("span", this.status === "Connected" ? "dot on" : "dot"));
    line.append(document.createTextNode(`${this.status} · ${this.chat?.driver ?? this.driver}`));
  }

  private renderAlert() {
    const alert = this.root.querySelector(".alert");
    if (!(alert instanceof HTMLElement)) return;
    alert.textContent = this.error;
    alert.hidden = this.error === "";
  }

  private authCard(): HTMLElement {
    const card = el("section", "card");
    card.append(
      el("h2", "card-title", "Sign in"),
      el(
        "p",
        "muted",
        "Create a user or log in. This screen calls ChatClient only. Switching transport above swaps Socket.IO for Phoenix.",
      ),
    );

    const form = document.createElement("form");
    form.className = "auth-form";
    const username = field("Username", "text", "username");
    const password = field("Password", "password", "password");
    form.append(username.label, password.label);

    const actions = el("div", "actions");
    const create = button("Create user", "primary");
    const login = button("Log in", "ghost");
    create.type = "submit";
    login.type = "button";
    actions.append(create, login);
    form.append(actions);

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      void this.authenticate("register", username.input.value, password.input.value);
    });
    login.addEventListener("click", () => {
      void this.authenticate("login", username.input.value, password.input.value);
    });

    card.append(form);
    return card;
  }

  private room(): HTMLElement {
    const layout = el("section", "room");
    const aside = el("aside", "people");
    aside.append(el("h2", "panel-title", "People"));
    aside.append(el("ul", "people-list"));
    const thread = el("div", "thread");
    const bar = el("div", "thread-bar");
    bar.append(el("h2", "panel-title", this.me?.username ?? ""));
    const logout = button("Log out", "ghost");
    logout.addEventListener("click", () => void this.boot());
    bar.append(logout);
    thread.append(bar, el("ol", "messages"), this.composer());
    layout.append(aside, thread);
    queueMicrotask(() => {
      this.renderPeople();
      this.renderMessages();
    });
    return layout;
  }

  private composer(): HTMLElement {
    const form = document.createElement("form");
    form.className = "composer";
    const input = document.createElement("input");
    input.type = "text";
    input.maxLength = 2000;
    input.placeholder = "Write a message";
    input.required = true;
    input.autocomplete = "off";
    const send = button("Send", "primary");
    send.type = "submit";
    form.append(input, send);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      void this.send(input);
    });
    return form;
  }

  private renderPeople() {
    const list = this.root.querySelector(".people-list");
    if (!list) return;
    list.replaceChildren();
    for (const user of this.users) {
      const item = document.createElement("li");
      const name = el("span", "person", user.username);
      if (user.id === this.me?.id) name.append(el("span", "you", " you"));
      const presence = el("span", user.online ? "presence on" : "presence", user.online ? "online" : "offline");
      item.append(name, presence);
      list.append(item);
    }
  }

  private renderMessages() {
    const list = this.root.querySelector(".messages");
    if (!list) return;
    const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 48;
    list.replaceChildren();
    if (this.messages.length === 0) {
      list.append(el("li", "empty", "No messages yet."));
      return;
    }
    for (const message of this.messages) list.append(this.renderMessage(message));
    if (atBottom) list.scrollTop = list.scrollHeight;
    if (this.editingId) {
      const editor = list.querySelector("input");
      if (editor instanceof HTMLInputElement) editor.focus();
    }
  }

  private renderMessage(message: Message): HTMLElement {
    const item = document.createElement("li");
    item.className = message.userId === this.me?.id ? "message mine" : "message";
    const meta = el("div", "meta");
    meta.append(el("span", "author", message.username));
    meta.append(el("time", "time", formatTime(message.createdAt)));
    if (message.editedAt) meta.append(el("span", "edited", "edited"));
    item.append(meta);

    if (this.editingId === message.id) {
      const form = document.createElement("form");
      form.className = "edit-form";
      const input = document.createElement("input");
      input.type = "text";
      input.value = message.text;
      input.maxLength = 2000;
      input.required = true;
      const save = button("Save", "primary");
      save.type = "submit";
      const cancel = button("Cancel", "ghost");
      cancel.type = "button";
      cancel.addEventListener("click", () => {
        this.editingId = null;
        this.renderMessages();
      });
      form.append(input, save, cancel);
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        void this.edit(message.id, input.value);
      });
      item.append(form);
      return item;
    }

    item.append(el("p", "msg-text", message.text));
    if (message.userId === this.me?.id) {
      const actions = el("div", "message-actions");
      const edit = button("Edit", "btn-text");
      const remove = button("Delete", "btn-text danger");
      edit.addEventListener("click", () => {
        this.editingId = message.id;
        this.renderMessages();
      });
      remove.addEventListener("click", () => void this.remove(message.id));
      actions.append(edit, remove);
      item.append(actions);
    }
    return item;
  }

  private async authenticate(mode: "register" | "login", username: string, password: string) {
    const chat = this.chat;
    if (!chat || this.busy) return;
    this.busy = true;
    this.error = "";
    this.renderAlert();
    try {
      const session = mode === "register" ? await chat.register(username, password) : await chat.login(username, password);
      if (this.chat !== chat) return;
      this.me = session.user;
      this.users = session.users;
      this.messages = session.messages;
      this.error = "";
      this.renderBody();
    } catch (error) {
      if (this.chat !== chat) return;
      this.error = error instanceof Error ? error.message : "request failed";
      this.renderAlert();
    } finally {
      this.busy = false;
    }
  }

  private async send(input: HTMLInputElement) {
    const chat = this.chat;
    const text = input.value.trim();
    if (!chat || !text || this.busy) return;
    this.busy = true;
    this.error = "";
    this.renderAlert();
    try {
      const message = await chat.sendMessage(text);
      input.value = "";
      this.upsert(chat, message);
    } catch (error) {
      this.error = error instanceof Error ? error.message : "request failed";
      this.renderAlert();
    } finally {
      this.busy = false;
    }
  }

  private async edit(id: string, text: string) {
    const chat = this.chat;
    if (!chat || this.busy) return;
    this.busy = true;
    this.error = "";
    this.renderAlert();
    try {
      const message = await chat.editMessage(id, text);
      this.editingId = null;
      this.upsert(chat, message);
    } catch (error) {
      this.error = error instanceof Error ? error.message : "request failed";
      this.renderAlert();
    } finally {
      this.busy = false;
    }
  }

  private async remove(id: string) {
    const chat = this.chat;
    if (!chat || this.busy) return;
    this.busy = true;
    this.error = "";
    this.renderAlert();
    try {
      await chat.deleteMessage(id);
      this.messages = this.messages.filter((message) => message.id !== id);
      if (this.editingId === id) this.editingId = null;
      this.renderMessages();
    } catch (error) {
      this.error = error instanceof Error ? error.message : "request failed";
      this.renderAlert();
    } finally {
      this.busy = false;
    }
  }
}

function readDriver(): Driver {
  return localStorage.getItem(storageKey) === "phoenix" ? "phoenix" : "socket.io";
}

function el(tag: string, className: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(label: string, kind: string): HTMLButtonElement {
  const node = document.createElement("button");
  node.type = "button";
  node.className = kind;
  node.textContent = label;
  return node;
}

function field(label: string, type: string, name: string) {
  const wrap = document.createElement("label");
  wrap.className = "field";
  wrap.append(document.createTextNode(label));
  const input = document.createElement("input");
  input.type = type;
  input.name = name;
  input.autocomplete = type === "password" ? "current-password" : "username";
  input.required = true;
  input.maxLength = type === "password" ? 72 : 20;
  wrap.append(input);
  return { label: wrap, input };
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date);
}
