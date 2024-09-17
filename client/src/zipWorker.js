import { parentPort, workerData } from 'worker_threads';
import fs from 'fs';
import archiver from 'archiver';

const createZip = async (directoryPath, zipFilePath) => {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipFilePath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => resolve(zipFilePath));
    archive.on('error', (err) => reject(err));

    archive.pipe(output);
    archive.directory(directoryPath, false);
    archive.finalize();
  });
};

(async () => {
  const { directoryPath, zipFilePath } = workerData;
  try {
    await createZip(directoryPath, zipFilePath);
    parentPort.postMessage({ success: true });
  } catch (error) {
    parentPort.postMessage({ success: false, error: error.message });
  }
})();
