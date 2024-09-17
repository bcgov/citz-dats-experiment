import path from 'path';
import os from 'os';
import { promisify } from 'util';
import fs from 'fs';
import WorkerPool from './WorkerPool.js'; // Import the WorkerPool class

const stat = promisify(fs.stat);

// Create a worker pool with a concurrency limit of 4
const pool = new WorkerPool(4);

export const transfer = async (req, res) => {
  const startTime = Date.now();
  const { filepath, batchSize = '10' } = req.query;

  if (!filepath || typeof filepath !== 'string') {
    res.status(400).json({ error: 'filepath query parameter is required and must be a string' });
    return;
  }

  try {
    const fileStat = await stat(filepath);
    if (!fileStat.isDirectory()) {
      res.status(400).json({ error: 'Selected filepath is not a directory' });
      return;
    }

    const directoryName = path.basename(filepath);
    const transferDir = path.join('transfers', directoryName);
    const destinationDir = path.join(transferDir, 'temp');
    const metadataFilePath = path.join(transferDir, 'metadata.json');

    if (!fs.existsSync(transferDir)) {
      fs.mkdirSync(transferDir, { recursive: true });
    }

    // Schedule tasks for copying, generating metadata, and zipping using the worker pool
    const copyPromise = pool.runTask(new URL('./copyWorker.js', import.meta.url), {
      source: filepath,
      destination: destinationDir,
      batchSize: Number(batchSize),
    });

    const metadataPromise = pool.runTask(new URL('./metadataWorker.js', import.meta.url), {
      filepath,
      baseMetadata: {
        filepath,
        computer: os.hostname(),
      },
      batchSize: Number(batchSize),
      metadataFilePath, // Pass the metadata file path to the worker
    });

    // Wait for both file copying and metadata generation to complete
    const [copyResult, metadataResult] = await Promise.all([copyPromise, metadataPromise]);

    if (!copyResult.success || metadataResult.error) {
      throw new Error('Error during transfer');
    }

    // Extract size and file count from metadata result
    const { fileCount, totalSize } = metadataResult;

    // Schedule the zipping process
    const zipPromise = pool.runTask(new URL('./zipWorker.js', import.meta.url), {
      directoryPath: destinationDir,
      zipFilePath: path.join(transferDir, 'final.zip'),
    });

    const zipResult = await zipPromise;

    if (!zipResult.success) {
      throw new Error('Error during zipping');
    }

    // Calculate the total processing time
    const totalProcessingTime = Date.now() - startTime;

    // Format the total size
    const formattedTotalSize = `${(totalSize / (1024 * 1024)).toFixed(2)} MB`;

    // Return the final response with size and file count
    res.status(200).json({
      transferPath: `transfers/${transferDir}`,
      size: formattedTotalSize, // Include formatted total size
      fileCount, // Include file count
      batchSize: Number(batchSize),
      processingTime: `${totalProcessingTime} ms`,
    });
  } catch (error) {
    res.status(500).json({ error: `Error during transfer: ${error.message}` });
  }
};
