defmodule ChatPhoenix.ChatChannel do
  use Phoenix.Channel

  @impl true
  def join("chat:lobby", _payload, socket) do
    {:ok, socket}
  end

  @impl true
  def handle_in("auth:register", payload, socket) when is_map(payload) do
    reply_auth(socket, ChatPhoenix.Store.register(payload["username"], payload["password"]))
  end

  def handle_in("auth:login", payload, socket) when is_map(payload) do
    reply_auth(socket, ChatPhoenix.Store.login(payload["username"], payload["password"]))
  end

  def handle_in("users:list", _payload, socket) do
    case current_user(socket) do
      {:ok, _user_id} -> {:reply, {:ok, %{users: ChatPhoenix.Store.list_users()}}, socket}
      {:error, reason} -> fail(socket, reason)
    end
  end

  def handle_in("messages:list", _payload, socket) do
    case current_user(socket) do
      {:ok, _user_id} -> {:reply, {:ok, %{messages: ChatPhoenix.Store.list_messages()}}, socket}
      {:error, reason} -> fail(socket, reason)
    end
  end

  def handle_in("message:send", payload, socket) when is_map(payload) do
    with {:ok, user_id} <- current_user(socket),
         {:ok, message} <- ChatPhoenix.Store.send_message(user_id, payload["text"]) do
      broadcast!(socket, "message:new", message)
      {:reply, {:ok, %{message: message}}, socket}
    else
      {:error, reason} -> fail(socket, reason)
    end
  end

  def handle_in("message:edit", payload, socket) when is_map(payload) do
    with {:ok, user_id} <- current_user(socket),
         {:ok, message} <- ChatPhoenix.Store.edit_message(user_id, payload["id"], payload["text"]) do
      broadcast!(socket, "message:edited", message)
      {:reply, {:ok, %{message: message}}, socket}
    else
      {:error, reason} -> fail(socket, reason)
    end
  end

  def handle_in("message:delete", payload, socket) when is_map(payload) do
    with {:ok, user_id} <- current_user(socket),
         {:ok, id} <- ChatPhoenix.Store.delete_message(user_id, payload["id"]) do
      broadcast!(socket, "message:deleted", %{id: id})
      {:reply, {:ok, %{id: id}}, socket}
    else
      {:error, reason} -> fail(socket, reason)
    end
  end

  def handle_in(_event, _payload, socket) do
    fail(socket, "unknown event")
  end

  @impl true
  def terminate(_reason, socket) do
    case socket.assigns[:user_id] do
      nil ->
        :ok

      user_id ->
        ChatPhoenix.Store.disconnect(user_id)

        ChatPhoenix.Endpoint.broadcast("chat:lobby", "users:updated", %{
          users: ChatPhoenix.Store.list_users()
        })

        :ok
    end
  end

  defp reply_auth(socket, {:ok, user, token}) do
    socket = claim(socket, user.id)

    case ChatPhoenix.Store.get_user(user.id) do
      {:ok, fresh} ->
        broadcast!(socket, "users:updated", %{users: ChatPhoenix.Store.list_users()})
        {:reply, {:ok, %{user: fresh, token: token}}, socket}

      {:error, reason} ->
        fail(socket, reason)
    end
  end

  defp reply_auth(socket, {:error, reason}), do: fail(socket, reason)

  defp claim(socket, user_id) do
    case socket.assigns[:user_id] do
      ^user_id ->
        socket

      nil ->
        ChatPhoenix.Store.connect(user_id)
        assign(socket, :user_id, user_id)

      old_id ->
        ChatPhoenix.Store.disconnect(old_id)
        ChatPhoenix.Store.connect(user_id)
        assign(socket, :user_id, user_id)
    end
  end

  defp current_user(socket) do
    case socket.assigns[:user_id] do
      nil -> {:error, "not authenticated"}
      user_id -> {:ok, user_id}
    end
  end

  defp fail(socket, reason), do: {:reply, {:error, %{error: reason}}, socket}
end
