import { describe, expect, it } from "vitest";
import { mailboxName, moveSelection, plural, shortcutFor, todayState, uncertainties } from "./today-view";

describe("uncertainties", () => {
  it("merges questions and placeholders without duplicates, and lists warnings", () => {
    const u = uncertainties({
      questions: ["Délai de livraison ?"],
      draftPreview: "Bonjour, le prix est [[À CONFIRMER : prix au m²]] et le délai [[délai de livraison ?]].",
      flags: ["guard:amount", "guard:phone", "unknown_flag"],
    });
    expect(u.items).toEqual(["Délai de livraison ?", "prix au m²"]);
    expect(u.warnings).toEqual(["Des informations non sourcées ont été remplacées par des questions."]);
  });
  it("does not repeat a spot already covered by a question", () => {
    const u = uncertainties({
      questions: ["Quel est votre prix au m² ?"],
      draftPreview: "Nous comptons [[À CONFIRMER : prix au m²]].",
      flags: [],
    });
    expect(u.items).toEqual(["Quel est votre prix au m² ?"]);
  });
  it("is empty for a confident draft", () => {
    expect(uncertainties({ questions: [], draftPreview: "Bonjour", flags: [] })).toEqual({ items: [], warnings: [] });
  });
});

describe("shortcutFor", () => {
  it("maps j/k/o/e", () => {
    expect(shortcutFor({ key: "j" })).toBe("next");
    expect(shortcutFor({ key: "k" })).toBe("previous");
    expect(shortcutFor({ key: "o" })).toBe("open");
    expect(shortcutFor({ key: "e" })).toBe("answer");
    expect(shortcutFor({ key: "x" })).toBeNull();
  });
  it("ignores typing and modifiers", () => {
    expect(shortcutFor({ key: "j", target: { tagName: "textarea" } })).toBeNull();
    expect(shortcutFor({ key: "j", target: { tagName: "INPUT" } })).toBeNull();
    expect(shortcutFor({ key: "o", target: { tagName: "DIV", isContentEditable: true } })).toBeNull();
    expect(shortcutFor({ key: "k", metaKey: true })).toBeNull();
    expect(shortcutFor({ key: "e", ctrlKey: true })).toBeNull();
  });
});

describe("moveSelection", () => {
  it("starts at the first or last item, then clamps", () => {
    expect(moveSelection(-1, 1, 3)).toBe(0);
    expect(moveSelection(-1, -1, 3)).toBe(2);
    expect(moveSelection(2, 1, 3)).toBe(2);
    expect(moveSelection(0, -1, 3)).toBe(0);
    expect(moveSelection(1, 1, 3)).toBe(2);
    expect(moveSelection(0, 1, 0)).toBe(-1);
  });
});

describe("todayState", () => {
  const settings = { eligible: true, continuousEnabled: true };
  it("puts decisions first", () => {
    expect(todayState({ drafts: 1, questions: 0, followups: 0, settings: { eligible: false, continuousEnabled: false } })).toBe(
      "decisions",
    );
    expect(todayState({ drafts: 0, questions: 2, followups: 0, settings })).toBe("decisions");
  });
  it("tells the next step when nothing waits", () => {
    expect(todayState({ drafts: 0, questions: 0, followups: 0, settings: { eligible: false, continuousEnabled: false } })).toBe(
      "connect",
    );
    expect(todayState({ drafts: 0, questions: 0, followups: 0, settings: { eligible: true, continuousEnabled: false } })).toBe(
      "continuous_off",
    );
    expect(todayState({ drafts: 0, questions: 0, followups: 0, settings })).toBe("quiet");
  });
});

describe("copy helpers", () => {
  it("pluralizes and names the mailbox", () => {
    expect(plural(1, "brouillon", "brouillons")).toBe("1 brouillon");
    expect(plural(0, "brouillon", "brouillons")).toBe("0 brouillon");
    expect(plural(3, "brouillon", "brouillons")).toBe("3 brouillons");
    expect(mailboxName("outlook")).toBe("Outlook");
    expect(mailboxName(undefined)).toBe("votre boîte mail");
  });
});
