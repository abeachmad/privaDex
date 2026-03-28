import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const envPath = path.join(root, ".env");
const manifestPath = path.join(root, "contracts", "local-programs.json");

function readEnvPrograms(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  const programs = [];

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^(VITE_PROGRAM_[A-Z0-9_]+)=(.+)$/);
    if (!match) continue;
    programs.push({ key: match[1], program: match[2] });
  }

  return programs;
}

function formatCheck(filePath) {
  if (!filePath) return "missing";
  return fs.existsSync(path.join(root, filePath)) ? "ok" : "missing";
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const envPrograms = readEnvPrograms(envPath);

console.log("Active frontend program references");
console.log(`Contract root: ${manifest.contractRoot}`);
console.log("");

for (const item of envPrograms) {
  const entry = manifest.activeFrontendPrograms[item.key];

  console.log(`${item.key}`);
  console.log(`  env: ${item.program}`);

  if (!entry) {
    console.log("  local: no manifest entry");
    console.log("");
    continue;
  }

  if (entry.status === "missing_local_source") {
    console.log(`  local: ${entry.status}`);
    console.log(`  note: ${entry.note}`);
    for (const ref of entry.nearestLocalReferences || []) {
      console.log(`  ref: ${ref} [${formatCheck(ref)}]`);
    }
    console.log("");
    continue;
  }

  for (const field of ["source", "build", "metadata", "artifact"]) {
    if (entry[field]) {
      console.log(`  ${field}: ${entry[field]} [${formatCheck(entry[field])}]`);
    }
  }

  console.log("");
}

console.log("Shared local artifacts");
for (const [name, filePath] of Object.entries(manifest.sharedArtifacts || {})) {
  console.log(`  ${name}: ${filePath} [${formatCheck(filePath)}]`);
}
