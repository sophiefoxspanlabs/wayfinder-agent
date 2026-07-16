import "dotenv/config";
import express from "express";
import cors from "cors";
import { runAgent } from "./agent.js";

const app = express();
const port = Number(process.env.PORT ?? 3001);

app.use(cors());
app.use(express.json());

app.get("/", (_request, response) => {
  response.send("Wayfinder Agent API");
});

app.post("/api/run", async (request, response) => {
  try {
    const { url, task } = request.body as {
      url?: string;
      task?: string;
    };

    if (!url || !task) {
      response.status(400).json({
        success: false,
        error: "Both URL and task are required.",
      });
      return;
    }

    const result = await runAgent(url, task);
    response.json(result);
  } catch (error) {
    response.status(500).json({
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Unknown server error",
    });
  }
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});