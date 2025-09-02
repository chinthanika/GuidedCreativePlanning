// servers/profilemanager_server.js
import express from "express";
import bodyParser from "body-parser";
import ConfirmDenyPipeline from "../services/ConfirmDenyPipeline.js";

const app = express();
app.use(bodyParser.json());

/**
 * Stage a change
 */
app.post("/api/stage-change", async (req, res) => {
  try {
    const { userId, entityType, entityId, newData } = req.body;
    const pipeline = new ConfirmDenyPipeline({ uid: userId });
    const staged = await pipeline.stageChange(entityType, entityId, newData);
    res.status(200).json(staged);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Confirm a change
 */
app.post("/api/confirm-change", async (req, res) => {
  try {
    const { userId, changeRequest } = req.body;
    const pipeline = new ConfirmDenyPipeline({ uid: userId });
    const confirmed = await pipeline.confirm(changeRequest);
    res.status(200).json(confirmed);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Deny a change
 */
app.post("/api/deny-change", async (req, res) => {
  try {
    const { changeRequest } = req.body;
    const pipeline = new ConfirmDenyPipeline();
    const denied = await pipeline.deny(changeRequest);
    res.status(200).json(denied);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = 5001;
app.listen(PORT, () => {
  console.log(`Profile Manager running on port ${PORT}`);
});
