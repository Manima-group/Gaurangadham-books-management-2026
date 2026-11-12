import asyncio, re, subprocess
from playwright.async_api import async_playwright
B="http://localhost:3000"
def q(s): return subprocess.run(["psql","-h","localhost","-U","postgres","-d","gaurangadham","-tAc",s],capture_output=True,text=True).stdout.strip()
async def login(b, u, pw):
    ctx = await b.new_context(); await ctx.add_init_script("sessionStorage.setItem('gb-intro-seen','1')")
    p = await ctx.new_page(); await p.goto(B+"/login"); await p.fill("#identifier",u); await p.fill("#password",pw)
    await p.click("button:has-text('Log in')"); await p.wait_for_url(re.compile("/(dashboard|welcome)"))
    if "/welcome" in p.url: await p.click("text=Skip the tour"); await p.wait_for_url(re.compile("/dashboard"))
    return p
async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(executable_path="/opt/pw-browsers/chromium-1243/chrome-linux64/chrome")
        mgr = await login(b,"9000000002","manager123"); adm = await login(b,"9000000001","admin123")
        # --- 1. two people approve the same report at the same instant
        rid = q("select id from daily_report where status='submitted' and dham_id=1 order by id limit 1")
        before = q(f"select count(*) from stock_movement where report_id={rid}")
        await asyncio.gather(mgr.goto(f"{B}/reports/{rid}"), adm.goto(f"{B}/reports/{rid}"))
        await asyncio.gather(mgr.click("button:has-text('Approve Report')"), adm.click("button:has-text('Approve Report')"))
        await asyncio.sleep(3)
        after = q(f"select count(*) from stock_movement where report_id={rid}")
        lines = q(f"select count(*) from daily_report_line where report_id={rid} and sold_qty>0")
        msgs = [await p.locator("[role=alert],[role=status]").all_inner_texts() for p in (mgr, adm)]
        print(f"approve race: movements before={before} after={after} expected={lines}", "PASS" if after == lines else "FAIL")
        print("   messages:", [m[:1] for m in msgs])
        # --- 2. two admins send 70% of the Central Store's Gita copies each, at the same instant
        have = int(q("select sum(case when to_holder='central' then qty else -qty end) from stock_movement where book_id=1 and (to_holder='central' or from_holder='central')"))
        n = int(have*0.7)
        adm2 = await login(b,"9000000001","admin123")
        for p, d in ((adm,"1"),(adm2,"2")):
            await p.goto(f"{B}/stock/assign-dham?dham={d}")
            await p.get_by_label("Copies of Bhagavad Gita As It Is (English)").fill(str(n))
            await p.click("button:has-text('Review')")
        await asyncio.gather(adm.click("button:has-text('Confirm — Assign')"), adm2.click("button:has-text('Confirm — Assign')"))
        await asyncio.sleep(3)
        left = int(q("select sum(case when to_holder='central' then qty else -qty end) from stock_movement where book_id=1 and (to_holder='central' or from_holder='central')"))
        print(f"assign race: central had {have}, each tried {n}, now {left}", "PASS" if left >= 0 and left == have - n else "FAIL")
        # --- 3. devotee double-taps Submit Money
        dv = await login(b,"9000000011","devotee123")
        rem = q("select (select coalesce(sum(collected_paise),0) from daily_report d join \"user\" u on u.id=d.devotee_id where u.phone='9000000011' and status in ('submitted','approved','changes_required')) - (select coalesce(sum(amount_paise),0) from money_submission m join \"user\" u on u.id=m.devotee_id where u.phone='9000000011' and status<>'disputed')")
        cnt0 = q("select count(*) from money_submission m join \"user\" u on u.id=m.devotee_id where u.phone='9000000011'")
        dv2 = await login(b,"9000000011","devotee123")
        for p in (dv, dv2):
            await p.goto(f"{B}/my/money"); await p.fill("#amount", str(int(rem)/100))
        await asyncio.gather(dv.click("button:has-text('Submit Money')"), dv2.click("button:has-text('Submit Money')"))
        await asyncio.sleep(3)
        cnt1 = q("select count(*) from money_submission m join \"user\" u on u.id=m.devotee_id where u.phone='9000000011'")
        print(f"money double-submit: full balance ₹{int(rem)/100} sent twice at once → new entries {int(cnt1)-int(cnt0)}", "PASS" if int(cnt1)-int(cnt0) == 1 else "FAIL")
        await b.close()
asyncio.run(main())
