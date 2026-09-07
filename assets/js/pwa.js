(() => {
    const cfg = window.ROOMTAB;
    if ("serviceWorker" in navigator) {
        window.addEventListener("load", () => {
            navigator.serviceWorker.register(`${cfg.base}/sw.js`, { scope: `${cfg.base}/` }).catch(() => {});
        });
    }

    const standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone;
    if (standalone) {
        document.body.classList.add("standalone");
        document.documentElement.style.background = "#efe6d6";
    }

    const lockZoom = (event) => event.preventDefault();
    document.addEventListener("gesturestart", lockZoom);
    document.addEventListener("gesturechange", lockZoom);
    document.addEventListener("gestureend", lockZoom);
    document.addEventListener("touchmove", (event) => {
        if (event.touches.length > 1) event.preventDefault();
    }, { passive: false });

    let deferred;
    window.addEventListener("beforeinstallprompt", (event) => {
        event.preventDefault();
        deferred = event;
        window.ROOMTAB.install = async () => {
            if (!deferred) return;
            deferred.prompt();
            await deferred.userChoice;
            deferred = null;
            document.getElementById("install-app")?.classList.add("hidden");
        };
        document.getElementById("install-app")?.classList.remove("hidden");
    });
})();
