#!/usr/bin/env node

import dedent from "dedent";
import { globby } from "globby";
import meow from "meow";
import path from "path";
import { loadJsonFile } from "load-json-file";
import { spawnSync } from "child_process";
import compareVersions from "compare-versions";
import editJsonFile from "edit-json-file";

const cli = meow(
  dedent`Usage
          $ lerna-update-versions-from-package`,
  { importMeta: import.meta }
);

function error(msg) {
  console.error(`Error: ${msg}`);
  process.exit(1);
}

// main
(async () => {
  let lerna;

  try {
    lerna = await loadJsonFile(path.resolve("lerna.json"));
  } catch (error) {
    return error("No readable 'lerna.json' file found");
  }

  if (!lerna?.packages) {
    return error("No 'packages' field specified in 'lerna.json' file");
  }

  const paths = await globby(lerna.packages, { onlyDirectories: true });
  const packages = paths.map((p) => path.resolve(p, "package.json"));

  for (const p of packages) {
    const file = editJsonFile(p, { stringify_eol: true });

    const packageName = file.get("name");
    const packageVersion = file.get("version");

    const npmVersion = getNewestNpmDistTag(packageName);

    if (compareVersions.compare(npmVersion, packageVersion, ">")) {
      // if newest if newer than in file, it might have been lost during a CI event
      console.log(`Updating ${packageName} to ${npmVersion}`);
      file.set("version", npmVersion);
      file.save();
    } else {
      // npm is the same or older, don't do anything
      console.log(
        `Skipping ${packageName} (package.json@${packageVersion} npm@${npmVersion})`
      );
    }
  }
})();

function getNewestNpmDistTag(packageName) {
  const child = spawnSync("npm", ["dist-tags", packageName, "--parseable"]);
  if (child.error) {
    return error(`Running 'npm dist-tags' didn't work for '${packageName}'`);
  }
  return child.stdout
    .toString()
    .trim()
    .split("\n")
    .map((s) => s.split(" ")[1])
    .sort(compareVersions)
    .pop();
}
