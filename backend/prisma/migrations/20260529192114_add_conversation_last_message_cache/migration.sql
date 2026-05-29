-- AlterTable
ALTER TABLE "AssistantConversation" ADD COLUMN     "lastMessageSource" "AssistantMessageSource",
ADD COLUMN     "lastMessageStatus" "AssistantMessageStatus";

-- Backfill from the most-recent AssistantMessage per conversation. Conversations
-- with zero messages stay null and the API treats null as "no messages yet".
UPDATE "AssistantConversation" AS c
SET    "lastMessageStatus" = m."status",
       "lastMessageSource" = m."source"
FROM (
  SELECT DISTINCT ON ("conversationId")
         "conversationId",
         "status",
         "source"
  FROM   "AssistantMessage"
  ORDER  BY "conversationId", "createdAt" DESC
) AS m
WHERE  m."conversationId" = c."id";
