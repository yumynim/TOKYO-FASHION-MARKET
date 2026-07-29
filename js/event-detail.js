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
});
