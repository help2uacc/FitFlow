(process.env as Record<string, string>).NODE_ENV = "test";
process.env.AI_PROVIDER = "mock";
process.env.DATABASE_PATH = ":memory:";
process.env.STORAGE_DIR = process.env.STORAGE_DIR ?? "./storage-test";
process.env.APP_URL = "http://localhost:3000";
