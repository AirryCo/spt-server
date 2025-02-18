import { ApplicationContext } from "@spt/context/ApplicationContext";
import { ContextVariableType } from "@spt/context/ContextVariableType";
import { BotGenerator } from "@spt/generators/BotGenerator";
import { BotDifficultyHelper } from "@spt/helpers/BotDifficultyHelper";
import { BotHelper } from "@spt/helpers/BotHelper";
import { ProfileHelper } from "@spt/helpers/ProfileHelper";
import { WeightedRandomHelper } from "@spt/helpers/WeightedRandomHelper";
import { MinMax } from "@spt/models/common/MinMax";
import { ICondition, IGenerateBotsRequestData } from "@spt/models/eft/bot/IGenerateBotsRequestData";
import { IPmcData } from "@spt/models/eft/common/IPmcData";
import { IBotBase } from "@spt/models/eft/common/tables/IBotBase";
import { IBotCore } from "@spt/models/eft/common/tables/IBotCore";
import { IDifficultyCategories } from "@spt/models/eft/common/tables/IBotType";
import { IGetRaidConfigurationRequestData } from "@spt/models/eft/match/IGetRaidConfigurationRequestData";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { SideType } from "@spt/models/enums/SideType";
import { WildSpawnTypeNumber } from "@spt/models/enums/WildSpawnTypeNumber";
import { IBotGenerationDetails } from "@spt/models/spt/bots/BotGenerationDetails";
import { IBotConfig } from "@spt/models/spt/config/IBotConfig";
import { IPmcConfig } from "@spt/models/spt/config/IPmcConfig";
import type { ILogger } from "@spt/models/spt/utils/ILogger";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { BotGenerationCacheService } from "@spt/services/BotGenerationCacheService";
import { DatabaseService } from "@spt/services/DatabaseService";
import { LocalisationService } from "@spt/services/LocalisationService";
import { MatchBotDetailsCacheService } from "@spt/services/MatchBotDetailsCacheService";
import { SeasonalEventService } from "@spt/services/SeasonalEventService";
import { ProgressWriter } from "@spt/utils/ProgressWriter";
import { RandomUtil } from "@spt/utils/RandomUtil";
import type { ICloner } from "@spt/utils/cloners/ICloner";
import { inject, injectable } from "tsyringe";

@injectable()
export class BotController {
    protected botConfig: IBotConfig;
    protected pmcConfig: IPmcConfig;

    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("DatabaseService") protected databaseService: DatabaseService,
        @inject("BotGenerator") protected botGenerator: BotGenerator,
        @inject("BotHelper") protected botHelper: BotHelper,
        @inject("BotDifficultyHelper") protected botDifficultyHelper: BotDifficultyHelper,
        @inject("WeightedRandomHelper") protected weightedRandomHelper: WeightedRandomHelper,
        @inject("BotGenerationCacheService") protected botGenerationCacheService: BotGenerationCacheService,
        @inject("MatchBotDetailsCacheService") protected matchBotDetailsCacheService: MatchBotDetailsCacheService,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("SeasonalEventService") protected seasonalEventService: SeasonalEventService,
        @inject("ProfileHelper") protected profileHelper: ProfileHelper,
        @inject("ConfigServer") protected configServer: ConfigServer,
        @inject("ApplicationContext") protected applicationContext: ApplicationContext,
        @inject("RandomUtil") protected randomUtil: RandomUtil,
        @inject("PrimaryCloner") protected cloner: ICloner,
    ) {
        this.botConfig = this.configServer.getConfig(ConfigTypes.BOT);
        this.pmcConfig = this.configServer.getConfig(ConfigTypes.PMC);
    }

    /**
     * Return the number of bot load-out varieties to be generated
     * @param type bot Type we want the load-out gen count for
     * @returns number of bots to generate
     */
    public getBotPresetGenerationLimit(type: string): number {
        const value = this.botConfig.presetBatch[type === "assaultGroup" ? "assault" : type];

        if (!value) {
            this.logger.warning(this.localisationService.getText("bot-bot_preset_count_value_missing", type));

            return 10;
        }

        return value;
    }

    /**
     * Handle singleplayer/settings/bot/difficulty
     * Get the core.json difficulty settings from database/bots
     * @returns IBotCore
     */
    public getBotCoreDifficulty(): IBotCore {
        return this.databaseService.getBots().core;
    }

    /**
     * Get bot difficulty settings
     * Adjust PMC settings to ensure they engage the correct bot types
     * @param type what bot the server is requesting settings for
     * @param diffLevel difficulty level server requested settings for
     * @param raidConfig OPTIONAL - applicationContext Data stored at start of raid
     * @param ignoreRaidSettings should raid settings chosen pre-raid be ignored
     * @returns Difficulty object
     */
    public getBotDifficulty(
        type: string,
        diffLevel: string,
        raidConfig?: IGetRaidConfigurationRequestData,
        ignoreRaidSettings = false,
    ): IDifficultyCategories {
        let difficulty = diffLevel.toLowerCase();

        if (!(raidConfig || ignoreRaidSettings)) {
            this.logger.error(
                this.localisationService.getText("bot-missing_application_context", "RAID_CONFIGURATION"),
            );
        }

        // Check value chosen in pre-raid difficulty dropdown
        // If value is not 'asonline', change requested difficulty to be what was chosen in dropdown
        const botDifficultyDropDownValue = raidConfig?.wavesSettings.botDifficulty.toLowerCase() ?? "asonline";
        if (botDifficultyDropDownValue !== "asonline") {
            difficulty =
                this.botDifficultyHelper.convertBotDifficultyDropdownToBotDifficulty(botDifficultyDropDownValue);
        }

        const botDb = this.databaseService.getBots();
        return this.botDifficultyHelper.getBotDifficultySettings(type, difficulty, botDb);
    }

    public getAllBotDifficulties(): Record<string, any> {
        const result = {};

        const botTypesDb = this.databaseService.getBots().types;
        const botTypes = Object.keys(WildSpawnTypeNumber).filter((v) => Number.isNaN(Number(v)));
        for (let botType of botTypes) {
            const enumType = botType.toLowerCase();
            // pmcBEAR/pmcUSEC need to be converted into `usec`/`bear` so we can read difficulty settings from bots/types
            botType = this.botHelper.isBotPmc(botType)
                ? this.botHelper.getPmcSideByRole(botType).toLowerCase()
                : botType.toLowerCase();

            const botDetails = botTypesDb[botType];
            if (!botDetails?.difficulty) {
                this.logger.warning(`Unable to find bot: ${botType} difficulty values`);

                continue;
            }

            const botDifficulties = Object.keys(botDetails.difficulty);
            result[enumType] = {};
            for (const difficulty of botDifficulties) {
                result[enumType][difficulty] = this.getBotDifficulty(enumType, difficulty, null, true);
            }
        }

        return result;
    }

    /**
     * Generate bot profiles and store in cache
     * @param sessionId Session id
     * @param info bot generation request info
     * @returns IBotBase array
     */
    public async generate(sessionId: string, info: IGenerateBotsRequestData): Promise<IBotBase[]> {
        const pmcProfile = this.profileHelper.getPmcProfile(sessionId);

        // If we don't have enough bots cached to satisfy this request, populate the cache
        if (!this.cacheSatisfiesRequest(info))
        {
            await this.generateAndCacheBots(info, pmcProfile, sessionId);
        }

        return this.returnBotsFromCache(info);
    }

    /**
     * Return true if the current cache satisfies the passed in bot generation request
     * @param info 
     * @returns 
     */
    public cacheSatisfiesRequest(info: IGenerateBotsRequestData): boolean {
        return info.conditions.every((condition) => {
            // Create the key that would be used for caching this bot type, so we can check how many exist
            const cacheKey = this.botGenerationCacheService.createCacheKey(
                condition.Role,
                condition.Difficulty
            );

            return this.botGenerationCacheService.getCachedBotCount(cacheKey) >= condition.Limit;
        });
    }

    /**
     * When we have less bots than necessary to fulfill a request, re-populate the cache
     * @param request Bot generation request object
     * @param pmcProfile Player profile
     * @param sessionId Session id
     * @returns IBotBase[]
     */
    protected async generateAndCacheBots(
        request: IGenerateBotsRequestData,
        pmcProfile: IPmcData | undefined,
        sessionId: string,
    ): Promise<void> {
        const raidSettings = this.getMostRecentRaidSettings();

        const allPmcsHaveSameNameAsPlayer = this.randomUtil.getChance100(
            this.pmcConfig.allPMCsHavePlayerNameWithRandomPrefixChance,
        );

        // Map conditions to promises for bot generation
        const conditionPromises = request.conditions.map(async (condition) => {
            // If we already have enough for this bot type, don't generate more
            const cacheKey = this.botGenerationCacheService.createCacheKey(
                condition.Role,
                condition.Difficulty
            );

            if (this.botGenerationCacheService.getCachedBotCount(cacheKey) >= condition.Limit)
            {
                return;
            }

            const botGenerationDetails = this.getBotGenerationDetailsForWave(
                condition,
                pmcProfile,
                allPmcsHaveSameNameAsPlayer,
                raidSettings,
                // Spawn the higher of the preset cache amount, or the requested amount
                Math.max(this.getBotPresetGenerationLimit(condition.Role), condition.Limit),
                this.botHelper.isBotPmc(condition.Role),
            );

            // Generate bots for the current condition
            await this.generateWithBotDetails(condition, botGenerationDetails, sessionId);
        });

        await Promise.all(conditionPromises);
    }

    protected getMostRecentRaidSettings(): IGetRaidConfigurationRequestData {
        const raidSettings = this.applicationContext
            .getLatestValue(ContextVariableType.RAID_CONFIGURATION)
            ?.getValue<IGetRaidConfigurationRequestData>();

        if (raidSettings === undefined) {
            this.logger.warning(this.localisationService.getText("bot-unable_to_load_raid_settings_from_appcontext"));
        }

        return raidSettings;
    }

    /**
     * Get min/max level range values for a specific map
     * @param location Map name e.g. factory4_day
     * @returns MinMax
     */
    protected getPmcLevelRangeForMap(location: string): MinMax {
        if (!location) {
            return undefined;
        }

        return this.pmcConfig.locationSpecificPmcLevelOverride[location.toLowerCase()];
    }

    /**
     * Create a BotGenerationDetails for the bot generator to use
     * @param condition Client data defining bot type and difficulty
     * @param pmcProfile Player who is generating bots
     * @param allPmcsHaveSameNameAsPlayer Should all PMCs have same name as player
     * @param raidSettings Settings chosen pre-raid by player
     * @param botCountToGenerate How many bots to generate
     * @param generateAsPmc Force bot being generated a PMC
     * @returns BotGenerationDetails
     */
    protected getBotGenerationDetailsForWave(
        condition: ICondition,
        pmcProfile: IPmcData | undefined,
        allPmcsHaveSameNameAsPlayer: boolean,
        raidSettings: IGetRaidConfigurationRequestData,
        botCountToGenerate: number,
        generateAsPmc: boolean,
    ): IBotGenerationDetails {
        return {
            isPmc: generateAsPmc,
            side: generateAsPmc ? this.botHelper.getPmcSideByRole(condition.Role) : SideType.SAVAGE,
            role: condition.Role,
            playerLevel: this.getPlayerLevelFromProfile(pmcProfile),
            playerName: pmcProfile?.Info.Nickname,
            botRelativeLevelDeltaMax: this.pmcConfig.botRelativeLevelDeltaMax,
            botRelativeLevelDeltaMin: this.pmcConfig.botRelativeLevelDeltaMin,
            botCountToGenerate: botCountToGenerate,
            botDifficulty: condition.Difficulty,
            locationSpecificPmcLevelOverride: this.getPmcLevelRangeForMap(raidSettings?.location), // Min/max levels for PMCs to generate within
            isPlayerScav: false,
            allPmcsHaveSameNameAsPlayer: allPmcsHaveSameNameAsPlayer,
        };
    }

    /**
     * Get players profile level
     * @param pmcProfile Profile to get level from
     * @returns Level as number
     */
    protected getPlayerLevelFromProfile(pmcProfile: IPmcData | undefined): number {
        return pmcProfile?.Info.Level || 1;
    }

    /**
     * Generate many bots and store then on the cache
     * @param condition the condition details to generate the bots with
     * @param botGenerationDetails the bot details to generate the bot with
     * @param sessionId Session id
     * @returns A promise for the bots to be done generating
     */
    protected async generateWithBotDetails(
        condition: ICondition,
        botGenerationDetails: IBotGenerationDetails,
        sessionId: string,
    ): Promise<void> {
        const isEventBot = condition.Role.toLowerCase().includes("event");
        if (isEventBot) {
            // Add eventRole data + reassign role property to be base type
            botGenerationDetails.eventRole = condition.Role;
            botGenerationDetails.role = this.seasonalEventService.getBaseRoleForEventBot(
                botGenerationDetails.eventRole,
            );
        }

        // Create a compound key to store bots in cache against
        const cacheKey = this.botGenerationCacheService.createCacheKey(
            botGenerationDetails.eventRole ?? botGenerationDetails.role,
            botGenerationDetails.botDifficulty,
        );

        // Get number of bots we have in cache
        const botCacheCount = this.botGenerationCacheService.getCachedBotCount(cacheKey);

        if (botCacheCount >= botGenerationDetails.botCountToGenerate) {
            this.logger.debug(`Cache already has sufficient ${cacheKey} bots: ${botCacheCount}, skipping generation`);
            return;
        }

        // We're below desired count, add bots to cache
        const botsToGenerate = botGenerationDetails.botCountToGenerate - botCacheCount;
        const progressWriter = new ProgressWriter(botGenerationDetails.botCountToGenerate);

        this.logger.debug(`Generating ${botsToGenerate} bots for cacheKey: ${cacheKey}`);

        const botGenerationPromises = Array.from({ length: botsToGenerate }, async (_, i) => {
            try {
                const detailsClone = await this.cloner.cloneAsync(botGenerationDetails);
                await this.generateSingleBotAndStoreInCache(detailsClone, sessionId, cacheKey);
                progressWriter.increment();
            } catch (error) {
                this.logger.error(`Failed to generate bot #${i + 1}: ${error.message}`);
            }
        });

        // Use allSettled here, this allows us to continue even if one of the promises is rejected
        await Promise.allSettled(botGenerationPromises);

        this.logger.debug(
            `Generated ${botGenerationDetails.botCountToGenerate} ${botGenerationDetails.role} (${
                botGenerationDetails.eventRole ?? botGenerationDetails.role ?? ""
            }) ${botGenerationDetails.botDifficulty} bots`,
        );
    }

    /**
     * Generate a single bot and store in the cache
     * @param botGenerationDetails the bot details to generate the bot with
     * @param sessionId Session id
     * @param cacheKey the cache key to store the bot with
     * @returns A promise for the bot to be stored
     */
    protected async generateSingleBotAndStoreInCache(
        botGenerationDetails: IBotGenerationDetails,
        sessionId: string,
        cacheKey: string,
    ): Promise<void> {
        const botToCache = await this.botGenerator.prepareAndGenerateBot(sessionId, botGenerationDetails);
        this.botGenerationCacheService.storeBots(cacheKey, [botToCache]);

        // Store bot details in cache so post-raid PMC messages can use data
        this.matchBotDetailsCacheService.cacheBot(botToCache);
    }

    /**
     * Return the bots requested by the given bot generation request
     * @param sessionId Session id
     * @param request Bot generation request object
     * @returns An array of IBotBase objects as requested by request
     */
    protected async returnBotsFromCache(
        request: IGenerateBotsRequestData,
    ): Promise<IBotBase[]> {
        const desiredBots: IBotBase[] = [];

        // We can assume that during this call, we have enough bots cached to cover the request
        request.conditions.map((requestedBot) => {
            // Create a compound key to store bots in cache against
            const cacheKey = this.botGenerationCacheService.createCacheKey(
                requestedBot.Role,
                requestedBot.Difficulty,
            );

            // Fetch enough bots to satisfy the request
            for (let i = 0; i < requestedBot.Limit; i++)
            {
                const desiredBot = this.botGenerationCacheService.getBot(cacheKey);
                this.botGenerationCacheService.storeUsedBot(desiredBot);
                desiredBots.push(desiredBot);
            }
        });

        return desiredBots;
    }

    /**
     * Get the difficulty passed in, if its not "asonline", get selected difficulty from config
     * @param requestedDifficulty
     * @returns
     */
    public getPMCDifficulty(requestedDifficulty: string): string {
        // Maybe return a random difficulty...
        if (this.pmcConfig.difficulty.toLowerCase() === "asonline") {
            return requestedDifficulty;
        }

        if (this.pmcConfig.difficulty.toLowerCase() === "random") {
            return this.botDifficultyHelper.chooseRandomDifficulty();
        }

        return this.pmcConfig.difficulty;
    }

    /**
     * Get the max number of bots allowed on a map
     * Looks up location player is entering when getting cap value
     * @param location The map location cap was requested for
     * @returns cap number
     */
    public getBotCap(location: string): number {
        const botCap = this.botConfig.maxBotCap[location.toLowerCase()];
        if (location === "default") {
            this.logger.warning(
                this.localisationService.getText("bot-no_bot_cap_found_for_location", location.toLowerCase()),
            );
        }

        return botCap;
    }

    public getAiBotBrainTypes(): any {
        return {
            pmc: this.pmcConfig.pmcType,
            assault: this.botConfig.assaultBrainType,
            playerScav: this.botConfig.playerScavBrainType,
        };
    }
}
