import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";

type JsonRecord = Record<string, unknown>;
type ConversationRow = {
  conversation_id: string;
  reference: string;
  subject: string;
  status: string;
  is_support_ticket: boolean;
};
type NotificationRow = {
  outbox_id: string;
  recipient_profile_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  telegram_chat_id: string;
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SECRET_KEY") ?? "";
const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const allowedOrigins = new Set([
  "https://betanor.et",
  "https://www.betanor.et",
  "https://betanor-digital-platform.vercel.app",
  "http://localhost:3000",
]);

function headersFor(request: Request) {
  const origin = request.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": allowedOrigins.has(origin) ? origin : "https://betanor.et",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
    "Content-Type": "application/json; charset=utf-8",
  };
}

function json(request: Request, data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: headersFor(request) });
}

function getAdmin() {
  if (!supabaseUrl || !serviceKey) throw new Error("Supabase server credentials are not configured.");
  return createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

function clean(value: unknown, maxLength = 4000) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function getBotToken() {
  if (!botToken) throw new Error("The Telegram bot token has not been configured in Supabase Edge Function secrets.");
  return botToken;
}

async function telegram(method: string, payload: JsonRecord = {}) {
  const response = await fetch(`https://api.telegram.org/bot${getBotToken()}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(12_000),
  });
  const result = await response.json().catch(() => ({})) as { ok?: boolean; result?: unknown; description?: string };
  if (!response.ok || !result.ok) throw new Error(result.description || `Telegram ${method} request failed.`);
  return result.result;
}

async function verifyTransport(admin: ReturnType<typeof getAdmin>, secret: string | null) {
  if (!secret) return false;
  const { data, error } = await admin.rpc("telegram_transport_secret_matches", { secret_input: secret });
  return !error && data === true;
}

async function telegramIdentity(admin: ReturnType<typeof getAdmin>, userId: number, chatId: number) {
  const { data, error } = await admin
    .from("telegram_connections")
    .select("profile_id,telegram_chat_id,active_conversation_id")
    .eq("telegram_user_id", String(userId))
    .maybeSingle();
  if (error || !data || data.telegram_chat_id !== String(chatId)) return null;
  const { data: profile } = await admin.from("profiles").select("id,is_active,account_type").eq("id", data.profile_id).maybeSingle();
  if (!profile?.is_active) return null;
  return { profileId: data.profile_id as string, accountType: profile.account_type as string, activeConversationId: data.active_conversation_id as string | null };
}

async function sendText(chatId: number | string, text: string, replyMarkup?: JsonRecord) {
  return telegram("sendMessage", {
    chat_id: chatId,
    text: text.slice(0, 4000),
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    disable_web_page_preview: true,
  });
}

const mirroredMimeTypes = new Set([
  "application/pdf",
  "application/zip",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

function safeAttachmentName(value: unknown) {
  const input = clean(value, 140).replace(/[\\/]/g, "_").replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return input.replace(/[^a-zA-Z0-9._ ()-]/g, "_").slice(0, 120) || "telegram-attachment";
}

async function mirrorGroupAttachment(admin: ReturnType<typeof getAdmin>, message: JsonRecord, chatId: string) {
  const document = message.document as JsonRecord | undefined;
  const photos = Array.isArray(message.photo) ? message.photo as JsonRecord[] : [];
  const photo = photos.at(-1);
  const media = document ?? photo;
  if (!media || typeof media.file_id !== "string") return null;

  const mimeType = document ? clean(document.mime_type, 120).toLowerCase() : "image/jpeg";
  const fileSize = typeof media.file_size === "number" ? media.file_size : 0;
  if (!mirroredMimeTypes.has(mimeType) || fileSize < 1 || fileSize > 10 * 1024 * 1024) {
    return { note: "[Telegram attachment not mirrored: file type is unsupported or file exceeds the 10 MB portal limit.]" };
  }

  const file = await telegram("getFile", { file_id: media.file_id }) as { file_path?: string };
  if (!file.file_path || file.file_path.includes("..")) throw new Error("Telegram did not return a safe attachment path.");
  const response = await fetch(`https://api.telegram.org/file/bot${getBotToken()}/${file.file_path}`, { signal: AbortSignal.timeout(12_000) });
  if (!response.ok) throw new Error("Could not download a Telegram attachment.");
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength < 1 || bytes.byteLength > 10 * 1024 * 1024) {
    return { note: "[Telegram attachment not mirrored: file exceeds the 10 MB portal limit.]" };
  }

  const messageId = typeof message.message_id === "number" ? String(message.message_id) : crypto.randomUUID();
  const fileName = safeAttachmentName(document?.file_name ?? (photo ? `telegram-photo-${messageId}.jpg` : "telegram-file"));
  const storagePath = `telegram-group/${chatId.replace(/[^0-9]/g, "")}/${messageId}/${fileName}`;
  const { error } = await admin.storage.from("betanor-chat-attachments").upload(storagePath, bytes, {
    contentType: mimeType,
    cacheControl: "3600",
    upsert: false,
  });
  if (error) throw new Error("Could not store the private Telegram group attachment.");
  return { path: storagePath, name: fileName, mimeType, size: bytes.byteLength };
}

async function handleGroupMessage(admin: ReturnType<typeof getAdmin>, message: JsonRecord) {
  const chat = message.chat as JsonRecord | undefined;
  const sender = message.from as JsonRecord | undefined;
  if ((chat?.type !== "group" && chat?.type !== "supergroup") || typeof chat.id !== "number" || typeof message.message_id !== "number" || typeof sender?.id !== "number" || sender.is_bot === true) return;
  const chatId = String(chat.id);
  const { data: binding, error: bindingError } = await admin.from("telegram_group_bindings")
    .select("telegram_chat_id,workspace_id,conversation_id")
    .eq("telegram_chat_id", chatId)
    .eq("is_active", true)
    .maybeSingle();
  if (bindingError) throw new Error("Could not verify whether this Telegram group is connected.");
  if (!binding) return;
  const { data: existingMessage, error: existingError } = await admin.from("chat_messages")
    .select("id")
    .eq("telegram_group_chat_id", chatId)
    .eq("telegram_group_message_id", message.message_id)
    .maybeSingle();
  if (existingError) throw new Error("Could not check whether this Telegram group message was already received.");
  if (existingMessage) return;

  const text = clean(message.text ?? message.caption, 4000);
  const attachment = await mirrorGroupAttachment(admin, message, chatId);
  const messageKind = message.sticker ? "sticker" : message.voice ? "voice message" : message.video ? "video" : message.audio ? "audio" : message.animation ? "animation" : message.video_note ? "video note" : "attachment";
  const body = [text, attachment?.note, !text && !attachment?.path && !attachment?.note ? `[Telegram ${messageKind}]` : ""].filter(Boolean).join("\n").slice(0, 4000);
  const senderName = [clean(sender.first_name, 80), clean(sender.last_name, 80)].filter(Boolean).join(" ");
  const senderLabel = clean(sender.username, 64) ? `@${clean(sender.username, 64)}` : senderName || "Telegram staff member";
  const taskCode = body.match(/\b(BTNR-TASK-\d{8,})\b/i)?.[1] ?? null;
  const reply = message.reply_to_message as JsonRecord | undefined;
  const replyToMessageId = typeof reply?.message_id === "number" ? reply.message_id : null;

  const { error } = await admin.rpc("telegram_record_group_message", {
    telegram_chat_id_input: chatId,
    telegram_message_id_input: message.message_id,
    telegram_user_id_input: String(sender.id),
    sender_label_input: senderLabel,
    body_input: body || "[Telegram message]",
    task_code_input: taskCode,
    reply_to_message_id_input: replyToMessageId,
    attachment_path_input: attachment?.path ?? null,
    attachment_name_input: attachment?.name ?? null,
    attachment_mime_type_input: attachment?.mimeType ?? null,
    attachment_size_bytes_input: attachment?.size ?? null,
  });
  if (error) {
    const { data: persisted } = await admin.from("chat_messages").select("id")
      .eq("telegram_group_chat_id", chatId).eq("telegram_group_message_id", message.message_id).maybeSingle();
    if (!persisted && attachment?.path) await admin.storage.from("betanor-chat-attachments").remove([attachment.path]);
    throw new Error("Could not mirror a Telegram group message into Betanor.");
  }
}

function portalUrl(accountType: string, payload: Record<string, unknown>, ticketId?: string, conversationId?: string) {
  const entityType = clean(payload.entity_type, 64).toLowerCase();
  const entityId = clean(payload.entity_id, 64);
  const safeEntityId = /^[0-9a-f-]{36}$/i.test(entityId) ? encodeURIComponent(entityId) : "";
  if (ticketId) {
    return accountType === "customer"
      ? `https://betanor.et/portal/support/tickets/${encodeURIComponent(ticketId)}`
      : `https://betanor.et/workspace/support/tickets/${encodeURIComponent(ticketId)}`;
  }
  if (conversationId && accountType === "staff") return "https://betanor.et/workspace/chats";
  if (accountType === "customer") {
    return entityType === "support_ticket" && safeEntityId
      ? `https://betanor.et/portal/support/tickets/${safeEntityId}`
      : "https://betanor.et/portal";
  }

  const workspaceRoutes: Record<string, string> = {
    tender: "/workspace/tenders",
    letter: "/workspace/letters",
    project: "/workspace/projects",
    task: "/workspace/tasks",
    employee: "/workspace/employees",
    leave_request: "/workspace/leave",
    payroll_cycle: "/workspace/payslips",
    payslip: "/workspace/payslips",
    expense: "/workspace/expenses",
    invoice: "/workspace/invoices",
    quotation: "/workspace/quotations",
    contract: "/workspace/contracts",
    rfq: "/workspace/rfqs",
    chat_conversation: "/workspace/chats",
    support_ticket: "/workspace/support/tickets",
  };
  const route = workspaceRoutes[entityType];
  if (!route) return "https://betanor.et/workspace";
  const routeOnlyTypes = new Set(["leave_request", "payroll_cycle", "payslip", "rfq", "chat_conversation"]);
  return `https://betanor.et${route}${safeEntityId && !routeOnlyTypes.has(entityType) ? `/${safeEntityId}` : ""}`;
}

async function openTickets(admin: ReturnType<typeof getAdmin>, chatId: number, profileId: string) {
  const { data, error } = await admin.rpc("telegram_list_conversations", { actor_profile_id: profileId });
  if (error) throw new Error("Could not load conversations for this account.");
  const rows = (data ?? []) as ConversationRow[];
  if (rows.length === 0) {
    await sendText(chatId, "There are no open conversations available to your Betanor account right now.");
    return;
  }
  await sendText(chatId, "Choose a conversation. Replies you send here will appear in the Betanor portal chat.", {
    inline_keyboard: rows.map((row) => [{
      text: `${row.reference} · ${row.subject}`.slice(0, 64),
      callback_data: `conv:${row.conversation_id}`,
    }]),
  });
}

async function handleWebhookUpdate(admin: ReturnType<typeof getAdmin>, update: JsonRecord) {
  const message = update.message as JsonRecord | undefined;
  const callback = update.callback_query as JsonRecord | undefined;
  const callbackMessage = callback?.message as JsonRecord | undefined;
  const envelope = message ?? callbackMessage;
  if (!envelope) return;
  const chat = envelope.chat as JsonRecord | undefined;
  const from = (message?.from ?? callback?.from) as JsonRecord | undefined;
  if ((chat?.type === "group" || chat?.type === "supergroup") && message) {
    await handleGroupMessage(admin, message);
    return;
  }
  if (chat?.type !== "private" || typeof from?.id !== "number" || typeof chat.id !== "number") return;
  const chatId = chat.id;
  const telegramUserId = from.id;
  const updateId = typeof update.update_id === "number" ? String(update.update_id) : "";

  if (message) {
    const text = clean(message.text, 4000);
    const command = text.split(/\s+/, 2)[0]?.split("@")[0]?.toLowerCase() ?? "";
    const argument = text.split(/\s+/, 2)[1] ?? "";

    if (command === "/start" && argument) {
      const { data, error } = await admin.rpc("telegram_consume_link_challenge", {
        token_input: argument,
        telegram_user_id_input: String(telegramUserId),
        telegram_chat_id_input: String(chatId),
        telegram_username_input: clean(from.username, 64) || null,
      });
      if (error || !data) {
        await sendText(chatId, error?.message ?? "That connection link could not be used. Create a new one from your Betanor profile.");
        return;
      }
      await sendText(chatId, "Your Telegram account is now connected to Betanor. Use /tickets to choose a conversation, then reply here to chat.");
      await openTickets(admin, chatId, data as string);
      return;
    }

    const identity = await telegramIdentity(admin, telegramUserId, chatId);
    if (command === "/start" || command === "/help") {
      await sendText(chatId, identity
        ? "Betanor chat is connected. Use /tickets to choose an open conversation. Messages are sent to that conversation; send /tickets to switch."
        : "To connect, sign in to Betanor, open My Profile → Telegram, create a one-time link, then press Start in this chat.");
      return;
    }
    if (!identity) {
      await sendText(chatId, "Connect your Telegram account from My Profile in the Betanor portal before using chat.");
      return;
    }
    if (command === "/tickets") {
      await openTickets(admin, chatId, identity.profileId);
      return;
    }
    if (command.startsWith("/")) {
      await sendText(chatId, "Available commands: /tickets and /help.");
      return;
    }

    const activeConversationId = identity.activeConversationId;
    if (!activeConversationId) {
      await sendText(chatId, "Choose a conversation first with /tickets.");
      return;
    }
    if (!text) {
      await sendText(chatId, "Text messages are supported here. Use the Betanor portal chat to upload attachments or screenshots.");
      return;
    }
    const { error } = await admin.rpc("telegram_record_chat_message", {
      actor_profile_id: identity.profileId,
      conversation_id_input: activeConversationId,
      body_input: text,
      update_id_input: updateId,
    });
    if (error) {
      await sendText(chatId, "I couldn't send that reply. Use /tickets to select an available conversation again.");
      return;
    }
    await sendText(chatId, "Sent to Betanor chat.");
    return;
  }

  if (callback) {
    const identity = await telegramIdentity(admin, telegramUserId, chatId);
    const callbackId = clean(callback.id, 128);
    const callbackData = clean(callback.data, 128);
    const conversationId = callbackData.startsWith("conv:") ? callbackData.slice(5) : "";
    if (!identity || !/^[0-9a-f-]{36}$/i.test(conversationId)) {
      if (callbackId) await telegram("answerCallbackQuery", { callback_query_id: callbackId, text: "That conversation is not available." });
      return;
    }
    const { data, error } = await admin.rpc("telegram_select_conversation", {
      actor_profile_id: identity.profileId,
      conversation_id_input: conversationId,
    });
    if (callbackId) await telegram("answerCallbackQuery", { callback_query_id: callbackId, text: error || !data ? "Conversation unavailable" : "Conversation selected" });
    if (!error && data) await sendText(chatId, "Conversation selected. Reply here to continue. Use /tickets to switch.");
  }
}

function notificationText(row: NotificationRow, accountType: string) {
  const payload = row.payload ?? {};
  const ticketNumber = clean(payload.ticket_number ?? payload.reference, 80);
  const ticketId = clean(payload.ticket_id, 64);
  const conversationId = clean(payload.conversation_id, 64);
  const event = row.event_type.toUpperCase();
  const prefix = ticketNumber ? `${ticketNumber}: ` : "";
  const eventText: Record<string, string> = {
    TASK_ASSIGNED: "A new task has been assigned to you.",
    SUPPORT_REQUEST_RECEIVED: "Your support request was received.",
    SUPPORT_TICKET_UPDATED: "Your support ticket has an update.",
    SUPPORT_NEW_TICKET: "A new support ticket needs attention.",
    SUPPORT_CHAT_MESSAGE: "There is a new message on your support ticket.",
    CHAT_CUSTOMER_MESSAGE: "A customer sent a new chat message.",
    CHAT_BETANOR_REPLY: "Betanor replied in your chat.",
    CHAT_INTERNAL_MESSAGE: "An internal staff conversation has a new reply.",
  };
  const text = `${prefix}${eventText[event] ?? "You have a new Betanor notification."}`;
  return {
    text,
    url: portalUrl(accountType, payload, ticketId || undefined, conversationId || undefined),
  };
}

async function dispatchNotifications(admin: ReturnType<typeof getAdmin>) {
  if (!botToken) return { ok: true, configured: false, processed: 0 };
  const { data, error } = await admin.rpc("telegram_claim_notifications", { batch_limit: 20 });
  if (error) throw new Error("Could not claim Telegram notifications.");
  const rows = (data ?? []) as NotificationRow[];
  let sent = 0;
  for (const row of rows) {
    let successful = false;
    let detail = "";
    try {
      const { data: profile } = await admin.from("profiles").select("account_type,is_active").eq("id", row.recipient_profile_id).maybeSingle();
      if (!profile?.is_active) throw new Error("Recipient account is inactive.");
      const notification = notificationText(row, profile.account_type);
      await sendText(row.telegram_chat_id, `${notification.text}\n${notification.url}`);
      successful = true;
      sent += 1;
    } catch (error) {
      detail = errorText(error);
    }
    await admin.rpc("telegram_finish_notification", {
      outbox_id_input: row.outbox_id,
      success_input: successful,
      error_input: detail.slice(0, 500) || null,
    });
  }
  return { ok: true, configured: true, processed: rows.length, sent };
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: headersFor(request) });
  if (request.method !== "POST") return json(request, { error: "POST is required." }, 405);
  const admin = getAdmin();
  const body = await request.json().catch(() => ({})) as JsonRecord;
  const action = clean(body.action, 40);

  try {
    if (request.headers.has("x-telegram-bot-api-secret-token")) {
      if (!await verifyTransport(admin, request.headers.get("x-telegram-bot-api-secret-token"))) {
        return json(request, { error: "Unauthorized webhook." }, 401);
      }
      await handleWebhookUpdate(admin, body);
      return json(request, { ok: true });
    }

    if (action === "dispatch") {
      if (!await verifyTransport(admin, request.headers.get("x-betanor-transport-secret"))) {
        return json(request, { error: "Unauthorized dispatcher." }, 401);
      }
      return json(request, await dispatchNotifications(admin));
    }

    const authorization = request.headers.get("authorization") ?? "";
    const jwt = authorization.replace(/^Bearer\s+/i, "").trim();
    if (!jwt) return json(request, { error: "Sign in to your Betanor account first." }, 401);
    const { data: identity, error: identityError } = await admin.auth.getUser(jwt);
    if (identityError || !identity.user) return json(request, { error: "Your Betanor session is invalid or expired." }, 401);
    if (action === "create_link") {
      if (!botToken) return json(request, { error: "The Telegram bot is not configured yet. Ask a Betanor administrator to finish setup." }, 503);
      const bot = await telegram("getMe") as { username?: string };
      if (!bot.username) return json(request, { error: "The Telegram bot does not have a public username." }, 503);
      const { data: token, error } = await admin.rpc("telegram_create_link_challenge", {
        profile_id_input: identity.user.id,
      });
      if (error || typeof token !== "string") return json(request, { error: error?.message ?? "Could not create a Telegram connection link." }, 400);
      return json(request, { url: `https://t.me/${bot.username}?start=${encodeURIComponent(token)}`, expiresInSeconds: 600 });
    }

    if (action === "configure_webhook") {
      const { data: allowed, error } = await admin.rpc("telegram_user_can_configure", {
        profile_id_input: identity.user.id,
      });
      if (error || allowed !== true) return json(request, { error: "Only an administrator with settings access can configure the Telegram bot." }, 403);
      if (!botToken) return json(request, { error: "Add TELEGRAM_BOT_TOKEN to Supabase Edge Function secrets, then try again." }, 503);
      const { data: transportSecret, error: secretError } = await admin.rpc("telegram_get_transport_secret");
      if (secretError || typeof transportSecret !== "string") return json(request, { error: "The secure webhook secret is unavailable." }, 500);
      const { data: projectUrl, error: urlError } = await admin.rpc("telegram_get_project_url");
      if (urlError || typeof projectUrl !== "string") return json(request, { error: "The project webhook URL is unavailable." }, 500);
      const webhookUrl = `${projectUrl.replace(/\/$/, "")}/functions/v1/telegram-bridge`;
      const result = await telegram("setWebhook", {
        url: webhookUrl,
        secret_token: transportSecret,
        allowed_updates: ["message", "callback_query"],
        drop_pending_updates: false,
      });
      const bot = await telegram("getMe") as { username?: string };
      return json(request, { ok: result === true, botUsername: bot.username ?? null, webhookUrl });
    }

    if (action === "connect_group") {
      const { data: allowed, error: permissionError } = await admin.rpc("telegram_user_can_configure", {
        profile_id_input: identity.user.id,
      });
      if (permissionError || allowed !== true) return json(request, { error: "Only an administrator with settings access can connect a Telegram group." }, 403);
      if (!botToken) return json(request, { error: "Add TELEGRAM_BOT_TOKEN to Supabase Edge Function secrets before connecting a group." }, 503);

      const groupHandle = clean(body.groupHandle, 64);
      if (!/^@[A-Za-z0-9_]{5,32}$/.test(groupHandle)) return json(request, { error: "Enter the public Telegram group handle, for example @betanoret." }, 400);
      const group = await telegram("getChat", { chat_id: groupHandle }) as { id?: number; type?: string; title?: string; username?: string };
      if (typeof group.id !== "number" || (group.type !== "group" && group.type !== "supergroup")) {
        return json(request, { error: "That Telegram account is not a group or supergroup." }, 400);
      }
      const bot = await telegram("getMe") as { id?: number; username?: string };
      if (typeof bot.id !== "number") return json(request, { error: "Could not identify the Betanor Telegram bot." }, 502);
      const membership = await telegram("getChatMember", { chat_id: group.id, user_id: bot.id }) as { status?: string };
      if (membership.status !== "administrator" && membership.status !== "creator") {
        return json(request, { error: "Promote the Betanor bot to a group administrator, then connect again." }, 400);
      }

      const username = group.username ? `@${group.username}` : groupHandle;
      const { error: bindError } = await admin.rpc("telegram_bind_group", {
        telegram_chat_id_input: String(group.id),
        telegram_username_input: username,
        title_input: clean(group.title, 160) || username,
        actor_profile_id_input: identity.user.id,
      });
      if (bindError) return json(request, { error: bindError.message || "Could not connect this Telegram group." }, 400);
      return json(request, { ok: true, groupHandle: username, title: clean(group.title, 160) || username });
    }

    if (action === "group_status") {
      const { data: allowed, error: permissionError } = await admin.rpc("telegram_user_can_configure", {
        profile_id_input: identity.user.id,
      });
      if (permissionError || allowed !== true) return json(request, { error: "Only an administrator with settings access can view Telegram group setup." }, 403);
      const { data: profile, error: profileError } = await admin.from("profiles")
        .select("workspace_id").eq("id", identity.user.id).single();
      if (profileError || !profile?.workspace_id) return json(request, { error: "Could not resolve your workspace." }, 403);
      const { data: groups, error: groupError } = await admin.from("telegram_group_bindings")
        .select("telegram_username,title,is_active,updated_at")
        .eq("workspace_id", profile.workspace_id)
        .order("updated_at", { ascending: false })
        .limit(1);
      if (groupError) return json(request, { error: "Could not load Telegram group setup." }, 500);
      const group = groups?.[0];
      return json(request, { connected: Boolean(group?.is_active), groupHandle: group?.telegram_username ? `@${group.telegram_username}` : null, title: group?.title ?? null });
    }

    return json(request, { error: "Unsupported Telegram action." }, 400);
  } catch (error) {
    const message = errorText(error);
    const status = message.includes("not been configured") ? 503 : 400;
    console.error("Telegram bridge request failed:", message.slice(0, 300));
    return json(request, { error: message.slice(0, 300) }, status);
  }
});
