# Zip Selective Extract for NodeJS

Efficiently extract arbitrary files from zip files that are hosted on S3.

Importantly, where every other nodejs zip reading method streams the entire zip file from s3 into the compute and ignores non-relevant bytes, this library uses byte range selection to request only the relevant data from S3 to begin with.

# Installation

`npm install https://github.com/kiwialec/nodejs-zip-selective-extract.git`

# Usage

## S3

Set the S3 config and bucket in the fileHandler, then your key should go in `path`
```
import { listFilesFromZip, LocalFileHandler, s3FileHandler } from 'nodejs-zip-selective-extract'

const Bucket = "my-bucket"
const s3config = { region: "us-east-1" } // put any other AWS config here

const fileHandler = new s3Handler({ s3config, Bucket });

const path = `path/to/file.zip`;
const filesInZip = await listFilesFromZip({ path, fileHandler })
console.log({ filesInZip })

try{
    const targetFile = `path/to/file/inside-zip.json`;
    const file = filesInZip.find ( f => f.fileName === targetFile );
    if(file){
        const fileContent = await file.get();
        console.log(fileContent.toString())
    }else{
        console.error("File not found in zip")
    }
    
}catch(e){
    console.error("Error extracting file from zip:",e)
}
```

## Local filesystem

```
import { listFilesFromZip, LocalFileHandler, s3FileHandler } from 'nodejs-zip-selective-extract'

const Bucket = "my-bucket"
const s3config = { region: "us-east-1" } // put any other AWS config here

const fileHandler = new LocalFileHandler();

const path = `/path/to/file.zip`;
const filesInZip = await listFilesFromZip({ path, fileHandler })
console.log({ filesInZip })

try{
    const targetFile = `path/to/file/inside-zip.json`;
    const file = filesInZip.find ( f => f.fileName === targetFile );
    if(file){
        const fileContent = await file.get();
        console.log(fileContent.toString())
    }else{
        console.error("File not found in zip")
    }
    
}catch(e){
    console.error("Error extracting file from zip:",e)
}
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