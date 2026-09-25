// `npm run dev` – the whole app in one terminal: the backend (backend/, port
// 4000) and the frontend (this folder, port 3000). Each line is prefixed with
// where it came from, so backend request logs (`GET /api/search 200`) and
// frontend logs stay easy to tell apart. Ctrl-C stops both.
//
// To run them in separate terminals instead: `npm run dev:backend` and `npm run dev:web`.

import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const apps = [
  { name: "backend", colour: "36", cwd: join(root, "backend"), cmd: "npm", args: ["run", "dev"] },
  { name: "web    ", colour: "35", cwd: root, cmd: "npx", args: ["next", "dev"] },
];

const children = apps.map((app) => {
  const child = spawn(app.cmd, app.args, {
    cwd: app.cwd,
    env: { ...process.env, FORCE_COLOR: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const prefix = `\x1b[${app.colour}m[${app.name}]\x1b[0m `;
  const forward = (stream) => (chunk) => {
    for (const line of String(chunk).split("\n")) if (line.trim()) stream.write(prefix + line + "\n");
  };
  child.stdout.on("data", forward(process.stdout));
  child.stderr.on("data", forward(process.stderr));
  child.on("exit", (code) => {
    // One going down takes the other with it, so a crash is never silent.
    for (const other of children) if (other !== child && other.exitCode === null) other.kill("SIGTERM");
    process.exitCode = code ?? 0;
  });
  return child;
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    for (const child of children) child.kill(signal);
  });
}
