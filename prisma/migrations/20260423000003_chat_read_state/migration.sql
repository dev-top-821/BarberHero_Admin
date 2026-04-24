-- Track last-read timestamps per chat participant. Enables unread counts
-- in the inbox and "Seen" markers on sent messages.
ALTER TABLE "ChatRoom" ADD COLUMN "customerLastReadAt" TIMESTAMP(3);
ALTER TABLE "ChatRoom" ADD COLUMN "barberLastReadAt" TIMESTAMP(3);
