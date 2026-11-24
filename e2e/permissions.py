"""E2E: outreach before approval, mobile bottom bar, Book Distribution restrictions, three separate permissions.
Run on a fresh local DB (npm run db:reset) with `npm start`. Never against production."""
import re, subprocess
from playwright.sync_api import sync_playwright, expect

B = "http://localhost:3000"
def q(s): return subprocess.run(["psql", "-h", "localhost", "-U", "postgres", "-d", "gaurangadham", "-tAc", s], capture_output=True, text=True).stdout.strip()
res = []
def check(name, ok, info=""):
    res.append((name, bool(ok))); print(("PASS " if ok else "FAIL ") + name + (f"  [{info}]" if info and not ok else ""))
def settle(pg):
    pg.wait_for_load_state("networkidle")
    try: pg.locator(".logo3d").first.wait_for(state="detached", timeout=15000)
    except Exception: pass
def page(b, mobile=False):
    ctx = b.new_context(viewport={"width": 390, "height": 844} if mobile else {"width": 1280, "height": 900}, is_mobile=mobile, has_touch=mobile)
    ctx.add_init_script("sessionStorage.setItem('gb-intro-seen','1')")
    pg = ctx.new_page(); pg.errs = []; pg.on("pageerror", lambda e: pg.errs.append(str(e)[:150])); return pg
def login(b, u, pw, mobile=False):
    pg = page(b, mobile)
    pg.goto(B + "/login"); pg.fill("#identifier", u); pg.fill("#password", pw); pg.click("button:has-text('Log in')")
    pg.wait_for_url(re.compile("/(dashboard|welcome)"))
    if "/welcome" in pg.url: pg.click("text=Skip the tour"); pg.wait_for_url(re.compile("/dashboard"))
    settle(pg); return pg
def go(pg, path): pg.goto(B + path); settle(pg)
def home(pg):
    go(pg, "/dashboard")
    if "/welcome" in pg.url: pg.click("text=Skip the tour"); pg.wait_for_url(re.compile("/dashboard")); settle(pg)
def msg(pg, pattern, t=20000):
    try: expect(pg.get_by_text(re.compile(pattern)).first).to_be_visible(timeout=t); return True
    except Exception: return False
def bottom(pg): return [x.strip() for x in pg.locator("nav[aria-label='Quick menu'] li").all_inner_texts()]
def add_contact(pg, name, mobile, consent=True):
    go(pg, "/contacts/new")
    pg.check("[data-testid=interest-book_reading]")
    pg.fill("[data-testid=c-name]", name); pg.fill("[data-testid=c-mobile]", mobile); pg.fill("[data-testid=c-area]", "Ameerpet")
    if consent: pg.check("[data-testid=c-consent]")
    pg.click("button:has-text('Save contact')")
def uid(phone): return q(f"select id from \"user\" where phone='{phone}'")
def toggle(m, name, perm, reason=""):
    go(m, "/people?role=devotee"); row = m.locator("li", has_text=name).first
    row.locator(f"[data-testid=toggle-{perm}]").click()
    f = row.locator(f"form:has(input[name=permission][value={perm}])")
    if reason: f.locator("input[name=reason]").fill(reason)
    f.locator("button[type=submit]").click()

with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium-1243/chrome-linux64/chrome")
    m = login(b, "9000000002", "manager123")
    go(m, "/people/registration"); m.click("button:has-text('Create Registration QR')"); msg(m, "Registration link ready")
    go(m, "/people/registration"); link = m.locator("[data-testid=invite-link]").first.input_value()

    # ---------- 1. Pending devotee: login + outreach ----------
    n = page(b, mobile=True); n.goto(link); settle(n)
    n.fill("#name", "Pending Pandit"); n.fill("#phone", "9876511111"); n.fill("#password", "secret12"); n.fill("#confirm", "secret12"); n.check("input[name=consent]")
    n.click("button:has-text('Register')"); n.wait_for_url(re.compile("/dashboard"), timeout=30000); settle(n)
    PEND = uid("9876511111")
    check("1 pending devotee logged in", n.locator("[data-testid=pending-dashboard]").count() == 1)
    check("1 pending home offers Collect Contacts", n.get_by_role("link", name=re.compile("Collect Contacts")).count() >= 1)
    check("2 mobile bottom bar (pending) = Home, Outreach, Contacts, Profile", bottom(n) == ["🏠\nHome", "➕\nOutreach", "📇\nContacts", "👤\nProfile"], bottom(n))
    add_contact(n, "No Consent Person", "9876522221", consent=False)
    check("1 consent still required", msg(n, "Please confirm they agreed") and q("select count(*) from outreach_contact where full_name='No Consent Person'") == "0")
    add_contact(n, "Outreach Friend", "9876522222")
    check("1 pending devotee creates a contact", msg(n, "Contact saved") and q(f"select count(*) from outreach_contact where collector_id='{PEND}'") == "1")
    check("1 contact tied to the invite's Dham + audited",
          q(f"select d.name from outreach_contact c join dham d on d.id=c.dham_id where c.collector_id='{PEND}'") == "Hyderabad Dham"
          and q(f"select count(*) from outreach_contact_audit a join outreach_contact c on c.id=a.contact_id where c.collector_id='{PEND}' and a.action='created'") == "1")
    existing = q("select mobile from outreach_contact where collector_id <> '" + PEND + "' limit 1")
    if existing:
        add_contact(n, "Maybe Same", existing)
        check("1 duplicate number flagged, other record not shown", msg(n, "may already be on file") and q(f"select dup_status from outreach_contact where collector_id='{PEND}' and full_name='Maybe Same'") == "possible")
    go(n, "/contacts/mine"); h = n.content()
    check("1 pending sees own contacts only", "Outreach Friend" in h and (not existing or q(f"select full_name from outreach_contact where mobile='{existing}' and collector_id<>'{PEND}' limit 1") not in h))
    other = q(f"select id from outreach_contact where collector_id <> '{PEND}' limit 1")
    if other:
        go(n, f"/contacts/{other}")
        check("1 pending can't open someone else's contact", "Outreach Friend" not in n.content() and q(f"select full_name from outreach_contact where id={other}") not in n.content())
    go(n, "/contacts"); check("1 /contacts (Sevak list) redirects pending devotee to own list", "/contacts/mine" in n.url)
    for path in ["/my/books", "/my/sales", "/my/money", "/stalls", "/availability", "/dham-sales", "/transfers"]:
        go(n, path); check(f"1 pending still denied {path}", "/dashboard" in n.url, n.url)
    check("1 pending denied export API", n.request.get(B + "/api/export/contacts").status in (401, 403))
    # spam guard: 20 contacts/hour while pending
    q(f"insert into outreach_contact (collector_id, dham_id, full_name, mobile, area, consent, consent_at, dup_status, collected_at, created_at, updated_at) select '{PEND}', dham_id, 'Bulk '||g, '98765'||lpad(g::text,5,'3'), 'X', true, now() at time zone 'UTC', 'none', now() at time zone 'UTC', now() at time zone 'UTC', now() at time zone 'UTC' from outreach_contact, generate_series(1,19) g where collector_id='{PEND}' limit 19")
    add_contact(n, "Over Limit", "9876544444")
    check("1 rate limit for pending registrations", msg(n, "Too many contacts") and q("select count(*) from outreach_contact where full_name='Over Limit'") == "0")
    q(f"delete from outreach_contact where collector_id='{PEND}' and full_name like 'Bulk %'")

    # ---------- 3. Approved without Book Distribution ----------
    go(m, "/people/requests"); m.get_by_label("Select Pending Pandit").check(); m.locator("button:has-text('Approve')").click(); msg(m, "approved")
    home(n)
    check("2 bottom bar (approved, no distribution) = Home, Outreach, Contacts, Profile", bottom(n) == ["🏠\nHome", "➕\nOutreach", "📇\nContacts", "👤\nProfile"], bottom(n))
    go(m, "/stock/assign-devotees")
    opts = m.locator("#devotee option").all_inner_texts()
    check("3 Assign Books excludes devotee without distribution", not any("Pending Pandit" in o for o in opts) and m.locator("[data-testid=assign-hidden-note]").count() == 1, opts)
    # direct request: replay a real assign request with the devotee id swapped
    GOVID = uid("9000000011")
    cap = {}
    m.on("request", lambda rq: cap.setdefault("r", rq) if rq.method == "POST" and "next-action" in {k.lower() for k in rq.headers} else None)
    go(m, f"/stock/assign-devotees?devotee={GOVID}")
    m.get_by_label("Copies of Bhagavad Gita As It Is (English)").fill("1")
    m.click("button:has-text('Review')"); m.click("button:has-text('Confirm — Give to Govinda')")
    msg(m, "Books assigned to Govinda")
    before = q(f"select coalesce(sum(qty),0) from stock_movement where to_holder='devotee:{PEND}'")
    if "r" in cap and cap["r"].post_data_buffer and GOVID.encode() in cap["r"].post_data_buffer:
        rq = cap["r"]; hdr = {k: v for k, v in rq.headers.items() if k.lower() in ("next-action", "next-router-state-tree", "content-type", "accept")}
        m.request.post(rq.url, headers=hdr, data=rq.post_data_buffer.replace(GOVID.encode(), PEND.encode()))
        check("3 direct assign request to non-distributing devotee refused", q(f"select coalesce(sum(qty),0) from stock_movement where to_holder='devotee:{PEND}'") == before == "0")
    else:
        check("3 direct assign request to non-distributing devotee refused", False, "could not capture assign request")
    go(m, "/transfers/new")
    check("3 transfer receiver list excludes non-distributing devotee", "Pending Pandit" not in m.content())
    go(n, "/stalls"); check("3 no stalls without distribution", "/stalls" not in n.url or n.get_by_text("Book Distribution is not turned on").count() >= 1)

    # ---------- 4. Three separate permissions ----------
    adm = login(b, "9000000001", "admin123")
    go(adm, "/people?role=devotee"); adm.locator("li", has_text="Pending Pandit").first.locator("button:has-text('Allow Availability')").click(); settle(adm); adm.wait_for_timeout(800)
    check("4 Book Availability grant stored", q(f"select can_see_availability from \"user\" where id='{PEND}'") == "t")
    go(n, "/availability"); check("4 Availability alone (no distribution) gives no access", "/availability" not in n.url, n.url)
    toggle(m, "Pending Pandit", "dham_sales_view"); msg(m, "Dham Sales View enabled")
    go(n, "/dham-sales"); check("4 Dham Sales View works without distribution", "/dham-sales" in n.url)
    go(n, "/availability"); check("4 Dham Sales View doesn't grant Availability", "/availability" not in n.url)
    go(n, "/my/books"); check("4 Dham Sales View doesn't grant books", "/my/books" not in n.url)
    toggle(m, "Pending Pandit", "book_distribution", "ready"); msg(m, "Book Distribution enabled")
    go(n, "/availability"); check("4 Availability works once distribution + grant are both on", "/availability" in n.url)
    home(n)
    check("2 bottom bar (with distribution) = Home, Sales, Books, Money, Outreach", bottom(n) == ["🏠\nHome", "📝\nSales", "📚\nBooks", "💰\nMoney", "➕\nOutreach"], bottom(n))
    go(m, "/stock/assign-devotees")
    check("5 activation: devotee now listed in Assign Books", any("Pending Pandit" in o for o in m.locator("#devotee option").all_inner_texts()))
    go(adm, "/people?role=devotee"); adm.locator("li", has_text="Pending Pandit").first.locator("button:has-text('Remove Availability')").click(); settle(adm); adm.wait_for_timeout(800)
    go(n, "/availability"); check("4 removing Availability keeps distribution", "/availability" not in n.url and q(f"select can_distribute_books from \"user\" where id='{PEND}'") == "t")

    # ---------- 5. Revocation of a devotee who holds books ----------
    gov = login(b, "9000000011", "devotee123", mobile=True)
    books_before = q(f"select sum(case when to_holder='devotee:{GOVID}' then qty else -qty end) from stock_movement where 'devotee:{GOVID}' in (to_holder, from_holder)")
    toggle(m, "Govinda Sharma", "book_distribution", "on leave")
    check("5 revoke tells the Sevak what is still held", msg(m, "still has .*books in hand"))
    a = q(f"select reason from access_audit where user_id='{GOVID}' and permission='book_distribution' order by id desc limit 1")
    check("5 revoke audited with holdings", "on leave" in a and "Still holds" in a and "books in hand" in a, a)
    check("5 no stock removed on revoke", q(f"select sum(case when to_holder='devotee:{GOVID}' then qty else -qty end) from stock_movement where 'devotee:{GOVID}' in (to_holder, from_holder)") == books_before)
    home(gov)
    check("5 revoked devotee sees hand-back notice", gov.locator("[data-testid=reconcile-notice]").count() == 1)
    go(gov, "/my/books"); check("5 revoked: My Books denied", "/my/books" not in gov.url)
    go(gov, "/my/sales"); check("5 revoked: sales denied", "/my/sales" not in gov.url)
    go(gov, "/my/money"); check("5 revoked: can still hand over money", "/my/money" in gov.url)
    go(m, f"/stock/take-back?devotee={GOVID}")
    check("5 Sevak can still take books back", m.get_by_text("Take Back Books from Govinda Sharma").count() >= 1)
    toggle(m, "Govinda Sharma", "book_distribution", "back"); msg(m, "Book Distribution enabled")
    go(gov, "/my/books"); check("5 re-enable restores access", "/my/books" in gov.url)
    # rejected registration: no outreach
    q("update \"user\" set approval_status='rejected' where phone='9876511111'")
    go(n, "/contacts/new"); check("1 rejected account loses outreach", "/contacts/new" not in n.url)
    check("no page errors", not (n.errs or m.errs or adm.errs or gov.errs), (n.errs + m.errs + adm.errs + gov.errs)[:3])
    b.close()

ok = sum(1 for _, x in res if x)
print(f"{ok}/{len(res)} passed")
