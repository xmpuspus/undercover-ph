// The static landing shell in index.html. It runs from <head>, before the body exists, so the night sky is set
// before the first paint. The poster and the buttons are wired once the body is parsed, which is before the app
// module runs. A file rather than an inline script, so the CSP in vercel.json (script-src 'self') allows it.
(function () {
  var q = /[?&]now=\d{4}-\d{2}-\d{2}T(\d{2}):(\d{2})/.exec(location.search);
  var p = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Manila", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date()).split(":");
  var m = q ? +q[1] * 60 + +q[2] : +p[0] * 60 + +p[1];
  var kind = m < 330 || m >= 1080 ? "night" : "day";
  document.documentElement.dataset.sky = kind;

  function wire() {
    var img = document.getElementById("shell-poster");
    if (!img) return;
    document.getElementById("shell-poster-src").srcset = "poster/" + kind + "-640.webp";
    img.src = "poster/" + kind + "-1280.webp";
    // A tap on Shaded or Sheltered before the app starts. App reads window.__shellPick on mount.
    var buttons = document.querySelectorAll("#shell-card button[data-mode]");
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].addEventListener("click", function () {
        window.__shellPick = this.dataset.mode;
      });
    }
  }
  if (document.readyState === "loading") document.addEventListener("readystatechange", wire, { once: true });
  else wire();
})();
