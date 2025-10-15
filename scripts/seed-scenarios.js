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
    const col = db.collection("scenarios");

    const file = path.resolve("data/scenarios.json");
    const { scenarios } = JSON.parse(fs.readFileSync(file,"utf-8"));

    const ops = scenarios.map(s => ({
      updateOne: {
        filter: { prompt: s.prompt },
        update: {
          $set: {
            prompt: s.prompt,
            options: s.options,
            correctIndex: s.correctIndex,
            tags: s.tags,
            enabled: s.enabled !== false,
            weight: typeof s.weight === "number" ? s.weight : 1,
            hostPersonaName: s.hostPersonaName || null,
            updatedAt: new Date()
          },
          $setOnInsert: { createdAt: new Date() }
        },
        upsert: true
      }
    }));

    const res = await col.bulkWrite(ops, { ordered: false });
    const after = await col.countDocuments({});
    console.log(`[JOB] scenarios bulk result: upserted=${res.upsertedCount||0} modified=${res.modifiedCount||0} matched=${res.matchedCount||0}`);
    console.log(`[JOB] scenarios total in DB: ${after}`);
    return ok({ total: after });
  }catch(e){
    console.error("[ERR] seed-scenarios failed", e);
    return err("DB_ERROR","Failed to seed scenarios",e);
  }finally{
    await client.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then(x => process.exit(x.ok?0:1));
}
