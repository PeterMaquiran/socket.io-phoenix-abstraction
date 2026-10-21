defmodule ChatPhoenix.Application do
  use Application

  @impl true
  def start(_type, _args) do
    children = [
      {Phoenix.PubSub, name: ChatPhoenix.PubSub},
      ChatPhoenix.Store,
      ChatPhoenix.Endpoint
    ]

    Supervisor.start_link(children, strategy: :one_for_one, name: ChatPhoenix.Supervisor)
  end
end
