const mongoose = require('mongoose');

const DB_URI = process.env.DATABASE;

const connectDB = async () => {
  if (!DB_URI) {
    console.error('MongoDB connection string (DB) is not set in environment variables');
    process.exit(1);
  }

  try {
    const conn = await mongoose.connect(DB_URI);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
    return conn;
  } catch (err) {
    console.error('Failed to connect to MongoDB', err);
    process.exit(1);
  }
};

module.exports = connectDB;
module.exports.DB_URI = DB_URI;