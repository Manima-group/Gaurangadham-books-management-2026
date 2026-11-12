import re
from playwright.sync_api import sync_playwright
PAGES = {
 ("9000000001","admin123"): ["/dashboard","/distribution","/distribution?period=week&size=big","/distribution/1","/distribution/2?period=all","/setup","/stock","/stock/receive","/stock/assign-dham","/stock/assign-devotees","/stock/history","/reports","/money","/monitor","/closing","/workflow","/dhams","/books","/people","/drives","/activity","/notifications","/account","/pending"],
 ("9000000002","manager123"): ["/dashboard","/distribution","/distribution/1?period=month&size=small","/stock","/stock/receive","/stock/assign-devotees","/stock/history","/reports","/money","/pending","/closing","/workflow","/people","/activity","/notifications","/account"],
 ("9000000011","devotee123"): ["/dashboard","/my/books","/my/sales","/my/money","/my/reports","/notifications","/account"],
}
total=0; errs=[]
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium-1243/chrome-linux64/chrome")
    for intro in [False, True]:
        for (u,pw),paths in PAGES.items():
            ctx=b.new_context(viewport={"width":390,"height":844} if u.endswith("11") else {"width":1366,"height":900})
            if not intro: ctx.add_init_script("sessionStorage.setItem('gb-intro-seen','1')")
            pg=ctx.new_page()
            pg.on("pageerror", lambda e: errs.append(pg.url+" "+str(e)[:120]))
            pg.goto("http://localhost:3000/login"); pg.wait_for_load_state("networkidle")
            if intro: pg.click("text=Skip intro"); pg.wait_for_timeout(800)
            pg.fill("#identifier", u); pg.fill("#password", pw); pg.click("button:has-text('Log in')")
            pg.wait_for_url(re.compile("/(dashboard|welcome)")); pg.wait_for_load_state("networkidle")
            for path in paths:
                pg.goto("http://localhost:3000"+path); pg.wait_for_load_state("networkidle"); total+=1
            ctx.close()
print("pages loaded:", total, "errors:", errs)
