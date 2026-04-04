import { createApp } from "./server.js";

const port = Number(process.env.PORT ?? process.env.API_PORT ?? 3001);
const app = createApp();

app.listen(port, () => {
  console.log(`ConfiAnalyzer API server listening on port ${port}`);
});
