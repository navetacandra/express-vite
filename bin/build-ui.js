const { spawn } = require("child_process");
const { existsSync, readFileSync, writeFileSync, copyFileSync, readdirSync, statSync } = require("fs");
const path = require("path");

// Constants for file paths and default configuration
const CONFIG_PATH = path.resolve(__dirname, '..', 'config.json');
const DEFAULT_CONFIG = {
  root: '.',
  frontend: { build_command: "npm run build", root: 'client', dist: 'dist' }
};

// Load configuration from config.json if available; otherwise, use defaults
function loadConfig() {
  return existsSync(CONFIG_PATH) ? require(CONFIG_PATH) : DEFAULT_CONFIG;
}

const config = loadConfig();
const clientPath = path.resolve(__dirname, '..', config.root, config.frontend.root);
const distPath = path.join(clientPath, config.frontend.dist);

// Executes a shell command and returns output via a Promise
function execute(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const process = spawn(command, args, { shell: true, ...options });
    let output = "";

    // Capture stdout data
    process.stdout.on("data", (data) => (output += data));
    // Log any errors from stderr
    process.stderr.on("data", (err) => console.error(`Error: ${err}`));
    // Resolve or reject based on process exit code
    process.on("close", (code) => {
      code === 0 ? resolve(output) : reject(new Error(`Command failed with code ${code}`));
    });
  });
}

// Recursively collects all files in a directory, relative to `distPath`
function getDistItems(dirpath = distPath) {
  return readdirSync(dirpath).flatMap((item) => {
    const itemPath = path.join(dirpath, item);
    const stat = statSync(itemPath);
    // Recursively get files if directory, otherwise add file to list
    return stat.isDirectory() ? getDistItems(itemPath) : itemPath.replace(distPath, "");
  }).sort();
}

// Generates cache data array for service worker from list of files
function generateCacheData(items) {
  const cacheItems = items.map((item) => `  "${item}"`).join(",\n");
  return `const cacheData = [\n  "/sw.js",\n${cacheItems}\n];`;
}

// Updates and writes the service worker with cache data
function generateSW() {
  const items = getDistItems();
  const swTemplate = readFileSync(path.join(__dirname, "sw.template.js"), "utf8");
  const newCacheData = generateCacheData(items);
  // Replace placeholder cacheData with dynamically generated cache list
  const updatedSW = swTemplate.replace(/const cacheData = \[.*?\];/s, newCacheData);
  writeFileSync(path.join(distPath, "sw.js"), updatedSW);
}

// Injects <script> tag for the service worker and optimizes stylesheet loading in HTML
function injectServiceWorkerScript(html) {
  return html
    .replace("</title>", '</title>\n    <script src="/service-worker.js" defer></script>')
    .replace(/><\/script>/g, " defer></script>") // Add defer to script tags for async loading
    .replace(/rel="stylesheet"/g, `media="print" onload="this.media='all'" rel="stylesheet"`); // Load CSS on print, then change to all
}

// Main function to copy service worker template, modify HTML, and generate SW cache
function generateServiceWorker() {
  // Copy service worker template to dist directory
  copyFileSync(
    path.join(__dirname, "service-worker.template.js"),
    path.join(distPath, "service-worker.js")
  );

  // Read index.html, inject service worker script, and optimize stylesheets
  const htmlPath = path.join(distPath, "index.html");
  let html = readFileSync(htmlPath, "utf8");
  html = injectServiceWorkerScript(html);
  writeFileSync(htmlPath, html);

  // Generate SW cache with updated cacheData
  generateSW();
}

// Main build function
(async function main() {
  try {
    console.log("Building UI...");
    // Execute build command as defined in config
    await execute("npm", ["run", "build"], { cwd: clientPath });
    // Generate service worker and update HTML
    generateServiceWorker();
    console.log("Build completed successfully!");
  } catch (err) {
    console.error("Build failed:", err);
    process.exit(1); // Exit with error code on failure
  }
})();

