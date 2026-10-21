# Relay

A small chat app with one client API and two realtime drivers.

The screen only talks to `ChatClient`. Socket.IO and Phoenix each implement `RealtimeConnection`. Starting on Socket.IO and moving to Phoenix is a driver change, not a rewrite.

```ts
const chat = await createChatClient("socket.io");
// const chat = await createChatClient("phoenix");

await chat.connect();
const session = await chat.login(username, password);
await chat.sendMessage("hello");
await chat.editMessage(session.messages[0].id, "hello again");
await chat.deleteMessage(session.messages[0].id);
```

Each driver has its own users and messages. The client API is the same for both.

| | |
| --- | --- |
| Socket.IO | `http://127.0.0.1:3210` |
| Phoenix | `http://127.0.0.1:4100/socket` |
| App | `http://127.0.0.1:5173` |

## Run

```bash
cd server-socketio && npm install && npm run dev
```

```bash
cd server-phoenix && mix deps.get && mix phx.server
```

```bash
cd client && npm install && npm run dev
```

With both servers up, `cd client && npm run verify` runs the same chat script against Socket.IO and then Phoenix.
