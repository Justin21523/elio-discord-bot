// MongoDB initialization script
// Executed once on first container start

db = db.getSiblingDB("communiverse_bot");

// Create application user (read/write access only to communiverse_bot DB)
db.createUser({
  user: "bot_user",
  pwd: "bot_password_changeme",
  roles: [
    {
      role: "readWrite",
      db: "communiverse_bot",
    },
  ],
});

print(
  '✅ MongoDB initialization complete: User "bot_user" created for database "communiverse_bot"'
);
