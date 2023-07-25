# Zip Selective Extract for NodeJS

Efficiently extract arbitrary files from zip files that are hosted on S3.

Importantly, where every other nodejs zip reading method streams the entire zip file from s3 into the compute and ignores non-relevant bytes, this library uses byte range selection to request only the relevant data from S3 to begin with.

# Installation

`npm install https://github.com/kiwialec/nodejs-zip-selective-extract.git`

# Usage

```
import { listFilesFromZip } from 'nodejs-zip-selective-extract'
import { S3Client } from '@aws-sdk/client-s3'
const Bucket = 'bucketName';
const Key = `prefix/path-to/file.zip`;
const client = new S3Client({ region: 'eu-west-1' }); 
const zipCatalog = await listFilesFromZip({ Bucket, Key, client })

const targetFile = `path/to/file/inside-zip.json`;
const file = files.find ( f => f.fileName === targetFile );
const fileContent = file.get();
```

# How it works 

This may not work out of the box for you. If you want to change it, here's an overview:

- Zip files are structured with the file data at the start, then the central directory (a catalog of the files and their position in the file), then the end of the file has the size & offset of the central directory
- Get the file size
- Retrieve the last 50 bytes of the file and check for the "End of Central Directory" delimiter (0x06054b50) - if this is not found, continue searching backwards for it
- Once the EOCD is found, extract the central directory size and offset
- Request the central directory byte range, parse it, and extract the file names / byte ranges
- Use the central directory values to request the ranges of the files, and decompress them

# Ideas / Help me improve this

- Support local files by reading ranges with fs 
- Stream bytes from s3 & decompress instead of buffering the whole range into memory