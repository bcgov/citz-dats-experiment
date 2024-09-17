import { parentPort, workerData } from 'worker_threads';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

const stat = promisify(fs.stat);
const readdir = promisify(fs.readdir);

const copyFileStream = (sourcePath, destinationPath) => {
  return new Promise((resolve, reject) => {
    const readStream = fs.createReadStream(sourcePath);
    const writeStream = fs.createWriteStream(destinationPath);

    readStream.on('error', reject);
    writeStream.on('error', reject);
    writeStream.on('finish', resolve);

    readStream.pipe(writeStream);
  });
};

const copyDirectoryInBatches = async (source, destination, batchSize = 10) => {
  if (!fs.existsSync(destination)) {
    fs.mkdirSync(destination, { recursive: true });
  }

  const files = await readdir(source);
  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize);
    await Promise.all(
      batch.map(async (file) => {
        const sourcePath = path.join(source, file);
        const destinationPath = path.join(destination, file);
        const fileStat = await stat(sourcePath);

        if (fileStat.isDirectory()) {
          await copyDirectoryInBatches(sourcePath, destinationPath, batchSize);
        } else {
          await copyFileStream(sourcePath, destinationPath);
        }
      })
    );
  }
};

(async () => {
  const { source, destination, batchSize } = workerData;
  try {
    await copyDirectoryInBatches(source, destination, batchSize);
    parentPort.postMessage({ success: true });
  } catch (error) {
    parentPort.postMessage({ success: false, error: error.message });
  }
})();
