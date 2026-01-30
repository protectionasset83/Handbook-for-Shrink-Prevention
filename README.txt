Shrink Prevention Website (Shared / Permanent Storage)

This version stores rules/codes on a SERVER so that:
- Rules persist even after closing the browser or restarting the computer.
- Anyone who visits the same link can view the same rules.

Important
- If you only open public/index.html directly (file://), the website falls back to *device-local* storage (localStorage).
  That is NOT shared across users/devices.
- For "shared forever" storage across users, you must run (or deploy) the server.

Run locally
1) Install Node.js 18+ (or 20+)
2) In this folder, run:
   npm install
   npm start
3) Open:
   http://localhost:3000

Admin password
- Default: admin123
- Change it for production by setting an environment variable:
  ADMIN_PASSWORD=yourStrongPassword npm start

Where the data is stored
- data/state.json

Sharing with other people
- When you run npm start, the server prints a "LAN" URL like:
  http://192.168.1.50:3000
  Share that link with others on the SAME network (same Wi‑Fi / same corporate network).

  If you only share http://localhost:3000, it will NOT work for other people because "localhost"
  points to THEIR computer, not yours.

  If someone cannot open the LAN link:
  - Your firewall may be blocking inbound traffic on port 3000
  - Your corporate network may block device-to-device connections
  In that case you need an approved server to host it.
- For access over the internet, deploy this server to a host that supports Node.js
  and persistent storage (or configure a database). The front-end uses relative /api paths
  so it will work automatically after deployment.

Important limitation (no-hosting scenario)
- A website opened as a local file (file://) cannot share data across different computers.
  For "everyone with the link sees the same rules" you must have SOME always-on place to
  store the shared data (server/database/cloud service). This project includes a server for that.

Notes
- Clipboard copy may require https:// or localhost in some browsers.
