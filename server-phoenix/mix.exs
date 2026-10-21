defmodule ChatPhoenix.MixProject do
  use Mix.Project

  def project do
    [
      app: :chat_phoenix,
      version: "0.1.0",
      elixir: "~> 1.15",
      start_permanent: Mix.env() == :prod,
      deps: deps()
    ]
  end

  def application do
    [
      extra_applications: [:logger],
      mod: {ChatPhoenix.Application, []}
    ]
  end

  defp deps do
    [
      {:phoenix, "~> 1.8.1"},
      {:bandit, "~> 1.6"},
      {:jason, "~> 1.4"}
    ]
  end
end
