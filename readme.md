# Zip Selective Extract for NodeJS

Efficiently extract arbitrary files from zip files.

From what I can see, every other nodejs zip reads the entire zip file into the compute and ignores non-relevant bytes, this isn't great if you just want one file from a large zip archive, and awful if your zip is stored on a high latency or remote filesystem (i.e. S3). This library utilises the zip file's central directory (a catalog of each file and it's location within the zip) to only read the relevant byte ranges from the zip file, meaning that it can efficiently give you access to small slices of data within a large (and potentially remote) zip archive.

The canonical use-case that I'm building for is storing many small files (10-100KB) in large zip files on S3 (thereby avoiding excession PutObject and lifecycle request costs), and retrieving an individual file at runtime.

The library assumes everything you tell it is correct and doesn't do any sanitisation of inputs. Caveat emptor.

# Installation

`npm install https://github.com/kiwialec/nodejs-zip-selective-extract.git`

# Usage

## S3

Set the S3 config and bucket in the fileHandler, then your key should go in `path`
```
import { listFilesFromZip, s3FileHandler } from 'nodejs-zip-selective-extract'

const Bucket = "my-bucket"
const s3config = { region: "us-east-1" } // put any other AWS config here

const fileHandler = new s3FileHandler({ s3config, Bucket });

const path = `path/to/key.zip`;
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
import { listFilesFromZip, LocalFileHandler } from 'nodejs-zip-selective-extract'

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

## Any other filesystem

The library is structured to use the provided FileHandler class to make it simple to integrate any arbitrary filesystem. 

Copy the ./lib/s3.js or ./lib/local.js format and ensure your class has the following methods:
- getByteRange({ path, start, end }) - output should be a buffer
- getFileSize({ path }) - output should be an integter (bytes)

Feel free to create a PR with any new FileHandler classes.

# listFilesFromZip output

The `listFilesFromZip` function will return an object array with all relevant info about the compressed files. This is pulled verbatim from the central directory, with the exception of the lastModifiedDate (which is converted to a JS Date object):
```javascript
[
    {
      fileName: 'example.txt',
      localFileHeaderOffset: 0,
      compressedSize: 20215,
      uncompressedSize: 108098,
      fileNameLength: 17,
      extraFieldLength: 0,
      fileCommentLength: 0,
      compressionMethod: 8, // compression method of 8 is deflated, 0 is stored
      lastModifiedDate: 2023-07-25T20:43:12.000Z,
      crc32: 1781530683,
      externalFileAttributes: 32,
      internalFileAttributes: 1,
      diskNumberStart: 0,
      fileComment: '',
      versionMadeBy: 20,
      get: [AsyncFunction: get] // calling the get() function will download the file and undertake the appropriate decompression
    },
    ...
]
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

- Stream bytes from s3 & decompress instead of buffering the whole range into memory