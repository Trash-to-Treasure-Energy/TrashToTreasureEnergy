import express from 'express';
import * as gpt4allPkg from 'gpt4all';
import fs from 'fs/promises';
import cookieParser from 'cookie-parser';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = 3000;

// Middleware
app.use(express.json());
app.use(express.static('public'));
app.use(cookieParser());

// gpt4all binding (be flexible with exports)
const GPT4All = gpt4allPkg.GPT4All || gpt4allPkg.default || gpt4allPkg;

let modelInstance = null;
let modelReady = false;

const modelsDir = path.join(__dirname, 'models');
const dataDir = path.join(__dirname, 'data');
const usersFile = path.join(dataDir, 'users.json');

async function ensureDataFile() {
    try {
        await fs.mkdir(dataDir, { recursive: true });
        try {
            await fs.access(usersFile);
        } catch (e) {
            await fs.writeFile(usersFile, JSON.stringify([] , null, 2));
        }
    } catch (err) {
        console.error('Failed to ensure data file:', err);
    }
}

async function loadUsers() {
    try {
        await ensureDataFile();
        const raw = await fs.readFile(usersFile, 'utf8');
        return JSON.parse(raw || '[]');
    } catch (err) {
        console.error('Error loading users:', err);
        return [];
    }
}

async function saveUsers(users) {
    try {
        await ensureDataFile();
        await fs.writeFile(usersFile, JSON.stringify(users, null, 2));
    } catch (err) {
        console.error('Error saving users:', err);
    }
}

function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

async function getCurrentUser(req) {
    const id = req.cookies?.userId;
    if (!id) return null;
    const users = await loadUsers();
    return users.find((u) => String(u.id) === String(id)) || null;
}

function delay(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

async function findModelFile() {
    try {
        const files = await fs.readdir(modelsDir);
        // pick first file with common model extensions
        const candidate = files.find((f) => /\.(gguf|bin|safetensors|pth|pt)$/i.test(f));
        if (candidate) return path.join(modelsDir, candidate);
    } catch (err) {
        // directory might not exist yet
    }
    return null;
}

async function waitForModelFile(pollMs = 2000) {
    console.log('Waiting for model file in', modelsDir);
    for (;;) {
        const file = await findModelFile();
        if (file) return file;
        await delay(pollMs);
    }
}

async function tryInitModel(modelPath) {
    try {
        console.log('Initializing GPT4All with model:', modelPath);
        // Try instantiation patterns used by different Node bindings
        let inst = null;

        try {
            // Some bindings accept the model path in the constructor
            inst = new GPT4All(modelPath);
        } catch (e) {
            // fallback: parameterless constructor
            try {
                inst = new GPT4All();
            } catch (e2) {
                inst = null;
            }
        }

        if (!inst) throw new Error('Unable to construct GPT4All model instance');

        // Common init methods across bindings
        if (typeof inst.init === 'function') {
            await inst.init();
        } else if (typeof inst.load === 'function') {
            // some bindings: inst.load(modelPath) or inst.load(modelName, {modelPath})
            try {
                await inst.load(modelPath);
            } catch (e) {
                // try second signature
                await inst.load(path.basename(modelPath), { modelPath: path.dirname(modelPath) });
            }
        } else if (typeof inst.open === 'function') {
            await inst.open(modelPath);
        }

        modelInstance = inst;
        modelReady = true;
        console.log('GPT4All model ready');
    } catch (err) {
        console.error('Failed to initialize model:', err);
        modelInstance = null;
        modelReady = false;
    }
}

async function loadModelWatcher() {
    const modelFile = await waitForModelFile();
    await tryInitModel(modelFile);
}

// Start background model watcher (non-blocking)
loadModelWatcher();

// Helper to get a reply from the model. Tries common method names and normalizes output.
async function generateReply(prompt) {
    if (!modelInstance) throw new Error('Model not initialized');

    // Try common inference method names
    const tryCalls = [
        'prompt',
        'generate',
        'call',
        'chat',
        'predict',
        'ask',
        'completion',
    ];

    for (const name of tryCalls) {
        if (typeof modelInstance[name] === 'function') {
            const result = await modelInstance[name](prompt);
            if (typeof result === 'string') return result;
            if (result == null) continue;
            // try to extract text
            if (typeof result.text === 'string') return result.text;
            if (typeof result.output === 'string') return result.output;
            if (Array.isArray(result) && result.length > 0) return String(result[0]);
            // otherwise stringify
            return String(result);
        }
    }

    // Some bindings expose a `generate` that returns an object with `choices` like OpenAI style
    if (typeof modelInstance.generate === 'function') {
        const r = await modelInstance.generate(prompt);
        if (r && typeof r === 'object') {
            if (Array.isArray(r.choices) && r.choices[0] && r.choices[0].text) return r.choices[0].text;
            if (r.text) return r.text;
        }
        return String(r);
    }

    throw new Error('No supported inference method found on model instance');
}

// Chat endpoint
// Auth endpoints
app.post('/signup', async (req, res) => {
    const { username, password, email } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'username and password required' });
    
    // Validate email if provided
    if (email && !email.includes('@')) return res.status(400).json({ error: 'invalid email format' });
    
    const users = await loadUsers();
    if (users.find((u) => u.username === username)) return res.status(409).json({ error: 'username taken' });
    if (email && users.find((u) => u.email === email)) return res.status(409).json({ error: 'email already registered' });
    
    const id = Date.now() + Math.floor(Math.random() * 10000);
    const user = { 
        id, 
        username, 
        email, // this will be undefined if not provided
        passwordHash: hashPassword(password), 
        createdAt: new Date().toISOString(), 
        data: { history: [] } 
    };
    users.push(user);
    await saveUsers(users);
    res.cookie('userId', id, { httpOnly: true });
    res.json({ ok: true, user: { id, username, email } });
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'username and password required' });
    const users = await loadUsers();
    const user = users.find((u) => u.username === username && u.passwordHash === hashPassword(password));
    if (!user) return res.status(401).json({ error: 'invalid credentials' });
    res.cookie('userId', user.id, { httpOnly: true });
    res.json({ ok: true, user: { id: user.id, username: user.username } });
});

app.post('/logout', (req, res) => {
    res.clearCookie('userId');
    res.json({ ok: true });
});

// Chat endpoint (requires auth)
app.post('/chat', async (req, res) => {
    const user = await getCurrentUser(req);
    if (!user) return res.status(401).json({ error: 'authentication required' });
    if (!modelReady) return res.status(503).json({ error: 'Model not loaded yet' });

    const { message } = req.body;
    if (!message || typeof message !== 'string') return res.status(400).json({ error: 'Message is required' });

    try {
        const reply = await generateReply(message);
        // persist to user history
        const users = await loadUsers();
        const found = users.find((u) => String(u.id) === String(user.id));
        if (found) {
            found.data = found.data || {};
            found.data.history = found.data.history || [];
            found.data.history.push({ prompt: message, reply, t: new Date().toISOString() });
            // keep last 200 entries
            if (found.data.history.length > 200) found.data.history = found.data.history.slice(-200);
            await saveUsers(users);
        }
        res.json({ reply });
    } catch (err) {
        console.error('Error generating reply:', err);
        res.status(500).json({ error: 'Failed to generate reply' });
    }
});

// Simple health endpoint
app.get('/health', (req, res) => {
    res.json({ ok: true, modelReady });
});

// Current user
app.get('/me', async (req, res) => {
    const user = await getCurrentUser(req);
    if (!user) return res.json({ user: null });
    res.json({ 
        user: { 
            id: user.id, 
            username: user.username,
            email: user.email // will be undefined if not set
        } 
    });
});

// Start server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    console.log('Static files served from /public');
});
