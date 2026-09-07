(() => {
    const root = document.getElementById("admin-app");
    const cfg = window.ROOMTAB_ADMIN;
    const state = {
        view: "boot",
        error: "",
        toast: "",
        admin: null,
        rooms: [],
        room: null,
        sheet: null,
        busy: false,
        form: {
            email: "",
            password: "",
            name: "",
            roomName: "",
            personName: "",
            personUser: "",
            personPass: "",
            editName: "",
            editUser: "",
            editPass: ""
        }
    };

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
        const query = method === "GET" && payload.id ? `&id=${encodeURIComponent(payload.id)}` : "";
        const res = await fetch(`${cfg.base}/admin/api.php?action=${encodeURIComponent(action)}${query}`, options);
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
        }, 2200);
    }

    function openSheet(sheet) {
        state.sheet = sheet;
        state.error = "";
        document.body.classList.add("modal-open");
        render();
    }

    function closeSheet() {
        state.sheet = null;
        state.busy = false;
        document.body.classList.remove("modal-open");
        render();
    }

    function apply(data) {
        state.error = "";
        if (data.admin) state.admin = data.admin;
        if (data.rooms) state.rooms = data.rooms;
        if (data.room) {
            state.room = data.room;
            state.form.roomName = data.room.name;
            state.view = "room";
            return;
        }
        if (data.logged_in) {
            state.view = "list";
            return;
        }
        state.view = "login";
        state.admin = null;
        state.room = null;
    }

    async function boot() {
        try {
            apply(await api("bootstrap", {}, "GET"));
        } catch {
            state.view = "login";
        }
        render();
    }

    function modalShell(title, body, { subtitle = "" } = {}) {
        return `
            <div class="sheet-bg center" id="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
                <div class="sheet">
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

    function renderLogin() {
        return `
            <section class="login-box">
                <div class="auth-card">
                    <div class="auth-brand">
                        <div class="brand-mark">A</div>
                        <h1>Admin</h1>
                        <p>Manage rooms and people.</p>
                    </div>
                    ${state.error ? `<div class="error">${esc(state.error)}</div>` : ""}
                    <div class="field">
                        <label for="admin-email">Email</label>
                        <input id="admin-email" type="email" value="${esc(state.form.email)}" autocomplete="username" placeholder="you@example.com">
                    </div>
                    <div class="field">
                        <label for="admin-pass">Password</label>
                        <input id="admin-pass" type="password" value="${esc(state.form.password)}" autocomplete="current-password" placeholder="Your password">
                    </div>
                    <button class="btn accent" id="admin-login" style="margin-top:8px">Sign in</button>
                </div>
            </section>
        `;
    }

    function renderList() {
        return `
            <div class="admin-top">
                <div>
                    <div class="eyebrow">${esc(state.admin?.email || "")}</div>
                    <h1>Rooms</h1>
                </div>
                <button class="btn small ghost" id="admin-logout">Log out</button>
            </div>
            ${state.error ? `<div class="error">${esc(state.error)}</div>` : ""}
            <div class="admin-toolbar">
                <button class="btn" id="open-create-room">＋ New room</button>
            </div>
            <div class="admin-grid">
                ${state.rooms.length ? state.rooms.map((room) => `
                    <button class="admin-card" data-open-room="${room.id}">
                        <b>${esc(room.name)}</b>
                        <small>${room.member_count} ${room.member_count === 1 ? "person" : "people"}</small>
                    </button>
                `).join("") : `<div class="empty"><strong>No rooms yet</strong>Create a room to start adding people.</div>`}
            </div>
        `;
    }

    function renderMember(member) {
        return `
            <article class="row admin-person">
                <div class="avatar">${esc((member.name || "?").slice(0, 1).toUpperCase())}</div>
                <div class="meta">
                    <b>${esc(member.name)}</b>
                    <small>${member.username ? "@" + esc(member.username) : "no login"}</small>
                </div>
                <div class="admin-actions">
                    <button class="btn small ghost" data-edit-person="${member.id}">Edit</button>
                    <button class="btn small ghost" data-delete-person="${member.id}">Delete</button>
                </div>
            </article>
        `;
    }

    function renderRoom() {
        const room = state.room;
        return `
            <div class="admin-top">
                <div>
                    <button class="btn small ghost" id="back-rooms">← All rooms</button>
                    <h1 style="margin-top:12px">${esc(room.name)}</h1>
                    <p class="admin-meta">${room.members.length} ${room.members.length === 1 ? "person" : "people"} in this room</p>
                </div>
                <button class="btn small ghost" id="admin-logout">Log out</button>
            </div>
            ${state.error ? `<div class="error">${esc(state.error)}</div>` : ""}
            <div class="admin-toolbar">
                <button class="btn" id="open-add-person">＋ Add person</button>
                <button class="btn ghost" id="open-rename-room">Rename room</button>
            </div>
            <div class="admin-section">
                <h2>People</h2>
            </div>
            <div class="list">
                ${room.members.length ? room.members.map(renderMember).join("") : `<div class="empty"><strong>Empty room</strong>Add the first roommate to get started.</div>`}
            </div>
            <div class="admin-danger-zone">
                <button class="btn danger" id="delete-room">Delete room</button>
            </div>
        `;
    }

    function renderSheet() {
        if (!state.sheet) {
            document.body.classList.remove("modal-open");
            return "";
        }
        document.body.classList.add("modal-open");
        const type = state.sheet.type;

        if (type === "create-room") {
            return modalShell("New room", `
                <p class="hint">Give the room a clear name so people recognize it.</p>
                <div class="field">
                    <label>Room name</label>
                    <input id="room-name" type="text" placeholder="Room 305" value="${esc(state.form.name)}" autofocus>
                </div>
                <div class="modal-actions">
                    <button class="btn${state.busy ? " loading" : ""}" id="create-room" ${state.busy ? "disabled" : ""}>Create room</button>
                </div>
            `);
        }

        if (type === "rename-room") {
            return modalShell("Rename room", `
                <div class="field">
                    <label>Room name</label>
                    <input id="edit-room-name" type="text" value="${esc(state.form.roomName)}" autofocus>
                </div>
                <div class="modal-actions">
                    <button class="btn${state.busy ? " loading" : ""}" id="save-room" ${state.busy ? "disabled" : ""}>Save name</button>
                </div>
            `);
        }

        if (type === "add-person") {
            return modalShell("Add person", `
                <p class="hint">They will log in with this username and password.</p>
                <div class="field">
                    <label>Display name</label>
                    <input id="person-name" type="text" placeholder="Ali" value="${esc(state.form.personName)}" autofocus>
                </div>
                <div class="field">
                    <label>Username</label>
                    <input id="person-user" type="text" placeholder="ali_305" value="${esc(state.form.personUser)}" autocomplete="off">
                </div>
                <div class="field">
                    <label>Password</label>
                    <input id="person-pass" type="password" placeholder="Temporary password" value="${esc(state.form.personPass)}" autocomplete="new-password">
                </div>
                <div class="modal-actions">
                    <button class="btn${state.busy ? " loading" : ""}" id="add-person" ${state.busy ? "disabled" : ""}>Add person</button>
                </div>
            `, { subtitle: esc(state.room?.name || "") });
        }

        if (type === "edit-person") {
            return modalShell("Edit person", `
                <div class="field">
                    <label>Display name</label>
                    <input id="edit-name" type="text" placeholder="Display name" value="${esc(state.form.editName)}" autofocus>
                </div>
                <div class="field">
                    <label>Username</label>
                    <input id="edit-user" type="text" placeholder="Username" value="${esc(state.form.editUser)}" autocomplete="off">
                </div>
                <div class="field">
                    <label>New password</label>
                    <input id="edit-pass" type="password" placeholder="Leave blank to keep current" value="${esc(state.form.editPass)}" autocomplete="new-password">
                </div>
                <div class="modal-actions">
                    <button class="btn${state.busy ? " loading" : ""}" id="save-person" ${state.busy ? "disabled" : ""}>Save changes</button>
                </div>
            `);
        }

        if (type === "confirm-delete-person") {
            const member = state.sheet.member;
            return modalShell("Remove person?", `
                <div class="confirm-icon">!</div>
                <p class="hint" style="margin-top:0">Remove <strong>${esc(member?.name || "this person")}</strong> from ${esc(state.room?.name || "this room")}? Their expenses in this room will also be removed.</p>
                <div class="modal-actions">
                    <button class="btn danger${state.busy ? " loading" : ""}" id="confirm-delete-person" ${state.busy ? "disabled" : ""}>Remove person</button>
                    <button class="btn ghost" id="cancel-sheet">Cancel</button>
                </div>
            `);
        }

        if (type === "confirm-delete-room") {
            return modalShell("Delete room?", `
                <div class="confirm-icon">!</div>
                <p class="hint" style="margin-top:0">Delete <strong>${esc(state.room?.name || "this room")}</strong>? This cannot be undone.</p>
                <div class="modal-actions">
                    <button class="btn danger${state.busy ? " loading" : ""}" id="confirm-delete-room" ${state.busy ? "disabled" : ""}>Delete room</button>
                    <button class="btn ghost" id="cancel-sheet">Cancel</button>
                </div>
            `);
        }

        return "";
    }

    function render() {
        let body = "";
        if (state.view === "boot") {
            body = `<div class="boot"><div class="boot-mark">A</div><p>Opening…</p></div>`;
        }
        if (state.view === "login") body = renderLogin();
        if (state.view === "list") body = renderList();
        if (state.view === "room") body = renderRoom();
        root.innerHTML = body + renderSheet() + (state.toast ? `<div class="toast">${esc(state.toast)}</div>` : "");
        bind();
    }

    function readForms() {
        const map = {
            email: "admin-email",
            password: "admin-pass",
            name: "room-name",
            roomName: "edit-room-name",
            personName: "person-name",
            personUser: "person-user",
            personPass: "person-pass",
            editName: "edit-name",
            editUser: "edit-user",
            editPass: "edit-pass"
        };
        Object.entries(map).forEach(([key, id]) => {
            const el = document.getElementById(id);
            if (el) state.form[key] = el.value;
        });
    }

    function bind() {
        const login = document.getElementById("admin-login");
        if (login) {
            login.onclick = async () => {
                readForms();
                state.error = "";
                login.classList.add("loading");
                login.disabled = true;
                try {
                    apply(await api("login", { email: state.form.email, password: state.form.password }));
                    render();
                } catch (err) {
                    state.error = err.message;
                    render();
                }
            };
            ["admin-email", "admin-pass"].forEach((id) => {
                document.getElementById(id)?.addEventListener("keydown", (e) => {
                    if (e.key === "Enter") {
                        e.preventDefault();
                        login.click();
                    }
                });
            });
        }

        const logout = document.getElementById("admin-logout");
        if (logout) {
            logout.onclick = async () => {
                await api("logout");
                state.view = "login";
                state.admin = null;
                state.room = null;
                state.sheet = null;
                document.body.classList.remove("modal-open");
                render();
            };
        }

        const openCreate = document.getElementById("open-create-room");
        if (openCreate) {
            openCreate.onclick = () => {
                state.form.name = "";
                openSheet({ type: "create-room" });
                setTimeout(() => document.getElementById("room-name")?.focus(), 60);
            };
        }

        const create = document.getElementById("create-room");
        if (create) {
            const run = async () => {
                if (state.busy) return;
                readForms();
                state.busy = true;
                create.classList.add("loading");
                create.disabled = true;
                try {
                    apply(await api("create_room", { name: state.form.name }));
                    state.form.name = "";
                    state.sheet = null;
                    state.busy = false;
                    document.body.classList.remove("modal-open");
                    toast("Room created");
                } catch (err) {
                    state.busy = false;
                    state.error = err.message;
                    toast(err.message);
                    render();
                }
            };
            create.onclick = run;
            document.getElementById("room-name")?.addEventListener("keydown", (e) => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    run();
                }
            });
        }

        document.querySelectorAll("[data-open-room]").forEach((btn) => {
            btn.onclick = async () => {
                try {
                    apply(await api("room", { id: Number(btn.dataset.openRoom) }, "GET"));
                    render();
                } catch (err) {
                    toast(err.message);
                }
            };
        });

        const back = document.getElementById("back-rooms");
        if (back) {
            back.onclick = () => {
                state.room = null;
                state.view = "list";
                state.error = "";
                state.sheet = null;
                document.body.classList.remove("modal-open");
                render();
            };
        }

        const openRename = document.getElementById("open-rename-room");
        if (openRename) {
            openRename.onclick = () => {
                state.form.roomName = state.room?.name || "";
                openSheet({ type: "rename-room" });
                setTimeout(() => document.getElementById("edit-room-name")?.focus(), 60);
            };
        }

        const saveRoom = document.getElementById("save-room");
        if (saveRoom) {
            saveRoom.onclick = async () => {
                if (state.busy) return;
                readForms();
                state.busy = true;
                saveRoom.classList.add("loading");
                saveRoom.disabled = true;
                try {
                    apply(await api("update_room", { room_id: state.room.id, name: state.form.roomName }));
                    state.sheet = null;
                    state.busy = false;
                    document.body.classList.remove("modal-open");
                    toast("Room updated");
                } catch (err) {
                    state.busy = false;
                    toast(err.message);
                    render();
                }
            };
        }

        const openAdd = document.getElementById("open-add-person");
        if (openAdd) {
            openAdd.onclick = () => {
                state.form.personName = "";
                state.form.personUser = "";
                state.form.personPass = "";
                openSheet({ type: "add-person" });
                setTimeout(() => document.getElementById("person-name")?.focus(), 60);
            };
        }

        const addPerson = document.getElementById("add-person");
        if (addPerson) {
            addPerson.onclick = async () => {
                if (state.busy) return;
                readForms();
                state.busy = true;
                addPerson.classList.add("loading");
                addPerson.disabled = true;
                try {
                    apply(await api("add_person", {
                        room_id: state.room.id,
                        name: state.form.personName,
                        username: state.form.personUser,
                        password: state.form.personPass
                    }));
                    state.form.personName = "";
                    state.form.personUser = "";
                    state.form.personPass = "";
                    state.sheet = null;
                    state.busy = false;
                    document.body.classList.remove("modal-open");
                    toast("Person added");
                } catch (err) {
                    state.busy = false;
                    toast(err.message);
                    render();
                }
            };
        }

        document.querySelectorAll("[data-edit-person]").forEach((btn) => {
            btn.onclick = () => {
                const id = Number(btn.dataset.editPerson);
                const member = state.room.members.find((m) => m.id === id);
                state.form.editName = member?.name || "";
                state.form.editUser = member?.username || "";
                state.form.editPass = "";
                openSheet({ type: "edit-person", memberId: id });
                setTimeout(() => document.getElementById("edit-name")?.focus(), 60);
            };
        });

        const savePerson = document.getElementById("save-person");
        if (savePerson) {
            savePerson.onclick = async () => {
                if (state.busy) return;
                readForms();
                state.busy = true;
                savePerson.classList.add("loading");
                savePerson.disabled = true;
                try {
                    apply(await api("update_person", {
                        room_id: state.room.id,
                        member_id: state.sheet.memberId,
                        name: state.form.editName,
                        username: state.form.editUser,
                        password: state.form.editPass
                    }));
                    state.form.editPass = "";
                    state.sheet = null;
                    state.busy = false;
                    document.body.classList.remove("modal-open");
                    toast("Person updated");
                } catch (err) {
                    state.busy = false;
                    toast(err.message);
                    render();
                }
            };
        }

        document.querySelectorAll("[data-delete-person]").forEach((btn) => {
            btn.onclick = () => {
                const id = Number(btn.dataset.deletePerson);
                const member = state.room.members.find((m) => m.id === id);
                openSheet({ type: "confirm-delete-person", member, memberId: id });
            };
        });

        const confirmDeletePerson = document.getElementById("confirm-delete-person");
        if (confirmDeletePerson) {
            confirmDeletePerson.onclick = async () => {
                if (state.busy) return;
                const id = state.sheet.memberId;
                state.busy = true;
                confirmDeletePerson.classList.add("loading");
                confirmDeletePerson.disabled = true;
                try {
                    apply(await api("delete_person", { room_id: state.room.id, member_id: id }));
                    state.sheet = null;
                    state.busy = false;
                    document.body.classList.remove("modal-open");
                    toast("Person removed");
                } catch (err) {
                    state.busy = false;
                    toast(err.message);
                    render();
                }
            };
        }

        const del = document.getElementById("delete-room");
        if (del) {
            del.onclick = () => openSheet({ type: "confirm-delete-room" });
        }

        const confirmDeleteRoom = document.getElementById("confirm-delete-room");
        if (confirmDeleteRoom) {
            confirmDeleteRoom.onclick = async () => {
                if (state.busy) return;
                state.busy = true;
                confirmDeleteRoom.classList.add("loading");
                confirmDeleteRoom.disabled = true;
                try {
                    const data = await api("delete_room", { room_id: state.room.id });
                    state.rooms = data.rooms || [];
                    state.room = null;
                    state.view = "list";
                    state.sheet = null;
                    state.busy = false;
                    document.body.classList.remove("modal-open");
                    toast("Room deleted");
                } catch (err) {
                    state.busy = false;
                    toast(err.message);
                    render();
                }
            };
        }

        const sheet = document.getElementById("sheet");
        if (sheet) {
            sheet.addEventListener("click", (e) => {
                if (e.target.id === "sheet" || e.target.id === "cancel-sheet" || e.target.closest("#cancel-sheet")) {
                    closeSheet();
                }
            });
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
