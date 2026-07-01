const fs = require("node:fs");
const path = require("node:path");

const outDir = path.join(__dirname, "..", "build");
const iconPng = path.join(outDir, "icon.png");
const iconIco = path.join(outDir, "icon.ico");

fs.mkdirSync(outDir, { recursive: true });

if (!fs.existsSync(iconPng)) throw new Error("Create build/icon.png before running this script.");

const pngBytes = fs.readFileSync(iconPng);
const { width, height } = assertPng(pngBytes, iconPng);
if (width !== height) throw new Error(`Icon PNG must be square. Got ${width}x${height}.`);

const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(1, 4);

const entry = Buffer.alloc(16);
entry[0] = width >= 256 ? 0 : width;
entry[1] = height >= 256 ? 0 : height;
entry[2] = 0;
entry[3] = 0;
entry.writeUInt16LE(1, 4);
entry.writeUInt16LE(32, 6);
entry.writeUInt32LE(pngBytes.length, 8);
entry.writeUInt32LE(header.length + entry.length, 12);

fs.writeFileSync(iconIco, Buffer.concat([header, entry, pngBytes]));

function assertPng(bytes, filePath) {
  const signature = "89504e470d0a1a0a";
  if (bytes.length < 24 || bytes.subarray(0, 8).toString("hex") !== signature) {
    throw new Error(`${filePath} is not a PNG file.`);
  }
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  return { width, height };
}
