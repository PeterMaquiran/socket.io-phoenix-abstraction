export type Driver = "socket.io" | "phoenix";

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

export type Session = {
  user: User;
  token: string;
  users: User[];
  messages: Message[];
};

export type AuthResult = {
  user: User;
  token: string;
};

export type UsersResult = {
  users: User[];
};

export type MessagesResult = {
  messages: Message[];
};

export type MessageResult = {
  message: Message;
};

export type DeletedResult = {
  id: string;
};
