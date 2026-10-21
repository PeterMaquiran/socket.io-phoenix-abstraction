defmodule ChatPhoenix.Endpoint do
  use Phoenix.Endpoint, otp_app: :chat_phoenix

  socket "/socket", ChatPhoenix.UserSocket,
    websocket: true,
    longpoll: false
end
