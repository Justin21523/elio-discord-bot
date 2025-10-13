import 'dotenv/config';

export const CONFIG = Object.freeze({
  DISCORD_TOKEN: process.env.DISCORD_TOKEN,
  APP_ID: process.env.APP_ID,
  GUILD_ID_DEV: process.env.GUILD_ID_DEV,
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017',
  DB_NAME: process.env.DB_NAME || 'communiverse_bot',
  GAME_WIN_POINTS: 10
});
