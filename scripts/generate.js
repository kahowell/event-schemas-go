const {
  quicktypeMultiFile,
  InputData,
  JSONSchemaInput,
  JSONSchemaStore,
} = require("quicktype-core");
const { execSync } = require("child_process");
const fsPromises = require("fs/promises");
const fs = require("fs");
const path = require("path");
const { chdir } = require("process");

class StaticJSONSchemaStore extends JSONSchemaStore {
  constructor() {
    super();
  }
  async fetch(address) {
    const contents = await fsPromises.readFile(address);
    return JSON.parse(contents);
  }
}

async function generateFiles(repoRoot, subdir) {
  const versions = await fsPromises.readdir(`${repoRoot}/.schemas/schemas/${subdir}`);
  for (const version of versions) {
    const schemas = await fsPromises.readdir(`${repoRoot}/.schemas/schemas/${subdir}/${version}`);
    for (const schema of schemas) {
      if (schema === 'empty.json' && subdir === 'core') continue // skip empty, quicktype generates bad code for this
      const schemaPath = `${repoRoot}/.schemas/schemas/${subdir}/${version}/${schema}`;
      const jsonSchemaString = await fsPromises.readFile(schemaPath, {encoding: 'utf8'});
      const filename = path.basename(schemaPath);
      const schemaInput = new JSONSchemaInput(new StaticJSONSchemaStore());
      const inputData = new InputData();
      await schemaInput.addSource({
        name: filename.replace('.json', ''),
        uris: [schemaPath],
        schema: jsonSchemaString
      });
      inputData.addInput(schemaInput);
      await generateGoFiles(subdir, version, inputData, schema);
    }
  }
}

async function generateGoFiles(subdir, version, inputData, schema) {
  const outputPath = `${subdir}/${version}`;
  const packageName = path.basename(subdir);
  const result = await quicktypeMultiFile({
    inputData,
    lang: "go",
    rendererOptions: {
      package: packageName,
    },
  });
  await fsPromises.mkdir(outputPath, {recursive: true});
  const filename = `${schema.replaceAll('-', '_').replaceAll('.json', '.go')}`;
  for (const [_, contents] of result) {
    await fsPromises.writeFile(`${outputPath}/${filename}`, contents.lines.join('\n'));
  }
}

async function main() {
  if (!fs.existsSync('.schemas')) {
    await execSync('git clone https://github.com/RedHatInsights/event-schemas .schemas');
  }
  chdir('.schemas');
  console.info('Ensuring event-schemas checkout up-to-date');
  await execSync('git pull --ff-only');
  chdir('..')

  console.info('Generating go source files');
  const repoRoot = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
  const apps = await fsPromises.readdir(`${repoRoot}/.schemas/schemas/apps/`);
  await generateFiles(repoRoot, 'core');
  for (const app of apps) {
    await generateFiles(repoRoot, `apps/${app}`);
  }
}

main();
