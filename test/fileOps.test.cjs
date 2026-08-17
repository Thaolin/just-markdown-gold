const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { writeFileAtomic } = require("../electron/fileOps.cjs");

test("writeFileAtomic replaces an existing document without temp residue", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "markdown-editor-file-ops-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));

  const documentPath = path.join(directory, "document.md");
  await fs.writeFile(documentPath, "original", "utf8");
  await writeFileAtomic(documentPath, "replacement");

  assert.equal(await fs.readFile(documentPath, "utf8"), "replacement");
  assert.deepEqual(await fs.readdir(directory), ["document.md"]);
});

test("writeFileAtomic preserves existing Unix document permissions", async (t) => {
  if (process.platform === "win32") return;
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "markdown-editor-file-ops-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));

  const documentPath = path.join(directory, "private.md");
  await fs.writeFile(documentPath, "original", { encoding: "utf8", mode: 0o640 });
  await fs.chmod(documentPath, 0o640);
  await writeFileAtomic(documentPath, "replacement");

  assert.equal((await fs.stat(documentPath)).mode & 0o777, 0o640);
});

test("writeFileAtomic preserves a symlink while updating its target", async (t) => {
  if (process.platform === "win32") {
    t.skip("Windows symlink creation requires an elevated test environment");
    return;
  }
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "markdown-editor-file-ops-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));

  const documentPath = path.join(directory, "document.md");
  const linkPath = path.join(directory, "document-link.md");
  await fs.writeFile(documentPath, "original", "utf8");
  await fs.symlink(documentPath, linkPath);
  await writeFileAtomic(linkPath, "replacement");

  assert.equal((await fs.lstat(linkPath)).isSymbolicLink(), true);
  assert.equal(await fs.readFile(linkPath, "utf8"), "replacement");
  assert.equal(await fs.readFile(documentPath, "utf8"), "replacement");
});

test("writeFileAtomic returns a canonical path for a new file under a symlinked directory", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "markdown-editor-file-ops-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));

  const realDirectory = path.join(directory, "real-documents");
  const linkedDirectory = path.join(directory, "linked-documents");
  const expectedPath = path.join(realDirectory, "new.md");
  await fs.mkdir(realDirectory);
  await fs.symlink(realDirectory, linkedDirectory, process.platform === "win32" ? "junction" : "dir");

  const savedPath = await writeFileAtomic(path.join(linkedDirectory, "new.md"), "replacement");
  const savedAgainPath = await writeFileAtomic(path.join(linkedDirectory, "new.md"), "replacement again");

  assert.equal(savedPath, expectedPath);
  assert.equal(savedAgainPath, expectedPath);
  assert.equal(await fs.readFile(expectedPath, "utf8"), "replacement again");
});
