import fs from 'fs';
import util from 'util';

export class LocalFileHandler {
    constructor() {
    }

    async getByteRange({ path, start, end }) {
        const fullPath = path;
       
        const readStream = fs.createReadStream(fullPath, { start, end });
        const chunks = [];
    
        for await (const chunk of readStream) {
          chunks.push(chunk);
        }
    
        return Buffer.concat(chunks);
    }
    

    async getFileSize({ path }) {
        const fullPath = path;
        const stats = await util.promisify(fs.stat)(fullPath);
        
        return stats.size;
    }
}
