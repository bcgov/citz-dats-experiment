import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import archiver from 'archiver';
import { promisify } from 'util';
import { exec } from 'child_process';

const stat = promisify(fs.stat);
const readdir = promisify(fs.readdir);
const execPromise = promisify(exec);

// Function to get file owner based on platform
export const getFileOwner = async (filePath) => {
  try {
    let command;

    if (process.platform === 'win32') {
      // Windows PowerShell command to get file owner
      command = `powershell -Command "(Get-Acl '${filePath}').Owner"`;
    } else {
      // Linux/macOS command to get file owner
      command = `stat -c '%U' '${filePath}'`;
    }

    const { stdout } = await execPromise(command);
    return stdout.trim(); // Return the owner name
  } catch (error) {
    console.error(`Error getting owner for file ${filePath}:`, error);
    return null; // Return null if owner could not be retrieved
  }
};

/**
 * Helper to format file size to human-readable format
 */
export const formatFileSize = (size) => {
  if (size < 1024) return size + ' B';
  const i = Math.floor(Math.log(size) / Math.log(1024));
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  return (size / Math.pow(1024, i)).toFixed(2) + ' ' + sizes[i];
};

// Get directory size recursively
export const getDirectorySize = async (dirPath) => {
  let totalSize = 0;

  const files = await readdir(dirPath);
  await Promise.all(
    files.map(async (file) => {
      const filePath = path.join(dirPath, file);
      const fileStat = await stat(filePath);

      if (fileStat.isDirectory()) {
        totalSize += await getDirectorySize(filePath);
      } else {
        totalSize += fileStat.size;
      }
    }),
  );

  return totalSize;
};

// Create a zip file from a directory
export const createZip = async (directoryPath, zipFilePath) => {
  const output = fs.createWriteStream(zipFilePath);
  const archive = archiver('zip', { zlib: { level: 9 } });

  archive.pipe(output);
  archive.directory(directoryPath, false);
  await archive.finalize();

  return zipFilePath;
};

// Calculate checksum of a file
export const calculateChecksum = async (filePath) => {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const input = fs.createReadStream(filePath);

    input.on('data', (chunk) => {
      hash.update(chunk);
    });

    input.on('end', () => {
      resolve(hash.digest('hex'));
    });

    input.on('error', (err) => {
      reject(err);
    });
  });
};

// Copy files in batches to avoid overwhelming the system
export const copyDirectoryInBatches = async (source, destination, batchSize = 10) => {
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
          await promisify(fs.copyFile)(sourcePath, destinationPath);
        }
      }),
    );
  }
};

// Generate metadata in batches
export const generateMetadataInBatches = async (
  rootDir,
  baseMetadata,
  batchSize = 10,
) => {
  const metadata = { ...baseMetadata, files: [] };
  let fileCount = 0;
  let totalSize = 0; // Initialize the total size variable

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
          totalSize += subMetadata.totalSize; // Add subdirectory size
        } else {
          const fileChecksum = await calculateChecksum(filePath); // Calculate checksum for the file
          metadata.files.push({
            filepath: path.relative(rootDir, filePath),
            size: formatFileSize(fileStat.size),
            birthtime: new Date(fileStat.birthtime).toLocaleString(),
            lastModified: new Date(fileStat.mtime).toLocaleString(),
            lastAccessed: new Date(fileStat.atime).toLocaleString(),
            owner: fileOwner, // Include owner in the metadata
            checksum: fileChecksum, // Include file checksum in the metadata
          });
          totalSize += fileStat.size; // Add file size to the total
          fileCount += 1; // Increment the file count
        }
      }),
    );
  }

  return { metadata, fileCount, totalSize }; // Return both metadata, file count, and total size
};