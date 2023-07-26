import { S3Client, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { gunzipSync } from 'zlib';


export async function listFilesFromZip({ Bucket, Key, client }) {

    const fileSize = await getFileSize({ Bucket, Key, client })
    const { centralDirSize, centralDirOffset } = await extractEocdOffset({ Bucket, Key, fileSize, client });
    const files = await readCatalog({ Bucket, Key, centralDirSize, centralDirOffset, client });
    
    return files.map ( file => {
        return {
            fileName: file.fileName,
            compressedSize: file.compressedSize,
            uncompressedSize: file.uncompressedSize,
            get: async () => {
                //const fileDataBuffer = await extractFile({ Bucket, Key, compressedSize: file.compressedSize, localFileHeaderOffset: file.localFileHeaderOffset, client });
                const fileDataBuffer = await getS3Range({ Bucket, Key, fileStartByte: file.fileStartByte, fileEndByte: file.fileEndByte, client });
                const inflatedFile = await inflateFile({ fileDataBuffer });
                return inflatedFile
            }
        }
    })

}

async function extractEocdOffset({ Bucket, Key, fileSize, client }) {
  let bufferLength = 50;
  let buffer = await getS3Range({ Bucket, Key, start: fileSize - bufferLength, end: fileSize - 1, client });

  let eocdOffset = buffer.indexOf(0x06054b50);
  while (eocdOffset === -1) {
    bufferLength *= 2;
    buffer = await getS3Range({ Bucket, Key, start: fileSize - bufferLength, end: fileSize - 1, client });
    eocdOffset = buffer.indexOf(0x06054b50);
  }

  let centralDirSize = buffer.readUInt32LE(eocdOffset + 12);
  let centralDirOffset = buffer.readUInt32LE(eocdOffset + 16);

  return { centralDirSize, centralDirOffset };
}

async function readCatalog({ Bucket, Key, centralDirSize, centralDirOffset, client }) {
  let centralDirBuffer = await getS3Range({ Bucket, Key, start: centralDirOffset, end: centralDirOffset + centralDirSize - 1, client });

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

    let fileStartByte = localFileHeaderOffset + 30 + fileNameLength + extraFieldLength
    let fileEndByte = localFileHeaderOffset + 30 + fileNameLength + extraFieldLength + compressedSize - 1
    let fileName = centralDirBuffer.toString('utf8', offset + 46, offset + 46 + fileNameLength);
    files.push ({ fileName, compressedSize, uncompressedSize, fileStartByte, fileEndByte });

    offset += 46 + fileNameLength + extraFieldLength + fileCommentLength;
  }

  return files;
}

async function extractFile({ Bucket, Key, fileStartByte, fileEndByte, client }) {

  let fileDataBuffer = await getS3Range({ Bucket, Key, start: fileStartByte, end: fileEndByte, client });

  return fileDataBuffer;
}

async function inflateFile({ fileDataBuffer }) {
  return gunzipSync(fileDataBuffer);
}

async function getS3Range({ Bucket, Key, start, end, client }) {
    const s3Params = {
        Bucket,
        Key,
        Range: `bytes=${start}-${end}`
      }

    const { Body } = await client.send(
      new GetObjectCommand(s3Params)
    );
  
    const chunks = [];
    for await (const chunk of Body) {
      chunks.push(chunk);
    }
  
    return Buffer.concat(chunks);
}


async function getFileSize({ Bucket, Key, client }) {
    const { ContentLength: fileSize } = await client.send(new HeadObjectCommand({ Bucket, Key }));
    return fileSize;
}
