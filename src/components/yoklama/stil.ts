/** Tarama ekranı (YoklamaTarama.html) ve hoca yoklama sekmesi (YoklamaHoca.html) stilleri. */
export const TARAMA_CSS = `
.yt { --yt-navy:#2F318D; --yt-ink:#1C1D3A; --yt-muted:#5F6283; --yt-line:#D9DBE8; --yt-ok:#1F6B43; --yt-okbg:#E7F3EC; --yt-err:#B42318; --yt-errbg:#FEF3F2; --yt-warn:#8A5210; --yt-warnbg:#FDF3E6; color:var(--yt-ink); }
.yt * { box-sizing:border-box; }
.yt-kart { background:#fff; border:1px solid var(--yt-line); border-radius:12px; padding:18px 20px; margin:0 0 18px; }
.yt-baslik { font-size:16px; font-weight:700; margin:0 0 4px; }
.yt-aciklama { color:var(--yt-muted); font-size:13.5px; line-height:1.5; margin:0 0 12px; max-width:72ch; }
.yt-birak { display:block; border:2px dashed #B4B8D0; border-radius:12px; padding:22px 16px; text-align:center; background:#FAFAFD; cursor:pointer; transition:border-color .15s, background .15s; }
.yt-birak:hover, .yt-birak.uzerinde { border-color:var(--yt-navy); background:#EEEFF8; }
.yt-birak strong { display:block; font-size:15px; color:var(--yt-navy); margin-bottom:4px; }
.yt-birak span { font-size:12.5px; color:var(--yt-muted); }
.yt-birak input { display:none; }
.yt-ilerleme { margin-top:14px; }
.yt-cubuk { height:8px; background:#EEF0F6; border-radius:99px; overflow:hidden; }
.yt-cubuk i { display:block; height:100%; width:0; background:var(--yt-navy); transition:width .2s; }
.yt-ilerleme-metin { font-size:13px; color:var(--yt-muted); margin-top:6px; }
.yt-ozet { display:flex; flex-wrap:wrap; gap:8px; margin:14px 0 4px; }
.yt-cip { font-size:12.5px; font-weight:700; border-radius:999px; padding:4px 11px; background:#EEF2FF; color:var(--yt-navy); white-space:nowrap; }
.yt-cip.ok { background:var(--yt-okbg); color:var(--yt-ok); } .yt-cip.uyari { background:var(--yt-warnbg); color:var(--yt-warn); } .yt-cip.hata { background:var(--yt-errbg); color:var(--yt-err); }
.yt-btn { border:0; border-radius:9px; padding:9px 16px; font-size:14px; font-weight:600; cursor:pointer; width:auto; box-shadow:none; transform:none; margin:0; font-family:inherit; }
.yt-btn.birincil { background:var(--yt-navy); color:#fff; } .yt-btn.birincil:hover { background:#222470; }
.yt-btn.ikincil { background:#fff; color:var(--yt-navy); border:1px solid #B4B8D0; } .yt-btn.ikincil:hover { background:#EEEFF8; }
.yt-btn[disabled] { opacity:.55; cursor:not-allowed; }
.yt-btn:focus-visible { outline:2px solid #E9993F; outline-offset:2px; }
.yt-sorun { display:flex; gap:12px; align-items:flex-start; border:1px solid #F3C9C4; background:var(--yt-errbg); border-radius:10px; padding:10px 12px; margin:8px 0; }
.yt-sorun img { width:64px; height:auto; border:1px solid var(--yt-line); border-radius:4px; flex-shrink:0; background:#fff; }
.yt-sorun .yt-s-metin { flex:1; font-size:13.5px; line-height:1.45; }
.yt-sorun .yt-s-metin b { display:block; }
.yt-sorun form { display:flex; gap:6px; margin-top:6px; flex-wrap:wrap; }
.yt-sorun input { padding:7px 10px; border:1px solid #B4B8D0; border-radius:8px; font-size:14px; width:130px; text-transform:uppercase; font-family:inherit; letter-spacing:.5px; }
.yt-ders { border:1px solid var(--yt-line); border-left:4px solid var(--yt-navy); border-radius:12px; margin:14px 0; background:#fff; }
.yt-ders.kaydedildi { border-left-color:#4E9B6E; }
.yt-ders.sorunlu { border-left-color:#E9993F; }
.yt-d-bas { padding:12px 16px; display:flex; flex-wrap:wrap; gap:6px 14px; align-items:center; justify-content:space-between; }
.yt-d-ad { font-weight:700; font-size:15px; }
.yt-d-alt { color:var(--yt-muted); font-size:12.5px; margin-top:2px; }
.yt-d-cipler { display:flex; gap:6px; flex-wrap:wrap; }
.yt-d-not { margin:0 16px 10px; font-size:13px; line-height:1.45; padding:8px 12px; border-radius:8px; background:var(--yt-warnbg); color:#5b3a0b; }
.yt-d-not.hata { background:var(--yt-errbg); color:var(--yt-err); }
.yt-d-not.ok { background:var(--yt-okbg); color:var(--yt-ok); }
.yt-filtre { margin:0 16px 8px; font-size:13px; display:flex; gap:8px; align-items:center; color:var(--yt-muted); }
.yt-filtre input { accent-color:var(--yt-navy); width:16px; height:16px; margin:0; }
.yt-tablo-kap { overflow-x:auto; border-top:1px solid var(--yt-line); }
table.yt-tablo { width:100%; border-collapse:collapse; font-size:13.5px; }
.yt-tablo th { background:#EEEFF8; font-size:12px; font-weight:600; text-align:left; padding:7px 10px; color:var(--yt-ink); white-space:nowrap; }
.yt-tablo td { padding:6px 10px; border-top:1px solid #EEF0F6; vertical-align:middle; }
.yt-tablo td.no { color:var(--yt-muted); font-variant-numeric:tabular-nums; white-space:nowrap; }
.yt-tablo tr.belirsiz td { background:#FFFBEF; }
.yt-tablo tr.yok td { background:#FEF6F5; }
.yt-hucre { display:flex; align-items:center; gap:8px; }
.yt-resim { flex-shrink:0; border:1px solid #CBD0E2; border-radius:4px; background-color:#fff; background-repeat:no-repeat; display:inline-block; }
.yt-hucre.belirsiz .yt-resim { border:2px solid #E9993F; }
.yt-sec { display:inline-flex; border:1px solid #B4B8D0; border-radius:8px; overflow:hidden; flex-shrink:0; }
.yt-sec button { border:0; background:#fff; color:var(--yt-muted); font-size:12px; font-weight:700; padding:6px 9px; cursor:pointer; width:auto; box-shadow:none; transform:none; margin:0; font-family:inherit; }
.yt-sec button:hover { background:#F2F3F8; }
.yt-sec button + button { border-left:1px solid #B4B8D0; }
.yt-sec button.secili.g { background:var(--yt-okbg); color:var(--yt-ok); }
.yt-sec button.secili.y { background:#FEE4E2; color:var(--yt-err); }
.yt-sec button:focus-visible { outline:2px solid #E9993F; outline-offset:-2px; }
.yt-neden { font-size:11.5px; color:var(--yt-warn); max-width:180px; line-height:1.3; }
.yt-onceki { font-size:11px; color:var(--yt-muted); }
.yt-d-cubuk { display:flex; flex-wrap:wrap; gap:8px 14px; align-items:center; justify-content:space-between; padding:10px 16px; border-top:1px solid var(--yt-line); }
.yt-d-cubuk .yt-say { font-size:13px; font-weight:600; }
.yt-gizli-satir { font-size:12.5px; color:var(--yt-muted); padding:8px 16px; }
.yt-gizli-satir button { background:none; border:0; color:var(--yt-navy); font-weight:600; cursor:pointer; padding:0; width:auto; font-family:inherit; font-size:12.5px; text-decoration:underline; }
.yt-tumu { display:flex; flex-wrap:wrap; gap:10px; align-items:center; margin:16px 0 4px; }
.yt-ipucu { font-size:12.5px; color:var(--yt-muted); line-height:1.5; margin-top:10px; }
@media (max-width:640px) {
  .yt-kart { padding:14px; }
  .yt-hucre { flex-direction:column; align-items:flex-start; gap:4px; }
  .yt-tablo td, .yt-tablo th { padding:6px; }
  .yt-neden { max-width:120px; }
}`;

export const YOKLAMA_HOCA_CSS = `
.yk-form{display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:16px; align-items:end;}
.yk-gun{margin-top:22px;}
.yk-gun h3{margin:0 0 8px; font-size:14px; font-weight:700; color:var(--navy);}
.yk-oturum{display:flex; align-items:center; gap:12px; width:100%; text-align:left; background:#fff; border:1px solid var(--line); border-radius:10px;
  padding:11px 14px; margin-bottom:8px; cursor:pointer; font-size:14px; color:var(--ink); transition:border-color .15s, background .15s;}
.yk-oturum:hover{border-color:var(--navy); background:var(--navy-tint);}
.yk-oturum:focus-visible{outline:2px solid var(--amber); outline-offset:2px;}
.yk-oturum.secili{border-color:var(--navy); box-shadow:0 0 0 2px rgba(47,49,141,.18);}
.yk-oturum[disabled]{cursor:not-allowed; opacity:.6; background:#FAFAFD;}
.yk-oturum .yo-saat{font-variant-numeric:tabular-nums; font-weight:600; min-width:96px;}
.yk-oturum .yo-ders{flex:1; min-width:0;}
.yk-oturum .yo-ders small{color:var(--muted); display:block; font-size:12px;}
.yk-cip{flex-shrink:0; font-size:12px; font-weight:700; border-radius:999px; padding:3px 10px; white-space:nowrap;}
.yk-cip.girilmedi{background:#FDF3E6; color:#8A5210;}
.yk-cip.girildi{background:#E7F3EC; color:#1F6B43;}
.yk-cip.yapilmadi{background:#EEF0F5; color:var(--muted);}
.yk-cip.ileri{background:#F2F3F8; color:var(--muted);}
.yk-cip.telafi{background:#FDF3E6; color:#8A5210; font-weight:600;}
.yk-ozet{margin-top:14px; font-size:13px; color:var(--muted);}
.yk-telafi{margin-top:24px; border:1px dashed var(--line-strong); border-radius:10px; background:#FAFAFD;}
.yk-telafi summary{cursor:pointer; padding:12px 16px; font-weight:600; color:var(--navy);}
.yk-telafi .yk-form{padding:4px 16px 16px;}
.yk-editor{margin-top:26px; border:1px solid var(--line); border-left:4px solid var(--navy); border-radius:12px; background:#fff;}
.yk-ed-bas{padding:16px 18px 10px; display:flex; flex-wrap:wrap; gap:8px 18px; align-items:baseline; justify-content:space-between;}
.yk-ed-bas h3{margin:0; font-family:var(--serif); font-size:19px;}
.yk-ed-bas .yk-alt{color:var(--muted); font-size:13px;}
.yk-ed-durum{display:flex; flex-wrap:wrap; gap:8px 18px; padding:0 18px 12px; font-size:14px; align-items:center;}
.yk-ed-durum label{display:inline-flex; gap:6px; align-items:center; cursor:pointer;}
.yk-ed-durum input{accent-color:var(--navy); width:16px; height:16px; margin:0;}
.yk-ed-durum .btn{width:auto; padding:7px 14px; font-size:13px;}
.yk-ed-durum .yk-sirala{margin-left:auto; font-size:13px; color:var(--muted, #5F6283);}
.yk-sirala select{width:auto; padding:6px 10px; border:1px solid #cfd3e6; border-radius:8px; font-size:13px; font-family:inherit; background:#fff; color:inherit; cursor:pointer;}
.yk-tablo-kap{overflow-x:auto; border-top:1px solid var(--line);}
table.yk-tablo{width:100%; border-collapse:collapse; font-size:14px;}
.yk-tablo th{position:sticky; top:0; background:var(--navy-tint); font-size:12.5px; font-weight:600; text-align:left; padding:8px 10px; border-bottom:1px solid var(--line-strong); z-index:1;}
.yk-tablo th.c, .yk-tablo td.c{text-align:center; width:82px;}
.yk-tablo td{padding:6px 10px; border-bottom:1px solid var(--line);}
.yk-tablo td.no{font-variant-numeric:tabular-nums; color:var(--muted); width:110px;}
.yk-tablo td.sira{color:var(--muted); width:36px; font-variant-numeric:tabular-nums;}
.yk-tablo tr.yok td{background:#FEF3F2;}
.yk-tablo tr.izinli td{background:#FDF8EE;}
.yk-tablo .etiket{font-size:11px; color:#8A5210; background:#FDF3E6; border-radius:999px; padding:1px 7px; margin-left:6px; white-space:nowrap;}
.yk-onay{position:relative; display:inline-flex; align-items:center; justify-content:center; width:64px; height:30px; border-radius:7px; cursor:pointer;
  border:1px solid var(--line-strong); font-size:12px; font-weight:700; user-select:none;}
.yk-onay input{position:absolute; opacity:0; inset:0; margin:0; cursor:pointer;}
.yk-onay:has(input:checked){background:#E7F3EC; border-color:#9CC9AE; color:#1F6B43;}
.yk-onay:has(input:not(:checked)){background:#FEE4E2; border-color:#F3A59C; color:var(--danger);}
.yk-onay.izin:has(input:checked){background:#FDF3E6; border-color:#E9C48F; color:#8A5210;}
.yk-onay.izin:has(input:not(:checked)){background:#fff; border-color:var(--line-strong); color:var(--muted);}
.yk-onay:has(input:focus-visible){outline:2px solid var(--amber); outline-offset:1px;}
.yk-onay:has(input:disabled){opacity:.45; cursor:not-allowed;}
.yk-aciklama{padding:12px 18px 0;}
.yk-aciklama textarea{width:100%; min-height:44px; padding:9px 12px; border:1px solid var(--line-strong); border-radius:9px; font:inherit; font-size:13.5px; resize:vertical;}
.yk-cubuk{position:sticky; bottom:0; display:flex; flex-wrap:wrap; gap:10px 16px; align-items:center; justify-content:space-between;
  padding:12px 18px; background:#fff; border-top:1px solid var(--line); border-radius:0 0 12px 12px; box-shadow:0 -8px 16px -12px rgba(34,36,112,.25);}
.yk-cubuk .yk-sayac{font-weight:600;}
.yk-cubuk .yk-sayac .k{color:var(--danger);}
.yk-cubuk .btn{width:auto;}
.yk-cubuk .yk-dug{display:flex; gap:8px; flex-wrap:wrap;}
.yk-mesaj{padding:0 18px;}
.yk-mesaj .ok, .yk-mesaj .hata{margin:12px 0 0; padding:10px 14px; border-radius:9px; font-size:13.5px;}
.yk-mesaj .ok{background:#E7F3EC; color:#1F6B43;}
.yk-mesaj .hata{background:#FEF3F2; color:var(--danger);}
.btn-tehlike{background:#fff; color:var(--danger); border:1px solid #F3A59C;}
.btn-tehlike:hover{background:#FEF3F2;}
.yk-tarama{margin-top:30px; padding-top:22px; border-top:1px solid var(--line);}
@media (max-width:640px){
  .yk-oturum{flex-wrap:wrap;}
  .yk-oturum .yo-saat{min-width:0;}
  .yk-tablo td.no{width:auto;}
  .yk-tablo th.c, .yk-tablo td.c{width:66px;}
  .yk-onay{width:54px;}
}`;
