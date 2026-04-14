import {
  Controller,
  Get,
  Put,
  Head,
  Delete,
  Req,
  Res,
  Headers,
  HttpStatus,
  StreamableFile,
  BadRequestException,
  HttpCode,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { StorageService } from './storage.service';

@Controller()
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  @Head('*')
  async getFileInfo(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const stat = await this.storageService.getPathInfo(req.path);
    if (stat.isDirectory()) {
      throw new BadRequestException('Cannot perform HEAD on a directory');
    }

    res.set({
      'Content-Length': stat.size.toString(),
      'Last-Modified': stat.mtime.toUTCString(),
    });
  }

  @Get('*')
  async getFileOrDir(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (req.path === '/favicon.ico') throw new BadRequestException();

    const stat = await this.storageService.getPathInfo(req.path);

    if (stat.isDirectory()) {
      return this.storageService.listDirectory(req.path);
    }

    res.set({
      'Content-Length': stat.size.toString(),
      'Last-Modified': stat.mtime.toUTCString(),
      'Content-Type': 'application/octet-stream',
    });

    const stream = this.storageService.getFileStream(req.path);
    return new StreamableFile(stream);
  }

  @Put('*')
  @HttpCode(HttpStatus.CREATED)
  async uploadOrCopyFile(
    @Req() req: Request,
    @Headers('x-copy-from') copyFrom?: string,
  ) {
    if (copyFrom) {
      await this.storageService.copyFile(copyFrom, req.path);
      return { message: 'File copied successfully' };
    }

    await this.storageService.saveFileFromStream(req.path, req);
    return { message: 'File uploaded successfully' };
  }

  @Delete('*')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deletePath(@Req() req: Request) {
    await this.storageService.deletePath(req.path);
  }
}
