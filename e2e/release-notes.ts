import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

export const APP_VERSION: string = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "..", "package.json"), "utf-8")
).version;

export const RELEASE_NOTE_ITEMS = [
  "Release notes are shown once after updating",
  "Turn them off with Don't show again",
];

export const RELEASE_NOTES = RELEASE_NOTE_ITEMS.map((item) => `- ${item}`).join("\n");
