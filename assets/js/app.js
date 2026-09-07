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
        busy: false,
        showPass: false,
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

    let toastTimer = 0;

    function toast(message) {
        state.toast = message;
        let el = document.getElementById("app-toast");
        if (!el) {
            el = document.createElement("div");
            el.id = "app-toast";
            el.className = "toast";
            document.body.appendChild(el);
        }
        el.textContent = message;
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => {
            el.remove();
            if (state.toast === message) state.toast = "";
        }, 2400);
    }

    function closeSheet() {
        state.sheet = null;
        state.busy = false;
        document.body.classList.remove("modal-open");
        render();
    }

    function openSheet(sheet) {
        state.sheet = sheet;
        state.sheetOpenedAt = Date.now();
        document.body.classList.add("modal-open");
        render();
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
        if (state.view === "auth") {
            setTimeout(() => document.getElementById("username")?.focus(), 50);
        }
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

    function modalShell(title, body, { subtitle = "", center = false, wide = false } = {}) {
        return `
            <div class="sheet-bg${center ? " center" : ""}" id="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
                <div class="sheet${wide ? " wide" : ""}">
                    <div class="handle"></div>
                    <div class="modal-head">
                        <div>
                            <h2>${title}</h2>
                            ${subtitle ? `<p class="hint" style="margin:8px 0 0">${subtitle}</p>` : ""}
                        </div>
                        <button type="button" class="modal-close" id="cancel-sheet" aria-label="Close">×</button>
                    </div>
                    ${body}
                </div>
            </div>
        `;
    }

    function eyeIcon(open) {
        if (open) {
            return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12s3.5-7 9-7 9 7 9 7-3.5 7-9 7-9-7-9-7z"/><circle cx="12" cy="12" r="3"/></svg>`;
        }
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18M10.6 10.6A3 3 0 0 0 12 15a3 3 0 0 0 2.4-1.2M9.9 5.1A10.4 10.4 0 0 1 12 5c5.5 0 9 7 9 7a17.6 17.6 0 0 1-3.1 4.1M6.1 6.1C4 7.8 3 12 3 12a17.5 17.5 0 0 0 6.4 5.7"/></svg>`;
    }

    function renderAuth() {
        const showPass = !!state.showPass;
        return `
            <section class="screen auth">
                <div class="auth-card">
                    <div class="auth-brand">
                        <div class="brand-mark">R</div>
                        <h1>${esc(cfg.name)}</h1>
                    </div>
                    ${state.error ? `<div class="error">${esc(state.error)}</div>` : ""}
                    <div class="field">
                        <label for="username">Username</label>
                        <input id="username" type="text" placeholder="e.g. ali_305" value="${esc(state.form.username)}" autocomplete="username" autocapitalize="none" spellcheck="false">
                    </div>
                    <div class="field">
                        <label for="password">Password</label>
                        <div class="input-wrap">
                            <input id="password" class="has-toggle" type="${showPass ? "text" : "password"}" placeholder="Your password" value="${esc(state.form.password)}" autocomplete="current-password">
                            <button type="button" class="toggle-pass" id="toggle-pass" aria-label="${showPass ? "Hide password" : "Show password"}">${eyeIcon(showPass)}</button>
                        </div>
                    </div>
                    <button class="btn accent" id="auth-submit" style="margin-top:8px">Sign in</button>
                </div>
            </section>
        `;
    }

    function renderSetup() {
        const showPass = !!state.showPass;
        return `
            <section class="screen auth">
                <div class="auth-card">
                    <div class="auth-brand">
                        <div class="brand-mark">R</div>
                        <h1>Set up RoomTab</h1>
                        <p>Create the admin login and your first room.</p>
                    </div>
                    ${state.error ? `<div class="error">${esc(state.error)}</div>` : ""}
                    <div class="field">
                        <label for="display-name">Your name</label>
                        <input id="display-name" type="text" placeholder="Ali" value="${esc(state.form.displayName)}" autocomplete="name">
                    </div>
                    <div class="field">
                        <label for="username">Admin username</label>
                        <input id="username" type="text" placeholder="ali_305" value="${esc(state.form.username)}" autocomplete="username" autocapitalize="none" spellcheck="false">
                    </div>
                    <div class="field">
                        <label for="password">Admin password</label>
                        <div class="input-wrap">
                            <input id="password" class="has-toggle" type="${showPass ? "text" : "password"}" placeholder="Choose a password" value="${esc(state.form.password)}" autocomplete="new-password">
                            <button type="button" class="toggle-pass" id="toggle-pass" aria-label="${showPass ? "Hide password" : "Show password"}">${eyeIcon(showPass)}</button>
                        </div>
                    </div>
                    <div class="field">
                        <label for="room-name">Room name</label>
                        <input id="room-name" type="text" placeholder="Room 305" value="${esc(state.form.name)}" autocomplete="off">
                    </div>
                    <div class="field">
                        <label for="room-pin">Room PIN</label>
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
                        <input id="member-user" type="text" placeholder="Username" value="${esc(state.form.memberUser)}" autocomplete="off" autocapitalize="none">
                    </div>
                    <div class="chip-add">
                        <input id="member-pass" type="password" placeholder="Password" value="${esc(state.form.memberPass)}" autocomplete="new-password">
                        <button class="btn small" id="add-member-draft" type="button">Add</button>
                    </div>
                    <button class="btn accent" id="setup-submit" style="margin-top:16px">Create room</button>
                </div>
            </section>
        `;
    }

    function renderNoRoom() {
        const who = state.user?.name || "you";
        return `
            <section class="screen auth">
                <div class="auth-card">
                    <div class="auth-brand">
                        <div class="brand-mark">${esc((who || "R").slice(0, 1).toUpperCase())}</div>
                        <h1>No room yet</h1>
                        <p>Signed in as ${esc(who)}. Ask your admin to add you to a room.</p>
                    </div>
                    <button class="btn ghost" id="logout">Log out</button>
                </div>
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
                    <button class="avatar" id="switch-me" aria-label="Account">${esc(me.name.slice(0,1).toUpperCase())}</button>
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
                    ${recent.items.length ? recent.items.map(expenseRow).join("") : `
                        <div class="empty">
                            <strong>No expenses yet</strong>
                            Tap a quick item above, or use + to log something new.
                        </div>
                    `}
                </div>
                ${pager("recent", recent)}
            </section>
            <button class="fab" data-new-item="1" aria-label="Add expense">＋</button>
        `;
    }

    function expenseRow(exp) {
        const body = `
                <div class="emo">${exp.emoji}</div>
                <div class="meta">
                    <b>${esc(exp.title)}</b>
                    <small>${esc(exp.payer)} paid · ${timeAgo(exp.created_at)}</small>
                </div>
                <div class="amt">${money(exp.amount)}</div>
        `;
        if (exp.can_edit) {
            return `<button type="button" class="row expense-row" data-expense="${exp.id}">${body}</button>`;
        }
        return `<article class="row">${body}</article>`;
    }

    function renderPeople() {
        const d = state.data;
        const owed = d.members.filter((m) => m.is_owed).length;
        const owing = d.members.filter((m) => m.owes).length;
        return `
            <section class="screen">
                <div class="top">
                    <div>
                        <div class="eyebrow">${esc(d.room.name)}</div>
                        <h1>Roommates</h1>
                    </div>
                    <button type="button" class="btn small ghost" id="settle-history">History</button>
                </div>
                <div class="stat-row">
                    <div class="stat"><small>Owed</small><b>${owed}</b></div>
                    <div class="stat"><small>Owing</small><b>${owing}</b></div>
                </div>
                <div class="list">
                    ${d.members.map((m) => `
                        <article class="row member-row">
                            <div class="avatar">${esc(m.name.slice(0,1).toUpperCase())}</div>
                            <div class="meta">
                                <b>${esc(m.name)}${m.id === d.me.id ? '<span class="badge">you</span>' : ""}${m.is_admin ? '<span class="badge admin">admin</span>' : ""}</b>
                                <small>${m.username ? "@" + esc(m.username) + " · " : ""}${esc(m.label)}</small>
                            </div>
                            <div class="member-side">
                                <div class="amt ${m.owes ? "neg" : m.is_owed ? "pos" : ""}">${m.balance_cents === 0 ? "—" : (m.owes ? "−" : "+") + m.pending}</div>
                                ${m.id === d.me.id && m.owes ? `<button class="btn small settle" data-settle="${m.id}">Settle</button>` : ""}
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
                ` : `<div class="empty"><strong>No order yet</strong>Add roommates to start the cleaning rotation.</div>`}
                <div class="section-head"><h2>Cleaning order</h2></div>
                <p class="hint">Press and hold the dots, then drag. Or use the arrows. Move someone down if they are away.</p>
                <div class="list" id="bath-list">
                    ${bath.order.map((m) => `
                        <article class="row bath-row ${m.is_current ? "current" : ""}" data-bath-id="${m.id}">
                            <button type="button" class="drag-handle" aria-label="Press and hold to reorder">⋮⋮</button>
                            <div class="pos">${m.position}</div>
                            <div class="avatar">${esc(m.name.slice(0,1).toUpperCase())}</div>
                            <div class="meta">
                                <b>${esc(m.name)}${m.id === d.me.id ? '<span class="badge">you</span>' : ""}</b>
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
                    `).join("") : `<div class="empty"><strong>All clear</strong>Everyone is settled up.</div>`}
                </div>
                <div class="section-head" style="margin-top:22px"><h2>All expenses</h2></div>
                <div class="list">
                    ${expenses.items.length ? expenses.items.map(expenseRow).join("") : `<div class="empty"><strong>Nothing logged yet</strong>Add an expense from Home or Add.</div>`}
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
        const items = (state.data?.items || []).filter((item) => item.is_quick);
        return `
            <section class="screen">
                <div class="top"><div><div class="eyebrow">Manual</div><h1>New expense</h1></div></div>
                <div class="add-panel">
                    <h2>Custom item</h2>
                    <p class="hint">Name it, pick an emoji, then log the first amount in a popup.</p>
                    <button class="btn" data-new-item="1">Create &amp; add expense</button>
                </div>
                ${items.length ? `
                    <div class="section-head"><h2>Or pick existing</h2></div>
                    <div class="pick-grid">
                        ${items.map((item) => `
                            <button class="pick" data-quick="${item.id}">
                                <div class="emo" style="width:44px;height:44px;border-radius:14px;background:var(--card-2);display:grid;place-items:center;font-size:22px">${item.emoji}</div>
                                <div>
                                    <b>${esc(item.name)}</b>
                                    <small>${item.last_amount ? "Last " + money(item.last_amount) : "Tap to add"}</small>
                                </div>
                            </button>
                        `).join("")}
                    </div>
                ` : ""}
            </section>
        `;
    }

    function sheetExpense(item) {
        const members = state.data.members;
        const me = state.data.me.id;
        const typed = state.sheet.amount ?? "0.00";
        const payer = state.sheet.payer || me;
        const body = `
            <p class="hint">Split across all ${members.length} roommates</p>
            <div class="field">
                <label>Amount (${cfg.currency})</label>
                <input id="exp-amount" type="text" inputmode="decimal" value="${esc(typed)}" placeholder="0.00">
            </div>
            <label>Who paid</label>
            <div class="payers">
                ${members.map((m) => `<button type="button" class="${m.id === payer ? "on" : ""}" data-payer="${m.id}">${esc(m.name)}</button>`).join("")}
            </div>
            <div class="modal-actions">
                <button class="btn${state.busy ? " loading" : ""}" id="save-expense" data-item="${item.id || ""}" ${state.busy ? "disabled" : ""}>Add expense</button>
            </div>
        `;
        return modalShell(`${item.emoji} ${esc(item.name)}`, body);
    }

    function sheetNewItem() {
        const members = state.data.members;
        const me = state.data.me.id;
        const selected = state.sheet.emoji || "🛒";
        const payer = state.sheet.payer || me;
        const body = `
            <p class="hint">Name it, give it an emoji, then log the first expense.</p>
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
                <input id="exp-amount" type="text" inputmode="decimal" placeholder="0.00" value="${esc(state.sheet.amount || "0.00")}">
            </div>
            <label>Who paid</label>
            <div class="payers">
                ${members.map((m) => `<button type="button" class="${m.id === payer ? "on" : ""}" data-payer="${m.id}">${esc(m.name)}</button>`).join("")}
            </div>
            <div class="modal-actions">
                <button class="btn${state.busy ? " loading" : ""}" id="save-new-item" ${state.busy ? "disabled" : ""}>Add expense</button>
            </div>
        `;
        return modalShell("New item", body);
    }

    function sheetAccount() {
        const me = state.data?.me || {};
        const user = state.user || {};
        const body = `
            <p class="hint">@${esc(me.username || user.username || "")} · stays signed in on this device</p>
            <div class="modal-actions">
                <button class="btn ghost" id="logout">Log out</button>
            </div>
        `;
        return modalShell(esc(me.name || user.name || "Account"), body, { center: true });
    }

    function sheetEditExpense(exp) {
        const members = state.data.members;
        const payer = state.sheet.payer || exp.payer_id;
        const amount = state.sheet.amount ?? exp.amount;
        const body = `
            <p class="hint">${esc(exp.payer)} paid · ${esc(dateStamp(exp.created_at))}</p>
            <div class="field">
                <label>Amount (${cfg.currency})</label>
                <input id="exp-amount" type="text" inputmode="decimal" value="${esc(amount)}" placeholder="0.00">
            </div>
            <label>Who paid</label>
            <div class="payers">
                ${members.map((m) => `<button type="button" class="${m.id === payer ? "on" : ""}" data-payer="${m.id}">${esc(m.name)}</button>`).join("")}
            </div>
            <div class="modal-actions">
                <button class="btn${state.busy ? " loading" : ""}" id="save-edit-expense" ${state.busy ? "disabled" : ""}>Save changes</button>
                <button class="btn ghost" id="ask-delete-expense">Delete expense</button>
            </div>
        `;
        return modalShell(`${exp.emoji} ${esc(exp.title)}`, body);
    }

    function sheetDeleteExpense(exp) {
        const body = `
            <div class="confirm-icon">✕</div>
            <p class="hint" style="margin-top:0">Remove ${esc(exp.emoji)} ${esc(exp.title)} for ${money(exp.amount)}? Balances will update for everyone.</p>
            <div class="modal-actions">
                <button class="btn danger${state.busy ? " loading" : ""}" id="confirm-delete-expense" ${state.busy ? "disabled" : ""}>Delete</button>
                <button class="btn ghost" id="back-edit-expense">Back</button>
            </div>
        `;
        return modalShell("Delete expense", body, { center: true });
    }

    function sheetSettle(member) {
        const body = `
            <div class="confirm-icon ok">✓</div>
            <p class="hint" style="margin-top:0">You currently owe ${money(member.pending)}. After you pay, this clears your pending amount.</p>
            <div class="modal-actions">
                <button class="btn settle${state.busy ? " loading" : ""}" id="confirm-settle" data-settle-confirm="${member.id}" ${state.busy ? "disabled" : ""}>Mark as paid</button>
                <button class="btn ghost" id="cancel-sheet">Cancel</button>
            </div>
        `;
        return modalShell("Settle your amount", body, { center: true });
    }

    function sheetSettleHistory() {
        const settled = paged(state.data.settlements || [], "settled");
        const body = settled.total ? `
            <div class="list">
                ${settled.items.map((s) => `
                    <article class="row">
                        <div class="meta"><b>${esc(s.from_name)} paid ${esc(s.to_name)}</b><small>${dateStamp(s.created_at)}</small></div>
                        <div class="amt pos">${money(s.amount)}</div>
                    </article>
                `).join("")}
            </div>
            ${pager("settled", settled)}
        ` : `<div class="empty"><strong>No settlements yet</strong>When someone settles their amount, it shows up here.</div>`;
        return modalShell("Settlement history", body);
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
        if (!state.sheet) {
            document.body.classList.remove("modal-open");
            return "";
        }
        document.body.classList.add("modal-open");
        if (state.sheet.type === "expense") return sheetExpense(state.sheet.item);
        if (state.sheet.type === "new") return sheetNewItem();
        if (state.sheet.type === "edit-expense") return sheetEditExpense(state.sheet.expense);
        if (state.sheet.type === "delete-expense") return sheetDeleteExpense(state.sheet.expense);
        if (state.sheet.type === "settle") return sheetSettle(state.sheet.member);
        if (state.sheet.type === "settle-history") return sheetSettleHistory();
        if (state.sheet.type === "account") return sheetAccount();
        return "";
    }

    function render() {
        let body = "";
        if (state.view === "boot") {
            body = `<section class="boot"><div class="boot-mark">R</div><p class="empty" style="border:0;background:transparent;padding:0">Opening room…</p></section>`;
        }
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
        root.innerHTML = body + renderNav() + renderSheet();
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
        state.busy = false;
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
        document.body.classList.remove("modal-open");
    }

    function currentPayer() {
        const on = document.querySelector(".payers button.on");
        return on ? Number(on.dataset.payer) : state.data.me.id;
    }

    function captureSheetDraft() {
        if (!state.sheet) return;
        const name = document.getElementById("item-name");
        const amount = document.getElementById("exp-amount");
        if (name) state.sheet.title = name.value;
        if (amount) state.sheet.amount = amount.value;
        state.sheet.payer = currentPayer();
    }

    function bind() {
        const togglePass = document.getElementById("toggle-pass");
        if (togglePass) {
            togglePass.onclick = () => {
                readAuthForm();
                state.showPass = !state.showPass;
                render();
                document.getElementById("password")?.focus();
            };
        }

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
                submit.classList.add("loading");
                submit.disabled = true;
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
                setupSubmit.classList.add("loading");
                setupSubmit.disabled = true;
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
                bathDone.classList.add("loading");
                bathDone.disabled = true;
                try {
                    const data = await api("bathroom_complete");
                    applyRoom(data);
                    state.page.bath = 1;
                    state.tab = "bath";
                    render();
                    const next = data.bathroom_result?.next;
                    toast(next ? `Next up: ${next}` : "Bathroom marked done");
                } catch (err) {
                    toast(err.message);
                    render();
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
            const HOLD_MS = 420;
            const MOVE_CANCEL = 10;
            let dragRow = null;
            let holdTimer = null;
            let armed = false;
            let startX = 0;
            let startY = 0;
            let startIds = [];

            const clearHold = () => {
                clearTimeout(holdTimer);
                holdTimer = null;
            };

            const resetDrag = (row) => {
                clearHold();
                row?.classList.remove("holding", "dragging");
                dragRow = null;
                armed = false;
            };

            bathList.querySelectorAll(".drag-handle").forEach((handle) => {
                handle.addEventListener("pointerdown", (e) => {
                    const row = handle.closest("[data-bath-id]");
                    if (!row) return;
                    resetDrag(dragRow);
                    dragRow = row;
                    armed = false;
                    startX = e.clientX;
                    startY = e.clientY;
                    startIds = [...bathList.querySelectorAll("[data-bath-id]")].map((el) => Number(el.dataset.bathId));
                    row.classList.add("holding");
                    handle.setPointerCapture(e.pointerId);
                    e.preventDefault();
                    holdTimer = setTimeout(() => {
                        if (dragRow !== row) return;
                        armed = true;
                        row.classList.remove("holding");
                        row.classList.add("dragging");
                        if (navigator.vibrate) navigator.vibrate(12);
                    }, HOLD_MS);
                });
                handle.addEventListener("pointermove", (e) => {
                    if (!dragRow) return;
                    if (!armed) {
                        const moved = Math.hypot(e.clientX - startX, e.clientY - startY);
                        if (moved > MOVE_CANCEL) {
                            resetDrag(dragRow);
                            try { handle.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
                        }
                        return;
                    }
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
                    const row = dragRow;
                    const didDrag = armed;
                    resetDrag(row);
                    if (!didDrag) return;
                    const ids = [...bathList.querySelectorAll("[data-bath-id]")].map((el) => Number(el.dataset.bathId));
                    if (ids.length === startIds.length && ids.every((id, i) => id === startIds[i])) return;
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

        document.querySelectorAll("[data-expense]").forEach((btn) => {
            btn.onclick = () => {
                const exp = state.data.expenses.find((e) => String(e.id) === btn.dataset.expense);
                if (!exp) return;
                openSheet({ type: "edit-expense", expense: exp, amount: exp.amount, payer: exp.payer_id });
                setTimeout(() => document.getElementById("exp-amount")?.focus(), 80);
            };
        });

        document.querySelectorAll("[data-quick]").forEach((btn) => {
            btn.onclick = () => {
                const item = state.data.items.find((i) => String(i.id) === btn.dataset.quick);
                openSheet({ type: "expense", item, amount: "0.00", payer: state.data.me.id });
                setTimeout(() => {
                    const input = document.getElementById("exp-amount");
                    if (!input) return;
                    input.focus();
                    input.select();
                }, 80);
            };
        });

        document.querySelectorAll("[data-new-item]").forEach((btn) => {
            btn.onclick = () => {
                openSheet({ type: "new", emoji: "🛒", title: "", amount: "0.00", payer: state.data.me.id });
                setTimeout(() => document.getElementById("item-name")?.focus(), 80);
            };
        });

        document.querySelectorAll("[data-emoji]").forEach((btn) => {
            btn.onclick = () => {
                captureSheetDraft();
                state.sheet.emoji = btn.dataset.emoji;
                render();
            };
        });

        document.querySelectorAll("[data-payer]").forEach((btn) => {
            btn.onclick = () => {
                document.querySelectorAll("[data-payer]").forEach((b) => b.classList.toggle("on", b === btn));
                if (state.sheet) state.sheet.payer = Number(btn.dataset.payer);
            };
        });

        const saveExp = document.getElementById("save-expense");
        if (saveExp) {
            const save = async () => {
                if (state.busy) return;
                captureSheetDraft();
                const amount = state.sheet.amount;
                const itemId = Number(saveExp.dataset.item);
                const paidBy = currentPayer();
                state.busy = true;
                saveExp.classList.add("loading");
                saveExp.disabled = true;
                try {
                    const data = await api("add_expense", {
                        item_id: itemId,
                        amount,
                        paid_by: paidBy
                    });
                    applyRoom(data);
                    state.page.recent = 1;
                    state.page.expenses = 1;
                    state.sheet = null;
                    state.busy = false;
                    document.body.classList.remove("modal-open");
                    render();
                    toast("Expense added and split");
                } catch (err) {
                    state.busy = false;
                    toast(err.message);
                    render();
                }
            };
            saveExp.onclick = save;
            document.getElementById("exp-amount")?.addEventListener("keydown", (e) => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    save();
                }
            });
        }

        const saveNew = document.getElementById("save-new-item");
        if (saveNew) {
            const save = async () => {
                if (state.busy) return;
                captureSheetDraft();
                const title = state.sheet.title;
                const emoji = state.sheet.emoji;
                const amount = state.sheet.amount;
                const paidBy = currentPayer();
                state.busy = true;
                saveNew.classList.add("loading");
                saveNew.disabled = true;
                try {
                    const data = await api("add_expense", {
                        title,
                        emoji,
                        amount,
                        paid_by: paidBy
                    });
                    applyRoom(data);
                    state.page.recent = 1;
                    state.page.expenses = 1;
                    state.sheet = null;
                    state.busy = false;
                    document.body.classList.remove("modal-open");
                    render();
                    toast("New item saved");
                } catch (err) {
                    state.busy = false;
                    toast(err.message);
                    render();
                }
            };
            saveNew.onclick = save;
        }

        document.querySelectorAll("[data-settle]").forEach((btn) => {
            btn.onclick = () => {
                const member = state.data.members.find((m) => String(m.id) === btn.dataset.settle);
                if (!member || member.id !== state.data.me.id) return;
                openSheet({ type: "settle", member });
            };
        });

        const settleHistory = document.getElementById("settle-history");
        if (settleHistory) {
            settleHistory.onclick = () => openSheet({ type: "settle-history" });
        }

        const saveEdit = document.getElementById("save-edit-expense");
        if (saveEdit) {
            const save = async () => {
                if (state.busy) return;
                captureSheetDraft();
                state.busy = true;
                saveEdit.classList.add("loading");
                saveEdit.disabled = true;
                try {
                    const data = await api("update_expense", {
                        expense_id: state.sheet.expense.id,
                        amount: state.sheet.amount,
                        paid_by: currentPayer()
                    });
                    applyRoom(data);
                    state.sheet = null;
                    state.busy = false;
                    document.body.classList.remove("modal-open");
                    toast("Expense updated");
                    render();
                } catch (err) {
                    state.busy = false;
                    toast(err.message);
                    render();
                }
            };
            saveEdit.onclick = save;
            document.getElementById("exp-amount")?.addEventListener("keydown", (e) => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    save();
                }
            });
        }

        const askDelete = document.getElementById("ask-delete-expense");
        if (askDelete) {
            askDelete.onclick = () => {
                captureSheetDraft();
                openSheet({ type: "delete-expense", expense: state.sheet.expense });
            };
        }

        const backEdit = document.getElementById("back-edit-expense");
        if (backEdit) {
            backEdit.onclick = () => {
                const exp = state.sheet.expense;
                openSheet({ type: "edit-expense", expense: exp, amount: exp.amount, payer: exp.payer_id });
            };
        }

        const confirmDeleteExp = document.getElementById("confirm-delete-expense");
        if (confirmDeleteExp) {
            confirmDeleteExp.onclick = async () => {
                if (state.busy) return;
                state.busy = true;
                render();
                try {
                    const data = await api("delete_expense", { expense_id: state.sheet.expense.id });
                    applyRoom(data);
                    state.sheet = null;
                    state.busy = false;
                    document.body.classList.remove("modal-open");
                    toast("Expense deleted");
                    render();
                } catch (err) {
                    state.busy = false;
                    toast(err.message);
                    render();
                }
            };
        }

        const confirmSettle = document.getElementById("confirm-settle");
        if (confirmSettle) {
            confirmSettle.onclick = async () => {
                if (state.busy) return;
                state.busy = true;
                render();
                try {
                    const data = await api("settle", { member_id: Number(confirmSettle.dataset.settleConfirm) });
                    applyRoom(data);
                    state.page.settled = 1;
                    state.sheet = null;
                    state.busy = false;
                    document.body.classList.remove("modal-open");
                    toast("Pending amount cleared");
                    render();
                } catch (err) {
                    state.busy = false;
                    toast(err.message);
                    render();
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
            switchMe.onclick = () => openSheet({ type: "account" });
        }

        const sheet = document.getElementById("sheet");
        if (sheet) {
            sheet.addEventListener("click", (e) => {
                const justOpened = Date.now() - (state.sheetOpenedAt || 0) < 450;
                if (justOpened && e.target.id === "sheet") return;
                if (e.target.id === "sheet" || e.target.id === "cancel-sheet" || e.target.closest("#cancel-sheet")) {
                    closeSheet();
                }
            });
        }

        const installBtn = document.getElementById("install-app");
        if (installBtn && typeof window.ROOMTAB.install === "function") {
            installBtn.classList.remove("hidden");
            installBtn.onclick = () => window.ROOMTAB.install();
        }
    }

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && state.sheet) {
            e.preventDefault();
            closeSheet();
        }
    });

    boot();
})();
