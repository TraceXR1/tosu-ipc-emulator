import path from 'node:path';

// A packaged build runs from its own binary, plain node means a dev run
const IS_PACKAGED = !/^(node|nodejs)(\.exe)?$/i.test(path.basename(process.execPath));
const baseDir = IS_PACKAGED ? path.dirname(process.execPath) : path.resolve(import.meta.dirname, '..');

export { baseDir };
