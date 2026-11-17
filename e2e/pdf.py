"""PDF / Excel download regression. App on :3000 with demo data."""
import io, re, sys
from playwright.sync_api import sync_playwright
from pypdf import PdfReader

B = "http://localhost:3000"
CHROME = "/opt/pw-browsers/chromium-1243/chrome-linux64/chrome"
res = []


def check(name, ok, extra=""):
    res.append((name, ok)); print(("PASS " if ok else "FAIL ") + name + (f"  [{extra}]" if extra and not ok else ""))


def login(b, u, pw):
    ctx = b.new_context(accept_downloads=True, viewport={"width": 1280, "height": 900}); ctx.add_init_script("sessionStorage.setItem('gb-intro-seen','1')")
    pg = ctx.new_page(); pg.goto(B + "/login"); pg.fill("#identifier", u); pg.fill("#password", pw); pg.click("button:has-text('Log in')")
    pg.wait_for_url(re.compile("/(dashboard|welcome)"))
    if "/welcome" in pg.url: pg.click("text=Skip the tour"); pg.wait_for_url(re.compile("/dashboard"))
    return pg


EXPECT = {  # kind → text that must appear in the PDF
    "reports": "Daily Sales Reports", "distribution": "Book Distribution", "closing": "Daily Closing", "money": "Collected Money",
    "stock": "Book Stock", "transfers": "Books Transfer", "contacts": "Outreach Contacts",
}

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=CHROME)
    a = login(b, "9000000001", "admin123")
    for kind, title in EXPECT.items():
        r = a.request.get(f"{B}/api/export/{kind}?format=pdf&dham=1")
        body = r.body()
        cd = r.headers.get("content-disposition", "")
        name = re.search(r'filename="([^"]+)"', cd)
        ok_head = r.status == 200 and r.headers.get("content-type") == "application/pdf" and name and name.group(1).endswith(".pdf")
        check(f"{kind}: 200, application/pdf, .pdf name", bool(ok_head), f"{r.status} {r.headers.get('content-type')} {cd}")
        check(f"{kind}: real PDF bytes", body[:5] == b"%PDF-" and b"%%EOF" in body[-1024:])
        try:
            rd = PdfReader(io.BytesIO(body))
            text = "\n".join((pg.extract_text() or "") for pg in rd.pages)
            check(f"{kind}: opens in a PDF reader, has '{title}'", len(rd.pages) >= 1 and title in text, text[:80])
            check(f"{kind}: page footer numbers right", all(f"Page {i + 1} of {len(rd.pages)}" in (pg.extract_text() or "") for i, pg in enumerate(rd.pages)))
        except Exception as e:
            check(f"{kind}: opens in a PDF reader", False, str(e)[:120])
        x = a.request.get(f"{B}/api/export/{kind}?format=xlsx&dham=1")
        check(f"{kind}: Excel is a real .xlsx", x.status == 200 and x.body()[:2] == b"PK" and re.search(r'filename="[^"]+\.xlsx"', x.headers.get("content-disposition", "")) is not None)

    # Errors come back as JSON errors, never as a file
    r = a.request.get(f"{B}/api/export/nope?format=pdf")
    check("unknown report → 404 JSON", r.status == 404 and r.headers["content-type"].startswith("application/json") and "error" in r.json())
    d = login(b, "9000000011", "devotee123")
    r = d.request.get(f"{B}/api/export/stock?format=pdf")
    check("devotee → 403 JSON", r.status == 403 and r.headers["content-type"].startswith("application/json"))
    anon = b.new_context().request.get(f"{B}/api/export/stock?format=pdf")
    check("signed out → 401 JSON", anon.status == 401)

    # The button: downloads a real .pdf file
    a.goto(B + "/reports"); a.wait_for_load_state("networkidle")
    with a.expect_download() as dl:
        a.click("[data-testid=dl-pdf]")
    f = dl.value
    path = f.path()
    data = open(path, "rb").read()
    check("button saves a .pdf file", f.suggested_filename.endswith(".pdf") and data[:5] == b"%PDF-", f.suggested_filename)
    # The button on a failing request shows the error and saves nothing
    a.route("**/api/export/**", lambda route: route.fulfill(status=500, content_type="application/json", body='{"error":"The PDF could not be made. Please try again."}'))
    downloads = []
    a.on("download", lambda x: downloads.append(x))
    a.click("[data-testid=dl-pdf]")
    a.wait_for_selector("text=The PDF could not be made", timeout=10000)
    a.wait_for_timeout(1000)
    check("failed request shows the error, no .txt download", len(downloads) == 0)
    a.unroute("**/api/export/**")
    a.route("**/api/export/**", lambda route: route.fulfill(status=200, content_type="text/html", body="<html>oops</html>"))
    a.click("[data-testid=dl-pdf]")
    a.wait_for_selector("[role=alert]", timeout=10000)
    a.wait_for_timeout(800)
    check("wrong content type is not saved as a file", len(downloads) == 0)
    b.close()

bad = [n for n, ok in res if not ok]
print(f"\n{len(res) - len(bad)}/{len(res)} passed")
sys.exit(1 if bad else 0)
