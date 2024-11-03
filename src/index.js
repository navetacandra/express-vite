const express = require('express');
const compression = require('compression');
const { createHash } = require('crypto');
const { createReadStream, existsSync } = require('fs');
const { resolve, join } = require('path');
const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(compression({ level: 9 }));

const CONFIG_PATH = resolve(__dirname, '..', 'config.json');
const DEFAULT_CONFIG = {
  root: '.',
  frontend: { build_command: "npm run build", root: 'client', dist: 'dist' }
};

// Load configuration from config.json if available; otherwise, use defaults
function loadConfig() {
  return existsSync(CONFIG_PATH) ? require(CONFIG_PATH) : DEFAULT_CONFIG;
}

const config = loadConfig();
const distPath = resolve(join(__dirname, '..', config.root, config.frontend.root, config.frontend.dist));

async function handleFileCache(req, res, filepath) {
  const hash = createHash('md5');
  const stream = createReadStream(filepath);

  stream.on('data', (chunk) => hash.update(chunk));
  stream.on('end', async () => {
    const etag = hash.digest('hex');
    res.setHeader("Cache-Control", "public, max-age=31536000");
    res.setHeader("ETag", etag);

    if (req.headers['if-none-match'] === etag) {
      res.status(304).end();
    } else {
      res.sendFile(filepath);
    }
  });
  stream.on('error', () => res.status(500).send());
}

app.get('/*',  (req, res) => {
  let filepath = req.path.slice(1);
  filepath = !!filepath ? filepath : 'index.html';
  let absolutePath = resolve(join(distPath, filepath));

  if(!existsSync(absolutePath)) {
    if(filepath === 'index.html') {
      return res.status(404).send('<h1 style="text-align: center">Not Found</h1>');
    }
    absolutePath = resolve(join(distPath, 'index.html'));
  }
  handleFileCache(req, res, absolutePath);
});

app.listen(3000, () => console.log('Server running on port 3000'));
