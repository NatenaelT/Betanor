# Betanor Telegram integration

Telegram is an optional channel for existing Betanor chat and application notifications. Betanor remains the source of truth: Telegram replies are written to existing `chat_messages`, support/chat events use the scoped `support_notification_outbox` path, and other in-app notifications are fanned out to that same retryable outbox only when the recipient has opted in and linked Telegram.

## One-time administrator setup

1. Create the official bot with Telegram's `@BotFather` and keep its HTTP API token private.
2. In the Supabase project, open **Edge Functions → Secrets** and add `TELEGRAM_BOT_TOKEN`. Do not put the token in Vercel variables, browser code, SQL, Git, or a user-visible form.
3. Deploy the `telegram-bridge` Edge Function with JWT gateway verification disabled. The function itself validates Supabase sessions for browser actions and verifies a high-entropy webhook/dispatch secret from Supabase Vault for all unauthenticated provider requests.
4. Open **Workspace → System configuration → Telegram integration** as a user with `settings.manage`, then choose **Configure Telegram webhook**. The function calls Telegram `setWebhook` and `getMe`; the bot username is shown when setup succeeds.
5. Users open **My Profile → Telegram chat and notifications → Connect Telegram**, then click **Open Telegram** and press Start in the bot. That link contains a cryptographically random, single-use token, expires after 10 minutes, and is stored only as a SHA-256 hash in Postgres.
6. Users turn on Telegram notification preference when they want alerts. They can pause notifications or disconnect Telegram from My Profile.
7. Add the Betanor bot as an administrator in the employee group. In the same settings area, connect its public handle (for this setup, `@betanoret`). The bridge verifies the group and bot-admin membership before storing the group ID. Only this allowlisted group is mirrored.

## Using chat

- `/start` and `/help` explain account connection.
- `/tickets` lists up to ten conversations the linked Betanor account can currently access.
- Choose a conversation and send normal text messages to reply. Send `/tickets` again to change the active conversation.
- Attachments and screenshots should be sent in the Betanor portal chat; private Telegram replies are text-only.

### Employee group and task discussions

- Telegram employee-group posts are stored one message at a time in the existing private internal chat. The group is not exposed to customers, and messages are not echoed back into Telegram.
- Supported photos and documents up to 10 MB are copied to the private `betanor-chat-attachments` bucket. Other media is recorded as a message marker but is not downloaded.
- To attach a group message to a task, include its generated reference (for example `#BTNR-TASK-00000042`) or reply to a group message already linked to that task. The discussion appears on the task page and in internal chat. Messages without a task reference stay in the group conversation only.
- Task references appear in **Work → Tasks** and task details. Use the code in Telegram, not a task UUID.
- A new assignment creates a portal notification for an employee with an active portal account. If that employee individually linked Telegram and enabled Telegram notifications, the dispatcher sends a separate private bot message with a task link. Task details are never broadcast to the whole group.
- Each employee should link their own Telegram account in **My Profile → Telegram chat and notifications**. This identifies their posts and is required for private task alerts. Unlinked members’ group messages remain attributed to their Telegram display name only.

Customer users can only access conversations for their own active customer portal relationship. Customer support ticket access additionally requires `customer.support.respond`. Staff can access assigned support tickets with `support.respond`, broader permitted records with `support.view_all`, and internal staff-only conversations only with `chat.manage`. Access is rechecked on each list, selection, and reply. Customer users can never open internal staff conversations. Internal notes inside customer/ticket conversations are excluded from Telegram.

## Notifications and operations

The database asynchronously invokes the dispatcher after enqueue; Supabase Cron retries every minute if the immediate request is unavailable. Failures use bounded exponential backoff, and abandoned processing claims are recovered after five minutes. Each notification is sent only to an active profile with an active Telegram link and `telegram = true`. Chat message bodies are not copied into push-notification text; the bot sends a generic event plus an authenticated portal link. Email remains on its existing provider path and is outside this Telegram change.

Delivery is at-least-once across external network failures: an uncertain provider response can result in a duplicate alert. Telegram `update_id` deduplicates inbound text replies before insertion. Notifications contain only a generic alert and an allowlisted portal destination; notification titles and bodies are deliberately not copied to Telegram because HR, payroll, finance, and other records may contain sensitive details. Files remain private in Supabase Storage and are not copied into Telegram.

## Troubleshooting

Delivery is at-least-once across external network failures: an uncertain provider response can result in a duplicate alert. Telegram update IDs deduplicate inbound private replies; group message IDs make the group mirror idempotent. Notification messages contain only a generic alert and an allowlisted in-portal destination. Group attachments stay in private Supabase Storage.

- **Bot token missing:** add `TELEGRAM_BOT_TOKEN` in Supabase Edge Function secrets, then configure the webhook again.
- **Link expired:** generate a fresh link from My Profile; do not reuse or forward the old one.
- **No conversations listed:** confirm the Betanor account is active, the customer portal relationship is active (customers), and the relevant chat/support permissions are assigned (staff).
- **No employee group messages:** confirm the group connected in System configuration is the right one, the bot is still a group administrator, the webhook is active, and the user has `chat.internal.read`. Telegram delivers ordinary group messages to bot administrators; messages from other bots are not forwarded by Telegram.
- **Notification not received:** check that the Telegram account is linked, Telegram preferences are on, the user is active, and the `betanor-telegram-notification-dispatch` Cron job is succeeding.
- **Token exposure:** revoke/rotate the bot token with BotFather, replace the Supabase Edge Function secret, then configure the webhook again.
