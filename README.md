# My AI App (Express + GPT4All)

A minimal local web app that serves a chat UI and forwards messages to a locally loaded GPT4All model.

## Requirements

- Node.js (16+ recommended)
- npm
- A GPT4All model file (place it in the `models/` folder)

## Install

Install the Node dependencies:

```powershell
npm install
```

This will install `express` and `gpt4all`. If you want to use the dev server:

```powershell
npm install --save-dev nodemon
```

(We already add `nodemon` as a devDependency in `package.json`, so `npm install` will install it.)

## Download a GPT4All model

Go to the GPT4All releases or your preferred mirror and download a model compatible with the `gpt4all` Node package. Example filenames include:

- `gpt4all-falcon-q4_0.gguf`
- `ggml-gpt4all-j-v1.3.bin`

Place the downloaded file into the `models/` directory at the project root. The server will watch that directory and load the first file it finds with a supported extension (`.gguf`, `.bin`, `.safetensors`, `.pth`, `.pt`).

## Run the server

Start the server (production):

```powershell
npm start
```

Start the server in development mode (auto-restarts on changes):

```powershell
npm run dev
```

Open your browser to:

```
http://localhost:3000
```

## Notes

- The server polls the `models` folder and will load the model when it appears. You can start the server before or after placing the model file into `models/`.
- If the `gpt4all` package API differs from the one this project expects, tell me the installed version (`npm ls gpt4all`) and I can update `server.js` to match the library's exact API.
- Health endpoint: `GET /health` returns `{ ok: true, modelReady: boolean }`.

## Troubleshooting

- Model fails to initialize: check the server logs for the exact error. Most issues are missing native dependencies for the `gpt4all` binding or an incompatible model file.
- If you see permission errors on Windows when using PowerShell and scripts, running PowerShell as Administrator or adjusting execution policy may help for some model-install steps, but not normally required for this repository.

***

If you'd like, I can also add a small script that verifies model presence before starting, or wire up a download helper to fetch a model automatically. Let me know which option you prefer.

## PWA, deployment, and publishing under trashtotreasure.info.co.za

This project includes a basic PWA manifest (`/manifest.json`) and a minimal service worker (`/service-worker.js`). To publish the app under `trashtotreasure.info.co.za` and make it installable on phones, follow these steps:

1. Obtain a server (VPS) with a public IP (Ubuntu or Debian recommended).
2. Create DNS records for your domain (at your DNS provider):
	- Add an A record for `trashtotreasure.info.co.za` pointing to your server's IP.
3. On the VPS:
	- Install Node.js (LTS) and Git.
	- Clone this repository and run `npm install`.
	- Use a process manager such as `pm2` to run `npm start` (keeps app running across reboots).
4. Use Nginx as a reverse proxy and to obtain TLS certificates with Let's Encrypt. A simple Nginx config (replace domain/IP as needed):

```
server {
	 listen 80;
	 server_name trashtotreasure.info.co.za;
	 location / {
		  proxy_pass http://127.0.0.1:3000;
		  proxy_set_header Host $host;
		  proxy_set_header X-Real-IP $remote_addr;
		  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
		  proxy_set_header X-Forwarded-Proto $scheme;
	 }
}
```

Then run `certbot --nginx -d trashtotreasure.info.co.za` to obtain TLS certificates and enable HTTPS. Service workers require HTTPS to run in production, so this step is essential for PWA install on mobile.

5. Test the PWA:
	- Open `https://trashtotreasure.info.co.za` in Chrome or any modern browser. You should see the site and, after registering the service worker, the browser may prompt to "Add to Home screen." You can also check DevTools -> Application -> Manifest.

6. Mobile stores:
	- For the Google Play Store, you can package the PWA as a Trusted Web Activity (TWA) via Android Studio.
	- For the Apple App Store, Apple prefers native wrappers; consider using Capacitor or a thin WebView app and follow Apple's submission guidelines.

Security notes:
- For production, consider replacing the local `data/users.json` with a real database, and use bcrypt for password hashing with salts, and optional email verification.
- Always run behind HTTPS and keep your server packages updated.

If you want, I can also generate a `Dockerfile` and a sample `nginx` config file to make deployment easier — tell me which target environment you prefer (Docker, DigitalOcean droplet, AWS EC2, etc.).
