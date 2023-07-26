import { inflateRawSync } from 'zlib';
import { LocalFileHandler } from './lib/local.js';
import { s3FileHandler } from './lib/s3.js';

export {LocalFileHandler, s3FileHandler}

export async function listFilesFromZip({ path, fileHandler }) {

    const fileSize = await fileHandler.getFileSize({ path })
    
    const { centralDirSize, centralDirOffset } = await extractEocdOffset({ path, fileSize, fileHandler });
    const files = await readCatalog({ path, centralDirSize, centralDirOffset, fileHandler });
    
    return files.map ( file => {
        return {
            ...file,
            get: async () => {
                const fileDataBuffer = await extractFile({ path, compressedSize: file.compressedSize, localFileHeaderOffset: file.localFileHeaderOffset, fileHandler });
                let inflatedFile;
                if (file.compressionMethod === 8) { // DEFLATE
                  inflatedFile = await inflateRawSync(fileDataBuffer);
                } else if (file.compressionMethod === 0) { // STORE (no compression)
                  inflatedFile = fileDataBuffer;
                } else {
                  throw new Error(`Unsupported compression method: ${file.compressionMethod}`);
                }
                return inflatedFile;
            }
        }
    })

}

async function extractEocdOffset({ path, fileSize, fileHandler }) {
  let bufferLength = 50;
  let buffer = await fileHandler.getByteRange({ path, start: fileSize - bufferLength, end: fileSize - 1 });
  let eocdOffset = buffer.indexOf(0x06054b50);
  while (eocdOffset === -1) {
    bufferLength *= 2;
    buffer = await fileHandler.getByteRange({ path, start: fileSize - bufferLength, end: fileSize - 1 });
    eocdOffset = buffer.indexOf(0x06054b50);
  }

  let centralDirSize = buffer.readUInt32LE(eocdOffset + 12);
  let centralDirOffset = buffer.readUInt32LE(eocdOffset + 16);

  return { centralDirSize, centralDirOffset };
}

async function readCatalog({ path, centralDirSize, centralDirOffset, fileHandler }) {
  let centralDirBuffer = await fileHandler.getByteRange({ path, start: centralDirOffset, end: centralDirOffset + centralDirSize - 1 });

  let offset = 0;
  const files = [];
  while (offset < centralDirSize) {
    if (centralDirBuffer.readUInt32LE(offset) !== 0x02014b50) {
      break;
    }

    let fileNameLength = centralDirBuffer.readUInt16LE(offset + 28);
    let extraFieldLength = centralDirBuffer.readUInt16LE(offset + 30);
    let fileCommentLength = centralDirBuffer.readUInt16LE(offset + 32);
    let localFileHeaderOffset = centralDirBuffer.readUInt32LE(offset + 42);
    let compressedSize = centralDirBuffer.readUInt32LE(offset + 20);
    let uncompressedSize = centralDirBuffer.readUInt32LE(offset + 24);
    let compressionMethod = centralDirBuffer.readUInt16LE(offset + 10);
    let crc32 = centralDirBuffer.readUInt32LE(offset + 16);
    let externalFileAttributes = centralDirBuffer.readUInt32LE(offset + 38);
    let internalFileAttributes = centralDirBuffer.readUInt16LE(offset + 36);
    let diskNumberStart = centralDirBuffer.readUInt16LE(offset + 34);
    let versionMadeBy = centralDirBuffer.readUInt16LE(offset + 4);
    let lastModifiedDate = dosDateTimeToDate(centralDirBuffer.readUInt16LE(offset + 14), centralDirBuffer.readUInt16LE(offset + 12));

    let fileName = centralDirBuffer.toString('utf8', offset + 46, offset + 46 + fileNameLength);
    let fileComment = fileCommentLength ? centralDirBuffer.toString('utf8', offset + 46 + fileNameLength + extraFieldLength, offset + 46 + fileNameLength + extraFieldLength + fileCommentLength) : '';

    files.push({
      fileName, 
      localFileHeaderOffset, 
      compressedSize, 
      uncompressedSize, 
      fileNameLength, 
      extraFieldLength, 
      fileCommentLength, 
      compressionMethod, 
      lastModifiedDate, 
      crc32, 
      externalFileAttributes, 
      internalFileAttributes, 
      diskNumberStart, 
      fileComment,
      versionMadeBy
    });
    offset += 46 + fileNameLength + extraFieldLength + fileCommentLength;
  }

  return files;
}

async function extractFile({ path, compressedSize, localFileHeaderOffset, fileHandler }) {
  // It is important to retrieve fileNameLength and extraFieldLength again from the localFile header, because they are not guaranteed to be the same as the values in the central directory.
  let localFileHeaderBuffer = await fileHandler.getByteRange({ path, start: localFileHeaderOffset, end: localFileHeaderOffset + 29 });
  let fileNameLength = localFileHeaderBuffer.readUInt16LE(26);
  let extraFieldLength = localFileHeaderBuffer.readUInt16LE(28);

  let fileDataBuffer = await fileHandler.getByteRange({ path, start: localFileHeaderOffset + 30 + fileNameLength + extraFieldLength, end: localFileHeaderOffset + 30 + fileNameLength + extraFieldLength + compressedSize - 1 });

  return fileDataBuffer;
}


function dosDateTimeToDate(date, time) {
  const day = date & 0x1F;
  const month = (date >> 5) & 0x0F;
  const year = ((date >> 9) & 0x7F) + 1980;
  const second = (time & 0x1F) * 2;
  const minute = (time >> 5) & 0x3F;
  const hour = (time >> 11) & 0x1F;
  return new Date(year, month - 1, day, hour, minute, second);
}