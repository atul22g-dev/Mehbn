const mongoose = require("mongoose");

mongoose.set("strictQuery", true);

const MONGODB_URI = process.env.DATABASE;

if (!MONGODB_URI) {
  console.error("❌ DATABASE environment variable is not set on Vercel");
}

/**
 * Global cache for serverless function warm starts.
 * On Vercel, global variables persist across warm invocations
 * but reset on cold starts. This prevents reconnecting on every request.
 */
let cached = global._mongooseConnection;

if (!cached) {
  cached = global._mongooseConnection = { conn: null, promise: null };
}

/**
 * Returns a cached MongoDB connection, or establishes a new one.
 * - On warm invocations: returns the existing connection immediately
 * - On cold start: initiates a connection and caches it
 * - On failure: resets the cache so the next call retries
 */
async function connectDB() {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    cached.promise = mongoose
      .connect(MONGODB_URI, {
        bufferCommands: false,
      })
      .then((mongooseInstance) => {
        console.log(
          `✅ MongoDB connected: ${mongooseInstance.connection.host}`
        );
        cached.conn = mongooseInstance;
        return mongooseInstance;
      })
      .catch((err) => {
        console.error(`❌ MongoDB connection error: ${err.message}`);
        cached.promise = null; // Reset so the next call retries
        throw err;
      });
  }

  return cached.promise;
}

module.exports = connectDB;
