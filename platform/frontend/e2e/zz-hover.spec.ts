import { test, expect, Page, BrowserContext } from "@playwright/test";
import fs from "fs";

const OUT = process.env.HOVER_OUT || "/tmp/hover-findings.jsonl";
const emit = (o: any) => fs.appendFileSync(OUT, JSON.stringify(o) + "\n");

// One-off: hover every interactive element on every signed-in route, in both
// themes, and measure the label against its own ground. Looking for the class
// of defect the New audit button had — a hover rule that repaints the ink to
// something the background already is.

const EMAIL = process.env.E2E_STEWARD_EMAIL || "super_admin@gov.in";
const PAGES = [
  "/dashboard", "/domains", "/domains/new", "/audits", "/audits/new", "/settings",
  "/library", "/assessments", "/studio", "/review", "/compare",
  "/admin/organisations", "/admin/domain-claims", "/admin/config",
  "/admin/bulk-scan", "/admin/national", "/admin/discovery", "/admin/monitoring",
  "/admin/approvals",
];

const PROBE = `
function parse(c){const m=c.match(/[\\d.]+/g)||[];return m.slice(0,4).map(Number)}
function lum(c){const p=parse(c);const [r,g,b]=p.slice(0,3).map(v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)});return 0.2126*r+0.7152*g+0.0722*b}
function alpha(c){const p=parse(c);return p.length===4?p[3]:1}
function ratio(a,b){const l1=lum(a),l2=lum(b);return (Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05)}
function ground(el){
  let n=el;
  while(n && n!==document.documentElement){
    const bg=getComputedStyle(n).backgroundColor;
    if(alpha(bg)>0.5) return bg;
    n=n.parentElement;
  }
  return getComputedStyle(document.body).backgroundColor;
}
function read(el){
  const s=getComputedStyle(el);
  const size=parseFloat(s.fontSize), bold=parseInt(s.fontWeight,10)>=700;
  const large = size>=24 || (size>=18.66 && bold);
  const bg=ground(el);
  return {color:s.color, bg, ratio:Math.round(ratio(s.color,bg)*100)/100,
          need: large?3:4.5, opacity:s.opacity};
}
`;

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByPlaceholder("name.dept@nic.in").fill(EMAIL);
  const otp = page.waitForResponse((r) => r.url().includes("/v1/auth/otp/request") && r.ok());
  await page.getByRole("button", { name: "Send OTP" }).click();
  const { dev_otp } = await (await otp).json();
  if (!dev_otp) throw new Error("no dev_otp — API not in dev mode");
  await page.getByLabel(/one-time password/i).fill(dev_otp);
  await page.getByRole("button", { name: /verify & sign in/i }).click();
  await page.waitForURL("**/dashboard");
}

let ctx: BrowserContext, page: Page;
const findings: any[] = [];

test.beforeAll(async ({ browser }) => {
  ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  page = await ctx.newPage();
  await signIn(page);
});
test.afterAll(async () => {
  emit({ done: true });
  await ctx?.close();
});

for (const theme of ["light", "dark"] as const) {
  test(`hover contrast sweep — ${theme}`, async () => {
    test.setTimeout(600_000);
    await page.evaluate((t) => localStorage.setItem("govux-theme", t), theme);

    for (const route of PAGES) {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(600);
      emit({ progress: `${theme} ${route}` });
      await page.addScriptTag({ content: PROBE });

      const targets = page.locator(
        "a:visible, button:visible, [role=button]:visible, summary:visible");
      const n = Math.min(await targets.count(), 60);

      for (let i = 0; i < n; i++) {
        const el = targets.nth(i);
        let label = "";
        try {
          label = ((await el.textContent()) || "").trim().replace(/\s+/g, " ").slice(0, 34);
          if (!label) label = (await el.getAttribute("aria-label")) || "(no text)";
          const rest = await el.evaluate((e) => (window as any).read(e));
          await el.hover({ timeout: 1200, force: true });
          await page.waitForTimeout(45);
          const hov = await el.evaluate((e) => (window as any).read(e));

          if (hov.ratio < hov.need) {
            emit({
              theme, route, label, phase: "hover",
              ratio: hov.ratio, need: hov.need, color: hov.color, bg: hov.bg,
              restRatio: rest.ratio,
              regressedByHover: rest.ratio >= rest.need,
            });
          } else if (rest.ratio < rest.need) {
            emit({
              theme, route, label, phase: "rest",
              ratio: rest.ratio, need: rest.need, color: rest.color, bg: rest.bg,
            });
          }
        } catch { /* element went away mid-sweep; skip */ }
      }
    }
    expect(true).toBe(true);
  });
}
