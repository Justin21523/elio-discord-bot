import "dotenv/config";
import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
const dbName = process.env.DB_NAME || "communiverse_bot";

const samples = [
  {
    type: "gif",
    url: "https://media.giphy.com/media/Ju7l5y9osyymQ/giphy.gif",
    tags: ["funny"],
    nsfw: false,
    enabled: true,
    addedAt: new Date(),
  },
  {
    type: "image",
    url: "https://i.imgur.com/8Km9tLL.jpg",
    tags: ["cat"],
    nsfw: false,
    enabled: true,
    addedAt: new Date(),
  },
  {
    type: "gif",
    url: "https://media.giphy.com/media/l0HlNQ03J5JxX6lva/giphy.gif",
    tags: ["meme"],
    nsfw: true,
    enabled: true,
    addedAt: new Date(),
  },
];

async function main() {
  const client = new MongoClient(uri, {
    directConnection: true,
    serverSelectionTimeoutMS: 5000,
  });
  await client.connect();
  const db = client.db(dbName);
  const media = db.collection("media");

  const { acknowledged } = await media.insertMany(samples);
  console.log("[INT] Seed inserted:", acknowledged ? samples.length : 0);

  const total = await media.countDocuments({});
  const safe = await media.countDocuments({
    enabled: true,
    nsfw: { $ne: true },
  });
  const nsfw = await media.countDocuments({ enabled: true, nsfw: true });
  console.log(
    "[INT] media totals => all:",
    total,
    "safe:",
    safe,
    "nsfw:",
    nsfw
  );

  await client.close();
}

main().catch((e) => {
  console.error("[ERR] Seed failed:", e);
  process.exit(1);
});
