const fs = require("node:fs");
const path = require("node:path");
// Paths only. Never follow symlinks or read source/manifest contents.
function inventory(root) {
  const paths = [],
    stack = new Set();
  let visited = 0;
  const skip = new Set([
    "node_modules",
    "dist",
    "build",
    "vendor",
    "coverage",
    "target",
    "venv",
    "__pycache__",
  ]);
  function walk(relative, depth) {
    if (depth > 20)
      throw Error(
        "Project inventory exceeds the supported directory depth; no partial inventory was sent",
      );
    const dir = fs.opendirSync(path.join(root, relative));
    try {
      let entry;
      while ((entry = dir.readSync())) {
        if (++visited > 20000)
          throw Error(
            "Project inventory exceeds the scan limit; no partial inventory was sent",
          );
        const name = entry.name;
        if (
          name.startsWith(".") ||
          skip.has(name) ||
          entry.isSymbolicLink() ||
          /(secret|credential|password|token|\.env(?:\.|$)|\.(pem|key|p12|pfx)$)/i.test(
            name,
          )
        )
          continue;
        const rel = relative ? relative + "/" + name : name;
        if (entry.isDirectory()) walk(rel, depth + 1);
        else if (entry.isFile()) {
          if (rel.length > 240)
            throw Error(
              "Project contains a path longer than the supported inventory limit; no partial inventory was sent",
            );
          paths.push(rel);
          if (paths.length > 800)
            throw Error(
              "Project exceeds 800 eligible files; open a smaller project folder. No partial inventory was sent",
            );
          for (const [test, label] of [
            [/\.tsx?$|^tsconfig\.json$/, "TypeScript"],
            [/\.jsx?$|^package\.json$/, "JavaScript"],
            [/\.py$|^pyproject\.toml$/, "Python"],
            [/\.rs$|^Cargo\.toml$/, "Rust"],
            [/\.go$/, "Go"],
            [/\.java$/, "Java"],
            [/\.rb$/, "Ruby"],
            [/\.php$/, "PHP"],
          ])
            if (test.test(name)) stack.add(label);
        }
      }
    } finally {
      dir.closeSync();
    }
  }
  walk("", 0);
  return { paths: paths.sort(), stack: [...stack].sort() };
}
module.exports = { inventory };
