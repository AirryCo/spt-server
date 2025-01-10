import type { PrestigeCallbacks } from "@spt/callbacks/PrestigeCallbacks";
import { RouteAction, StaticRouter } from "@spt/di/Router";
import type { IGetBodyResponseData } from "@spt/models/eft/httpResponse/IGetBodyResponseData";
import { INullResponseData } from "@spt/models/eft/httpResponse/INullResponseData";
import { inject, injectable } from "tsyringe";

@injectable()
export class PrestigeStaticRouter extends StaticRouter {
    constructor(@inject("PrestigeCallbacks") protected prestigeCallbacks: PrestigeCallbacks) {
        super([
            new RouteAction(
                "/client/prestige/list",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<any>> => {
                    return this.prestigeCallbacks.getPrestige(url, info, sessionID);
                },
            ),

            new RouteAction(
                "/client/prestige/obtain",
                async (url: string, info: any, sessionID: string, _output: string): Promise<INullResponseData> => {
                    return this.prestigeCallbacks.obtainPrestige(url, info, sessionID);
                },
            ),
        ]);
    }
}
