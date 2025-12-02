/**
 * Discord.js mock objects for E2E testing.
 *
 * Provides comprehensive mocks for Discord client, messages,
 * guilds, channels, and other Discord entities.
 */

/**
 * Mock Discord Collection (Map-like structure).
 */
export class MockCollection extends Map {
  constructor(entries) {
    super(entries);
  }

  find(fn) {
    for (const [, value] of this) {
      if (fn(value)) return value;
    }
    return undefined;
  }

  filter(fn) {
    const results = new MockCollection();
    for (const [key, value] of this) {
      if (fn(value)) results.set(key, value);
    }
    return results;
  }

  map(fn) {
    const results = [];
    for (const [, value] of this) {
      results.push(fn(value));
    }
    return results;
  }

  first(count) {
    if (count === undefined) {
      return this.values().next().value;
    }
    const results = [];
    let i = 0;
    for (const [, value] of this) {
      if (i >= count) break;
      results.push(value);
      i++;
    }
    return results;
  }
}

/**
 * Mock Discord User.
 */
export function createMockUser(overrides = {}) {
  return {
    id: overrides.id || '123456789012345678',
    username: overrides.username || 'TestUser',
    discriminator: '1234',
    tag: `${overrides.username || 'TestUser'}#1234`,
    bot: overrides.bot ?? false,
    displayAvatarURL: () => 'https://cdn.discordapp.com/embed/avatars/0.png',
    toString: () => `<@${overrides.id || '123456789012345678'}>`,
    ...overrides,
  };
}

/**
 * Mock Discord Guild Member.
 */
export function createMockMember(overrides = {}) {
  const user = overrides.user || createMockUser();
  return {
    id: user.id,
    user,
    displayName: overrides.displayName || user.username,
    nickname: overrides.nickname || null,
    roles: {
      cache: new MockCollection(),
      highest: { id: '111', name: '@everyone', position: 0 },
    },
    permissions: {
      has: (perm) => overrides.permissions?.includes(perm) ?? true,
    },
    ...overrides,
  };
}

/**
 * Mock Discord Channel.
 */
export function createMockChannel(overrides = {}) {
  const messages = [];

  return {
    id: overrides.id || '111111111111111111',
    name: overrides.name || 'general',
    type: overrides.type ?? 0, // GUILD_TEXT
    topic: overrides.topic || null,
    nsfw: overrides.nsfw ?? false,
    guild: overrides.guild || null,
    messages: {
      cache: new MockCollection(),
      fetch: async (options) => {
        // Simulate fetching messages
        if (typeof options === 'string') {
          return messages.find(m => m.id === options);
        }
        const limit = options?.limit || 50;
        return new MockCollection(
          messages.slice(-limit).map(m => [m.id, m])
        );
      },
    },
    send: async (content) => {
      const msg = createMockMessage({
        content: typeof content === 'string' ? content : content.content,
        channel: { id: overrides.id || '111111111111111111' },
      });
      messages.push(msg);
      return msg;
    },
    sendTyping: async () => {},
    permissionsFor: () => ({
      has: (perm) => overrides.permissions?.includes(perm) ?? true,
    }),
    toString: () => `<#${overrides.id || '111111111111111111'}>`,
    ...overrides,
  };
}

/**
 * Mock Discord Guild.
 */
export function createMockGuild(overrides = {}) {
  const channels = new MockCollection();
  const members = new MockCollection();

  if (overrides.channels) {
    for (const channel of overrides.channels) {
      channels.set(channel.id, channel);
    }
  }

  return {
    id: overrides.id || '222222222222222222',
    name: overrides.name || 'Test Server',
    icon: null,
    ownerId: overrides.ownerId || '123456789012345678',
    memberCount: overrides.memberCount || 100,
    channels: {
      cache: channels,
      fetch: async (id) => channels.get(id),
    },
    members: {
      cache: members,
      fetch: async (id) => {
        if (members.has(id)) return members.get(id);
        return createMockMember({ user: createMockUser({ id }) });
      },
    },
    roles: {
      cache: new MockCollection(),
      everyone: { id: overrides.id || '222222222222222222' },
    },
    ...overrides,
  };
}

/**
 * Mock Discord Message.
 */
export function createMockMessage(overrides = {}) {
  const author = overrides.author || createMockUser();
  const channel = overrides.channel || createMockChannel();
  const guild = overrides.guild || createMockGuild();

  // Add channel to guild
  if (guild.channels && !guild.channels.cache.has(channel.id)) {
    guild.channels.cache.set(channel.id, channel);
  }

  return {
    id: overrides.id || Date.now().toString(),
    content: overrides.content || 'Test message',
    cleanContent: overrides.cleanContent || overrides.content || 'Test message',
    author,
    member: createMockMember({ user: author }),
    channel: { ...channel, guild },
    guild,
    createdTimestamp: overrides.createdTimestamp || Date.now(),
    createdAt: new Date(overrides.createdTimestamp || Date.now()),
    mentions: {
      users: new MockCollection(),
      members: new MockCollection(),
      roles: new MockCollection(),
      channels: new MockCollection(),
      everyone: false,
      has: (user) => false,
      ...overrides.mentions,
    },
    attachments: new MockCollection(),
    embeds: [],
    components: [],
    reference: overrides.reference || null,
    reply: async (content) => {
      return createMockMessage({
        content: typeof content === 'string' ? content : content.content,
        channel,
        guild,
        reference: { messageId: overrides.id },
      });
    },
    react: async (emoji) => ({
      emoji: { name: emoji },
      count: 1,
    }),
    delete: async () => {},
    edit: async (content) => {
      return createMockMessage({
        ...overrides,
        content: typeof content === 'string' ? content : content.content,
      });
    },
    fetch: async () => createMockMessage(overrides),
    toString: () => overrides.content || 'Test message',
    ...overrides,
  };
}

/**
 * Mock Discord Interaction.
 */
export function createMockInteraction(overrides = {}) {
  let replied = false;
  let deferred = false;
  let editedReply = null;

  const user = overrides.user || createMockUser();
  const channel = overrides.channel || createMockChannel();
  const guild = overrides.guild || createMockGuild();

  const options = {
    data: overrides.options || {},
    getString: (name) => options.data[name],
    getInteger: (name) => options.data[name],
    getNumber: (name) => options.data[name],
    getBoolean: (name) => options.data[name],
    getUser: (name) => options.data[name],
    getMember: (name) => options.data[name],
    getChannel: (name) => options.data[name],
    getRole: (name) => options.data[name],
    getSubcommand: () => options.data._subcommand || null,
    getSubcommandGroup: () => options.data._subcommandGroup || null,
  };

  return {
    id: overrides.id || Date.now().toString(),
    type: overrides.type ?? 2, // APPLICATION_COMMAND
    commandName: overrides.commandName || 'test',
    user,
    member: createMockMember({ user }),
    channel,
    guild,
    options,
    replied,
    deferred,
    reply: async (content) => {
      if (replied || deferred) {
        throw new Error('Already replied');
      }
      replied = true;
      return { content };
    },
    deferReply: async (options) => {
      if (replied || deferred) {
        throw new Error('Already replied');
      }
      deferred = true;
    },
    editReply: async (content) => {
      editedReply = content;
      return { content };
    },
    followUp: async (content) => ({ content }),
    deleteReply: async () => {},
    fetchReply: async () => ({ content: editedReply }),
    isCommand: () => true,
    isChatInputCommand: () => true,
    isButton: () => false,
    isSelectMenu: () => false,
    isModalSubmit: () => false,
    showModal: async () => {},
    ...overrides,
  };
}

/**
 * Mock Discord Button Interaction.
 */
export function createMockButtonInteraction(overrides = {}) {
  return createMockInteraction({
    type: 3, // MESSAGE_COMPONENT
    customId: overrides.customId || 'test_button',
    isCommand: () => false,
    isButton: () => true,
    message: overrides.message || createMockMessage(),
    update: async (content) => ({ content }),
    deferUpdate: async () => {},
    ...overrides,
  });
}

/**
 * Mock Discord Webhook.
 */
export function createMockWebhook(overrides = {}) {
  const messages = [];

  return {
    id: overrides.id || '333333333333333333',
    name: overrides.name || 'Test Webhook',
    avatar: null,
    token: 'mock-webhook-token',
    channelId: overrides.channelId || '111111111111111111',
    send: async (content) => {
      const msg = {
        id: Date.now().toString(),
        content: typeof content === 'string' ? content : content.content,
        username: content.username || overrides.name || 'Test Webhook',
        avatarURL: content.avatarURL || null,
      };
      messages.push(msg);
      return msg;
    },
    edit: async (content) => ({ ...overrides, ...content }),
    delete: async () => {},
    fetchMessage: async (id) => messages.find(m => m.id === id),
    ...overrides,
  };
}

/**
 * Mock Discord Client.
 */
export function createMockClient(overrides = {}) {
  const guilds = new MockCollection();
  const channels = new MockCollection();
  const users = new MockCollection();
  const webhooks = new MockCollection();

  // Add default guild
  const defaultGuild = createMockGuild();
  guilds.set(defaultGuild.id, defaultGuild);

  return {
    user: createMockUser({ id: 'bot123', username: 'TestBot', bot: true }),
    guilds: {
      cache: guilds,
      fetch: async (id) => guilds.get(id),
    },
    channels: {
      cache: channels,
      fetch: async (id) => channels.get(id),
    },
    users: {
      cache: users,
      fetch: async (id) => {
        if (users.has(id)) return users.get(id);
        return createMockUser({ id });
      },
    },
    fetchWebhook: async (id) => webhooks.get(id) || createMockWebhook({ id }),
    on: () => {},
    once: () => {},
    emit: () => {},
    login: async () => 'mock-token',
    destroy: async () => {},
    isReady: () => true,
    ...overrides,
  };
}

export default {
  MockCollection,
  createMockUser,
  createMockMember,
  createMockChannel,
  createMockGuild,
  createMockMessage,
  createMockInteraction,
  createMockButtonInteraction,
  createMockWebhook,
  createMockClient,
};
