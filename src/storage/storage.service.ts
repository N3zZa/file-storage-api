import {
  Injectable,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
  ForbiddenException,
} from '@nestjs/common';
import * as fs from 'fs/promises';
import { createReadStream, createWriteStream, ReadStream } from 'fs';
import * as path from 'path';
import { Request } from 'express';

type FsError = NodeJS.ErrnoException & {
  code?: string;
};

const BASE_STORAGE_DIR = path.resolve(process.cwd(), 'storage_data');

@Injectable()
export class StorageService {
  constructor() {
    fs.mkdir(BASE_STORAGE_DIR, { recursive: true }).catch(console.error);
  }

  private getSafePath(requestUrl: string): string {
    const decodedUrl = decodeURI(requestUrl);
    const urlPath = decodedUrl.split('?')[0];
    const resolvedPath = path.resolve(
      BASE_STORAGE_DIR,
      urlPath.replace(/^\//, ''),
    );

    if (!resolvedPath.startsWith(BASE_STORAGE_DIR)) {
      throw new ForbiddenException('Path Traversal Detected');
    }
    return resolvedPath;
  }

  async getPathInfo(reqPath: string) {
    const targetPath = this.getSafePath(reqPath);
    try {
      return await fs.stat(targetPath);
    } catch (err) {
      this.handleError(err as FsError);
    }
  }

  async listDirectory(reqPath: string) {
    const targetPath = this.getSafePath(reqPath);
    const files = await fs.readdir(targetPath, { withFileTypes: true });
    return files.map((file) => ({
      name: file.name,
      type: file.isDirectory() ? 'directory' : 'file',
    }));
  }

  getFileStream(reqPath: string): ReadStream {
    const targetPath = this.getSafePath(reqPath);
    return createReadStream(targetPath);
  }

  async saveFileFromStream(reqPath: string, stream: Request): Promise<void> {
    const targetPath = this.getSafePath(reqPath);
    await fs.mkdir(path.dirname(targetPath), { recursive: true });

    return new Promise((resolve, reject) => {
      const writeStream = createWriteStream(targetPath);
      stream.pipe(writeStream);

      writeStream.on('finish', resolve);
      writeStream.on('error', (err: NodeJS.ErrnoException) => reject(err));
    });
  }

  async copyFile(sourceReqPath: string, targetReqPath: string): Promise<void> {
    const sourcePath = this.getSafePath(sourceReqPath);
    const targetPath = this.getSafePath(targetReqPath);

    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    try {
      await fs.copyFile(sourcePath, targetPath);
    } catch (err) {
      this.handleError(err as FsError);
    }
  }

  async deletePath(reqPath: string): Promise<void> {
    const targetPath = this.getSafePath(reqPath);
    try {
      await fs.rm(targetPath, { recursive: true });
    } catch (err) {
      this.handleError(err as FsError);
    }
  }

  private handleError(err: FsError): never {
    switch (err.code) {
      case 'ENOENT':
        throw new NotFoundException('Not Found');

      case 'EACCES':
      case 'EPERM':
        throw new ForbiddenException('Forbidden');

      case 'ENOTDIR':
        throw new BadRequestException('Not a directory');

      default:
        throw new InternalServerErrorException(err.message);
    }
  }
}
