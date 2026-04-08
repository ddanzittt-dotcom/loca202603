import { chromium } from "playwright";
import { writeFileSync } from "fs";
import { createServer } from "vite";

const DIR = "docs/screenshots";
const VIEWPORT = { width: 390, height: 844 };

async function main() {
  // Vite dev server를 프로그래밍 방식으로 시작
  console.log("Vite dev server 시작 중...");
  const server = await createServer({ server: { port: 5199 } });
  await server.listen();
  const addr = server.httpServer.address();
  const BASE = `http://localhost:${addr.port}`;
  console.log(`  서버 준비: ${BASE}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
    locale: "ko-KR",
    bypassCSP: true,
  });
  const page = await context.newPage();

  // 콘솔 에러 수집
  const jsErrors = [];
  page.on("pageerror", (e) => jsErrors.push(e.message));

  async function goTab(index) {
    await page.locator(".bottom-nav__item").nth(index).click({ timeout: 5000 });
    await page.waitForTimeout(800);
  }

  async function shot(name) {
    // CDP 직접 캡처로 폰트 타임아웃 우회
    const cdp = await page.context().newCDPSession(page);
    const { data } = await cdp.send("Page.captureScreenshot", {
      format: "png",
      clip: { x: 0, y: 0, width: VIEWPORT.width, height: VIEWPORT.height, scale: 2 },
    });
    writeFileSync(`${DIR}/${name}.png`, Buffer.from(data, "base64"));
    await cdp.detach();
    console.log(`  ✓ ${name}.png`);
  }

  async function vis(sel, ms = 3000) {
    return page.locator(sel).first().isVisible({ timeout: ms }).catch(() => false);
  }

  try {
    // 1. 홈
    console.log("1. 홈 탭");
    await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 15000 });
    // React lazy 로딩 대기 — .brand 또는 .bottom-nav 등장까지
    await page.waitForSelector(".brand", { timeout: 15000 });
    await page.waitForSelector(".bottom-nav", { timeout: 10000 });
    await page.waitForTimeout(1500);
    await shot("01_home");

    // 2. 지도 목록
    console.log("2. 지도 목록");
    await goTab(1);
    await page.waitForTimeout(500);
    await shot("02_maps_list");

    // 3. 지도 에디터
    console.log("3. 지도 에디터");
    if (await vis(".map-card__open", 3000)) {
      await page.locator(".map-card__open").first().click();
      await page.waitForTimeout(2000);
      await shot("03_map_editor");

      // 4. 공유 시트
      console.log("4. 공유 시트");
      if (await vis('[aria-label="지도 공유하기"]', 2000)) {
        await page.locator('[aria-label="지도 공유하기"]').click();
        await page.waitForTimeout(800);
        await shot("04_share_sheet");
        if (await vis(".sheet-backdrop", 1000)) {
          await page.locator(".sheet-backdrop").click();
          await page.waitForTimeout(400);
        }
      }
      if (await vis('[aria-label="뒤로 가기"]', 1000)) {
        await page.locator('[aria-label="뒤로 가기"]').click();
        await page.waitForTimeout(500);
      }
    } else {
      console.log("  (지도 열기 버튼 미발견)");
    }

    // 5. 새 지도 시트
    console.log("5. 새 지도 시트");
    await goTab(1);
    await page.waitForTimeout(300);
    const createBtns = page.locator("button").filter({ hasText: /새 지도/ });
    if (await createBtns.first().isVisible({ timeout: 2000 }).catch(() => false)) {
      await createBtns.first().click();
      await page.waitForTimeout(600);
      await shot("05_new_map_sheet");
      if (await vis(".sheet .icon-button", 1000)) {
        await page.locator(".sheet .icon-button").first().click();
        await page.waitForTimeout(300);
      }
    } else {
      console.log("  (새 지도 버튼 미발견 - 스킵)");
    }

    // 6. 장소
    console.log("6. 장소 탭");
    await goTab(2);
    await shot("06_places");

    // 7. 검색
    console.log("7. 검색 탭");
    await goTab(3);
    await shot("07_search");

    // 8. 프로필
    console.log("8. 프로필 탭");
    await goTab(4);
    await page.waitForTimeout(500);
    await shot("08_profile");

    // 9. 읽기 전용 뷰어
    console.log("9. 읽기 전용 뷰어");
    await goTab(0);
    await page.waitForTimeout(500);
    if (await vis(".map-preview", 2000)) {
      await page.locator(".map-preview").first().click();
      await page.waitForTimeout(2000);
      await shot("09_readonly_viewer");
    }

    if (jsErrors.length > 0) {
      console.log("\n⚠ JS 에러:", jsErrors.length, "개");
      jsErrors.slice(0, 5).forEach((e) => console.log("  ", e.slice(0, 120)));
    }

  } finally {
    await browser.close();
    await server.close();
  }

  console.log("\n완료! →", DIR);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
