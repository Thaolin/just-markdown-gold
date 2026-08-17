const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

async function resolveWriteTarget(filePath) {
  const resolved = path.resolve(filePath);
  try {
    const existing = await fs.lstat(resolved);
    if (existing.isSymbolicLink()) return fs.realpath(resolved);
    return path.join(await fs.realpath(path.dirname(resolved)), path.basename(resolved));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return path.join(await fs.realpath(path.dirname(resolved)), path.basename(resolved));
  }
}

async function writeFileAtomic(filePath, content, encoding = "utf8") {
  const targetPath = await resolveWriteTarget(filePath);

  const tempPath = path.join(
    path.dirname(targetPath),
    `.${path.basename(targetPath)}.${process.pid}.${randomUUID()}.tmp`,
  );
  let handle;
  let replaced = false;
  let mode = 0o600;

  try {
    try {
      mode = (await fs.stat(targetPath)).mode & 0o777;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    handle = await fs.open(tempPath, "wx", mode);
    await handle.writeFile(content, encoding);
    await handle.sync();
    await handle.close();
    handle = null;
    await fs.rename(tempPath, targetPath);
    replaced = true;
    return targetPath;
  } finally {
    await handle?.close().catch(() => {});
    if (!replaced) await fs.unlink(tempPath).catch(() => {});
  }
}

module.exports = { writeFileAtomic };
