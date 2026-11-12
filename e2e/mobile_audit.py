import re, json, sys
from playwright.sync_api import sync_playwright
exec(open("/home/claude/e2e/allpages.py").read().split("total=0")[0])  # PAGES
EXTRA = {("9000000001","admin123"): ["/reports/1","/stock/take-back?devotee=", "/welcome?again=1"], ("9000000002","manager123"): ["/reports/1"]}
CHECK = """() => {
  const vw = document.documentElement.clientWidth, out = {hscroll: document.documentElement.scrollWidth > vw + 1, wide: [], small: []};
  for (const el of document.querySelectorAll('main *')) {
    const r = el.getBoundingClientRect(); if (!r.width) continue;
    let p = el.parentElement, scroller = false;
    while (p) { const s = getComputedStyle(p); if (/(auto|scroll)/.test(s.overflowX)) { scroller = true; break; } p = p.parentElement; }
    if (r.right > vw + 1 && !scroller) out.wide.push((el.tagName + '.' + (el.className||'').toString().slice(0,40)) + ' ' + Math.round(r.right));
    if (scroller && el.tagName === 'TABLE') out.wide.push('TABLE-in-scroller w=' + Math.round(r.width));
    if (['A','BUTTON','SELECT','INPUT'].includes(el.tagName) && getComputedStyle(el).display !== 'none' && r.height < 36 && r.height > 0 && !el.closest('nav[aria-label="You are here"]') && el.type !== 'hidden' && el.type !== 'radio')
      out.small.push(el.tagName + ':' + (el.innerText||el.name||'').trim().slice(0,24) + ' h=' + Math.round(r.height));
  }
  out.wide = [...new Set(out.wide)].slice(0, 8); out.small = [...new Set(out.small)].slice(0, 10);
  return out;
}"""
W = int(sys.argv[1]) if len(sys.argv) > 1 else 390
report = {}
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium-1243/chrome-linux64/chrome")
    for (u, pw), paths in PAGES.items():
        ctx = b.new_context(viewport={"width": W, "height": 844}, is_mobile=True, has_touch=True)
        ctx.add_init_script("sessionStorage.setItem('gb-intro-seen','1')")
        pg = ctx.new_page()
        pg.goto("http://localhost:3000/login"); pg.fill("#identifier", u); pg.fill("#password", pw); pg.click("button:has-text('Log in')")
        pg.wait_for_url(re.compile("/(dashboard|welcome)"))
        if "/welcome" in pg.url:
            pg.screenshot(path=f"shots/m/{u}-welcome.png", full_page=True); pg.click("text=Skip the tour"); pg.wait_for_url(re.compile("/dashboard"))
        for path in paths + EXTRA.get((u, pw), []):
            pg.goto("http://localhost:3000" + path); pg.wait_for_load_state("networkidle")
            r = pg.evaluate(CHECK)
            name = f"{u[-2:]}{path.replace('/','_').replace('?','_').replace('=','')}"
            pg.screenshot(path=f"shots/m/{name}.png", full_page=True)
            if r["hscroll"] or r["wide"] or r["small"]: report[name] = r
        ctx.close()
print(json.dumps(report, indent=1))
