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
