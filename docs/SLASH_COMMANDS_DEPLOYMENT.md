# Slash Commands Deployment Guide

## Understanding the Issue

When you deploy your bot to multiple servers, you might notice:
- ✅ Auto-reply (message events) works everywhere
- ❌ Slash commands (`/persona`, `/game`, etc.) only work in your dev server

**Why?** Your slash commands are registered **guild-scoped** (only to your dev server), not **globally**.

## Command Registration Types

### 1. Guild-Scoped Commands (Development)
- ✅ **Instant** - Commands appear immediately (< 5 seconds)
- ⚠️ **Single server** - Only visible in the specified guild
- 💡 **Best for:** Testing and development

### 2. Global Commands (Production)
- ✅ **All servers** - Commands work everywhere your bot is invited
- ⚠️ **Slow propagation** - Takes ~1 hour to appear in all servers
- 💡 **Best for:** Production deployment

## How to Fix

### Step 1: Deploy Commands Globally

Run this command to register your slash commands globally:

```bash
npm run deploy:global
```

**Important:**
- This will make commands available to **all servers** where your bot is invited
- Commands will take **~1 hour** to propagate across Discord
- You only need to run this once (or when you add/modify commands)

### Step 2: Wait for Propagation

After running the command:
1. Wait **1 hour** for Discord to propagate the commands globally
2. During this time, your dev server will still have instant access (from guild-scoped commands)
3. Other servers will see the commands appear gradually

### Step 3: Verify in Other Servers

After ~1 hour, test in a different server:
1. Type `/` in any channel
2. You should see your bot's commands appear
3. Try running `/persona list` or `/game start`

## Bot Invite Link

To ensure your bot has the correct permissions when invited to new servers, use this invite URL format:

```
https://discord.com/api/oauth2/authorize?client_id=YOUR_APP_ID&permissions=8&scope=bot%20applications.commands
```

Replace `YOUR_APP_ID` with your bot's Application ID from the Discord Developer Portal.

**Required scopes:**
- `bot` - Basic bot functionality
- `applications.commands` - Slash commands support

## Development vs Production Workflow

### Development Workflow

```bash
# 1. Edit commands in scripts/deploy-commands.js
# 2. Deploy to dev server (instant)
npm run deploy:dev

# 3. Test commands immediately in your dev server
# 4. Repeat as needed
```

### Production Workflow

```bash
# 1. Test thoroughly in dev server first
npm run deploy:dev

# 2. When ready for production, deploy globally
npm run deploy:global

# 3. Wait ~1 hour for propagation
# 4. Verify in production servers
```

## Troubleshooting

### Commands still not appearing after 1 hour?

1. **Check bot permissions**
   - Ensure bot was invited with `applications.commands` scope
   - Re-invite bot with correct permissions if needed

2. **Verify deployment succeeded**
   ```bash
   npm run deploy:global
   ```
   - Look for "✅ Successfully registered commands GLOBALLY"
   - Check for any error messages

3. **Check Discord API status**
   - Visit https://discordstatus.com/
   - Sometimes Discord API delays can extend propagation time

4. **Force refresh Discord client**
   - Press `Ctrl+R` (Windows/Linux) or `Cmd+R` (Mac) to reload Discord
   - Sometimes clients cache command lists

### Need to update commands?

When you modify slash commands:

1. **Update the command definition** in `scripts/deploy-commands.js` or `scripts/deploy-commands-global.js`

2. **Redeploy:**
   ```bash
   # For dev server (instant)
   npm run deploy:dev

   # For all servers (~1 hour)
   npm run deploy:global
   ```

3. Discord will automatically update the commands (no need to remove old ones)

## Environment Variables

Your `.env` file controls deployment behavior:

```env
# Discord Configuration
DISCORD_TOKEN=your_bot_token
APP_ID=your_app_id
GUILD_ID_DEV=your_dev_guild_id  # Used by deploy:dev
```

**Note:** `deploy:global` ignores `GUILD_ID_DEV` and always deploys globally.

## Best Practices

1. **Always test in dev server first**
   - Use `npm run deploy:dev` for rapid iteration
   - Only deploy globally when commands are stable

2. **Document command changes**
   - Keep track of what commands you add/modify
   - Update this guide if you change the deployment process

3. **Communicate with users**
   - When deploying new commands, let server admins know
   - Remind them commands take ~1 hour to appear

4. **Keep dev and global in sync**
   - Both `deploy-commands.js` and `deploy-commands-global.js` should have the same commands
   - Consider refactoring to share command definitions

## Quick Reference

| Command | Scope | Propagation Time | Use Case |
|---------|-------|------------------|----------|
| `npm run deploy:dev` | Guild-scoped | < 5 seconds | Development & testing |
| `npm run deploy:global` | Global | ~1 hour | Production deployment |

## Additional Resources

- [Discord Slash Commands Docs](https://discord.com/developers/docs/interactions/application-commands)
- [Discord.js Guide - Slash Commands](https://discordjs.guide/creating-your-bot/slash-commands.html)
- [Bot Invite URL Generator](https://discord.com/developers/docs/topics/oauth2#bot-authorization-flow)
