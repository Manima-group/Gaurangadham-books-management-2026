"""Import books from Excel: sample download, preview, confirm, re-import, error file, permissions."""
import os, re, subprocess, tempfile
import openpyxl
from playwright.sync_api import sync_playwright, expect
B = "http://localhost:3000"
def q(s): return subprocess.run(["psql","-h","localhost","-U","postgres","-d","gaurangadham","-tAc",s],capture_output=True,text=True).stdout.strip()
res = []
def check(name, ok): res.append((name, ok)); print(("PASS " if ok else "FAIL ") + name)
def settle(pg):
    pg.wait_for_load_state("networkidle")
    try: pg.locator(".logo3d").first.wait_for(state="detached", timeout=15000)
    except Exception: pass
def login(b, u, pw, w=1280):
    ctx = b.new_context(viewport={"width": w, "height": 900}, accept_downloads=True)
    ctx.add_init_script("sessionStorage.setItem('gb-intro-seen','1')")
    pg = ctx.new_page(); pg.errs = []; pg.on("pageerror", lambda e: pg.errs.append(str(e)[:150]))
    pg.goto(B + "/login"); pg.fill("#identifier", u); pg.fill("#password", pw); pg.click("button:has-text('Log in')")
    pg.wait_for_url(re.compile("/(dashboard|welcome)"))
    if "/welcome" in pg.url: pg.click("text=Skip the tour"); pg.wait_for_url(re.compile("/dashboard"))
    settle(pg); return pg
def central(sku):
    return int(q(f"""select coalesce(sum(case when m.to_holder='central' then m.qty else 0 end)-sum(case when m.from_holder='central' then m.qty else 0 end),0)
                    from stock_movement m join book b on b.id=m.book_id where b.sku='{sku}'""") or 0)
tmp = tempfile.mkdtemp()
def upload(pg, path):
    pg.set_input_files("[data-testid=import-file]", path); pg.click("[data-testid=check-file]")
    try: expect(pg.locator("[data-testid=check-file]")).to_have_text("Checking…", timeout=3000)
    except Exception: pass
    expect(pg.locator("[data-testid=check-file]")).to_have_text("Check file", timeout=20000)
    expect(pg.locator("[data-testid=import-preview], [data-testid=book-import] [role=alert]").first).to_be_visible(timeout=20000)

with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium-1243/chrome-linux64/chrome")
    a = login(b, "9000000001", "admin123")
    a.goto(B + "/books"); settle(a)
    check("import card shown", a.get_by_text("📥 Import books from Excel").count() == 1)
    check("required columns listed", all(a.locator("[data-testid=book-import] li", has_text=t).count() == 1 for t in ["Book Name *", "Language *", "Price (₹) *"]))
    with a.expect_download() as dl: a.click("[data-testid=sample]")
    sample = os.path.join(tmp, "sample.xlsx"); dl.value.save_as(sample)
    wb = openpyxl.load_workbook(sample); ws = wb["Books"]
    hdr = [c.value for c in ws[1]]
    check("sample is a real xlsx with headers", hdr[:3] == ["Book Name *", "Language *", "Price (₹) *"] and "How to fill" in wb.sheetnames)
    check("sample has 4 example rows", ws.max_row == 5)
    a.screenshot(path="shots/imp-card.png", full_page=True)

    bg_before = central("BG-EN"); books_before = int(q("select count(*) from book"))
    upload(a, sample)
    pv = a.locator("[data-testid=import-preview]")
    check("preview: 2 new / 2 update", pv.get_by_text("🆕 2 new").count() == 1 and pv.get_by_text("✏️ 2 update").count() == 1)
    check("preview shows made code", pv.get_by_text("made for you").count() == 2)
    check("preview saves nothing", int(q("select count(*) from book")) == books_before)
    a.screenshot(path="shots/imp-preview.png", full_page=True)
    a.click("[data-testid=confirm-import]")
    expect(a.locator("[data-testid=import-done]")).to_be_visible(timeout=20000)
    check("result message", a.locator("[data-testid=import-done]").get_by_text("2 books added, 2 updated").count() == 1)
    check("2 books created", int(q("select count(*) from book")) == books_before + 2)
    check("Isopanisad created with code", q("select sku||'|'||price_paise||'|'||size from book where title='Sri Isopanisad' and language='Hindi'") == "ISO-HI|6000|small")
    check("BG-EN price updated to 350", q("select price_paise from book where sku='BG-EN'") == "35000")
    check("price history row for BG-EN", q("select count(*) from book_price_history h join book b on b.id=h.book_id where b.sku='BG-EN' and h.old_price_paise=30000 and h.new_price_paise=35000") == "1")
    check("50 copies to central for BG-EN", central("BG-EN") == bg_before + 50)
    check("100 Isopanisad in central", central("ISO-HI") == 100)
    check("received movement from external", q("select count(*) from stock_movement where kind='received' and from_holder='external' and reference like 'Excel import:%'") == "3")

    # re-import same file: all updates, no new price history (same prices), copies added again
    upload(a, sample)
    check("re-import: 0 new / 4 update", pv.get_by_text("🆕 0 new").count() == 1 and pv.get_by_text("✏️ 4 update").count() == 1)
    a.click("[data-testid=confirm-import]"); expect(a.locator("[data-testid=import-done]")).to_be_visible(timeout=20000)
    check("re-import: no duplicate books", int(q("select count(*) from book")) == books_before + 2)
    check("re-import: price history unchanged", q("select count(*) from book_price_history h join book b on b.id=h.book_id where b.sku='BG-EN'") in ("1", "2") and q("select count(*) from book_price_history h join book b on b.id=h.book_id where b.sku='BG-EN' and h.new_price_paise=35000 and h.old_price_paise=35000") == "0")
    check("re-import: copies added again", central("BG-EN") == bg_before + 100)

    # error file: missing price, bad size, duplicate row, negative qty -> refused, nothing saved
    wb2 = openpyxl.Workbook(); s2 = wb2.active
    s2.append(["Book Name", "Language", "Price", "Size", "Copies Received"])
    s2.append(["Nectar of Devotion", "English", "", "Big", 5])
    s2.append(["Krishna Book", "English", 400, "Huge", 5])
    s2.append(["Krishna Book", "English", 400, "Big", -2])
    bad = os.path.join(tmp, "bad.xlsx"); wb2.save(bad)
    n_before = int(q("select count(*) from book")); mv_before = q("select count(*) from stock_movement")
    upload(a, bad)
    check("error rows marked", pv.get_by_text("⛔ 3 with problems").count() == 1)
    check("confirm hidden when errors", a.locator("[data-testid=confirm-import]").count() == 0)
    check("nothing saved from bad file", int(q("select count(*) from book")) == n_before and q("select count(*) from stock_movement") == mv_before)
    a.screenshot(path="shots/imp-errors.png", full_page=True)

    # missing required column -> friendly message
    wb3 = openpyxl.Workbook(); s3 = wb3.active; s3.append(["Title", "Cost"]); s3.append(["X", 10])
    nocol = os.path.join(tmp, "nocol.xlsx"); wb3.save(nocol)
    upload(a, nocol)
    check("missing column message", a.locator("[data-testid=book-import] [role=alert]").count() == 1)

    # CSV works
    csvp = os.path.join(tmp, "books.csv")
    open(csvp, "w", encoding="utf-8").write('Book Name,Language,Price (₹),Size\n"Krishna, the Supreme Personality",English,450,Big\n')
    upload(a, csvp)
    check("csv preview 1 new", pv.get_by_text("🆕 1 new").count() == 1)
    a.click("[data-testid=confirm-import]"); expect(a.locator("[data-testid=import-done]")).to_be_visible(timeout=20000)
    check("csv book created (comma in quotes)", q("select price_paise||'|'||size from book where title='Krishna, the Supreme Personality'") == "45000|big")

    a.goto(B + "/stock/receive"); settle(a)
    check("receive page links to import", a.get_by_role("link", name=re.compile("Import books and copies from Excel")).count() == 1)
    check("admin: no page errors", not a.errs)

    # permissions
    m = login(b, "9000000002", "manager123")
    r = m.request.get(B + "/api/books/template")
    check("manager cannot download template (403)", r.status == 403)
    m.goto(B + "/stock/receive"); settle(m)
    check("manager sees no import link", m.get_by_text("Import books and copies from Excel").count() == 0)
    r2 = b.new_context().request.get(B + "/api/books/template")
    check("signed-out template 401", r2.status == 401)

    # mobile layout
    mm = login(b, "9000000001", "admin123", w=390)
    mm.goto(B + "/books"); settle(mm)
    over = mm.evaluate("document.documentElement.scrollWidth > window.innerWidth + 1")
    check("mobile: no sideways scroll", not over)
    mm.screenshot(path="shots/imp-mobile.png", full_page=True)
    b.close()

print(f"\n{sum(ok for _, ok in res)}/{len(res)} passed")
