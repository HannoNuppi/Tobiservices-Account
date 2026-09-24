/* =====================================================================
   NETZWERK-DESIGN-SYSTEM — gemeinsame Helfer für Toast & Modal
   Einbinden mit: <script src="theme.js"></script> (nach dem <body>-Inhalt)
   ===================================================================== */

function jdEnsureToast(){
  let t = document.getElementById("jdToast");
  if(!t){
    t = document.createElement("div");
    t.id = "jdToast";
    t.className = "jd-toast";
    document.body.appendChild(t);
  }
  return t;
}
let jdToastTimer;
function jdToast(msg, ms){
  const t = jdEnsureToast();
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(jdToastTimer);
  jdToastTimer = setTimeout(()=> t.classList.remove("show"), ms || 2600);
}

function jdEnsureModal(){
  let overlay = document.getElementById("jdOverlay");
  if(!overlay){
    overlay = document.createElement("div");
    overlay.id = "jdOverlay";
    overlay.className = "jd-overlay";
    overlay.innerHTML = `<div class="jd-modal" id="jdModal"></div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener("click", (e)=>{ if(e.target === overlay) jdCloseModal(); });
  }
  return overlay;
}
function jdOpenModal(innerHtml){
  const overlay = jdEnsureModal();
  const modal = document.getElementById("jdModal");
  modal.innerHTML = `<button class="jd-modal-close" onclick="jdCloseModal()">×</button>` + innerHtml;
  overlay.classList.add("show");
}
function jdCloseModal(){
  const overlay = document.getElementById("jdOverlay");
  if(overlay) overlay.classList.remove("show");
}
