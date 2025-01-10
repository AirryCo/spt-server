import type { PrestigeController } from "@spt/controllers/PrestigeController";
import { HttpServerHelper } from "@spt/helpers/HttpServerHelper";
import type { IEmptyRequestData } from "@spt/models/eft/common/IEmptyRequestData";
import { IPrestige } from "@spt/models/eft/common/tables/IPrestige";
import type { IGetBodyResponseData } from "@spt/models/eft/httpResponse/IGetBodyResponseData";
import { INullResponseData } from "@spt/models/eft/httpResponse/INullResponseData";
import { IObtainPrestigeRequest } from "@spt/models/eft/prestige/IObtainPrestigeRequest";
import { HttpResponseUtil } from "@spt/utils/HttpResponseUtil";
import { inject, injectable } from "tsyringe";

@injectable()
export class PrestigeCallbacks {
    constructor(
        @inject("HttpServerHelper") protected httpServerHelper: HttpServerHelper,
        @inject("HttpResponseUtil") protected httpResponse: HttpResponseUtil,
        @inject("PrestigeController") protected prestigeController: PrestigeController,
    ) {}

    /** Handle client/prestige/list */
    public getPrestige(url: string, info: IEmptyRequestData, sessionID: string): IGetBodyResponseData<IPrestige> {
        return this.httpResponse.getBody(this.prestigeController.getPrestige(sessionID, info));
    }

    /** Handle client/prestige/obtain */
    public obtainPrestige(url: string, info: IObtainPrestigeRequest[], sessionID: string): INullResponseData {
        this.prestigeController.obtainPrestige(sessionID, info);

        return this.httpResponse.nullResponse();
    }
}
