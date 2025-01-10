import buildInfo from "@spt/entry/build.json" assert { type: "json" };
import fs from "fs-extra";
import { EntryType } from "./models/enums/EntryType";

// biome-ignore lint/complexity/noStaticOnlyClass:
export class ProgramStatics {
    private static _ENTRY_TYPE: EntryType;

    private static _DEBUG: boolean;
    private static _COMPILED: boolean;
    private static _MODS: boolean;

    private static _EXPECTED_NODE: string;
    private static _SPT_VERSION: string;
    private static _COMMIT: string;
    private static _BUILD_TIME: number;

    public static initialize(): void {
        ProgramStatics._ENTRY_TYPE = buildInfo.entryType as EntryType;

        // If running the local entry, the expected node version can be fetched from the package.json file. In built
        // entries, the expected node version is set at build and can be fetched from the build.json file.
        if (ProgramStatics._ENTRY_TYPE === EntryType.LOCAL) {
            const packageInfo = JSON.parse(fs.readFileSync("./package.json", "utf8"));
            ProgramStatics._EXPECTED_NODE = packageInfo?.engines?.node ?? "";
        } else {
            ProgramStatics._EXPECTED_NODE = buildInfo.expectedNode;
        }

        ProgramStatics._SPT_VERSION = buildInfo.sptVersion ?? "";
        ProgramStatics._COMMIT = buildInfo.commit ?? "";
        ProgramStatics._BUILD_TIME = buildInfo.buildTime ?? 0;

        switch (ProgramStatics._ENTRY_TYPE) {
            case EntryType.RELEASE:
                ProgramStatics._DEBUG = false;
                ProgramStatics._COMPILED = true;
                ProgramStatics._MODS = true;
                break;
            case EntryType.BLEEDING_EDGE:
                ProgramStatics._DEBUG = true;
                ProgramStatics._COMPILED = true;
                ProgramStatics._MODS = false;
                break;
            case EntryType.DEBUG:
            case EntryType.BLEEDING_EDGE_MODS:
                ProgramStatics._DEBUG = true;
                ProgramStatics._COMPILED = true;
                ProgramStatics._MODS = true;
                break;
            default: // EntryType.LOCAL
                ProgramStatics._DEBUG = true;
                ProgramStatics._COMPILED = false;
                ProgramStatics._MODS = true;
                break;
        }
    }

    // Public Static Getters
    public static get ENTRY_TYPE(): EntryType {
        return ProgramStatics._ENTRY_TYPE;
    }
    public static get DEBUG(): boolean {
        return ProgramStatics._DEBUG;
    }
    public static get COMPILED(): boolean {
        return ProgramStatics._COMPILED;
    }
    public static get MODS(): boolean {
        return ProgramStatics._MODS;
    }
    public static get EXPECTED_NODE(): string {
        return ProgramStatics._EXPECTED_NODE;
    }
    public static get SPT_VERSION(): string {
        return ProgramStatics._SPT_VERSION;
    }
    public static get COMMIT(): string {
        return ProgramStatics._COMMIT;
    }
    public static get BUILD_TIME(): number {
        return ProgramStatics._BUILD_TIME;
    }
}
