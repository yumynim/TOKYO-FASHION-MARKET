// ==========================================================
// チケット詳細ページ（event-detail.html）
// URLの ?i=<EVENTSの配列番号> を読み、該当イベントの内容を表示する
// ==========================================================

document.addEventListener("DOMContentLoaded", () => {
  const i = Number(new URLSearchParams(window.location.search).get("i"));
  const ev = typeof EVENTS !== "undefined" ? EVENTS[i] : null;

  if (!ev) {
    document.getElementById("edName").textContent = "イベントが見つかりません";
    document.getElementById("edDate").textContent = "";
    return;
  }

  document.title = `${ev.name} | TOKYO FASHION MARKET`;
  document.getElementById("edName").textContent = ev.name;
  document.getElementById("edDate").textContent = ev.dateLabel;
  document.getElementById("edDesc").innerHTML = `<p>${typeof EVENT_DESC !== "undefined" ? EVENT_DESC : ""}</p>`;
  document.getElementById("edPrice").innerHTML =
    `一般入場　￥${ev.price.toLocaleString("ja-JP")} <span class="goods-tax">税込</span>`;

  // 写真は最大3枚まで。images が空の間はプレースホルダーを表示する
  const gallery = document.getElementById("edGallery");
  const images = (ev.images || []).slice(0, 3);
  const slots = Math.max(images.length, 1);
  gallery.innerHTML = Array.from({ length: slots }, (_, idx) => {
    const src = images[idx];
    return src
      ? `<figure class="ph"><img src="${src}" alt="${ev.name}"></figure>`
      : `<figure class="ph"><figcaption>PHOTO</figcaption></figure>`;
  }).join("");

  document.getElementById("edBuyBtn").addEventListener("click", () => Store.openTicket(i));

  // 会場の地図（住所が入っている場合のみ表示）。
  // Google Cloudの請求先アカウント登録・APIキーが不要な埋め込み方式
  // （地図共有の「地図を埋め込む」と同じ仕組み）なので、料金は一切かからない。
  const mapBlock = document.getElementById("edMapBlock");
  if (ev.addr) {
    document.getElementById("edVenue").textContent = ev.venue || "";
    document.getElementById("edMapFrame").src = `https://www.google.com/maps?q=${encodeURIComponent(ev.addr)}&output=embed`;
    mapBlock.hidden = false;
  }

  // シェアボタン（Facebook / X / LINE）。このページのURLと開催情報を渡す
  const shareUrl = window.location.href;
  const shareText = `${ev.name}｜${ev.dateLabel} - TOKYO FASHION MARKET`;
  const shareLinks = [
    {
      label: "Facebook",
      url: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`,
      icon: '<circle cx="12" cy="12" r="9"/><path d="M14 8h-1.5A2.5 2.5 0 0 0 10 10.5V12H8v2.5h2V20h2.5v-5.5H14l.5-2.5h-2v-1a1 1 0 0 1 1-1H14V8Z"/>',
    },
    {
      label: "X",
      url: `https://twitter.com/intent/tweet?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`,
      icon: '<path d="M5 5l14 14M19 5 5 19"/>',
    },
    {
      label: "LINE",
      url: `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(shareUrl)}`,
      icon: '<path d="M4 12a8 6.5 0 1 1 8 6.5c-1 0-2-.15-2.9-.4L5 19l.9-3.3A6.3 6.3 0 0 1 4 12Z"/>',
    },
  ];
  document.getElementById("edShare").innerHTML = shareLinks
    .map(
      (s) => `<a href="${s.url}" target="_blank" rel="noopener" aria-label="${s.label}でシェア">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">${s.icon}</svg>
      </a>`
    )
    .join("");
});
