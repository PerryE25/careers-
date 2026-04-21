import { createApp } from "./api/app.js";
import { env } from "./config/env.js";
const app = createApp();
app.listen(env.port, () => {
    console.log(`CareerCopilot backend listening on http://localhost:${env.port}`);
});
