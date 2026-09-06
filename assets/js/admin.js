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
        editingId: null,
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

    function renderLogin() {
        return `
            <section class="login-box">
                <div class="brand">
                    <div class="brand-mark">A</div>
                    <h1>Admin</h1>
                    <p>Manage rooms and people.</p>
                </div>
                ${state.error ? `<div class="error">${esc(state.error)}</div>` : ""}
                <div class="field">
                    <label>Email</label>
                    <input id="admin-email" type="email" value="${esc(state.form.email)}" autocomplete="username">
                </div>
                <div class="field">
                    <label>Password</label>
                    <input id="admin-pass" type="password" value="${esc(state.form.password)}" autocomplete="current-password">
                </div>
                <button class="btn" id="admin-login">Log in</button>
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
            <div class="admin-card" style="margin-bottom:16px">
                <label>New room</label>
                <div class="chip-add" style="margin-top:10px">
                    <input id="room-name" type="text" placeholder="Room name" value="${esc(state.form.name)}">
                    <button class="btn small" id="create-room">Create</button>
                </div>
            </div>
            <div class="admin-grid">
                ${state.rooms.length ? state.rooms.map((room) => `
                    <button class="admin-card" data-open-room="${room.id}">
                        <b>${esc(room.name)}</b>
                        <small>${room.member_count} ${room.member_count === 1 ? "person" : "people"}</small>
                    </button>
                `).join("") : `<p class="empty">No rooms yet.</p>`}
            </div>
        `;
    }

    function renderMember(member) {
        const editing = state.editingId === member.id;
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
            ${editing ? `
                <div class="admin-card admin-edit">
                    <label>Edit person</label>
                    <div class="field" style="margin-top:10px">
                        <input id="edit-name" type="text" placeholder="Display name" value="${esc(state.form.editName)}">
                    </div>
                    <div class="field">
                        <input id="edit-user" type="text" placeholder="Username" value="${esc(state.form.editUser)}" autocomplete="off">
                    </div>
                    <div class="field">
                        <input id="edit-pass" type="password" placeholder="New password (optional)" value="${esc(state.form.editPass)}" autocomplete="new-password">
                    </div>
                    <div class="admin-actions">
                        <button class="btn small" id="save-person">Save</button>
                        <button class="btn small ghost" id="cancel-edit">Cancel</button>
                    </div>
                </div>
            ` : ""}
        `;
    }

    function renderRoom() {
        const room = state.room;
        return `
            <div class="admin-top">
                <div>
                    <button class="btn small ghost" id="back-rooms">All rooms</button>
                    <h1 style="margin-top:12px">${esc(room.name)}</h1>
                </div>
                <button class="btn small ghost" id="admin-logout">Log out</button>
            </div>
            ${state.error ? `<div class="error">${esc(state.error)}</div>` : ""}
            <div class="admin-card" style="margin-bottom:16px">
                <label>Room name</label>
                <div class="chip-add" style="margin-top:10px">
                    <input id="edit-room-name" type="text" value="${esc(state.form.roomName)}">
                    <button class="btn small" id="save-room">Save</button>
                </div>
            </div>
            <div class="list">
                ${room.members.length ? room.members.map(renderMember).join("") : `<div class="empty">No people in this room yet.</div>`}
            </div>
            <div class="admin-card" style="margin-top:16px">
                <label>Add person</label>
                <div class="field" style="margin-top:10px">
                    <input id="person-name" type="text" placeholder="Display name" value="${esc(state.form.personName)}">
                </div>
                <div class="field">
                    <input id="person-user" type="text" placeholder="Username" value="${esc(state.form.personUser)}" autocomplete="off">
                </div>
                <div class="chip-add">
                    <input id="person-pass" type="password" placeholder="Password" value="${esc(state.form.personPass)}" autocomplete="new-password">
                    <button class="btn small" id="add-person">Add</button>
                </div>
            </div>
            <button class="btn ghost" id="delete-room" style="margin-top:18px">Delete room</button>
        `;
    }

    function render() {
        let body = "";
        if (state.view === "boot") body = `<p class="empty">Opening…</p>`;
        if (state.view === "login") body = renderLogin();
        if (state.view === "list") body = renderList();
        if (state.view === "room") body = renderRoom();
        root.innerHTML = body + (state.toast ? `<div class="toast">${esc(state.toast)}</div>` : "");
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
                state.editingId = null;
                render();
            };
        }

        const create = document.getElementById("create-room");
        if (create) {
            create.onclick = async () => {
                readForms();
                try {
                    apply(await api("create_room", { name: state.form.name }));
                    state.form.name = "";
                    toast("Room created");
                } catch (err) {
                    state.error = err.message;
                    render();
                }
            };
            document.getElementById("room-name")?.addEventListener("keydown", (e) => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    create.click();
                }
            });
        }

        document.querySelectorAll("[data-open-room]").forEach((btn) => {
            btn.onclick = async () => {
                try {
                    state.editingId = null;
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
                state.editingId = null;
                render();
            };
        }

        const saveRoom = document.getElementById("save-room");
        if (saveRoom) {
            saveRoom.onclick = async () => {
                readForms();
                try {
                    apply(await api("update_room", { room_id: state.room.id, name: state.form.roomName }));
                    toast("Room updated");
                } catch (err) {
                    state.error = err.message;
                    render();
                }
            };
        }

        const addPerson = document.getElementById("add-person");
        if (addPerson) {
            addPerson.onclick = async () => {
                readForms();
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
                    toast("Person added");
                } catch (err) {
                    state.error = err.message;
                    render();
                }
            };
        }

        document.querySelectorAll("[data-edit-person]").forEach((btn) => {
            btn.onclick = () => {
                readForms();
                const id = Number(btn.dataset.editPerson);
                const member = state.room.members.find((m) => m.id === id);
                state.editingId = id;
                state.form.editName = member?.name || "";
                state.form.editUser = member?.username || "";
                state.form.editPass = "";
                state.error = "";
                render();
            };
        });

        const cancelEdit = document.getElementById("cancel-edit");
        if (cancelEdit) {
            cancelEdit.onclick = () => {
                state.editingId = null;
                state.form.editPass = "";
                render();
            };
        }

        const savePerson = document.getElementById("save-person");
        if (savePerson) {
            savePerson.onclick = async () => {
                readForms();
                try {
                    apply(await api("update_person", {
                        room_id: state.room.id,
                        member_id: state.editingId,
                        name: state.form.editName,
                        username: state.form.editUser,
                        password: state.form.editPass
                    }));
                    state.editingId = null;
                    state.form.editPass = "";
                    toast("Person updated");
                } catch (err) {
                    state.error = err.message;
                    render();
                }
            };
        }

        document.querySelectorAll("[data-delete-person]").forEach((btn) => {
            btn.onclick = async () => {
                const id = Number(btn.dataset.deletePerson);
                const member = state.room.members.find((m) => m.id === id);
                if (!window.confirm(`Remove ${member?.name || "this person"} from ${state.room.name}? Their expenses in this room will also be removed.`)) {
                    return;
                }
                try {
                    apply(await api("delete_person", { room_id: state.room.id, member_id: id }));
                    if (state.editingId === id) state.editingId = null;
                    toast("Person removed");
                } catch (err) {
                    toast(err.message);
                }
            };
        });

        const del = document.getElementById("delete-room");
        if (del) {
            del.onclick = async () => {
                if (!window.confirm(`Delete ${state.room.name}? This cannot be undone.`)) return;
                try {
                    const data = await api("delete_room", { room_id: state.room.id });
                    state.rooms = data.rooms || [];
                    state.room = null;
                    state.view = "list";
                    state.editingId = null;
                    toast("Room deleted");
                } catch (err) {
                    toast(err.message);
                }
            };
        }
    }

    boot();
})();
