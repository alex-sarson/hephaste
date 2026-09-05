import { describe, expect, it } from "vitest";
import { INDUSTRY_PRESETS, onboardingRequestSchema } from "./account.js";
import { industrySchema } from "./enums.js";

describe("INDUSTRY_PRESETS", () => {
  it("has a preset for every value in industrySchema", () => {
    for (const industry of industrySchema.options) {
      expect(INDUSTRY_PRESETS[industry]).toBeDefined();
    }
  });

  it("gives every preset non-empty job/customer/asset labels", () => {
    for (const preset of Object.values(INDUSTRY_PRESETS)) {
      for (const pair of [preset.job, preset.customer, preset.asset]) {
        expect(pair.singular.length).toBeGreaterThan(0);
        expect(pair.plural.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("onboardingRequestSchema", () => {
  it("accepts a full preset-shaped payload", () => {
    const preset = INDUSTRY_PRESETS.BEAUTY;
    const result = onboardingRequestSchema.safeParse({
      industry: "BEAUTY",
      jobLabelSingular: preset.job.singular,
      jobLabelPlural: preset.job.plural,
      customerLabelSingular: preset.customer.singular,
      customerLabelPlural: preset.customer.plural,
      assetLabelSingular: preset.asset.singular,
      assetLabelPlural: preset.asset.plural,
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty label", () => {
    const preset = INDUSTRY_PRESETS.TRADES;
    const result = onboardingRequestSchema.safeParse({
      industry: "TRADES",
      jobLabelSingular: "",
      jobLabelPlural: preset.job.plural,
      customerLabelSingular: preset.customer.singular,
      customerLabelPlural: preset.customer.plural,
      assetLabelSingular: preset.asset.singular,
      assetLabelPlural: preset.asset.plural,
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unrecognized industry", () => {
    const preset = INDUSTRY_PRESETS.TRADES;
    const result = onboardingRequestSchema.safeParse({
      industry: "PHOTOGRAPHY",
      jobLabelSingular: preset.job.singular,
      jobLabelPlural: preset.job.plural,
      customerLabelSingular: preset.customer.singular,
      customerLabelPlural: preset.customer.plural,
      assetLabelSingular: preset.asset.singular,
      assetLabelPlural: preset.asset.plural,
    });
    expect(result.success).toBe(false);
  });
});
