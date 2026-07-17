import "dotenv/config";
import express from "express";
import cors from "cors";
import { runAgent } from "./agent.js";

const app = express();
const port = Number(process.env.PORT ?? 3001);

app.use(cors());
app.use(express.json());

function getFriendlyErrorMessage(error: unknown): string {
  const message =
    error instanceof Error ? error.message : String(error);

  if (
    message.includes("ERR_NAME_NOT_RESOLVED") ||
    message.includes("ENOTFOUND")
  ) {
    return "Couldn't reach that website. Check that the URL is correct.";
  }

  if (
    message.toLowerCase().includes("timeout") ||
    message.includes("Navigation timeout")
  ) {
    return "The website took too long to load. Please try again.";
  }

  if (
    message.includes("ERR_CONNECTION_REFUSED") ||
    message.includes("ERR_CONNECTION_RESET")
  ) {
    return "The website refused the connection or became unavailable.";
  }

  if (
    message.includes("Target page, context or browser has been closed") ||
    message.toLowerCase().includes("browser has disconnected")
  ) {
    return "The browser session ended unexpectedly. Please try again.";
  }

  return "The agent couldn't complete this task. Please try again.";
}

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
        error: "Please provide both a website URL and a task.",
      });
      return;
    }

    const result = await runAgent(url, task);
    response.json(result);
  } catch (error) {
    console.error("Agent error:", error);

    response.status(500).json({
      success: false,
      error: getFriendlyErrorMessage(error),
    });
  }
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});