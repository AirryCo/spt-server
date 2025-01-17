import { CustomizationController } from "@spt/controllers/CustomizationController";
import type { IEmptyRequestData } from "@spt/models/eft/common/IEmptyRequestData";
import type { IPmcData } from "@spt/models/eft/common/IPmcData";
import type { ICustomisationStorage } from "@spt/models/eft/common/tables/ICustomisationStorage";
import type { ISuit } from "@spt/models/eft/common/tables/ITrader";
import type { IBuyClothingRequestData } from "@spt/models/eft/customization/IBuyClothingRequestData";
import type { ICustomizationSetRequest } from "@spt/models/eft/customization/ICustomizationSetRequest";
import type { IHideoutCustomisation } from "@spt/models/eft/hideout/IHideoutCustomisation";
import type { IGetBodyResponseData } from "@spt/models/eft/httpResponse/IGetBodyResponseData";
import type { IItemEventRouterResponse } from "@spt/models/eft/itemEvent/IItemEventRouterResponse";
import { SaveServer } from "@spt/servers/SaveServer";
import { HttpResponseUtil } from "@spt/utils/HttpResponseUtil";
import { inject, injectable } from "tsyringe";

@injectable()
export class CustomizationCallbacks {
    constructor(
        @inject("CustomizationController") protected customizationController: CustomizationController,
        @inject("SaveServer") protected saveServer: SaveServer,
        @inject("HttpResponseUtil") protected httpResponse: HttpResponseUtil,
    ) {}

    /**
     * Handle client/trading/customization/storage
     * @returns IGetSuitsResponse
     */
    public getCustomisationUnlocks(
        url: string,
        info: IEmptyRequestData,
        sessionID: string,
    ): IGetBodyResponseData<ICustomisationStorage[]> {
        return this.httpResponse.getBody(this.saveServer.getProfile(sessionID).customisationUnlocks);
    }

    /**
     * Handle client/trading/customization
     * @returns ISuit[]
     */
    public getTraderSuits(url: string, info: IEmptyRequestData, sessionID: string): IGetBodyResponseData<ISuit[]> {
        const splittedUrl = url.split("/");
        const traderID = splittedUrl[splittedUrl.length - 3];

        return this.httpResponse.getBody(this.customizationController.getTraderSuits(traderID, sessionID));
    }

    /**
     * Handle CustomizationBuy event
     */
    public buyCustomisation(
        pmcData: IPmcData,
        body: IBuyClothingRequestData,
        sessionID: string,
    ): IItemEventRouterResponse {
        return this.customizationController.buyCustomisation(pmcData, body, sessionID);
    }

    /** Handle client/hideout/customization/offer/list */
    public getHideoutCustomisation(
        url: string,
        info: IEmptyRequestData,
        sessionID: string,
    ): IGetBodyResponseData<IHideoutCustomisation> {
        return this.httpResponse.getBody(this.customizationController.getHideoutCustomisation(sessionID, info));
    }

    /** Handle client/customization/storage */
    public getStorage(
        url: string,
        request: IEmptyRequestData,
        sessionID: string,
    ): IGetBodyResponseData<ICustomisationStorage[]> {
        return this.httpResponse.getBody(this.customizationController.getCustomisationStorage(sessionID, request));
    }

    /** Handle CustomizationSet */
    public setCustomisation(
        pmcData: IPmcData,
        request: ICustomizationSetRequest,
        sessionID: string,
    ): IItemEventRouterResponse {
        return this.customizationController.setCustomisation(sessionID, request, pmcData);
    }
}
