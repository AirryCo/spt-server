export interface ICustomisationStorage {
    id: string; // Customiastion.json/itemId
    source: CustomisationSource;
    type: CustomisationType;
}

export enum CustomisationType {
    SUITE = "suite",
    DOG_TAG = "dogTag",
    HEAD = "head",
    VOICE = "voice",
    GESTURE = "gesture",
    ENVIRONMENT = "environment",
    WALL = "wall",
    FLOOR = "floor",
    CEILING = "ceiling",
    LIGHT = "light",
    SHOOTING_RANGE_MARK = "shootingRangeMark",
    CAT = "cat",
    MANNEQUIN_POSE = "mannequinPose",
}

export enum CustomisationSource {
    QUEST = "quest",
    PRESTIGE = "prestige",
    ACHIEVEMENT = "achievement",
    UNLOCKED_IN_GAME = "unlockedInGame",
    PAID = "paid",
    DROP = "drop",
    DEFAULT = "default",
}
