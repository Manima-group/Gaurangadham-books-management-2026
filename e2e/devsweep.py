import re
from playwright.sync_api import sync_playwright
exec(open("/home/claude/e2e/allpages.py").read().split("total=0")[0])  # reuse PAGES
issues=[]; n=0
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium-1243/chrome-linux64/chrome")
    for intro in [True, False]:
        for (u,pw),paths in PAGES.items():
            ctx=b.new_context(viewport={"width":390,"height":844} if u.endswith("11") else {"width":1366,"height":900})
            if not intro: ctx.add_init_script("sessionStorage.setItem('gb-intro-seen','1')")
            pg=ctx.new_page(); pg.set_default_timeout(120000)
            pg.on("console", lambda m: issues.append(pg.url+" | "+m.text[:200]) if m.type=="error" and ("ydrat" in m.text or "didn't match" in m.text) else None)
            pg.on("pageerror", lambda e: issues.append(pg.url+" | PAGEERR "+str(e)[:200]))
            pg.goto("http://localhost:3000/login"); pg.wait_for_load_state("networkidle")
            if intro: pg.click("text=Skip intro"); pg.wait_for_timeout(1000)
            pg.fill("#identifier", u); pg.fill("#password", pw); pg.click("button:has-text('Log in')")
            pg.wait_for_url(re.compile("/(dashboard|welcome)")); pg.wait_for_load_state("networkidle")
            for path in paths:
                pg.goto("http://localhost:3000"+path); pg.wait_for_load_state("networkidle"); pg.wait_for_timeout(300); n+=1
            ctx.close()
print("dev pages:", n, "hydration issues:", issues)
