import { IncomingMessage, ServerResponse } from "node:http";
import type { ILogger } from "@spt/models/spt/utils/ILogger";
import { ImageRouteService } from "@spt/services/mod/image/ImageRouteService";
import { FileSystemSync } from "@spt/utils/FileSystemSync";
import { HttpFileUtil } from "@spt/utils/HttpFileUtil";
import { inject, injectable } from "tsyringe";

@injectable()
export class ImageRouter {
    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("ImageRouteService") protected imageRouteService: ImageRouteService,
        @inject("HttpFileUtil") protected httpFileUtil: HttpFileUtil,
    ) {}

    public addRoute(key: string, valueToAdd: string): void {
        this.imageRouteService.addRoute(key.toLowerCase(), valueToAdd);
    }

    public async sendImage(sessionID: string, req: IncomingMessage, resp: ServerResponse, body: any): Promise<void> {
        // remove file extension
        const url = req.url ? FileSystemSync.stripExtension(req.url) : "";

        // send image
        const keyLower = url.toLowerCase();
        if (this.imageRouteService.existsByKey(keyLower)) {
            await this.httpFileUtil.sendFileAsync(resp, this.imageRouteService.getByKey(keyLower));
        } else {
            this.logger.error(`File not found: ${url}`);
        }
    }

    public getImage(): string {
        return "IMAGE";
    }
}
