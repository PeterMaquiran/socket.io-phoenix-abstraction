import Config

config :chat_phoenix, ChatPhoenix.Endpoint,
  adapter: Bandit.PhoenixAdapter,
  http: [ip: {127, 0, 0, 1}, port: 4100],
  url: [host: "127.0.0.1", port: 4100],
  server: true,
  check_origin: false,
  secret_key_base: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  pubsub_server: ChatPhoenix.PubSub

config :phoenix, :json_library, Jason
config :logger, level: :info
