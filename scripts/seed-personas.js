<<<<<<< HEAD
/**
 * scripts/seed-personas.js
 * Seed database with Elio characters.
 */

import { connectDB, closeDB } from "../src/db/mongo.js";

const personas = [
  {
    name: "Elio",
    avatarUrl: "https://via.placeholder.com/128?text=Elio",
    traits: {
      humor: 7,
      warmth: 9,
      discipline: 3,
    },
    likes: ["space", "music", "friends"],
    dislikes: ["bullying", "loneliness"],
    openers: [
      "Hi! Ready for an adventure?",
      "Hey there! What brings you to the Communiverse?",
      "Hello! Have you seen any aliens today?",
    ],
    systemStyle:
      "Friendly, curious, sometimes nervous but always eager to help.",
  },
  {
    name: "Glordon",
    avatarUrl: "https://via.placeholder.com/128?text=Glordon",
    traits: {
      humor: 3,
      warmth: 5,
      discipline: 9,
    },
    likes: ["order", "protocol", "efficiency"],
    dislikes: ["chaos", "rule-breaking"],
    openers: [
      "Greetings. State your purpose.",
      "Welcome. I trust you will follow regulations.",
      "Hello. Let us proceed with efficiency.",
    ],
    systemStyle: "Formal, logical, strict but fair.",
  },
  {
    name: "Caleb",
    avatarUrl: "https://via.placeholder.com/128?text=Caleb",
    traits: {
      humor: 8,
      warmth: 7,
      discipline: 5,
    },
    likes: ["jokes", "games", "hanging out"],
    dislikes: ["boredom", "being ignored"],
    openers: [
      "Yo! What's up?",
      "Hey! Wanna hang out?",
      "Sup? Ready for some fun?",
    ],
    systemStyle: "Casual, playful, supportive friend.",
  },
];

const scenarios = [
  {
    prompt: "You find a strange device in the forest. What do you do?",
    options: [
      "Pick it up immediately",
      "Observe it from a distance",
      "Call for help",
      "Run away",
    ],
    correctIndex: 1, // Observe from distance
    host: "Glordon",
    tags: ["safety", "decision"],
    enabled: true,
    createdAt: new Date(),
  },
  {
    prompt: "Your friend is feeling sad. How do you cheer them up?",
    options: [
      "Tell them a joke",
      "Give them space",
      "Listen to them",
      "Distract them with games",
    ],
    correctIndex: 2, // Listen
    host: "Elio",
    tags: ["friendship", "empathy"],
    enabled: true,
    createdAt: new Date(),
  },
  {
    prompt: "You see someone being bullied. What do you do?",
    options: [
      "Join the crowd",
      "Ignore it",
      "Stand up for them",
      "Tell a teacher",
    ],
    correctIndex: 2, // Stand up
    host: "Caleb",
    tags: ["courage", "kindness"],
    enabled: true,
    createdAt: new Date(),
  },
];

async function seed() {
  try {
    console.log("🌱 Seeding personas and scenarios...");

    const db = await connectDB();

    // Seed personas
    console.log("\n📝 Seeding personas...");
    let personaCount = 0;
    for (const persona of personas) {
      const existing = await db
        .collection("personas")
        .findOne({ name: persona.name });
      if (existing) {
        console.log(`⚠️  ${persona.name} already exists, skipping`);
      } else {
        await db.collection("personas").insertOne(persona);
        console.log(`✅ Added persona: ${persona.name}`);
        personaCount++;
      }
    }

    // Seed scenarios
    console.log("\n📝 Seeding scenarios...");
    let scenarioCount = 0;
    for (const scenario of scenarios) {
      const existing = await db
        .collection("scenarios")
        .findOne({ prompt: scenario.prompt });
      if (existing) {
        console.log(
          `⚠️  Scenario "${scenario.prompt.slice(
            0,
            30
          )}..." already exists, skipping`
        );
      } else {
        await db.collection("scenarios").insertOne(scenario);
        console.log(`✅ Added scenario: "${scenario.prompt.slice(0, 40)}..."`);
        scenarioCount++;
      }
    }

    console.log(`\n🎉 Seeding complete!`);
    console.log(`   Personas added: ${personaCount}/${personas.length}`);
    console.log(`   Scenarios added: ${scenarioCount}/${scenarios.length}`);

    await closeDB();
    process.exit(0);
  } catch (error) {
    console.error("❌ Seeding failed:", error.message);
    process.exit(1);
  }
}

seed();
=======
import { MongoClient } from "mongodb";
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || "mongodb+srv://communiverse_user:elioversebot@cluster0.1s3kk.mongodb.net/communiverse_bot?retryWrites=true&w=majority&appName=communiverse";
const DB_NAME   = process.env.DB_NAME  || "communiverse_bot";

function ok(data){return{ok:true,data}};function err(code,message,cause){return{ok:false,error:{code,message,cause}}}

async function main(){
  const client = new MongoClient(MONGO_URI);
  try{
    await client.connect();
    const db = client.db(DB_NAME);
    const col = db.collection("personas");

    const file = path.resolve("data/personas.json");
    const { personas } = JSON.parse(fs.readFileSync(file,"utf-8"));

    // bulk upsert (robust counters across driver versions)
    const ops = personas.map(p => ({
      updateOne: {
        filter: { name: p.name },
        update: {
          $set: {
            name: p.name,
            avatar: p.avatar,
            color: p.color,
            traits: p.traits,
            likes: p.likes,
            dislikes: p.dislikes,
            openers: p.openers,
            actions: p.actions,
            enabled: p.enabled !== false,
            updatedAt: new Date()
          },
          $setOnInsert: { createdAt: new Date() }
        },
        upsert: true
      }
    }));

    const res = await col.bulkWrite(ops, { ordered: false });
    const after = await col.countDocuments({});
    console.log(`[JOB] personas bulk result: upserted=${res.upsertedCount||0} modified=${res.modifiedCount||0} matched=${res.matchedCount||0}`);
    console.log(`[JOB] personas total in DB: ${after}`);
    return ok({ total: after });
  }catch(e){
    console.error("[ERR] seed-personas failed", e);
    return err("DB_ERROR","Failed to seed personas",e);
  }finally{
    await client.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then(x => process.exit(x.ok?0:1));
}
>>>>>>> 8e08c6071dd76d67fb7ab80ef3afdfe83828445a
