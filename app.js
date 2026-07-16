require('dotenv').config();
const express = require("express");
const path = require("path");
const app = express();
const mongoose = require("mongoose");

const PORT = process.env.PORT || 3000;

// Database Connection (serverless-ready with global caching)
const connectDB = require("./Database/db_conn");
const Contact = require('./model/Contact');

// Set static folder
app.use("/static", express.static("static")); // For serving static files
app.use(express.urlencoded());

// Set views folder
app.set("view engine", "hbs"); // Set the template engine as hbs
app.set("views", path.join(__dirname, "views")); // Set the views directory

// Set partials folder
var hbs = require("hbs");
const { cronAuth } = require('./middleware/auth.middleware');
hbs.registerPartials(__dirname + "/views/partials", function (err) {});


/**
 * Wait for a connecting connection to resolve to either connected or disconnected.
 * Returns false if disconnected/timed out, true if connected.
 */
function waitForConnection(timeoutMs = 8000) {
  const readyState = mongoose.connection.readyState;
  // Already connected
  if (readyState === 1) return Promise.resolve(true);
  // Not in a connecting state — won't become connected
  if (readyState !== 2) return Promise.resolve(false);

  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        cleanup();
        resolve(mongoose.connection.readyState === 1);
      }
    }, timeoutMs);

    const onConnected = () => {
      if (!settled) {
        settled = true;
        cleanup();
        resolve(true);
      }
    };
    const onDisconnected = () => {
      if (!settled) {
        settled = true;
        cleanup();
        resolve(false);
      }
    };

    const cleanup = () => {
      clearTimeout(timer);
      mongoose.connection.removeListener('connected', onConnected);
      mongoose.connection.removeListener('disconnected', onDisconnected);
    };

    mongoose.connection.once('connected', onConnected);
    mongoose.connection.once('disconnected', onDisconnected);
  });
}

// Database status endpoint
app.get('/api/status', async (_req, res, next) => {
  await connectDB();
  try {
    const states = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting',
    };

    let dbState = mongoose.connection.readyState;

    // If connecting, wait to see if it becomes connected or disconnected
    if (dbState === 2) {
      const becameConnected = await waitForConnection();
      // Re-check state after wait
      dbState = becameConnected ? 1 : mongoose.connection.readyState;
    }

    // If still not connected after waiting (or was disconnected/disconnecting), return 503
    if (dbState !== 1) {
      return res.status(503).json({
        status: 'error',
        message: 'Database is not connected',
        data: {
          database: states[dbState] || 'unknown',
          uptime: process.uptime(),
          uptime_hours: (process.uptime() / 3600).toFixed(2),
        },
      });
    }

    // Ping is lightweight and fast — replaces expensive serverStatus()
    const pingResult = await mongoose.connection.db
      .admin()
      .ping();

    const dbName = mongoose.connection.db.databaseName;

    // Stats with a 3-second timeout using Promise.race
    const statsPromise = mongoose.connection.db.stats();
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('stats timed out')), 3000)
    );
    const stats = await Promise.race([statsPromise, timeoutPromise]).catch(
      () => null
    );

    res.json({
      status: 'success',
      message: 'Server is running',
      data: {
        database: states[dbState],
        db_Name: dbName,
        ping: pingResult.ok === 1 ? 'ok' : 'fail',
        uptime: process.uptime(),
        uptime_hours: (process.uptime() / 3600).toFixed(2),
        collections: stats?.collections ?? null,
        documents: stats?.objects ?? null,
        indexes: stats?.indexes ?? null,
        data_size: stats?.dataSize
          ? (stats.dataSize / 1024 / 1024).toFixed(2) + ' MB'
          : null,
        storage_size: stats?.storageSize
          ? (stats.storageSize / 1024 / 1024).toFixed(2) + ' MB'
          : null,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── MongoDB Connection CronJob ─────────────────────────────────────────────────────

app.get("/api/db-heartbeat", cronAuth, async (req, res) => {
  try {
    // Ensure MongoDB connection is established (uses global cache on warm starts)
    await connectDB();

    await mongoose.connection.db
      .collection("heartbeat")
      .updateOne(
        { _id: "heartbeat" },
        { $set: { lastRun: new Date() } },
        { upsert: true }
      );

    res.json({
      success: true,
      message: "Heartbeat updated"
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: "Heartbeat not updated",
      messages: err.message
    });
  }
});


app.get("/", (req, res) => {
  res.status(200).render("index");
});

app.get("/about", (req, res) => {
  res.status(200).render("about");
});

app.get("/contact", (req, res) => {
  res.status(200).render("contact");
});

// Post ENDPOINTS
app.post("/contact", (req, res) => {
  var myData = new Contact(req.body);
  myData
    .save()
    .then(() => {
      res.send("This item has been saved to the database");
    })
    .catch(() => {
      res.status(400).send("Item was not saved to the database");
    });
});

// START THE SERVER
app.listen(PORT, () => {
  console.log(
    `The application started successfully on port http://localhost:${PORT}`
  );
});
