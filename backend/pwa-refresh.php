<?php
/**
 * One-time PWA cache bust — open this URL inside the stuck installed app:
 *   https://YOUR-DOMAIN/backend/pwa-refresh.php
 *
 * /backend is excluded from the SPA service worker, so this always loads fresh.
 */
header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-cache, no-store, must-revalidate');
header('Pragma: no-cache');
header('Expires: 0');
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Updating App…</title>
  <style>
    body { font-family: system-ui, sans-serif; display:flex; min-height:100vh; align-items:center; justify-content:center; margin:0; background:#fff7ed; color:#111; }
    .box { text-align:center; padding:24px; max-width:380px; }
    h1 { font-size:20px; margin:0 0 8px; color:#c2410c; }
    p { font-size:14px; color:#444; line-height:1.4; }
  </style>
</head>
<body>
  <div class="box">
    <h1>App update…</h1>
    <p>Purana PWA cache clear ho raha hai. Wait — app khud naya version khol degi.</p>
  </div>
  <script>
    (async function () {
      try {
        if ('caches' in window) {
          var keys = await caches.keys()
          await Promise.all(keys.map(function (k) { return caches.delete(k) }))
        }
        if ('serviceWorker' in navigator) {
          var regs = await navigator.serviceWorker.getRegistrations()
          await Promise.all(regs.map(function (r) { return r.unregister() }))
        }
        try {
          localStorage.removeItem('app_build_id')
        } catch (e) {}
      } catch (e) {}
      setTimeout(function () {
        window.location.replace('/?_fresh=' + Date.now())
      }, 700)
    })()
  </script>
</body>
</html>
