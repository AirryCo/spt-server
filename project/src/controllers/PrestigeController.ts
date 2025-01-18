import { PlayerScavGenerator } from "@spt/generators/PlayerScavGenerator";
import { DialogueHelper } from "@spt/helpers/DialogueHelper";
import { InventoryHelper } from "@spt/helpers/InventoryHelper";
import type { ItemHelper } from "@spt/helpers/ItemHelper";
import { ProfileHelper } from "@spt/helpers/ProfileHelper";
import { QuestHelper } from "@spt/helpers/QuestHelper";
import { TraderHelper } from "@spt/helpers/TraderHelper";
import { CustomisationSource } from "@spt/models/eft/common/tables/ICustomisationStorage";
import { IPrestige } from "@spt/models/eft/common/tables/IPrestige";
import { IReward } from "@spt/models/eft/common/tables/IReward";
import { IAddItemDirectRequest } from "@spt/models/eft/inventory/IAddItemDirectRequest";
import { IAddItemsDirectRequest } from "@spt/models/eft/inventory/IAddItemsDirectRequest";
import { IObtainPrestigeRequest } from "@spt/models/eft/prestige/IObtainPrestigeRequest";
import { IProfileCreateRequestData } from "@spt/models/eft/profile/IProfileCreateRequestData";
import { ISptProfile } from "@spt/models/eft/profile/ISptProfile";
import { SkillTypes } from "@spt/models/enums/SkillTypes";
import type { ILogger } from "@spt/models/spt/utils/ILogger";
import { EventOutputHolder } from "@spt/routers/EventOutputHolder";
import { SaveServer } from "@spt/servers/SaveServer";
import { CreateProfileService } from "@spt/services/CreateProfileService";
import { DatabaseService } from "@spt/services/DatabaseService";
import { LocalisationService } from "@spt/services/LocalisationService";
import { MailSendService } from "@spt/services/MailSendService";
import { ProfileFixerService } from "@spt/services/ProfileFixerService";
import { SeasonalEventService } from "@spt/services/SeasonalEventService";
import { HashUtil } from "@spt/utils/HashUtil";
import { TimeUtil } from "@spt/utils/TimeUtil";
import type { ICloner } from "@spt/utils/cloners/ICloner";
import { inject, injectable } from "tsyringe";
import type { IEmptyRequestData } from "../models/eft/common/IEmptyRequestData";

@injectable()
export class PrestigeController {
    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("HashUtil") protected hashUtil: HashUtil,
        @inject("PrimaryCloner") protected cloner: ICloner,
        @inject("TimeUtil") protected timeUtil: TimeUtil,
        @inject("SaveServer") protected saveServer: SaveServer,
        @inject("DatabaseService") protected databaseService: DatabaseService,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("ProfileFixerService") protected profileFixerService: ProfileFixerService,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("CreateProfileService") protected createProfileService: CreateProfileService,
        @inject("SeasonalEventService") protected seasonalEventService: SeasonalEventService,
        @inject("MailSendService") protected mailSendService: MailSendService,
        @inject("PlayerScavGenerator") protected playerScavGenerator: PlayerScavGenerator,
        @inject("EventOutputHolder") protected eventOutputHolder: EventOutputHolder,
        @inject("TraderHelper") protected traderHelper: TraderHelper,
        @inject("DialogueHelper") protected dialogueHelper: DialogueHelper,
        @inject("InventoryHelper") protected inventoryHelper: InventoryHelper,
        @inject("QuestHelper") protected questHelper: QuestHelper,
        @inject("ProfileHelper") protected profileHelper: ProfileHelper,
    ) {}

    /**
     * Handle /client/prestige/list
     */
    public getPrestige(sessionID: string, info: IEmptyRequestData): IPrestige {
        return this.databaseService.getTemplates().prestige;
    }

    /**
     * Handle /client/prestige/obtain
     */
    public async obtainPrestige(sessionId: string, request: IObtainPrestigeRequest[]): Promise<void> {
        const prePrestigeProfileClone = this.cloner.clone(this.profileHelper.getFullProfile(sessionId));
        const prePrestigePmc = prePrestigeProfileClone.characters.pmc;
        const createRequest: IProfileCreateRequestData = {
            side: prePrestigePmc.Info.Side,
            nickname: prePrestigePmc.Info.Nickname,
            headId: prePrestigePmc.Customization.Head,
            voiceId: Object.values(this.databaseService.getTemplates().customization).find(
                (customisation) => customisation._name === prePrestigePmc.Info.Voice,
            )._id,
            sptForcePrestigeLevel: prePrestigeProfileClone.characters.pmc.Info.PrestigeLevel + 1, // Current + 1,
        };

        // Reset profile
        await this.createProfileService.createProfile(sessionId, createRequest);

        // Get freshly reset profile ready for editing
        const newProfile = this.profileHelper.getFullProfile(sessionId);
        if (!newProfile) {
            this.logger.error(`Unable to create get new profile for: ${sessionId}`);

            return;
        }

        // Skill copy
        // TODO - Find what skills should be prestiged over
        const commonSKillsToCopy = prePrestigePmc.Skills.Common;
        for (const skillToCopy of commonSKillsToCopy) {
            // Set progress to max level 20
            skillToCopy.Progress = Math.min(skillToCopy.Progress, 2000);
            const existingSkill = newProfile.characters.pmc.Skills.Common.find((skill) => skill.Id === skillToCopy.Id);
            if (existingSkill) {
                existingSkill.Progress = skillToCopy.Progress;
            } else {
                newProfile.characters.pmc.Skills.Common.push(skillToCopy);
            }
        }

        const masteringSkillsToCopy = prePrestigePmc.Skills.Mastering;
        for (const skillToCopy of masteringSkillsToCopy) {
            // Set progress to max level 20
            skillToCopy.Progress = Math.min(skillToCopy.Progress, 2000);
            const existingSkill = newProfile.characters.pmc.Skills.Mastering.find(
                (skill) => skill.Id === skillToCopy.Id,
            );
            if (existingSkill) {
                existingSkill.Progress = skillToCopy.Progress;
            } else {
                newProfile.characters.pmc.Skills.Mastering.push(skillToCopy);
            }
        }

        const indexOfPrestigeObtained = Math.min(createRequest.sptForcePrestigeLevel - 1, 1); // Index starts at 0
        // Assumes Prestige data is in descending order
        const currentPrestigeData = this.databaseService.getTemplates().prestige.elements[indexOfPrestigeObtained];
        const prestigeRewards = this.databaseService
            .getTemplates()
            .prestige.elements.slice(0, indexOfPrestigeObtained + 1)
            .flatMap((prestige) => prestige.rewards);

        this.addPrestigeRewardsToProfile(sessionId, newProfile, prestigeRewards);

        // Flag profile as having achieved this prestige level
        newProfile.characters.pmc.Prestige[currentPrestigeData.id] = this.timeUtil.getTimestamp();

        // Copy transferred items
        for (const transferRequest of request) {
            const item = prePrestigePmc.Inventory.items.find((item) => item._id === transferRequest.id);
            if (!item) {
                this.logger.error(
                    `Unable to find item with id: ${transferRequest.id} in profile: ${sessionId}, skipping`,
                );

                continue;
            }
            const addItemRequest: IAddItemDirectRequest = {
                itemWithModsToAdd: [item],
                foundInRaid: item.upd?.SpawnedInSession ?? false,
                useSortingTable: false,
            };
            this.inventoryHelper.addItemToStash(
                sessionId,
                addItemRequest,
                newProfile.characters.pmc,
                this.eventOutputHolder.getOutput(sessionId),
            );
        }

        // Add "Prestigious" achievement
        if (!newProfile.achievements["676091c0f457869a94017a23"]) {
            newProfile.achievements["676091c0f457869a94017a23"] = this.timeUtil.getTimestamp();
        }

        // Force save of above changes to disk
        await this.saveServer.saveProfile(sessionId);
    }

    protected addPrestigeRewardsToProfile(sessionId: string, newProfile: ISptProfile, rewards: IReward[]) {
        for (const reward of rewards) {
            switch (reward.type) {
                case "CustomizationDirect": {
                    this.profileHelper.addHideoutCustomisationUnlock(newProfile, reward, CustomisationSource.PRESTIGE);
                    break;
                }
                case "Skill":
                    this.profileHelper.addSkillPointsToPlayer(
                        newProfile.characters.pmc,
                        reward.target as SkillTypes,
                        reward.value as number,
                    );
                    break;
                case "Item": {
                    const addItemRequest: IAddItemDirectRequest = {
                        itemWithModsToAdd: reward.items,
                        foundInRaid: reward.items[0]?.upd?.SpawnedInSession,
                        useSortingTable: false,
                        callback: null,
                    };
                    this.inventoryHelper.addItemToStash(
                        sessionId,
                        addItemRequest,
                        newProfile.characters.pmc,
                        this.eventOutputHolder.getOutput(sessionId),
                    );
                    break;
                }
                // case "ExtraDailyQuest": {
                //     // todo
                //     break;
                // }
                default:
                    this.logger.error(`Unhandled prestige reward type: ${reward.type}`);
                    break;
            }
        }
    }
}
