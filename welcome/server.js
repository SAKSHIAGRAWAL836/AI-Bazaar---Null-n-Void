// server.js
const express = require("express");
const path = require("path");
const bodyParser = require("body-parser");

const app = express();
const PORT = 3000;

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static("public")); // Serves index.html, style.css, etc.

// POST: Launch Tool
app.post("/launch", (req, res) => {
  const { name, description, category, price } = req.body;
  console.log("🛠️ Tool Launched:", { name, description, category, price });
  res.send({ success: true, message: `✅ Tool '${name}' launched at $${price}!` });
});

// POST: User Feedback
app.post("/feedback", (req, res) => {
  const { feedback } = req.body;
  console.log("💬 Feedback Received:", feedback);
  res.send({ success: true, message: "✅ Feedback submitted successfully!" });
});

// Start Server
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
