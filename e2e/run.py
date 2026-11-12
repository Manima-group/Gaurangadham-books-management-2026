import re, sys
from playwright.sync_api import sync_playwright, expect

BASE = "http://localhost:3000"
SHOTS = "/home/claude/shots"
errors = []

def check_page(page, path, label):
    resp = page.goto(BASE + path)
    page.wait_for_load_state("networkidle")
    body = page.content()
    ok = resp and resp.status < 400 and "Something went wrong" not in body and "Application error" not in body
    if not ok:
        errors.append(f"{label} {path} -> {resp.status if resp else 'none'}")
    return ok

def login(page, ident, pw):
    page.goto(BASE + "/login")
    page.fill("#identifier", ident)
    page.fill("#password", pw)
    page.click("button:has-text('Log in')")
    page.wait_for_url(re.compile(r"/(welcome|dashboard)"))
    if "/welcome" in page.url:
        page.click("text=Skip the tour")
        page.wait_for_url(re.compile(r"/dashboard"))

def logout(ctx):
    ctx.clear_cookies()

with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium-1243/chrome-linux64/chrome")
    _new = b.new_context
    def new_context(**kw):
        c = _new(**kw); c.add_init_script("sessionStorage.setItem('gb-intro-seen','1')"); return c
    b.new_context = new_context
    console_errs = []
    desk = b.new_context(viewport={"width": 1366, "height": 900})
    page = desk.new_page()
    page.on("console", lambda m: console_errs.append("CONSOLE "+page.url+" "+m.text[:1500]) if m.type=="error" and "ydrat" in m.text else None)
    page.on("pageerror", lambda e: console_errs.append(page.url+" "+str(e)[:1500]))

    # wrong password message
    page.goto(BASE + "/login"); page.fill("#identifier", "9000000001"); page.fill("#password", "nope"); page.click("button:has-text('Log in')")
    expect(page.get_by_text("is not correct")).to_be_visible()

    # ---- ADMIN ----
    page.goto(BASE + "/login"); page.fill("#identifier", "9000000001"); page.fill("#password", "admin123"); page.click("button:has-text('Log in')")
    page.wait_for_url(re.compile("/welcome"))
    page.screenshot(path=f"{SHOTS}/01-welcome.png")
    for _ in range(4): page.click("button:has-text('Next')")
    page.click("button:has-text('Start using the app')")
    page.wait_for_url(re.compile("/dashboard"))
    page.screenshot(path=f"{SHOTS}/02-admin-dashboard.png", full_page=True)
    for path in ["/setup","/stock","/stock/receive","/stock/assign-dham","/stock/assign-devotees","/stock/history","/reports","/reports?status=submitted","/money","/monitor","/closing","/workflow","/dhams","/books","/people","/people?role=manager","/drives","/activity","/notifications","/account","/pending"]:
        check_page(page, path, "admin")
    page.goto(BASE + "/workflow"); page.screenshot(path=f"{SHOTS}/03-workflow.png", full_page=True)
    page.goto(BASE + "/monitor"); page.screenshot(path=f"{SHOTS}/04-monitor.png", full_page=True)

    # Step 2: receive 500 Bhagavad Gita (English) at central
    page.goto(BASE + "/stock/receive")
    page.select_option("#bookId", label="Bhagavad Gita As It Is (English)")
    page.fill("#qty", "500")
    page.fill("#reference", "INV-2026-77")
    page.click("button:has-text('Review')")
    page.click("button:has-text('Confirm Receipt')")
    expect(page.get_by_text("Successfully received 500 copies of Bhagavad Gita As It Is.")).to_be_visible()
    page.screenshot(path=f"{SHOTS}/05-received.png")

    # Step 3: assign to Hyderabad Dham
    page.goto(BASE + "/stock/assign-dham")
    page.select_option("#dham", label="Hyderabad Dham"); page.click("button:has-text('Continue')")
    page.get_by_label("Copies of Bhagavad Gita As It Is (English)").fill("100")
    page.click("button:has-text('Review')")
    page.screenshot(path=f"{SHOTS}/06-assign-review.png")
    page.click("button:has-text('Confirm — Assign to Hyderabad Dham')")
    expect(page.get_by_text("100 books assigned to Hyderabad Dham.")).to_be_visible()

    # over-allocation validation
    page.get_by_label("Copies of Bhagavad Gita As It Is (English)").fill("99999")
    expect(page.get_by_text("Only").first).to_be_visible()

    # add a devotee
    page.goto(BASE + "/people?role=devotee")
    page.fill("#pname", "Test Devotee"); page.fill("#phone", "9123456789"); page.select_option("#dhamId", label="Hyderabad Dham"); page.fill("#password", "test123")
    page.click("button:has-text('Add Devotee')")
    expect(page.get_by_text("Test Devotee has been added as Devotee.")).to_be_visible()

    # price update
    page.goto(BASE + "/books#prices")
    page.get_by_label("Bhagavad Gita As It Is (English · BG-EN)").fill("55")
    page.click("button:has-text('Save New Prices')")
    expect(page.get_by_text("price updated").or_(page.get_by_text("prices updated"))).to_be_visible()
    logout(desk)

    # ---- MANAGER ----
    login(page, "9000000002", "manager123")
    page.screenshot(path=f"{SHOTS}/07-manager-dashboard.png", full_page=True)
    for path in ["/stock","/stock/receive","/stock/assign-devotees","/stock/history","/reports","/money","/pending","/closing","/workflow","/people","/activity","/notifications","/account"]:
        check_page(page, path, "manager")
    # manager should be denied admin pages
    page.goto(BASE + "/monitor"); 
    page.wait_for_url(re.compile("denied=1"), timeout=10000)
    # assign to Test Devotee
    page.goto(BASE + "/stock/assign-devotees")
    page.select_option("#devotee", label="Test Devotee"); page.click("button:has-text('Continue')")
    page.get_by_label("Copies of Bhagavad Gita As It Is (English)").fill("10")
    page.get_by_label("Copies of Chant and Be Happy (English)").fill("5")
    page.click("button:has-text('Review')")
    page.click("button:has-text('Confirm — Give to Test')")
    expect(page.get_by_text("Books assigned to Test Devotee")).to_be_visible()
    page.screenshot(path=f"{SHOTS}/08-assigned-devotee.png")
    logout(desk)

    # ---- DEVOTEE (mobile) ----
    mob = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
    mp = mob.new_page(); mp.on("pageerror", lambda e: console_errs.append(mp.url+" "+str(e)[:1500]))
    login(mp, "9123456789", "test123")
    mp.screenshot(path=f"{SHOTS}/09-devotee-home.png", full_page=True)
    for path in ["/my/books","/my/sales","/my/money","/my/reports","/notifications","/account"]:
        check_page(mp, path, "devotee")
    mp.goto(BASE + "/stock")
    mp.wait_for_url(re.compile("denied=1"), timeout=10000)
    mp.goto(BASE + "/my/books"); mp.screenshot(path=f"{SHOTS}/10-devotee-books.png", full_page=True)
    mp.goto(BASE + "/my/sales"); mp.wait_for_load_state("networkidle")
    G = "Bhagavad Gita As It Is (English) sold at place 1"; C = "Chant and Be Happy (English) sold at place 1"
    mp.get_by_role("textbox", name=G, exact=True).fill("50")
    expect(mp.get_by_text("-40 left").first).to_be_visible()
    mp.get_by_role("textbox", name=G, exact=True).fill("4")
    mp.fill("#venue_0_name", "Ameerpet Metro Station")
    mp.click(f"button[aria-label='One more {C}']")
    mp.click(f"button[aria-label='One more {C}']")
    mp.screenshot(path=f"{SHOTS}/11-sales-form.png", full_page=True)
    expect(mp.get_by_text("6 books").first).to_be_visible()
    txt = mp.locator("button:has-text('Send ✓')").locator("xpath=..").inner_text()
    if "₹340" not in txt: errors.append("sales total wrong: " + txt)   # 4*55 + 2*60
    mp.click("button:has-text('Send ✓')")
    expect(mp.get_by_text(re.compile("are sent 🙏|saved. 🙏")).first).to_be_visible(timeout=20000)
    mp.screenshot(path=f"{SHOTS}/12-sales-done.png")
    # money: partial
    mp.goto(BASE + "/my/money")
    mp.fill("#amount", "200")
    mp.click("label:has-text('UPI')")
    mp.click("button:has-text('Submit Money')")
    expect(mp.get_by_text("transaction / UTR").first).to_be_visible()
    mp.fill("#reference", "UPI998877")
    mp.click("button:has-text('Submit Money')")
    expect(mp.get_by_text("₹200 submitted")).to_be_visible()
    expect(mp.get_by_text("You still have ₹140 to submit")).to_be_visible()
    mp.goto(BASE + "/my/money"); mp.screenshot(path=f"{SHOTS}/13-devotee-money.png", full_page=True)
    mob.clear_cookies()

    # ---- MANAGER review ----
    login(page, "9000000002", "manager123")
    page.goto(BASE + "/reports?status=submitted")
    page.locator("tr:has-text('Test Devotee') >> text=Review Report").click()
    page.wait_for_url(re.compile(r"/reports/\d+"))
    page.screenshot(path=f"{SHOTS}/14-review.png", full_page=True)
    page.click("button:has-text('Request Correction')")
    page.click("button:has-text('Send Back for Correction')")
    expect(page.get_by_text("Please write what needs to be corrected")).to_be_visible()
    page.click("button:has-text('Cancel')")
    page.click("button:has-text('Approve Report')")
    expect(page.get_by_text("This report is approved.")).to_be_visible()
    page.goto(BASE + "/money?status=submitted")
    page.locator("li:has-text('Test Devotee')").locator("button:has-text('Mark as Received')").click()
    expect(page.locator("li:has-text('Test Devotee')").get_by_text("Confirmed as received").first).to_be_visible()
    page.goto(BASE + "/closing"); page.screenshot(path=f"{SHOTS}/15-closing.png", full_page=True)
    page.click("button:has-text('Close This Day')")
    expect(page.get_by_text("There are differences that need your review.").or_(page.get_by_text("This day was closed by"))).to_be_visible()
    if page.locator("#note").count():
        page.fill("#note", "Two devotees did not go out today; others reported.")
        page.click("button:has-text('Close This Day')")
        expect(page.get_by_text("This day was closed by")).to_be_visible()
    page.goto(BASE + "/stock"); page.screenshot(path=f"{SHOTS}/16-manager-stock.png", full_page=True)
    logout(desk)

    # devotee sees approval
    login(mp, "9123456789", "test123")
    mp.goto(BASE + "/notifications")
    expect(mp.get_by_text("is approved").first).to_be_visible()
    mp.goto(BASE + "/my/books")
    mp.screenshot(path=f"{SHOTS}/17-devotee-after.png", full_page=True)

    # mobile admin layout
    mob2 = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
    ap = mob2.new_page()
    login(ap, "9000000002", "manager123")
    ap.screenshot(path=f"{SHOTS}/18-manager-mobile.png", full_page=True)

    b.close()

print("CONSOLE ERRORS:", console_errs[:10])
print("ERRORS:", errors)
sys.exit(1 if errors or console_errs else 0)
