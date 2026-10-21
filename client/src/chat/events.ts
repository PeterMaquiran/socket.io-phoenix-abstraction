export const Events = {
  register: "auth:register",
  login: "auth:login",
  listUsers: "users:list",
  listMessages: "messages:list",
  send: "message:send",
  edit: "message:edit",
  delete: "message:delete",
  messageNew: "message:new",
  messageEdited: "message:edited",
  messageDeleted: "message:deleted",
  usersUpdated: "users:updated",
} as const;
