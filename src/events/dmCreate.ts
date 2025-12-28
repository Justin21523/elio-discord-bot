/**
 * events/dmCreate.js
 * Handle Direct Messages sent to the bot
 */

import { Events } from "discord.js";
import { handleDMMessage } from "../handlers/dmHandlers.js";
import { logger } from "../util/logger.js";

export const name = Events.MessageCreate;

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export async function execute(message: any, services: any) {
  try {
    // Only handle DMs (not in guilds)
    if (message.guild) return;

    // Skip bot messages
    if (message.author.bot) return;

    logger.info("[EVENT:DMCreate] DM received", {
      userId: message.author.id,
      username: message.author.username,
    });

    // Route to DM handler
    await handleDMMessage(message, services);
  } catch (error: unknown) {
    logger.error("[EVENT:DMCreate] Error", { error: getErrorMessage(error) });
  }
}
