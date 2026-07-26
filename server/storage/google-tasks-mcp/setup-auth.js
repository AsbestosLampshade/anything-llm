#!/usr/bin/env node

import { readFileSync, writeFileSync, existsSync } from "fs";
import http from "http";
import { google } from "googleapis";
import path from "path";
import { fileURLToPath } from "url";
import { exec } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CREDS_DIR = path.join(__dirname, "credentials");
const CREDENTIALS_PATH = path.join(CREDS_DIR, "credentials.json");
const TOKEN_PATH = path.join(CREDS_DIR, "token.json");
const PORT = 3000;
const REDIRECT_URI = `http://localhost:${PORT}`;

if (!existsSync(CREDENTIALS_PATH)) {
  console.error("No credentials.json found at " + CREDENTIALS_PATH);
  console.error("");
  console.error("Setup instructions:");
  console.error("1. Go to https://console.cloud.google.com/apis/credentials");
  console.error("2. Create an OAuth 2.0 Client ID (Desktop application type)");
  console.error("3. Download the JSON and save it as:");
  console.error("   " + CREDENTIALS_PATH);
  console.error("4. Run this script again");
  process.exit(1);
}

const credentials = JSON.parse(readFileSync(CREDENTIALS_PATH, "utf-8"));
const { client_id, client_secret } = credentials.installed || credentials.web;

const oauth2Client = new google.auth.OAuth2(client_id, client_secret, REDIRECT_URI);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: "offline",
  scope: ["https://www.googleapis.com/auth/tasks"],
  prompt: "consent"
});

console.log("Opening browser for Google authorization...");
console.log("");
console.log("If the browser doesn't open, visit this URL:");
console.log(authUrl);
console.log("");

exec(`xdg-open "${authUrl}"`);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, REDIRECT_URI);
  const code = url.searchParams.get("code");

  if (code) {
    try {
      const { tokens } = await oauth2Client.getToken(code);
      writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
      console.log("Authorization successful! Token saved to " + TOKEN_PATH);
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end("<h2>Authorization successful!</h2><p>You can close this window.</p>");
      server.close();
      process.exit(0);
    } catch (e) {
      console.error("Token exchange failed:", e.message);
      res.writeHead(500, { "Content-Type": "text/html" });
      res.end("<h2>Authorization failed</h2><p>" + e.message + "</p>");
      server.close();
      process.exit(1);
    }
  } else {
    res.writeHead(400, { "Content-Type": "text/html" });
    res.end("<h2>No authorization code received</h2>");
  }
});

server.listen(PORT, () => {
  console.log("Waiting for authorization callback on " + REDIRECT_URI + " ...");
});
