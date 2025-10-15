// /src/db/validators.js
// English-only code & comments.
// Centralized JSON Schema validators for collections.
// NOTE: On MongoDB Atlas (readWrite role), collMod may be forbidden.
// Our ensure-indexes will gracefully skip validators if not allowed.

export const validators = {
  personas: {
    $jsonSchema: {
      bsonType: "object",
      required: ["name","avatar","color","traits","likes","dislikes","openers","actions","enabled"],
      properties: {
        name: { bsonType: "string", minLength: 1 },
        avatar: { bsonType: "string", minLength: 4 },
        color: { bsonType: ["int","long","double"] },
        traits: { bsonType: "object" },
        likes: { bsonType: "array", items: { bsonType: "string" } },
        dislikes: { bsonType: "array", items: { bsonType: "string" } },
        openers: { bsonType: "array", items: { bsonType: "string" } },
        actions: {
          bsonType: "object",
          additionalProperties: {
            bsonType: "object",
            required: ["friendship","trust","dependence"],
            properties: {
              friendship: { bsonType: ["int","long","double"] },
              trust:      { bsonType: ["int","long","double"] },
              dependence: { bsonType: ["int","long","double"] },
              notes: { bsonType: ["string","null"] }
            }
          }
        },
        enabled:   { bsonType: "bool" },
        createdAt: { bsonType: ["date","null"] },
        updatedAt: { bsonType: ["date","null"] }
      }
    }
  },

  scenarios: {
    $jsonSchema: {
      bsonType: "object",
      required: ["prompt","options","correctIndex","tags","enabled","weight","hostPersonaName"],
      properties: {
        prompt: { bsonType: "string", minLength: 1 },
        options: { bsonType: "array", minItems: 2, maxItems: 4, items: { bsonType: "string" } },
        correctIndex: { bsonType: ["int","long","double"] },
        tags:   { bsonType: "array", items: { bsonType: "string" } },
        enabled:{ bsonType: "bool" },
        weight: { bsonType: ["int","long","double"] },
        hostPersonaName: { bsonType: "string" },
        createdAt: { bsonType: ["date","null"] },
        updatedAt: { bsonType: ["date","null"] }
      }
    }
  },

  greetings: {
    $jsonSchema: {
      bsonType: "object",
      required: ["text","tags","weight","enabled"],
      properties: {
        text: { bsonType: "string", minLength: 1 },
        tags: { bsonType: "array", items: { bsonType: "string" } },
        weight: { bsonType: ["int","long","double"] },
        enabled: { bsonType: "bool" },
        personaHost: { bsonType: ["string","null"] },
        style: {
          bsonType: "object",
          properties: {
            title: { bsonType: ["string","null"] },
            markdownAccent: { bsonType: ["string","null"] }, // "**" | "*" | "`"
            useCodeFontForTags: { bsonType: "bool" },
            showTagsField: { bsonType: "bool" }
          }
        },
        imageUrl: { bsonType: ["string","null"] },
        createdAt: { bsonType: ["date","null"] },
        updatedAt: { bsonType: ["date","null"] }
      }
    }
  },

  // ---  media ---
  media: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['type', 'url', 'enabled'],
      properties: {
        type: { enum: ['gif', 'image'] },
        url: { bsonType: 'string', minLength: 5 },
        tags: { bsonType: 'array', items: { bsonType: 'string' } },
        nsfw: { bsonType: 'bool' },
        enabled: { bsonType: 'bool' },
        addedAt: { bsonType: ['date', 'null'] },
        addedByUserId: { bsonType: ['string', 'null'] },
        updatedAt: { bsonType: ['date', 'null'] },
      },
      additionalProperties: true,
    },
  },

  // --- schedules ---
  schedules: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['guildId', 'channelId', 'kind', 'hhmm', 'enabled'],
      properties: {
        guildId: { bsonType: 'string' },
        channelId: { bsonType: 'string' },
        kind: { enum: ['drop', 'greet', 'digest'] },
        hhmm: { bsonType: 'string', pattern: '^\\d{2}:\\d{2}$' },
        timezone: { bsonType: ['string', 'null'] },
        enabled: { bsonType: 'bool' },
        createdAt: { bsonType: ['date', 'null'] },
        updatedAt: { bsonType: ['date', 'null'] },
      },
      additionalProperties: true,
    },
  },
};
