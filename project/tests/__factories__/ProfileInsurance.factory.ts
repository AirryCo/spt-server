import "reflect-metadata";

import { ItemHelper } from "@spt/helpers/ItemHelper";
import { IInsurance } from "@spt/models/eft/profile/ISptProfile";
import { profileInsuranceFixture } from "@tests/__fixture__/profileInsurance.fixture";
import { container } from "tsyringe";

type DateInput = number | number[] | { [index: number]: number };

export class ProfileInsuranceFactory {
    private profileInsuranceFixture: IInsurance[];

    constructor() {
        this.init();
    }

    public init(): this {
        this.profileInsuranceFixture = JSON.parse(JSON.stringify(profileInsuranceFixture)); // Deep clone.
        return this;
    }

    /**
     * Adjusts the scheduledTime, messageContent.systemData.date, and messageContent.systemData.time, otherwise the
     * dates in the original fixture will likely be expired.
     */
    public adjustPackageDates(dateInput?: DateInput): this {
        this.profileInsuranceFixture = this.profileInsuranceFixture.map((insurance, index) => {
            // Default to 1 hour ago.
            const defaultDate = Math.floor(Date.now() / 1000 - 1 * 60 * 60);

            let date: number;
            if (Array.isArray(dateInput) || typeof dateInput === "object") {
                date = dateInput[index] || defaultDate;
            } else {
                date = dateInput || defaultDate;
            }

            const dateObject = new Date(date * 1000); // Convert UNIX timestamp to milliseconds

            const month = (dateObject.getUTCMonth() + 1).toString().padStart(2, "0");
            const day = dateObject.getUTCDate().toString().padStart(2, "0");
            const year = dateObject.getUTCFullYear();
            const hours = dateObject.getUTCHours().toString().padStart(2, "0");
            const minutes = dateObject.getUTCMinutes().toString().padStart(2, "0");

            insurance.scheduledTime = date;
            insurance.systemData.date = `${month}.${day}.${year}`;
            insurance.systemData.time = `${hours}:${minutes}`;
            return insurance;
        });

        return this;
    }

    /**
     * Removes all attachment items that are currently attached to their parent, leaving the "normal" base items.
     */
    public removeAttachmentItems(): this {
        const itemHelper = container.resolve<ItemHelper>("ItemHelper");

        this.profileInsuranceFixture = this.profileInsuranceFixture.map((insurance) => {
            insurance.items = insurance.items.filter((item) => !itemHelper.isAttachmentAttached(item));
            return insurance;
        });

        return this;
    }

    /**
     * Removes all normal base items leaving only attachment items that are currently attached to their parent.
     * This *will* cause orphaned attachments.
     */
    public removeRegularItems(): this {
        const itemHelper = container.resolve<ItemHelper>("ItemHelper");

        this.profileInsuranceFixture = this.profileInsuranceFixture.map((insurance) => {
            insurance.items = insurance.items.filter((item) => itemHelper.isAttachmentAttached(item));
            return insurance;
        });

        return this;
    }

    public get(): IInsurance[] {
        return this.profileInsuranceFixture;
    }
}
