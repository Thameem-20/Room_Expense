(() => {
    const root = document.getElementById("app");
    const cfg = window.ROOMTAB;
    const ICONS = ["🛒","🦷","🧻","💧","🧼","🗑️","🫧","🍞","🥛","☕","🧴","🧽","🧂","🍪","🧊","🍋","🧃","🧺","🧹","🔑","🛏️","💊","🚿","🍚","🧄","🧅","🍅"];

    const state = {
        view: "boot",
        tab: "home",
        error: "",
        toast: "",
        sheet: null,
        authMode: "login",
        roomMode: "create",
        form: {
            username: "",
            password: "",
            displayName: "",
            name: "",
            pin: "",
            memberName: "",
            memberUser: "",
            memberPass: ""
        },
        membersDraft: [],
        data: null,
        user: null,
        page: { recent: 1, expenses: 1, settled: 1, bath: 1 }
    };

    const PAGE_SIZE = 10;

    const esc = (value) => String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");

    async function api(action, payload = {}, method = "POST") {
        const options = { method, headers: { "X-CSRF-Token": cfg.csrf } };
        if (method === "POST") {
            options.headers["Content-Type"] = "application/json";
            options.body = JSON.stringify({ action, ...payload });
        }
        const res = await fetch(`${cfg.base}/api.php?action=${encodeURIComponent(action)}`, options);
        const data = await res.json().catch(() => ({ ok: false, error: "Bad response" }));
        if (!res.ok || data.ok === false) {
            throw new Error(data.error || "Something went wrong.");
        }
        return data;
    }

    function toast(message) {
        state.toast = message;
        render();
        setTimeout(() => {
            if (state.toast === message) {
                state.toast = "";
                render();
            }
        }, 2400);
    }

    function parseDate(iso) {
        return new Date(String(iso).replace(" ", "T"));
    }

    function timeAgo(iso) {
        const date = parseDate(iso);
        const diff = Math.max(0, (Date.now() - date.getTime()) / 1000);
        if (diff < 60) return "Just now";
        if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
        if (diff < 172800) return "Yesterday";
        return date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
    }

    function dateStamp(iso) {
        const date = parseDate(iso);
        return date.toLocaleString(undefined, {
            day: "numeric",
            month: "short",
            year: "numeric",
            hour: "numeric",
            minute: "2-digit"
        });
    }

    function applyAuth(data) {
        state.error = "";
        state.user = data.user || state.user;
        if (data.logged_in && data.needs_room) {
            state.data = null;
            state.view = "noroom";
            return;
        }
        if (data.logged_in && data.room) {
            state.data = data;
            state.view = "app";
            return;
        }
        state.view = data.can_setup ? "setup" : "auth";
    }

    function applyRoom(data) {
        state.data = data;
        state.user = data.user || state.user;
        state.error = "";
        state.view = "app";
        if (!state.tab) state.tab = "home";
    }

    async function boot() {
        try {
            const data = await api("bootstrap", {}, "GET");
            applyAuth(data);
        } catch (err) {
            state.view = "auth";
            state.error = err.message;
        }
        render();
    }

    function iconNav(name) {
        const paths = {
            home: '<path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z"/>',
            add: '<path d="M12 5v14M5 12h14"/>',
            people: '<path d="M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM4 19c0-2.5 2-4 4-4h2c.7 0 1.3.1 1.9.4M20 19c0-2.5-2-4-4-4h-1"/>',
            list: '<path d="M8 7h11M8 12h11M8 17h11M5 7h.01M5 12h.01M5 17h.01"/>',
            bath: '<path d="M4 12h16M6 12V8a3 3 0 0 1 3-3h0a3 3 0 0 1 3 3v1M5 16h.01M9 16h.01M13 16h.01M17 16h.01M7 20h10"/>'
        };
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[name]}</svg>`;
    }

    function renderAuth() {
        return `
            <section class="screen auth">
                <div class="brand">
                    <div class="brand-mark">R</div>
                    <h1>${esc(cfg.name)}</h1>
                    <p>Log in with the username and password your room admin gave you.</p>
                </div>
                ${state.error ? `<div class="error">${esc(state.error)}</div>` : ""}
                <div class="field">
                    <label>Username</label>
                    <input id="username" type="text" placeholder="ali_305" value="${esc(state.form.username)}" autocomplete="username">
                </div>
                <div class="field">
                    <label>Password</label>
                    <input id="password" type="password" placeholder="Your password" value="${esc(state.form.password)}" autocomplete="current-password">
                </div>
                <div style="flex:1"></div>
                <button class="btn" id="auth-submit" style="margin-top:18px">Log in</button>
            </section>
        `;
    }

    function renderSetup() {
        return `
            <section class="screen auth">
                <div class="brand">
                    <div class="brand-mark">R</div>
                    <h1>Set up</h1>
                    <p>Create the admin login and the first room. After this, only you can add people.</p>
                </div>
                ${state.error ? `<div class="error">${esc(state.error)}</div>` : ""}
                <div class="field">
                    <label>Your name</label>
                    <input id="display-name" type="text" placeholder="Ali" value="${esc(state.form.displayName)}" autocomplete="name">
                </div>
                <div class="field">
                    <label>Admin username</label>
                    <input id="username" type="text" placeholder="ali_305" value="${esc(state.form.username)}" autocomplete="username">
                </div>
                <div class="field">
                    <label>Admin password</label>
                    <input id="password" type="password" placeholder="Your password" value="${esc(state.form.password)}" autocomplete="new-password">
                </div>
                <div class="field">
                    <label>Room name</label>
                    <input id="room-name" type="text" placeholder="Room 305" value="${esc(state.form.name)}" autocomplete="off">
                </div>
                <div class="field">
                    <label>Room PIN</label>
                    <input id="room-pin" type="password" inputmode="numeric" maxlength="6" placeholder="4–6 digits" value="${esc(state.form.pin)}">
                </div>
                <div class="field">
                    <label>Roommates</label>
                    <div class="chips">${state.membersDraft.map((m, i) => `
                        <span class="chip">${esc(m.name)} · @${esc(m.username)} <button data-remove="${i}" type="button">×</button></span>
                    `).join("")}</div>
                </div>
                <div class="field">
                    <input id="member-name" type="text" placeholder="Display name" value="${esc(state.form.memberName)}">
                </div>
                <div class="field">
                    <input id="member-user" type="text" placeholder="Username" value="${esc(state.form.memberUser)}" autocomplete="off">
                </div>
                <div class="chip-add">
                    <input id="member-pass" type="password" placeholder="Password" value="${esc(state.form.memberPass)}" autocomplete="new-password">
                    <button class="btn small" id="add-member-draft" type="button">Add</button>
                </div>
                <div style="flex:1"></div>
                <button class="btn" id="setup-submit" style="margin-top:18px">Create room</button>
            </section>
        `;
    }

    function renderNoRoom() {
        const who = state.user?.name || "you";
        return `
            <section class="screen auth">
                <div class="brand">
                    <p class="eyebrow">Signed in as ${esc(who)}</p>
                    <h1>No room yet</h1>
                    <p>Ask the room admin to add you. You cannot join or sign up on your own.</p>
                </div>
                <button class="btn ghost" id="logout">Log out</button>
            </section>
        `;
    }

    function money(amount) {
        return `${cfg.currency} ${amount}`;
    }

    function paged(items, key) {
        const list = items || [];
        const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
        let page = state.page[key] || 1;
        page = Math.min(pages, Math.max(1, page));
        state.page[key] = page;
        const start = (page - 1) * PAGE_SIZE;
        return {
            items: list.slice(start, start + PAGE_SIZE),
            page,
            pages,
            total: list.length,
            from: list.length ? start + 1 : 0,
            to: Math.min(start + PAGE_SIZE, list.length)
        };
    }

    function pager(key, info) {
        if (info.total <= PAGE_SIZE) return "";
        return `
            <div class="pager">
                <button type="button" class="btn small ghost" data-page="${key}" data-dir="-1"${info.page <= 1 ? " disabled" : ""}>Prev</button>
                <span>${info.from}–${info.to} of ${info.total}</span>
                <button type="button" class="btn small ghost" data-page="${key}" data-dir="1"${info.page >= info.pages ? " disabled" : ""}>Next</button>
            </div>
        `;
    }

    function renderHome() {
        const d = state.data;
        const me = d.me;
        const heading = me.is_owed ? "You are owed" : me.owes ? "You owe" : "You are settled";
        const items = d.items.filter((item) => item.is_quick).slice(0, 8);
        const recent = paged(d.expenses, "recent");
        return `
            <section class="screen">
                <div class="top">
                    <div>
                        <div class="eyebrow">${esc(d.room.name)}</div>
                        <h1>Hey, ${esc(me.name)}</h1>
                    </div>
                    <button class="avatar" id="switch-me">${esc(me.name.slice(0,1).toUpperCase())}</button>
                </div>
                <div class="balance">
                    <small>${heading}</small>
                    <strong>${money(me.pending)}</strong>
                    <span>Split equally across everyone in the room</span>
                </div>
                <div class="section-head"><h2>Quick add</h2></div>
                <div class="quick-grid">
                    ${items.map((item) => `
                        <button class="quick" data-quick="${item.id}">
                            <span class="emo">${item.emoji}</span>
                            <b>${esc(item.name)}</b>
                        </button>
                    `).join("")}
                    <button class="quick add" data-new-item="1">
                        <span class="emo">＋</span>
                        <b>New item</b>
                    </button>
                </div>
                <div class="section-head"><h2>Recent</h2></div>
                <div class="list">
                    ${recent.items.length ? recent.items.map(expenseRow).join("") : `<div class="empty">No expenses yet. Tap toothpaste or water to start.</div>`}
                </div>
                ${pager("recent", recent)}
            </section>
        `;
    }

    function expenseRow(exp) {
        return `
            <article class="row">
                <div class="emo">${exp.emoji}</div>
                <div class="meta">
                    <b>${esc(exp.title)}</b>
                    <small>${esc(exp.payer)} paid · ${timeAgo(exp.created_at)}</small>
                </div>
                <div class="amt">${money(exp.amount)}</div>
            </article>
        `;
    }

    function renderPeople() {
        const d = state.data;
        return `
            <section class="screen">
                <div class="top">
                    <div>
                        <div class="eyebrow">${esc(d.room.name)}</div>
                        <h1>Roommates</h1>
                    </div>
                </div>
                <div class="list">
                    ${d.members.map((m) => `
                        <article class="row member-row">
                            <div class="avatar">${esc(m.name.slice(0,1).toUpperCase())}</div>
                            <div class="meta">
                                <b>${esc(m.name)}${m.id === d.me.id ? " · you" : ""}${m.is_admin ? " · admin" : ""}</b>
                                <small>${m.username ? "@" + esc(m.username) + " · " : ""}${esc(m.label)}</small>
                            </div>
                            <div class="member-side">
                                <div class="amt ${m.owes ? "neg" : m.is_owed ? "pos" : ""}">${m.balance_cents === 0 ? "—" : (m.owes ? "−" : "+") + money(m.pending)}</div>
                                ${m.owes ? `<button class="btn small settle" data-settle="${m.id}">Settle</button>` : ""}
                            </div>
                        </article>
                    `).join("")}
                </div>
            </section>
        `;
    }

    function renderBathroom() {
        const d = state.data;
        const bath = d.bathroom || { order: [], history: [], current: null };
        const current = bath.current;
        const completed = paged(bath.history, "bath");
        return `
            <section class="screen">
                <div class="top">
                    <div>
                        <div class="eyebrow">${esc(d.room.name)}</div>
                        <h1>Bathroom</h1>
                    </div>
                </div>
                ${current ? `
                    <div class="bath-now">
                        <small>This week</small>
                        <strong>${esc(current.name)}</strong>
                        <span>Top of the list cleans. Mark done to pass it to the next person.</span>
                        <button class="btn" id="bath-done">Mark ${esc(current.name)} done</button>
                    </div>
                ` : `<div class="empty">Add roommates to start the cleaning order.</div>`}
                <div class="section-head"><h2>Cleaning order</h2></div>
                <p style="color:var(--muted);font-size:13px;margin:-4px 2px 12px">Hold the dots and drag, or use the arrows. Move someone down if they are away.</p>
                <div class="list" id="bath-list">
                    ${bath.order.map((m) => `
                        <article class="row bath-row ${m.is_current ? "current" : ""}" data-bath-id="${m.id}">
                            <button type="button" class="drag-handle" aria-label="Drag to reorder">⋮⋮</button>
                            <div class="pos">${m.position}</div>
                            <div class="avatar">${esc(m.name.slice(0,1).toUpperCase())}</div>
                            <div class="meta">
                                <b>${esc(m.name)}${m.id === d.me.id ? " · you" : ""}</b>
                                <small>${m.is_current ? "Cleans this week" : "Up next"}</small>
                            </div>
                            <div class="stepper">
                                <button type="button" data-bath-up="${m.id}">▲</button>
                                <button type="button" data-bath-down="${m.id}">▼</button>
                            </div>
                        </article>
                    `).join("")}
                </div>
                ${completed.total ? `
                    <div class="section-head" style="margin-top:22px"><h2>Completed</h2></div>
                    <div class="list">
                        ${completed.items.map((h) => `
                            <article class="row">
                                <div class="meta">
                                    <b>${esc(h.cleaner)} cleaned</b>
                                    <small>${esc(dateStamp(h.completed_at))}${h.marked_by !== h.cleaner ? " · marked by " + esc(h.marked_by) : ""}</small>
                                </div>
                            </article>
                        `).join("")}
                    </div>
                    ${pager("bath", completed)}
                ` : ""}
            </section>
        `;
    }

    function renderHistory() {
        const d = state.data;
        const expenses = paged(d.expenses, "expenses");
        const settled = paged(d.settlements, "settled");
        return `
            <section class="screen">
                <div class="top"><div><div class="eyebrow">Export</div><h1>Settlement</h1></div></div>
                <div class="export">${esc(d.export_text)}</div>
                <button class="btn" id="share-export">Copy summary</button>
                <div class="section-head" style="margin-top:22px"><h2>Suggested payments</h2></div>
                <div class="list">
                    ${d.payments.length ? d.payments.map((p) => `
                        <article class="row">
                            <div class="meta"><b>${esc(p.from)} → ${esc(p.to)}</b><small>To settle up</small></div>
                            <div class="amt">${money(p.amount)}</div>
                        </article>
                    `).join("") : `<div class="empty">Everyone is settled up.</div>`}
                </div>
                <div class="section-head" style="margin-top:22px"><h2>All expenses</h2></div>
                <div class="list">
                    ${expenses.items.length ? expenses.items.map(expenseRow).join("") : `<div class="empty">Nothing logged yet.</div>`}
                </div>
                ${pager("expenses", expenses)}
                ${settled.total ? `
                    <div class="section-head" style="margin-top:22px"><h2>Settled</h2></div>
                    <div class="list">
                        ${settled.items.map((s) => `
                            <article class="row">
                                <div class="meta"><b>${esc(s.from_name)} paid ${esc(s.to_name)}</b><small>${timeAgo(s.created_at)}</small></div>
                                <div class="amt pos">${money(s.amount)}</div>
                            </article>
                        `).join("")}
                    </div>
                    ${pager("settled", settled)}
                ` : ""}
                <button class="btn ghost" id="logout" style="margin-top:22px">Log out</button>
            </section>
        `;
    }

    function renderAdd() {
        return `
            <section class="screen">
                <div class="top"><div><div class="eyebrow">Manual</div><h1>New expense</h1></div></div>
                <p style="color:var(--muted);margin-bottom:16px">Add something that is not in quick add. Pick an emoji as the icon.</p>
                <button class="btn" data-new-item="1">Create item & add</button>
            </section>
        `;
    }

    function sheetExpense(item) {
        const members = state.data.members;
        const me = state.data.me.id;
        const prefill = item.last_amount || "";
        return `
            <div class="sheet-bg" id="sheet">
                <div class="sheet">
                    <div class="handle"></div>
                    <h2>${item.emoji} ${esc(item.name)}</h2>
                    <p style="color:var(--muted);margin:6px 0 16px">Split across all ${members.length} roommates</p>
                    <div class="field">
                        <label>Amount (${cfg.currency})</label>
                        <input id="exp-amount" type="number" inputmode="decimal" step="0.01" min="0" value="${esc(prefill)}" placeholder="10.00">
                    </div>
                    <label>Who paid</label>
                    <div class="payers">
                        ${members.map((m) => `<button type="button" class="${m.id === me ? "on" : ""}" data-payer="${m.id}">${esc(m.name)}</button>`).join("")}
                    </div>
                    <button class="btn" id="save-expense" data-item="${item.id || ""}">Add expense</button>
                </div>
            </div>
        `;
    }

    function sheetNewItem() {
        const members = state.data.members;
        const me = state.data.me.id;
        const selected = state.sheet.emoji || "🛒";
        return `
            <div class="sheet-bg" id="sheet">
                <div class="sheet">
                    <div class="handle"></div>
                    <h2>New item</h2>
                    <p style="color:var(--muted);margin:6px 0 16px">Name it, give it an emoji, then log the first expense.</p>
                    <div class="field">
                        <label>Item name</label>
                        <input id="item-name" type="text" placeholder="Colgate" value="${esc(state.sheet.title || "")}">
                    </div>
                    <label>Emoji icon</label>
                    <div class="emoji-grid">
                        ${Array.from(new Set(["🛒", ...ICONS])).map((e) => `
                            <button type="button" class="${e === selected ? "on" : ""}" data-emoji="${e}">${e}</button>
                        `).join("")}
                    </div>
                    <div class="field">
                        <label>Amount (${cfg.currency})</label>
                        <input id="exp-amount" type="number" inputmode="decimal" step="0.01" min="0" placeholder="10.00" value="${esc(state.sheet.amount || "")}">
                    </div>
                    <label>Who paid</label>
                    <div class="payers">
                        ${members.map((m) => `<button type="button" class="${m.id === me ? "on" : ""}" data-payer="${m.id}">${esc(m.name)}</button>`).join("")}
                    </div>
                    <button class="btn" id="save-new-item">Add expense</button>
                </div>
            </div>
        `;
    }

    function sheetAccount() {
        const me = state.data?.me || {};
        const user = state.user || {};
        return `
            <div class="sheet-bg" id="sheet">
                <div class="sheet">
                    <div class="handle"></div>
                    <h2>${esc(me.name || user.name || "Account")}</h2>
                    <p style="color:var(--muted);margin:8px 0 18px">@${esc(me.username || user.username || "")} · stays signed in on this device</p>
                    <button class="btn ghost" id="logout">Log out</button>
                    <button class="btn ghost" id="cancel-sheet" style="margin-top:8px">Close</button>
                </div>
            </div>
        `;
    }

    function sheetSettle(member) {
        return `
            <div class="sheet-bg" id="sheet">
                <div class="sheet">
                    <div class="handle"></div>
                    <h2>Settle ${esc(member.name)}</h2>
                    <p style="color:var(--muted);margin:8px 0 18px">${esc(member.name)} currently owes ${money(member.pending)}. After payment, this clears their pending amount.</p>
                    <button class="btn settle" id="confirm-settle" data-settle-confirm="${member.id}">Mark as paid</button>
                    <button class="btn ghost" id="cancel-sheet" style="margin-top:8px">Cancel</button>
                </div>
            </div>
        `;
    }

    function renderNav() {
        if (state.view !== "app") return "";
        const tabs = [
            ["home", "Home", "home"],
            ["add", "Add", "add"],
            ["bath", "Bath", "bath"],
            ["people", "People", "people"],
            ["history", "Settle", "list"]
        ];
        return `
            <nav class="nav">
                ${tabs.map(([id, label, icon]) => `
                    <button class="${state.tab === id ? "active" : ""}" data-tab="${id}">
                        ${iconNav(icon)}
                        ${label}
                    </button>
                `).join("")}
            </nav>
        `;
    }

    function renderSheet() {
        if (!state.sheet) return "";
        if (state.sheet.type === "expense") return sheetExpense(state.sheet.item);
        if (state.sheet.type === "new") return sheetNewItem();
        if (state.sheet.type === "settle") return sheetSettle(state.sheet.member);
        if (state.sheet.type === "account") return sheetAccount();
        return "";
    }

    function render() {
        let body = "";
        if (state.view === "boot") body = `<section class="screen"><p class="empty">Opening room…</p></section>`;
        if (state.view === "auth") body = renderAuth();
        if (state.view === "setup") body = renderSetup();
        if (state.view === "noroom") body = renderNoRoom();
        if (state.view === "app") {
            if (state.tab === "home") body = renderHome();
            if (state.tab === "add") body = renderAdd();
            if (state.tab === "people") body = renderPeople();
            if (state.tab === "bath") body = renderBathroom();
            if (state.tab === "history") body = renderHistory();
        }
        root.innerHTML = body + renderNav() + renderSheet() + (state.toast ? `<div class="toast">${esc(state.toast)}</div>` : "");
        bind();
    }

    function readAuthForm() {
        const map = {
            username: "username",
            password: "password",
            displayName: "display-name",
            name: "room-name",
            pin: "room-pin",
            memberName: "member-name",
            memberUser: "member-user",
            memberPass: "member-pass"
        };
        Object.entries(map).forEach(([key, id]) => {
            const el = document.getElementById(id);
            if (el) state.form[key] = el.value;
        });
    }

    function resetSessionState() {
        state.data = null;
        state.user = null;
        state.view = "auth";
        state.tab = "home";
        state.sheet = null;
        state.membersDraft = [];
        state.page = { recent: 1, expenses: 1, settled: 1, bath: 1 };
        state.form = {
            username: "",
            password: "",
            displayName: "",
            name: "",
            pin: "",
            memberName: "",
            memberUser: "",
            memberPass: ""
        };
    }

    function currentPayer() {
        const on = document.querySelector(".payers button.on");
        return on ? Number(on.dataset.payer) : state.data.me.id;
    }

    function bind() {
        document.querySelectorAll("[data-auth-mode]").forEach((btn) => {
            btn.onclick = () => {
                readAuthForm();
                state.authMode = btn.dataset.authMode;
                state.error = "";
                render();
            };
        });

        document.querySelectorAll("[data-room-mode]").forEach((btn) => {
            btn.onclick = () => {
                readAuthForm();
                state.roomMode = btn.dataset.roomMode;
                state.error = "";
                render();
            };
        });

        const addDraft = document.getElementById("add-member-draft");
        if (addDraft) {
            const add = () => {
                readAuthForm();
                const name = state.form.memberName.trim();
                const username = state.form.memberUser.trim();
                const password = state.form.memberPass;
                if (!name || !username || !password) {
                    toast("Add their name, username, and password");
                    return;
                }
                if (state.membersDraft.some((m) => m.username.toLowerCase() === username.toLowerCase())) {
                    toast("That username is already in the list");
                    return;
                }
                state.membersDraft.push({ name, username, password });
                state.form.memberName = "";
                state.form.memberUser = "";
                state.form.memberPass = "";
                render();
                document.getElementById("member-name")?.focus();
            };
            addDraft.onclick = add;
            ["member-name", "member-user", "member-pass"].forEach((id) => {
                document.getElementById(id)?.addEventListener("keydown", (e) => {
                    if (e.key === "Enter") {
                        e.preventDefault();
                        add();
                    }
                });
            });
        }

        document.querySelectorAll("[data-remove]").forEach((btn) => {
            btn.onclick = () => {
                readAuthForm();
                state.membersDraft.splice(Number(btn.dataset.remove), 1);
                render();
            };
        });

        const submit = document.getElementById("auth-submit");
        if (submit) {
            ["username", "password", "display-name"].forEach((id) => {
                document.getElementById(id)?.addEventListener("keydown", (e) => {
                    if (e.key === "Enter") {
                        e.preventDefault();
                        submit.click();
                    }
                });
            });
            submit.onclick = async () => {
                readAuthForm();
                state.error = "";
                try {
                    const data = await api("login", {
                        username: state.form.username,
                        password: state.form.password
                    });
                    applyAuth(data);
                    render();
                } catch (err) {
                    state.error = err.message;
                    render();
                }
            };
        }

        const setupSubmit = document.getElementById("setup-submit");
        if (setupSubmit) {
            setupSubmit.onclick = async () => {
                readAuthForm();
                state.error = "";
                try {
                    const data = await api("setup", {
                        name: state.form.displayName,
                        username: state.form.username,
                        password: state.form.password,
                        room_name: state.form.name,
                        pin: state.form.pin,
                        members: state.membersDraft
                    });
                    applyAuth(data);
                    render();
                } catch (err) {
                    state.error = err.message;
                    render();
                }
            };
        }

        document.querySelectorAll("[data-tab]").forEach((btn) => {
            btn.onclick = () => {
                state.tab = btn.dataset.tab;
                render();
            };
        });

        document.querySelectorAll("[data-page]").forEach((btn) => {
            btn.onclick = () => {
                const key = btn.dataset.page;
                state.page[key] = (state.page[key] || 1) + Number(btn.dataset.dir);
                render();
            };
        });

        const bathIds = () => (state.data?.bathroom?.order || []).map((m) => m.id);

        const saveBathOrder = async (ids) => {
            const data = await api("bathroom_reorder", { member_ids: ids });
            applyRoom(data);
            state.tab = "bath";
            render();
        };

        const bathDone = document.getElementById("bath-done");
        if (bathDone) {
            bathDone.onclick = async () => {
                try {
                    const data = await api("bathroom_complete");
                    applyRoom(data);
                    state.page.bath = 1;
                    state.tab = "bath";
                    const next = data.bathroom_result?.next;
                    toast(next ? `Next up: ${next}` : "Bathroom marked done");
                } catch (err) {
                    toast(err.message);
                }
            };
        }

        document.querySelectorAll("[data-bath-up]").forEach((btn) => {
            btn.onclick = async (e) => {
                e.stopPropagation();
                const ids = bathIds();
                const i = ids.indexOf(Number(btn.dataset.bathUp));
                if (i < 1) return;
                [ids[i - 1], ids[i]] = [ids[i], ids[i - 1]];
                try {
                    await saveBathOrder(ids);
                } catch (err) {
                    toast(err.message);
                }
            };
        });

        document.querySelectorAll("[data-bath-down]").forEach((btn) => {
            btn.onclick = async (e) => {
                e.stopPropagation();
                const ids = bathIds();
                const i = ids.indexOf(Number(btn.dataset.bathDown));
                if (i < 0 || i >= ids.length - 1) return;
                [ids[i + 1], ids[i]] = [ids[i], ids[i + 1]];
                try {
                    await saveBathOrder(ids);
                } catch (err) {
                    toast(err.message);
                }
            };
        });

        const bathList = document.getElementById("bath-list");
        if (bathList) {
            let dragRow = null;
            bathList.querySelectorAll(".drag-handle").forEach((handle) => {
                handle.addEventListener("pointerdown", (e) => {
                    dragRow = handle.closest("[data-bath-id]");
                    if (!dragRow) return;
                    dragRow.classList.add("dragging");
                    handle.setPointerCapture(e.pointerId);
                    e.preventDefault();
                });
                handle.addEventListener("pointermove", (e) => {
                    if (!dragRow) return;
                    const over = document.elementFromPoint(e.clientX, e.clientY)?.closest("#bath-list [data-bath-id]");
                    if (!over || over === dragRow) return;
                    const rect = over.getBoundingClientRect();
                    if (e.clientY < rect.top + rect.height / 2) {
                        bathList.insertBefore(dragRow, over);
                    } else {
                        bathList.insertBefore(dragRow, over.nextSibling);
                    }
                });
                const finish = async () => {
                    if (!dragRow) return;
                    dragRow.classList.remove("dragging");
                    const ids = [...bathList.querySelectorAll("[data-bath-id]")].map((el) => Number(el.dataset.bathId));
                    dragRow = null;
                    try {
                        await saveBathOrder(ids);
                    } catch (err) {
                        toast(err.message);
                    }
                };
                handle.addEventListener("pointerup", finish);
                handle.addEventListener("pointercancel", finish);
            });
        }

        document.querySelectorAll("[data-quick]").forEach((btn) => {
            btn.onclick = () => {
                const item = state.data.items.find((i) => String(i.id) === btn.dataset.quick);
                state.sheet = { type: "expense", item, payer: state.data.me.id };
                render();
                setTimeout(() => document.getElementById("exp-amount")?.focus(), 50);
            };
        });

        document.querySelectorAll("[data-new-item]").forEach((btn) => {
            btn.onclick = () => {
                state.sheet = { type: "new", emoji: "🛒", title: "" };
                state.tab = "home";
                render();
            };
        });

        document.querySelectorAll("[data-emoji]").forEach((btn) => {
            btn.onclick = () => {
                state.sheet.emoji = btn.dataset.emoji;
                state.sheet.title = document.getElementById("item-name")?.value || "";
                state.sheet.amount = document.getElementById("exp-amount")?.value || "";
                render();
            };
        });

        document.querySelectorAll("[data-payer]").forEach((btn) => {
            btn.onclick = () => {
                document.querySelectorAll("[data-payer]").forEach((b) => b.classList.toggle("on", b === btn));
            };
        });

        const saveExp = document.getElementById("save-expense");
        if (saveExp) {
            saveExp.onclick = async () => {
                const amount = document.getElementById("exp-amount").value;
                try {
                    const data = await api("add_expense", {
                        item_id: Number(saveExp.dataset.item),
                        amount,
                        paid_by: currentPayer()
                    });
                    applyRoom(data);
                    state.page.recent = 1;
                    state.page.expenses = 1;
                    state.sheet = null;
                    toast("Expense added and split");
                    render();
                } catch (err) {
                    toast(err.message);
                }
            };
        }

        const saveNew = document.getElementById("save-new-item");
        if (saveNew) {
            saveNew.onclick = async () => {
                try {
                    const data = await api("add_expense", {
                        title: document.getElementById("item-name").value,
                        emoji: state.sheet.emoji,
                        amount: document.getElementById("exp-amount").value,
                        paid_by: currentPayer()
                    });
                    applyRoom(data);
                    state.page.recent = 1;
                    state.page.expenses = 1;
                    state.sheet = null;
                    toast("New item saved");
                    render();
                } catch (err) {
                    toast(err.message);
                }
            };
        }

        document.querySelectorAll("[data-settle]").forEach((btn) => {
            btn.onclick = () => {
                const member = state.data.members.find((m) => String(m.id) === btn.dataset.settle);
                state.sheet = { type: "settle", member };
                render();
            };
        });

        const confirmSettle = document.getElementById("confirm-settle");
        if (confirmSettle) {
            confirmSettle.onclick = async () => {
                try {
                    const data = await api("settle", { member_id: Number(confirmSettle.dataset.settleConfirm) });
                    applyRoom(data);
                    state.page.settled = 1;
                    state.sheet = null;
                    toast("Pending amount cleared");
                    render();
                } catch (err) {
                    toast(err.message);
                }
            };
        }

        const addPerson = document.getElementById("add-person");
        if (addPerson) {
            addPerson.onclick = async () => {
                try {
                    const data = await api("add_member", {
                        name: document.getElementById("new-person-name").value.trim(),
                        username: document.getElementById("new-person-user").value.trim(),
                        password: document.getElementById("new-person-pass").value
                    });
                    applyRoom(data);
                    toast("Roommate added");
                    render();
                } catch (err) {
                    toast(err.message);
                }
            };
        }

        const share = document.getElementById("share-export");
        if (share) {
            share.onclick = async () => {
                const text = state.data.export_text;
                try {
                    if (navigator.share) {
                        await navigator.share({ title: cfg.name, text });
                    } else {
                        await navigator.clipboard.writeText(text);
                        toast("Summary copied");
                    }
                } catch {
                    await navigator.clipboard.writeText(text);
                    toast("Summary copied");
                }
            };
        }

        const logout = document.getElementById("logout");
        if (logout) {
            logout.onclick = async () => {
                await api("logout");
                resetSessionState();
                render();
            };
        }

        const switchMe = document.getElementById("switch-me");
        if (switchMe) {
            switchMe.onclick = () => {
                state.sheet = { type: "account" };
                render();
            };
        }

        const sheet = document.getElementById("sheet");
        if (sheet) {
            sheet.addEventListener("click", (e) => {
                if (e.target.id === "sheet" || e.target.id === "cancel-sheet") {
                    state.sheet = null;
                    render();
                }
            });
        }

        const installBtn = document.getElementById("install-app");
        if (installBtn && typeof window.ROOMTAB.install === "function") {
            installBtn.classList.remove("hidden");
            installBtn.onclick = () => window.ROOMTAB.install();
        }
    }

    boot();
})();
