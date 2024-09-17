import { parentPort, workerData } from 'worker_threads';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import crypto from 'crypto';
import { getFileOwner, formatFileSize } from './utils.js';

const stat = promisify(fs.stat);
const readdir = promisify(fs.readdir);

// Calculate file checksum
const calculateChecksum = async (filePath) => {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const input = fs.createReadStream(filePath);

    input.on('data', (chunk) => hash.update(chunk));
    input.on('end', () => resolve(hash.digest('hex')));
    input.on('error', reject);
  });
};

// Generate metadata in batches
const generateMetadataInBatches = async (rootDir, baseMetadata, batchSize = 10) => {
  const metadata = { ...baseMetadata, files: [] };
  let fileCount = 0;
  let totalSize = 0;

  const files = await readdir(rootDir);
  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize);
    await Promise.all(
      batch.map(async (file) => {
        const filePath = path.join(rootDir, file);
        const fileStat = await stat(filePath);
        const fileOwner = await getFileOwner(filePath);

        if (fileStat.isDirectory()) {
          const subMetadata = await generateMetadataInBatches(filePath, baseMetadata, batchSize);
          metadata.files.push(...subMetadata.metadata.files);
          fileCount += subMetadata.fileCount;
          totalSize += subMetadata.totalSize;
        } else {
          const fileChecksum = await calculateChecksum(filePath);
          metadata.files.push({
            filepath: path.relative(rootDir, filePath),
            size: formatFileSize(fileStat.size),
            birthtime: new Date(fileStat.birthtime).toLocaleString(),
            lastModified: new Date(fileStat.mtime).toLocaleString(),
            lastAccessed: new Date(fileStat.atime).toLocaleString(),
            owner: fileOwner,
            checksum: fileChecksum,
          });
          totalSize += fileStat.size;
          fileCount += 1;
        }
      }),
    );
  }

  return { metadata, fileCount, totalSize };
};

// Write metadata to a file
const writeMetadataToFile = (metadataFilePath, metadata) => {
  fs.writeFileSync(metadataFilePath, JSON.stringify(metadata, null, 2));
};

(async () => {
  const { filepath, baseMetadata, batchSize, metadataFilePath } = workerData;
  try {
    const { metadata, fileCount, totalSize } = await generateMetadataInBatches(filepath, baseMetadata, batchSize);

    // Write metadata to the file
    writeMetadataToFile(metadataFilePath, { ...metadata, totalSize });

    // Return metadata to the parent thread
    parentPort.postMessage({ success: true, metadata, fileCount, totalSize });
  } catch (error) {
    parentPort.postMessage({ success: false, error: error.message });
  }
})();
