import { IncomingMessage, ServerResponse } from "node:http";
import https, { Server } from "node:https";
import { ApplicationContext } from "@spt/context/ApplicationContext";
import { ContextVariableType } from "@spt/context/ContextVariableType";
import { HttpServerHelper } from "@spt/helpers/HttpServerHelper";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { IHttpConfig } from "@spt/models/spt/config/IHttpConfig";
import type { ILogger } from "@spt/models/spt/utils/ILogger";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { WebSocketServer } from "@spt/servers/WebSocketServer";
import { IHttpListener } from "@spt/servers/http/IHttpListener";
import { LocalisationService } from "@spt/services/LocalisationService";
import { FileSystem } from "@spt/utils/FileSystem";
import { Timer } from "@spt/utils/Timer";
import { generate } from "selfsigned";
import { inject, injectAll, injectable } from "tsyringe";

@injectable()
export class HttpServer {
    protected httpConfig: IHttpConfig;
    protected started = false;
    protected certPath: string;
    protected keyPath: string;
    protected fileSystem: FileSystem;

    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("HttpServerHelper") protected httpServerHelper: HttpServerHelper,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @injectAll("HttpListener") protected httpListeners: IHttpListener[],
        @inject("ConfigServer") protected configServer: ConfigServer,
        @inject("ApplicationContext") protected applicationContext: ApplicationContext,
        @inject("WebSocketServer") protected webSocketServer: WebSocketServer,
        @inject("FileSystem") fileSystem: FileSystem, // new dependency
    ) {
        this.httpConfig = this.configServer.getConfig(ConfigTypes.HTTP);
        this.fileSystem = fileSystem;
        this.certPath = "./user/certs/localhost.crt";
        this.keyPath = "./user/certs/localhost.key";
    }

    /**
     * Handle server loading event
     */
    public async load(): Promise<void> {
        // changed to async
        this.started = false;

        const httpsServer: Server = await this.createHttpsServer();

        httpsServer.on("request", async (req: IncomingMessage, res: ServerResponse) => {
            await this.handleRequest(req, res);
        });

        httpsServer.listen(this.httpConfig.port, this.httpConfig.ip, () => {
            this.started = true;
            this.logger.success(
                this.localisationService.getText("started_webserver_success", this.httpServerHelper.getBackendUrl()),
            );
        });

        httpsServer.on("error", (e: any) => {
            if (process.platform === "linux" && !(process.getuid && process.getuid() === 0) && e.port < 1024) {
                this.logger.error(this.localisationService.getText("linux_use_priviledged_port_non_root"));
            } else {
                const message = this.localisationService.getText("port_already_in_use", e.port);
                this.logger.error(`${message} [${e.message}]`);
            }
        });

        // Setting up WebSocket using our https server
        this.webSocketServer.setupWebSocket(httpsServer);
    }

    /**
     * Creates an HTTPS server using the stored certificate and key.
     */
    protected async createHttpsServer(): Promise<Server> {
        let credentials: { cert: string; key: string };
        try {
            credentials = {
                cert: await this.fileSystem.read(this.certPath),
                key: await this.fileSystem.read(this.keyPath),
            };
        } catch (err: unknown) {
            const timer = new Timer();
            credentials = await this.generateSelfSignedCertificate();
            this.logger.debug(`Generating self-signed SSL certificate took: ${timer.getTime("sec")}s`);
        }

        const options: https.ServerOptions = {
            cert: credentials.cert,
            key: credentials.key,
            minVersion: "TLSv1.2",
            maxVersion: "TLSv1.3",
        };
        return https.createServer(options);
    }

    /**
     * Generates a self-signed certificate and returns an object with the cert and key.
     */
    protected async generateSelfSignedCertificate(): Promise<{ cert: string; key: string }> {
        const attrs = [{ name: "commonName", value: "localhost" }];
        const pems = generate(attrs, {
            keySize: 4096,
            days: 3653, // Ten years
            algorithm: "sha256",
            extensions: [
                {
                    name: "subjectAltName",
                    altNames: [
                        { type: 2, value: "localhost" }, // DNS
                        { type: 7, ip: "127.0.0.1" }, // Resolving IP
                    ],
                },
            ],
        });

        try {
            await this.fileSystem.write(this.certPath, pems.cert);
            await this.fileSystem.write(this.keyPath, pems.private);
        } catch (err: unknown) {
            this.logger.error(`There was an error writing the certificate or key to disk: ${err}`);
        }

        return { cert: pems.cert, key: pems.private };
    }

    protected async handleRequest(req: IncomingMessage, resp: ServerResponse): Promise<void> {
        // Pull sessionId out of cookies and store inside app context
        const sessionId = this.getCookies(req).PHPSESSID;
        this.applicationContext.addValue(ContextVariableType.SESSION_ID, sessionId);

        // Extract headers for original IP detection
        const realIp = req.headers["x-real-ip"] as string;
        const forwardedFor = req.headers["x-forwarded-for"] as string;
        const clientIp = realIp || (forwardedFor ? forwardedFor.split(",")[0].trim() : req.socket.remoteAddress);

        if (this.httpConfig.logRequests) {
            const isLocalRequest = this.isLocalRequest(clientIp);
            if (typeof isLocalRequest !== "undefined") {
                if (isLocalRequest) {
                    this.logger.info(this.localisationService.getText("client_request", req.url));
                } else {
                    this.logger.info(
                        this.localisationService.getText("client_request_ip", {
                            ip: clientIp,
                            url: req.url.replaceAll("/", "\\"), // Localisation service escapes `/` into hex code `&#x2f;`
                        }),
                    );
                }
            }
        }

        for (const listener of this.httpListeners) {
            if (listener.canHandle(sessionId, req)) {
                await listener.handle(sessionId, req, resp);
                break;
            }
        }
    }

    /**
     * Check against hardcoded values that determine its from a local address
     * @param remoteAddress Address to check
     * @returns True if its local
     */
    protected isLocalRequest(remoteAddress: string | undefined): boolean | undefined {
        if (!remoteAddress) {
            return undefined;
        }

        return (
            remoteAddress.startsWith("127.0.0") ||
            remoteAddress.startsWith("192.168.") ||
            remoteAddress.startsWith("localhost")
        );
    }

    protected getCookies(req: IncomingMessage): Record<string, string> {
        const found: Record<string, string> = {};
        const cookies = req.headers.cookie;

        if (cookies) {
            for (const cookie of cookies.split(";")) {
                const parts = cookie.split("=");

                found[parts.shift().trim()] = decodeURI(parts.join("="));
            }
        }

        return found;
    }

    public isStarted(): boolean {
        return this.started;
    }
}
