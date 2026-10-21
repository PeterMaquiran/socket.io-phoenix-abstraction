import { createChatClient } from "./chat/create-chat-client";
import type { ChatClient } from "./chat/chat-client";
import type { Driver, Message, User } from "./chat/types";

const password = "secret";

await exercise("socket.io");
await exercise("phoenix");
console.log("both drivers passed the same ChatClient script");

async function exercise(driver: Driver) {
  const suffix = `${driver === "socket.io" ? "io" : "phx"}_${Math.random().toString(36).slice(2, 8)}`;
  const alice = await createChatClient(driver);
  const bob = await createChatClient(driver);
  const seen: Message[] = [];
  const edited: Message[] = [];
  const deleted: string[] = [];
  let users: User[] = [];

  bob.onMessage((message) => seen.push(message));
  bob.onMessageEdited((message) => edited.push(message));
  bob.onMessageDeleted((id) => deleted.push(id));
  bob.onUsers((next) => {
    users = next;
  });

  await alice.connect();
  await bob.connect();

  const aliceSession = await alice.register(`alice_${suffix}`, password);
  const bobSession = await bob.register(`bob_${suffix}`, password);
  const people = await alice.listUsers();
  assert(people.some((user) => user.username === `bob_${suffix}` && user.online), `${driver} lists both users`);

  const returning = await createChatClient(driver);
  await returning.connect();
  const loggedIn = await returning.login(`alice_${suffix}`, password);
  await returning.disconnect();
  assert(loggedIn.user.id === aliceSession.user.id, `${driver} login returns the same user`);

  await expectError(alice.login("alice_missing", password), "invalid username or password");
  await expectError(bob.sendMessage("   "), "message cannot be empty");

  const sent = await alice.sendMessage(`hello from ${driver}`);
  await waitFor(() => seen.some((message) => message.id === sent.id), `${driver} delivers message:new`);

  const changed = await alice.editMessage(sent.id, `edited on ${driver}`);
  await waitFor(
    () => edited.some((message) => message.id === sent.id && message.text === changed.text),
    `${driver} delivers message:edited`,
  );
  await expectError(bob.editMessage(sent.id, "nope"), "you can only change your own messages");

  await alice.deleteMessage(sent.id);
  await waitFor(() => deleted.includes(sent.id), `${driver} delivers message:deleted`);
  await expectError(alice.deleteMessage(sent.id), "message not found");

  const reader = await createChatClient(driver);
  await reader.connect();
  await reader.login(`bob_${suffix}`, password);
  const kept = await alice.sendMessage("kept");
  await waitFor(() => seen.some((message) => message.id === kept.id), `${driver} delivers the kept message`);
  const history = await reader.listMessages();
  await reader.disconnect();
  assert(history.some((message) => message.text === "kept"), `${driver} history contains the kept message`);
  assert(!history.some((message) => message.id === sent.id), `${driver} history drops the deleted message`);

  await bob.disconnect();
  await waitFor(async () => {
    const people = await alice.listUsers();
    return people.find((user) => user.id === bobSession.user.id)?.online === false;
  }, `${driver} marks a disconnected user offline`);
  assert(users.some((user) => user.id === aliceSession.user.id), `${driver} pushed a user list`);

  await alice.disconnect();
  console.log(`${driver} ok`);
}

async function expectError(pending: Promise<unknown>, fragment: string) {
  try {
    await pending;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (!message.includes(fragment)) {
      throw new Error(`expected "${fragment}" but got "${message}"`);
    }
    return;
  }
  throw new Error(`expected failure containing "${fragment}"`);
}

async function waitFor(predicate: () => boolean | Promise<boolean>, label: string) {
  const start = Date.now();
  while (Date.now() - start < 4000) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`timed out waiting for ${label}`);
}

function assert(value: unknown, label: string) {
  if (!value) throw new Error(label);
}
