import { ItemHelper } from "@spt/helpers/ItemHelper";
import { PaymentHelper } from "@spt/helpers/PaymentHelper";
import { PresetHelper } from "@spt/helpers/PresetHelper";
import { ProfileHelper } from "@spt/helpers/ProfileHelper";
import { TraderHelper } from "@spt/helpers/TraderHelper";
import { IPmcData } from "@spt/models/eft/common/IPmcData";
import { IItem } from "@spt/models/eft/common/tables/IItem";
import { IQuest } from "@spt/models/eft/common/tables/IQuest";
import { IReward } from "@spt/models/eft/common/tables/IReward";
import { IItemEventRouterResponse } from "@spt/models/eft/itemEvent/IItemEventRouterResponse";
import { QuestStatus } from "@spt/models/enums/QuestStatus";
import { SkillTypes } from "@spt/models/enums/SkillTypes";
import type { ILogger } from "@spt/models/spt/utils/ILogger";
import { DatabaseService } from "@spt/services/DatabaseService";
import { LocalisationService } from "@spt/services/LocalisationService";
import { HashUtil } from "@spt/utils/HashUtil";
import type { ICloner } from "@spt/utils/cloners/ICloner";
import { inject, injectable } from "tsyringe";
import { RewardHelper } from "@spt/helpers/RewardHelper";
import { CustomisationSource } from "@spt/models/eft/common/tables/ICustomisationStorage";

@injectable()
export class QuestRewardHelper {
    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("HashUtil") protected hashUtil: HashUtil,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("DatabaseService") protected databaseService: DatabaseService,
        @inject("ProfileHelper") protected profileHelper: ProfileHelper,
        @inject("PaymentHelper") protected paymentHelper: PaymentHelper,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("TraderHelper") protected traderHelper: TraderHelper,
        @inject("PresetHelper") protected presetHelper: PresetHelper,
        @inject("PrimaryCloner") protected cloner: ICloner,
        @inject("RewardHelper") protected rewardHelper: RewardHelper,
    ) {}

    /**
     * Give player quest rewards - Skills/exp/trader standing/items/assort unlocks - Returns reward items player earned
     * @param profileData Player profile (scav or pmc)
     * @param questId questId of quest to get rewards for
     * @param state State of the quest to get rewards for
     * @param sessionId Session id
     * @param questResponse Response to send back to client
     * @returns Array of reward objects
     */
    public applyQuestReward(
        profileData: IPmcData,
        questId: string,
        state: QuestStatus,
        sessionId: string,
        questResponse: IItemEventRouterResponse,
    ): IItem[] {
        // Repeatable quest base data is always in PMCProfile, `profileData` may be scav profile
        // TODO: consider moving repeatable quest data to profile-agnostic location
        const fullProfile = this.profileHelper.getFullProfile(sessionId);
        const pmcProfile = fullProfile?.characters.pmc;
        if (!pmcProfile) {
            this.logger.error(`Unable to get pmc profile for: ${sessionId}, no rewards given`);
            return [];
        }

        let questDetails = this.getQuestFromDb(questId, pmcProfile);
        if (!questDetails) {
            this.logger.warning(
                this.localisationService.getText("quest-unable_to_find_quest_in_db_no_quest_rewards", questId),
            );

            return [];
        }

        // Check for and apply intel center money bonus if it exists
        const questMoneyRewardBonusMultiplier = this.getQuestMoneyRewardBonusMultiplier(pmcProfile);
        if (questMoneyRewardBonusMultiplier > 0) {
            // Apply additional bonus from hideout skill
            questDetails = this.applyMoneyBoost(questDetails, questMoneyRewardBonusMultiplier, state); // money = money + (money * intelCenterBonus / 100)
        }

        // e.g. 'Success' or 'AvailableForFinish'
        const questStateAsString = QuestStatus[state];
        const rewards = <IReward[]>questDetails.rewards[questStateAsString];
        return this.rewardHelper.applyRewards(
            rewards,
            CustomisationSource.UNLOCKED_IN_GAME,
            fullProfile,
            profileData,
            questId,
            questResponse,
        );
    }

    /**
     * Get quest by id from database (repeatables are stored in profile, check there if questId not found)
     * @param questId Id of quest to find
     * @param pmcData Player profile
     * @returns IQuest object
     */
    protected getQuestFromDb(questId: string, pmcData: IPmcData): IQuest {
        // May be a repeatable quest
        let quest = this.databaseService.getQuests()[questId];
        if (!quest) {
            // Check daily/weekly objects
            for (const repeatableType of pmcData.RepeatableQuests) {
                quest = <IQuest>(<unknown>repeatableType.activeQuests.find((repeatable) => repeatable._id === questId));
                if (quest) {
                    break;
                }
            }
        }

        return quest;
    }

    /**
     * Get players money reward bonus from profile
     * @param pmcData player profile
     * @returns bonus as a percent
     */
    protected getQuestMoneyRewardBonusMultiplier(pmcData: IPmcData): number {
        // Check player has intel center
        const moneyRewardBonuses = pmcData.Bonuses.filter((profileBonus) => profileBonus.type === "QuestMoneyReward");

        // Get a total of the quest money reward percent bonuses
        const moneyRewardBonusPercent = moneyRewardBonuses.reduce((acc, cur) => acc + cur.value, 0);

        // Calculate hideout management bonus as a percentage (up to 51% bonus)
        const hideoutManagementSkill = this.profileHelper.getSkillFromProfile(pmcData, SkillTypes.HIDEOUT_MANAGEMENT);

        // 5100 becomes 0.51, add 1 to it, 1.51
        // We multiply the money reward bonuses by the hideout management skill multipler, giving the new result
        const hideoutManagementBonusMultipler = hideoutManagementSkill
            ? 1 + hideoutManagementSkill.Progress / 10000
            : 1;

        // e.g 15% * 1.4
        return moneyRewardBonusPercent * hideoutManagementBonusMultipler;
    }

    /**
     * Adjust quest money rewards by passed in multiplier
     * @param quest Quest to multiple money rewards
     * @param bonusPercent Pecent to adjust money rewards by
     * @param questStatus Status of quest to apply money boost to rewards of
     * @returns Updated quest
     */
    public applyMoneyBoost(quest: IQuest, bonusPercent: number, questStatus: QuestStatus): IQuest {
        const clonedQuest = this.cloner.clone(quest);
        const rewards: IReward[] = clonedQuest.rewards?.[QuestStatus[questStatus]] ?? [];
        const currencyRewards = rewards.filter(
            (reward) => reward.type === "Item" && this.paymentHelper.isMoneyTpl(reward.items[0]._tpl),
        );
        for (const reward of currencyRewards) {
            // Add % bonus to existing StackObjectsCount
            const rewardItem = reward.items[0];
            const newCurrencyAmount = Math.floor(rewardItem.upd.StackObjectsCount * (1 + bonusPercent / 100));
            rewardItem.upd.StackObjectsCount = newCurrencyAmount;
            reward.value = newCurrencyAmount;
        }

        return clonedQuest;
    }
}
