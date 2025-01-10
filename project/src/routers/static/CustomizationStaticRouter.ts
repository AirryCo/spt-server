import { CustomizationCallbacks } from "@spt/callbacks/CustomizationCallbacks";
import { RouteAction, StaticRouter } from "@spt/di/Router";
import { ICustomisationStorage } from "@spt/models/eft/common/tables/ICustomisationStorage";
import { IGetSuitsResponse } from "@spt/models/eft/customization/IGetSuitsResponse";
import { IHideoutCustomisation } from "@spt/models/eft/hideout/IHideoutCustomisation";
import { IGetBodyResponseData } from "@spt/models/eft/httpResponse/IGetBodyResponseData";
import { inject, injectable } from "tsyringe";

@injectable()
export class CustomizationStaticRouter extends StaticRouter {
    constructor(@inject("CustomizationCallbacks") protected customizationCallbacks: CustomizationCallbacks) {
        super([
            new RouteAction(
                "/client/trading/customization/storage",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<IGetSuitsResponse>> => {
                    return this.customizationCallbacks.getSuits(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/hideout/customization/offer/list",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<IHideoutCustomisation>> => {
                    return this.customizationCallbacks.getHideoutCustomisation(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/customization/storage",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<ICustomisationStorage[]>> => {
                    return this.customizationCallbacks.getStorage(url, info, sessionID);
                },
            ),
        ]);
    }
}
