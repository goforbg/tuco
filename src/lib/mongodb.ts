import { MongoClient, Db } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB = process.env.MONGODB_DB || 'tuco-ai';

if (!MONGODB_URI) {
  console.warn('MONGODB_URI not defined, using dummy URI for build');
}

/**
 * Global is used here to maintain a cached connection across hot reloads
 * in development. This prevents connections growing exponentially
 * during API Route usage.
 */
let cached = global.mongo;

if (!cached) {
  cached = global.mongo = { conn: null, promise: null };
}

async function connectDB(): Promise<{ client: MongoClient; db: Db }> {
  // During build time, return a mock connection to prevent build failures
  if (process.env.NODE_ENV === 'production' && !MONGODB_URI) {
    throw new Error('MONGODB_URI is required in production');
  }

  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    };

    const uri = MONGODB_URI || 'mongodb://localhost:27017/tuco-ai';
    cached.promise = MongoClient.connect(uri, opts).then((client) => {
      return {
        client,
        db: client.db(MONGODB_DB),
      };
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }

  return cached.conn;
}

export default connectDB;
