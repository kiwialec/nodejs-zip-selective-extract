
import { S3Client, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';

export class s3FileHandler {
    constructor({ s3config, Bucket }) {
      console.log({ s3config, Bucket })
        this.client = new S3Client(s3config);
        this.Bucket = Bucket;
    }
    async getByteRange({ path, start, end }) {
        const s3Params = {
            Bucket: this.Bucket,
            Key: path,
            Range: `bytes=${start}-${end}`
          }
    
        const { Body } = await this.client.send(
          new GetObjectCommand(s3Params)
        );
      
        const chunks = [];
        for await (const chunk of Body) {
          chunks.push(chunk);
        }
      
        return Buffer.concat(chunks);
    }
    
    
    async getFileSize({ path }) {
      console.log("getFileSize", { path }, { Bucket: this.Bucket, Key: path })
      const command = new HeadObjectCommand({ Bucket: this.Bucket, Key: path });
        const { ContentLength: fileSize } = await this.client.send(command);
        return fileSize;
    }
    
}

