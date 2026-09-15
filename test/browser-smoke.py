import copy
import json
import os
from pathlib import Path

from PIL import Image, ImageStat
from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
BASE_URL = os.getenv("SMOKE_BASE_URL", "http://127.0.0.1:4173")



def assert_nonblank(path: Path) -> None:
    image = Image.open(path).convert("RGB")
    variance = sum(ImageStat.Stat(image).var)
    assert variance > 100, f"screenshot appears blank: {path}"


def exercise(page, screenshot_name: str, test_live: bool = False, test_static_poll: bool = False) -> None:
    console_errors = []
    page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)
    # 外部字体不是被测对象：无外网环境（本地沙箱 / CI）下它会失败并污染 console 断言。
    # 页面自身已声明回退字体栈，这里把外部样式表打桩，让冒烟测试可离线复跑。
    page.route(
        "https://fonts.googleapis.com/**",
        lambda route: route.fulfill(status=200, content_type="text/css", body=""),
    )
    if test_static_poll:
        snapshot = json.loads((ROOT / "public" / "data" / "latest.json").read_text())
        initial = copy.deepcopy(snapshot)
        candidate = copy.deepcopy(snapshot)
        initial["generatedAt"] = "2026-09-10T06:00:00.000Z"
        candidate["generatedAt"] = "2026-09-10T08:30:00.000Z"
        candidate["market"]["advancers"] = 321
        requests = {"count": 0}

        def serve_snapshot(route):
            requests["count"] += 1
            route.fulfill(json=initial if requests["count"] == 1 else candidate)

        page.route("**/public/data/latest.json*", serve_snapshot)
        page.add_init_script("""
            const nativeSetInterval = window.setInterval;
            window.setInterval = (callback, delay, ...args) =>
              nativeSetInterval(callback, delay === 60000 ? 100 : delay, ...args);
        """)
    page.goto(
        BASE_URL,
        wait_until="domcontentloaded" if test_static_poll else "networkidle",
    )
    page.locator("#table-wrap:not([hidden])").wait_for()
    if test_static_poll:
        page.locator("#advancers").filter(has_text="321").wait_for(timeout=5_000)
        assert requests["count"] >= 2
    assert page.locator("tr.data-row").count() == 50
    assert "Top 50" in page.locator("#ranking-title").inner_text()
    assert page.locator(".brand-name").inner_text() == "港美侠"
    assert "Top 50" in page.locator("#daily-view").inner_text()
    assert "涨" in page.locator("#daily-view").inner_text()
    assert page.locator("#observation-list li").count() == 3
    assert page.locator("#focus-ranking li").count() == 10
    assert page.locator("#concentration-value").inner_text().endswith("%")
    summary_text = page.locator("#summary-text").inner_text()
    assert "数据来源：港股通收盘正式快照" in summary_text
    # 文稿的分节格式：项目符号 + 必要字段。
    assert "•" in summary_text and "南向资金" in summary_text
    if page.viewport_size["width"] > 760:
        headers = page.locator("thead").inner_text()
        assert all(label in headers for label in ["总市值", "换手率", "振幅"])
    else:
        visible_headers = page.locator("thead th:visible").all_inner_texts()
        assert visible_headers == ["排名", "证券", "涨跌幅", "成交额"]
    assert page.locator(".download-link").get_attribute("href") == "public/images/latest.png"
    summary_ids = [
        "#average-turnover",
        "#median-turnover",
        "#average-change",
        "#median-change",
        "#ranking-breadth",
        "#change-range",
        "#average-market-cap",
        "#median-market-cap",
        "#ah-count",
    ]
    assert all(page.locator(selector).inner_text() != "--" for selector in summary_ids)
    turnover_average = page.locator("#average-turnover").inner_text()
    first_link = page.locator("tr.data-row .security a").first
    first_code = first_link.locator(".code").inner_text().replace(".HK", "")
    assert first_link.get_attribute("href") == f"https://xueqiu.com/S/{first_code}"
    assert first_link.get_attribute("target") == "_blank"
    assert "noopener" in first_link.get_attribute("rel")
    page.locator("#ah-only").check()
    ah_rows = page.locator("tr.data-row").count()
    assert ah_rows == 50
    assert page.locator("tr.data-row .ah-badge").count() == ah_rows
    first_ah_row = page.locator("tr.data-row").first
    first_ah_row.locator(".rank").click()
    assert "AH 两地上市" in page.locator("tr.detail-row:not([hidden])").inner_text()
    first_ah_row.locator(".rank").click()
    page.locator("#ah-only").uncheck()

    if test_live:
        page.locator(".live-control").click()
        assert page.locator("#live-toggle").is_checked()
        page.locator("#status-text").filter(has_text="盘中快照").wait_for(timeout=20_000)
        assert page.locator("tr.data-row").count() == 50

    page.get_by_role("tab", name="总市值").click()
    assert "总市值 Top 50" == page.locator("#ranking-title").inner_text()
    assert page.locator("tr.data-row").count() == 50
    assert page.locator("#average-turnover").inner_text() != turnover_average
    market_cap_average = page.locator("#average-turnover").inner_text()

    page.get_by_role("tab", name="涨跌幅").click()
    assert "涨跌幅 Top 50" == page.locator("#ranking-title").inner_text()
    first_desc_change = page.locator("tr.data-row td").nth(3).inner_text()
    page.locator("#sort-direction").click()
    assert page.locator("#sort-direction").inner_text() == "从低到高"
    assert page.locator("tr.data-row td").nth(3).inner_text() != first_desc_change
    page.locator("#sort-direction").click()

    snapshot = json.loads((ROOT / "public" / "data" / "latest.json").read_text())
    turnover_codes = {item["code"] for item in snapshot["rankings"]["turnover"]}
    outside_code = next(item["code"] for item in snapshot["securities"] if item["code"] not in turnover_codes)
    page.locator("#search").fill(outside_code)
    assert page.locator("tr.data-row").count() >= 1
    assert outside_code in page.locator("tr.data-row .security .code").first.inner_text()
    page.locator("#search").fill("")

    first_row = page.locator("tr.data-row").first
    first_row.locator(".rank").click()
    assert first_row.get_attribute("aria-expanded") == "true"
    assert page.locator("tr.detail-row:not([hidden])").count() == 1
    # 公司简介不再内嵌在快照里，改为展开时按需读 company-profiles.json。
    page.wait_for_function(
        """() => {
            const el = document.querySelector("tr.detail-row:not([hidden]) .introduction");
            return el && el.textContent.trim() && el.textContent.trim() !== "正在读取公司简介…";
        }""",
        timeout=5_000,
    )
    # 详情行是懒构建的：展开才插入 DOM，且只插一行。
    assert page.locator("tr.detail-row").count() == 1

    if page.viewport_size["width"] > 760:
        # 焦点条宽度由 CSSOM 设置。若页面被严格 CSP 限制或改回内联 style，
        # 这里会退化成 0px —— 这是最容易静默坏掉的一处。
        bar_widths = page.eval_on_selector_all(
            "#focus-ranking .focus-bar i",
            "els => els.map(el => parseFloat(getComputedStyle(el).width))",
        )
        assert len(bar_widths) == 10, bar_widths
        assert all(width > 0 for width in bar_widths), bar_widths

    dimensions = page.evaluate("({width: document.documentElement.scrollWidth, viewport: innerWidth})")
    assert dimensions["width"] <= dimensions["viewport"], dimensions
    assert not console_errors, console_errors

    screenshot = ROOT / "outputs" / screenshot_name
    if not screenshot.parent.exists():
        screenshot.parent.mkdir(parents=True, exist_ok=True)
    page.screenshot(path=str(screenshot), full_page=True)
    assert_nonblank(screenshot)


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    desktop = browser.new_page(viewport={"width": 1440, "height": 1000}, device_scale_factor=1)
    exercise(
        desktop,
        "dashboard-desktop.png",
        test_live=os.getenv("TEST_LIVE") == "1",
        test_static_poll=True,
    )
    mobile = browser.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=1)
    exercise(mobile, "dashboard-mobile.png")
    browser.close()

print("Browser smoke test passed for desktop and mobile viewports.")
