defmodule ChatPhoenix.Store do
  use GenServer

  @username ~r/^[A-Za-z0-9_]{2,20}$/

  def start_link(_opts), do: GenServer.start_link(__MODULE__, %{}, name: __MODULE__)

  def register(username, password), do: GenServer.call(__MODULE__, {:register, username, password})
  def login(username, password), do: GenServer.call(__MODULE__, {:login, username, password})
  def connect(user_id), do: GenServer.call(__MODULE__, {:connect, user_id})
  def disconnect(user_id), do: GenServer.call(__MODULE__, {:disconnect, user_id})
  def list_users, do: GenServer.call(__MODULE__, :list_users)
  def get_user(user_id), do: GenServer.call(__MODULE__, {:get_user, user_id})
  def list_messages, do: GenServer.call(__MODULE__, :list_messages)
  def send_message(user_id, text), do: GenServer.call(__MODULE__, {:send, user_id, text})
  def edit_message(user_id, id, text), do: GenServer.call(__MODULE__, {:edit, user_id, id, text})
  def delete_message(user_id, id), do: GenServer.call(__MODULE__, {:delete, user_id, id})

  @impl true
  def init(_) do
    {:ok,
     %{
       users_by_name: %{},
       users_by_id: %{},
       messages: [],
       online: %{}
     }}
  end

  @impl true
  def handle_call({:register, username, password}, _from, state) do
    with {:ok, username} <- clean_username(username),
         {:ok, password} <- clean_password(password) do
      key = String.downcase(username)

      if Map.has_key?(state.users_by_name, key) do
        {:reply, {:error, "username taken"}, state}
      else
        user = %{
          id: id(),
          username: username,
          salt: :crypto.strong_rand_bytes(16),
          password_hash: nil
        }

        user = %{user | password_hash: hash_password(password, user.salt)}

        state = %{
          state
          | users_by_name: Map.put(state.users_by_name, key, user),
            users_by_id: Map.put(state.users_by_id, user.id, user)
        }

        {:reply, {:ok, public_user(user, state), token()}, state}
      end
    else
      {:error, reason} -> {:reply, {:error, reason}, state}
    end
  end

  def handle_call({:login, username, password}, _from, state) do
    name = if is_binary(username), do: String.trim(username), else: ""
    secret = if is_binary(password), do: password, else: ""
    user = Map.get(state.users_by_name, String.downcase(name))
    salt = if user, do: user.salt, else: :crypto.strong_rand_bytes(16)
    actual = if user, do: user.password_hash, else: :crypto.strong_rand_bytes(32)
    candidate = hash_password(secret, salt)

    if user && byte_size(actual) == byte_size(candidate) && :crypto.hash_equals(actual, candidate) do
      {:reply, {:ok, public_user(user, state), token()}, state}
    else
      {:reply, {:error, "invalid username or password"}, state}
    end
  end

  def handle_call({:connect, user_id}, _from, state) do
    count = Map.get(state.online, user_id, 0) + 1
    {:reply, :ok, %{state | online: Map.put(state.online, user_id, count)}}
  end

  def handle_call({:disconnect, user_id}, _from, state) do
    online =
      case Map.get(state.online, user_id, 0) - 1 do
        count when count <= 0 -> Map.delete(state.online, user_id)
        count -> Map.put(state.online, user_id, count)
      end

    {:reply, :ok, %{state | online: online}}
  end

  def handle_call(:list_users, _from, state) do
    users =
      state.users_by_id
      |> Map.values()
      |> Enum.map(&public_user(&1, state))
      |> Enum.sort_by(& &1.username)

    {:reply, users, state}
  end

  def handle_call({:get_user, user_id}, _from, state) do
    case Map.get(state.users_by_id, user_id) do
      nil -> {:reply, {:error, "not authenticated"}, state}
      user -> {:reply, {:ok, public_user(user, state)}, state}
    end
  end

  def handle_call(:list_messages, _from, state) do
    {:reply, state.messages, state}
  end

  def handle_call({:send, user_id, text}, _from, state) do
    with {:ok, user} <- fetch_user(state, user_id),
         {:ok, text} <- clean_text(text) do
      message = %{
        id: id(),
        userId: user.id,
        username: user.username,
        text: text,
        createdAt: now(),
        editedAt: nil
      }

      {:reply, {:ok, message}, %{state | messages: state.messages ++ [message]}}
    else
      {:error, reason} -> {:reply, {:error, reason}, state}
    end
  end

  def handle_call({:edit, user_id, id, text}, _from, state) do
    with {:ok, _user} <- fetch_user(state, user_id),
         {:ok, message} <- owned_message(state, user_id, id),
         {:ok, text} <- clean_text(text) do
      edited = %{message | text: text, editedAt: now()}
      messages = Enum.map(state.messages, fn item -> if item.id == id, do: edited, else: item end)
      {:reply, {:ok, edited}, %{state | messages: messages}}
    else
      {:error, reason} -> {:reply, {:error, reason}, state}
    end
  end

  def handle_call({:delete, user_id, id}, _from, state) do
    with {:ok, _user} <- fetch_user(state, user_id),
         {:ok, message} <- owned_message(state, user_id, id) do
      messages = Enum.reject(state.messages, &(&1.id == message.id))
      {:reply, {:ok, message.id}, %{state | messages: messages}}
    else
      {:error, reason} -> {:reply, {:error, reason}, state}
    end
  end

  defp fetch_user(state, user_id) do
    case Map.get(state.users_by_id, user_id) do
      nil -> {:error, "not authenticated"}
      user -> {:ok, user}
    end
  end

  defp owned_message(state, user_id, id) when is_binary(id) do
    case Enum.find(state.messages, &(&1.id == id)) do
      nil -> {:error, "message not found"}
      %{userId: ^user_id} = message -> {:ok, message}
      _message -> {:error, "you can only change your own messages"}
    end
  end

  defp owned_message(_state, _user_id, _id), do: {:error, "message not found"}

  defp public_user(user, state) do
    %{
      id: user.id,
      username: user.username,
      online: Map.get(state.online, user.id, 0) > 0
    }
  end

  defp hash_password(password, salt) do
    :crypto.pbkdf2_hmac(:sha256, password, salt, 10_000, 32)
  end

  defp clean_username(username) when is_binary(username) do
    trimmed = String.trim(username)

    if String.match?(trimmed, @username) do
      {:ok, trimmed}
    else
      {:error, "username must be 2-20 letters, numbers, or underscores"}
    end
  end

  defp clean_username(_), do: {:error, "username must be 2-20 letters, numbers, or underscores"}

  defp clean_password(password) when is_binary(password) do
    length = String.length(password)

    if length >= 4 and length <= 72 do
      {:ok, password}
    else
      {:error, "password must be 4-72 characters"}
    end
  end

  defp clean_password(_), do: {:error, "password must be 4-72 characters"}

  defp clean_text(text) when is_binary(text) do
    trimmed = String.trim(text)

    cond do
      trimmed == "" -> {:error, "message cannot be empty"}
      String.length(trimmed) > 2000 -> {:error, "message is too long"}
      true -> {:ok, trimmed}
    end
  end

  defp clean_text(_), do: {:error, "message cannot be empty"}

  defp now, do: DateTime.utc_now() |> DateTime.truncate(:millisecond) |> DateTime.to_iso8601()
  defp id, do: Base.encode16(:crypto.strong_rand_bytes(8), case: :lower)
  defp token, do: Base.encode16(:crypto.strong_rand_bytes(16), case: :lower)
end
