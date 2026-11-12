import re, subprocess, sys
from playwright.sync_api import sync_playwright, expect
B="http://localhost:3000"
def q(s): return subprocess.run(["psql","-h","localhost","-U","postgres","-d","gaurangadham","-tAc",s],capture_output=True,text=True).stdout.strip()
res=[]
def check(name, ok): res.append((name, ok)); print(("PASS " if ok else "FAIL ")+name)
def settle(pg): pass
def login(b, u, pw, w=390):
    ctx = b.new_context(viewport={"width":w,"height":844}, is_mobile=True, has_touch=True)
    ctx.add_init_script("sessionStorage.setItem('gb-intro-seen','1')")
    pg = ctx.new_page(); pg.errs=[]; pg.on("pageerror", lambda e: pg.errs.append(str(e)[:150]))
    pg.goto(B+"/login"); pg.fill("#identifier",u); pg.fill("#password",pw); pg.click("button:has-text('Log in')")
    pg.wait_for_url(re.compile("/(dashboard|welcome)"))
    if "/welcome" in pg.url: pg.click("text=Skip the tour"); pg.wait_for_url(re.compile("/dashboard"))
    settle(pg)
    return pg
def settle(pg):
    pg.wait_for_load_state("networkidle")
    try: pg.locator(".book3d").first.wait_for(state="detached", timeout=15000)
    except Exception: pass
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium-1243/chrome-linux64/chrome")
    # ---------- Devotee: 2 places in one day
    d = login(b, "9000000013", "devotee123")
    d.screenshot(path="shots/n-dev-home.png", full_page=True)
    check("devotee home: clean add-sales button", d.get_by_role("link", name="➕ Add Today's Sales").count() == 1)
    check("devotee home: given/sold/left tiles", d.get_by_text("Given to me").count() == 1)
    d.goto(B+"/my/sales"); settle(d)
    d.fill("#venue_0_name", "Ameerpet Metro Station"); d.click("text=🌅 Morning")
    d.get_by_label("Bhagavad Gita As It Is (English) sold at place 1", exact=True).fill("2")
    d.get_by_label("Chant and Be Happy (English) sold at place 1", exact=True).fill("3")
    d.click("text=➕ Add another place")
    d.fill("#venue_1_name", "KBR Park")
    d.get_by_label("Bhagavad Gita As It Is (English) sold at place 2", exact=True).fill("1")
    d.screenshot(path="shots/n-sales-2places.png", full_page=True)
    d.click("button:has-text('Send ✓')")
    expect(d.get_by_text(re.compile("saved. 🙏|are sent 🙏")).first).to_be_visible(timeout=20000)
    rid = q("select r.id from daily_report r join \"user\" u on u.id=r.devotee_id where u.phone='9000000013' and report_date=current_date")
    check("report has 2 places", q(f"select count(*) from daily_report_venue where report_id={rid}") == "2")
    check("report totals 6 books", q(f"select total_sold from daily_report where id={rid}") == "6")
    # place name required when books entered
    d.goto(B+"/my/sales?date=" + q("select to_char(current_date-2,'YYYY-MM-DD')")); settle(d)
    if d.locator("#venue_0_name").count():
        d.get_by_role("textbox", name=re.compile("sold at place 1")).first.fill("1"); d.click("button:has-text('Send ✓')")
        check("place name required", d.get_by_text("Please write the place name").first.is_visible())
    # ---------- Manager reviews: places shown
    m = login(b, "9000000002", "manager123")
    m.goto(f"{B}/reports/{rid}"); settle(m)
    check("review shows places", m.get_by_text("📍 Ameerpet Metro Station").count() >= 1 and m.get_by_text("📍 KBR Park").count() >= 1)
    m.screenshot(path="shots/n-review.png", full_page=True)
    m.click("button:has-text('Approve Report')"); expect(m.get_by_text("This report is approved").first).to_be_visible(timeout=15000)
    # ---------- Manager gives books to self and sells them (auto-approved)
    m.goto(B+"/stock/assign-devotees"); settle(m)
    opts = m.locator("#devotee option").all_inner_texts()
    check("manager can pick self", any("me (to distribute myself)" in o for o in opts))
    me_val = m.locator("#devotee option", has_text="me (to distribute").get_attribute("value")
    m.goto(f"{B}/stock/assign-devotees?devotee={me_val}"); settle(m)
    m.get_by_label("Copies of Chant and Be Happy (English)").fill("5"); m.click("button:has-text('Review')"); m.click("button:has-text('Confirm — Give to')")
    expect(m.get_by_text("Books assigned to").first).to_be_visible()
    m.goto(B+"/my/sales"); settle(m); m.fill("#venue_0_name", "Temple gate"); m.get_by_label("Chant and Be Happy (English) sold at place 1", exact=True).fill("2"); m.click("button:has-text('Send ✓')")
    expect(m.get_by_text(re.compile("Your stock is updated|are approved")).first).to_be_visible(timeout=20000)
    check("manager own report auto-approved", q("select status from daily_report r join \"user\" u on u.id=r.devotee_id where u.phone='9000000002' and report_date=current_date") == "approved")
    m.goto(B+"/my/books"); settle(m); check("manager My Books shows 3 left", m.get_by_text("3").count() > 0 and m.get_by_text("Chant and Be Happy").count() == 1)
    # ---------- Delete approved report → stock reversed
    sold_before = q(f"select coalesce(sum(qty),0) from stock_movement where report_id={rid} and kind='sold' and reversed_by is null")
    m.goto(f"{B}/reports/{rid}"); settle(m); m.click("text=🗑 Delete report"); m.click("button:has-text('Yes, delete')")
    expect(m).to_have_url(re.compile("/reports$|/reports\\?"), timeout=20000); 
    check("approved report deleted + stock reversed", q(f"select count(*) from daily_report where id={rid}") == "0" and q(f"select count(*) from stock_movement where report_id={rid} and kind='sold' and reversed_by is null") == "0" and sold_before == "6")
    # ---------- Undo a movement
    corr0 = int(q("select count(*) from stock_movement where kind='correction'"))
    m.goto(B+"/stock/history?kind=assign_devotee"); settle(m); 
    m.goto(B+"/stock/history?kind=assign_devotee"); settle(m)
    m.locator("text=🗑 Undo").first.click(); m.locator("button:has-text('Yes, delete')").first.click()
    expect(m.get_by_text("This can't be undone").first).to_be_visible(timeout=10000)
    check("undo blocked when books already sold", int(q("select count(*) from stock_movement where kind='correction'")) == corr0)
    m.goto(f"{B}/stock/assign-devotees?devotee={me_val}"); settle(m)
    m.get_by_label("Copies of Bhagavad Gita As It Is (English)").fill("1"); m.click("button:has-text('Review')"); m.click("button:has-text('Confirm — Give to')")
    expect(m.get_by_text("Books assigned to").first).to_be_visible(timeout=15000)
    m.goto(B+"/stock/history?kind=assign_devotee"); settle(m)
    m.locator("text=🗑 Undo").first.click(); m.locator("button:has-text('Yes, delete')").first.click()
    for _ in range(20):
        if int(q("select count(*) from stock_movement where kind='correction'")) > corr0: break
        m.wait_for_timeout(400)
    m.screenshot(path="shots/n-undo.png", full_page=True)
    check("undo creates correction", int(q("select count(*) from stock_movement where kind='correction'")) == corr0 + 1)
    # ---------- Admin: delete blocked vs allowed, edit person
    a = login(b, "9000000001", "admin123", 1280)
    a.goto(B+"/people?role=devotee"); settle(a); a.fill("#pname","Temp Person"); a.fill("#phone","9888877777"); a.select_option("#dhamId", label="Hyderabad Dham"); a.click("button:has-text('Add Devotee')")
    expect(a.get_by_text("has been added").first).to_be_visible()
    a.reload(); li = a.locator("li", has_text="Temp Person").first; li.locator("summary").click()
    li.locator("input[name=name]").fill("Temp Person Edited"); li.locator("button:has-text('Save Changes')").click(); a.wait_for_timeout(1200)
    check("edit person", q("select count(*) from \"user\" where name='Temp Person Edited'") == "1")
    a.reload(); li = a.locator("li", has_text="Temp Person Edited").first; li.locator("summary").click(); li.locator("text=🗑 Delete account").click(); li.locator("button:has-text('Yes, delete')").click(); a.wait_for_timeout(1500)
    check("delete person without history", q("select count(*) from \"user\" where phone='9888877777'") == "0")
    a.goto(B+"/people?role=devotee"); settle(a); li = a.locator("li", has_text="Govinda Sharma").first; li.locator("summary").click(); li.locator("text=🗑 Delete account").click(); li.locator("button:has-text('Yes, delete')").click()
    try: expect(li.get_by_text(re.compile("can.t be deleted")).first).to_be_visible(timeout=10000); okb=True
    except Exception: okb=False; a.screenshot(path="shots/n-blocked.png", full_page=True)
    check("delete blocked for person with history", okb)
    a.goto(B+"/drives"); settle(a); li = a.locator("li", has_text="Kartik").first; li.locator("summary").click(); li.locator("text=🗑 Delete drive").click(); li.locator("button:has-text('Yes, delete')").click(); a.wait_for_timeout(1500)
    check("delete drive", q("select count(*) from campaign") == "0")
    # ---------- Loader appears during navigation
    a.goto(B+"/dashboard"); settle(a); a.route("**/*", lambda r: (__import__('time').sleep(0.8), r.continue_())[1] if "_rsc" in r.request.url else r.continue_())
    a.click("a[href='/monitor'] >> nth=0"); a.wait_for_timeout(300)
    check("3D book loader shows while loading", a.locator(".book3d").count() >= 1)
    a.screenshot(path="shots/n-loader.png"); a.unroute("**/*")
    errs = d.errs + m.errs + a.errs
    check("no page errors", not errs); 
    if errs: print(errs)
    b.close()
print(f"\n{sum(ok for _,ok in res)}/{len(res)} passed")
sys.exit(0 if all(ok for _,ok in res) else 1)
