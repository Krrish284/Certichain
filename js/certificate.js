/* Student portal + digital certificate view. Read-only: no issue/revoke here. */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const msg = $("msg"), area = $("certArea");

  function setWallet(addr) {
    $("walletDot").className = "dot" + (addr ? " on" : "");
    $("walletText").textContent = addr ? "Connected: " + CC.shortAddr(addr) : "MetaMask not connected (optional)";
    $("connectBtn").textContent = addr ? "Reconnect" : "Connect MetaMask";
  }

  async function connect() {
    try {
      const a = await CC.connectWallet();
      setWallet(a);
      CC.toast("Wallet connected", "success");
    } catch (e) { CC.toast(CC.friendlyError(e), "error"); }
  }

  function drawQr(id) {
    const box = $("qr");
    box.innerHTML = "";
    const url = new URL("verify.html?id=" + encodeURIComponent(id), location.href).href;
    if (typeof QRCode === "undefined") { box.textContent = "QR library unavailable"; return; }
    new QRCode(box, { text: url, width: 112, height: 112, correctLevel: QRCode.CorrectLevel.M });
    $("verifyLink").href = url;
  }

  function show(res) {
    const c = res.cert, ok = res.status === "VERIFIED";
    $("cUni").textContent = c.universityName;
    $("cName").textContent = c.studentName;
    $("cCourse").textContent = c.courseName;
    $("cReg").textContent = c.registrationNumber;
    $("cGrade").textContent = c.grade;
    $("cDate").textContent = c.issueDate;
    $("cStatus").textContent = ok ? "Valid" : "Revoked";
    $("cId").textContent = c.certificateId;
    $("cIssuer").textContent = c.issuerAddress;
    $("cNet").textContent = CC.cfg.CHAIN_NAME + " (chain " + CC.cfg.CHAIN_ID + ")";
    const chip = $("chainOk");
    chip.className = "chain-ok " + (ok ? "ok" : "bad");
    chip.textContent = ok ? "✔ Verified on blockchain" : "✖ Revoked on blockchain";
    $("stamp").hidden = ok;
    drawQr(c.certificateId);
    area.hidden = false;
  }

  async function search(id) {
    id = id.trim();
    if (!id) return;
    area.hidden = true;
    $("searchBtn").disabled = true;
    msg.innerHTML = '<div class="card" style="margin-top:20px"><span class="spinner"></span>&nbsp; Reading the blockchain…</div>';
    try {
      const res = await CC.lookupCertificate(id);
      if (res.status === "NOT_FOUND") {
        msg.innerHTML = '<div class="banner warn" style="margin-top:20px"><b>NOT FOUND.</b> No certificate with ID <span class="mono">' + CC.esc(id) + "</span> exists on the blockchain.</div>";
      } else {
        msg.innerHTML = "";
        show(res);
      }
    } catch (e) {
      msg.innerHTML = '<div class="banner err" style="margin-top:20px">' + CC.esc(CC.friendlyError(e)) + "</div>";
    } finally { $("searchBtn").disabled = false; }
  }

  $("connectBtn").addEventListener("click", connect);
  $("searchForm").addEventListener("submit", (e) => { e.preventDefault(); search($("certId").value); });
  $("printBtn").addEventListener("click", () => window.print());

  CC.watchWallet({
    onAccountsChanged: (accs) => {
      if (!accs.length) { CC.disconnectWallet(); setWallet(null); CC.toast("MetaMask disconnected", "info"); }
      else { setWallet(accs[0]); CC.toast("Account changed to " + CC.shortAddr(accs[0]), "info"); }
    },
    onChainChanged: (chain) => {
      if (chain !== CC.cfg.CHAIN_ID) CC.toast("Network changed. Searching still works because it uses the read-only RPC.", "info");
    }
  });

  const preset = new URLSearchParams(location.search).get("id");
  if (preset) { $("certId").value = preset; search(preset); }
})();
