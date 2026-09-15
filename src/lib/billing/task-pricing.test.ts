import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { TaskPricing } from "../../components/product/TaskPricing";

it("renders proposed task pricing with media disclosure and no unwired CTAs", () => {
  const html = renderToStaticMarkup(
    createElement(TaskPricing, { initialSeats: 6 }),
  );
  expect(html).toContain("438");
  expect(html).toContain("Solo");
  expect(html).toContain("Partner");
  expect(html).toContain("200 tâches");
  expect(html).toContain("Production média en supplément");
  expect(html).toContain("Tarifs proposés");
  expect(html).not.toContain("<button");
});

it("uses unique accessible control IDs when reused on the same page", () => {
  const html = renderToStaticMarkup(
    createElement(
      "div",
      null,
      createElement(TaskPricing),
      createElement(TaskPricing),
    ),
  );
  const ids = [...html.matchAll(/<select id="([^"]+)"/g)].map(
    (match) => match[1],
  );
  expect(ids).toHaveLength(2);
  expect(new Set(ids).size).toBe(2);
  for (const id of ids) expect(html).toContain(`for="${id}"`);
});
