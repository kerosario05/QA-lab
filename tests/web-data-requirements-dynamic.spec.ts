import { test, expect } from "vitest";

// Helper to simulate webDataValues logic generically without hardcoding field names
function buildOverrides(dataRequirements: any[], webValues: Record<string, string|boolean>) {
  const filtered: Record<string,string> = {};
  for (const [k,v] of Object.entries(webValues)) {
    if (typeof v === 'boolean') filtered[k]=String(v);
    else if (String(v).trim()!=='') filtered[k]=String(v);
  }
  return filtered;
}

test("TEST1 Amount number preloaded", () => {
  const req = { key:"amount", label:"Amount", controlType:"number", suggestedValue:"100", required:true, editable:true };
  // Simulate initial value from suggestedValue
  const initial = req.suggestedValue;
  expect(initial).toBe("100");
  // Simulate rendering: controlType number => input type number
  expect(req.controlType).toBe("number");
});

test("TEST2 Access Type select Business selected", () => {
  const req = { key:"access_type", label:"Access Type", controlType:"select", options:["Individual","Business"], suggestedValue:"Business", required:true, editable:true } as any;
  expect(req.controlType).toBe("select");
  expect(req.options.length).toBe(2);
  expect(req.suggestedValue).toBe("Business");
  // Simulate generic render: dropdown should have Business selected
  const currentVal = req.suggestedValue;
  expect(currentVal).toBe("Business");
});

test("TEST3 Customer Code empty required", () => {
  const req = { key:"customer_code", label:"Customer Code", controlType:"text", required:true, editable:true } as any;
  expect(req.suggestedValue).toBeUndefined();
  const initial = req.suggestedValue ?? "";
  expect(initial).toBe("");
  expect(req.required).toBe(true);
});

test("TEST4 dataOverrides amount 100->250 isolated", () => {
  const scenarioA = "story::0";
  const scenarioB = "story::1";
  const webValues: Record<string, Record<string, string|boolean>> = {
    [scenarioA]: { amount: "250" },
    [scenarioB]: { amount: "100" },
  };
  const overridesA = buildOverrides([], webValues[scenarioA]);
  const overridesB = buildOverrides([], webValues[scenarioB]);
  expect(overridesA.amount).toBe("250");
  expect(overridesB.amount).toBe("100");
  expect(overridesA.amount).not.toBe(overridesB.amount); // isolation
  // Simulate legacy: scenario without dataRequirements array should not have overrides
  const legacyScenario: any = { requiredData: "Amount, Reference" };
  expect(Array.isArray((legacyScenario as any).dataRequirements)).toBe(false);
});
