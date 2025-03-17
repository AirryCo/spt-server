import { IBossLocationSpawn, ILocationBase } from "@spt/models/eft/common/ILocationBase";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { IPmcConfig } from "@spt/models/spt/config/IPmcConfig";
import type { ILogger } from "@spt/models/spt/utils/ILogger";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { DatabaseService } from "@spt/services/DatabaseService";
import { RandomUtil } from "@spt/utils/RandomUtil";
import { inject, injectable } from "tsyringe";

@injectable()
export class PmcWaveGenerator {
    protected pmcConfig: IPmcConfig;

    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("RandomUtil") protected randomUtil: RandomUtil,
        @inject("DatabaseService") protected databaseService: DatabaseService,
        @inject("ConfigServer") protected configServer: ConfigServer,
    ) {
        this.pmcConfig = this.configServer.getConfig(ConfigTypes.PMC);
    }

    /**
     * Add a pmc wave to a map
     * @param locationId e.g. factory4_day, bigmap
     * @param waveToAdd Boss wave to add to map
     */
    public AddPmcWaveToLocation(locationId: string, waveToAdd: IBossLocationSpawn): void {
        this.pmcConfig.customPmcWaves[locationId].push(waveToAdd);
    }

    /**
     * Add custom boss and normal waves to maps found in config/location.json to db
     */
    public applyWaveChangesToAllMaps(): void {
        for (const location of Object.keys(this.pmcConfig.customPmcWaves)) {
            this.applyWaveChangesToMapByName(location);
        }
    }

    public applyWaveChangesToMapByName(name: string): void {
        const pmcWavesToAdd = this.pmcConfig.customPmcWaves[name];
        if (!pmcWavesToAdd) {
            return;
        }

        const location = this.databaseService.getLocation(name);
        if (!location) {
            return;
        }

        location.base.BossLocationSpawn.push(...pmcWavesToAdd);
    }

    public applyWaveChangesToMap(location: ILocationBase): void {
        const pmcWavesToAdd = this.pmcConfig.customPmcWaves[location.Id.toLowerCase()];
        if (!pmcWavesToAdd) {
            return;
        }

        location.BossLocationSpawn.push(...pmcWavesToAdd);
    }
}
