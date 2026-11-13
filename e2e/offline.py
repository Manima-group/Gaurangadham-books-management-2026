import re, subprocess, time
from playwright.sync_api import sync_playwright, expect
B="http://localhost:3000"
def q(s): return subprocess.run(["psql","-h","localhost","-U","postgres","-d","gaurangadham","-tAc",s],capture_output=True,text=True).stdout.strip()
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium-1243/chrome-linux64/chrome")
    ctx = b.new_context(viewport={"width":390,"height":844}, is_mobile=True, has_touch=True)
    ctx.add_init_script("sessionStorage.setItem('gb-intro-seen','1')")
    pg = ctx.new_page(); errs=[]; pg.on("pageerror", lambda e: errs.append(str(e)[:120]))
    pg.goto(B+"/login"); pg.fill("#identifier","9000000013"); pg.fill("#password","devotee123"); pg.click("button:has-text('Log in')")
    pg.wait_for_url(re.compile("/(dashboard|welcome)"))
    if "/welcome" in pg.url: pg.click("text=Skip the tour"); pg.wait_for_url(re.compile("/dashboard"))
    pg.wait_for_function("navigator.serviceWorker && navigator.serviceWorker.controller !== null", timeout=15000) if False else None
    pg.reload(); pg.wait_for_load_state("networkidle"); time.sleep(3)
    chk = ctx.new_page(); chk.goto(B+"/dashboard"); chk.wait_for_load_state("networkidle")
    cdp = ctx.new_cdp_session(chk); print("installable:", cdp.send("Page.getInstallabilityErrors").get("installabilityErrors")); cdp.detach(); chk.close()
    print("SW controlling page:", pg.evaluate("!!navigator.serviceWorker.controller"))
    print("pages saved for offline:", pg.evaluate("caches.open('gb-pages-v2').then(c=>c.keys()).then(k=>k.map(r=>new URL(r.url).pathname))"))
    before = q("select count(*) from daily_report r join \"user\" u on u.id=r.devotee_id where u.phone='9000000013' and r.report_date=(now() at time zone 'Asia/Kolkata')::date")

    # ---- go offline
    ctx.set_offline(True)
    pg.goto(B+"/my/sales"); pg.wait_for_timeout(800)
    print("offline /my/sales opens:", pg.get_by_role("heading", name="Today's Sales").count() == 1)
    expect(pg.get_by_text("still enter today")).to_be_visible(timeout=10000)
    pg.fill("#venue_0_name", "Offline place"); pg.locator("input[name^='sold_0_']").first.fill("3")
    pg.click("button:has-text('Send ✓')")
    expect(pg.get_by_text("Saved on your phone").first).to_be_visible()
    pg.screenshot(path="/home/claude/shots/off-saved.png")
    pg.goto(B+"/my/money"); pg.wait_for_timeout(800)
    print("offline /my/money opens:", pg.get_by_role("heading", name="Hand Over Money").count() == 1)
    m0 = q("select count(*) from money_submission m join \"user\" u on u.id=m.devotee_id where u.phone='9000000013'")
    pg.fill("#amount", "100"); pg.click("button:has-text('Submit Money')")
    expect(pg.get_by_text("Saved on your phone").first).to_be_visible()
    pg.goto(B+"/dashboard"); pg.wait_for_timeout(800)
    expect(pg.get_by_text("waiting to send")).to_be_visible()
    print("home card shows saved-on-phone:", pg.get_by_text("Today's report is saved on your phone").count() == 1)
    pg.screenshot(path="/home/claude/shots/off-waiting.png")
    pg.goto(B+"/notifications"); pg.wait_for_timeout(800)
    print("unsaved page offline → offline screen:", pg.get_by_text("You're offline 📴").count() == 1)
    print("DB while offline (report count today):", q("select count(*) from daily_report r join \"user\" u on u.id=r.devotee_id where u.phone='9000000013' and r.report_date=(now() at time zone 'Asia/Kolkata')::date"), "(was", before, ")")

    # ---- back online
    ctx.set_offline(False)
    pg.goto(B+"/dashboard"); 
    expect(pg.get_by_text(re.compile("saved offline .* sent"))).to_be_visible(timeout=20000)
    pg.screenshot(path="/home/claude/shots/off-sent.png")
    st = q("select status||' sold='||total_sold from daily_report r join \"user\" u on u.id=r.devotee_id where u.phone='9000000013' and r.report_date=(now() at time zone 'Asia/Kolkata')::date")
    m1 = q("select count(*) from money_submission m join \"user\" u on u.id=m.devotee_id where u.phone='9000000013'")
    print("money entries: before", m0, "→ after reconnect", m1, "PASS" if int(m1) == int(m0) + 1 else "FAIL")
    print("after reconnect:", st, "| queue left:", pg.evaluate("JSON.parse(localStorage.getItem('gb-offline-queue')||'[]').length"))
    print("page errors:", errs)
    b.close()
