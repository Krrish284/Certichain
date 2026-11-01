/* University admin dashboard: every write is a real MetaMask transaction. */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = CC.esc;
  let isIssuer = false;
  let isOwner = false;

  /* ---------- chain log ---------- */
  function log(text, cls) {
    const box = $("logBox");
    if (box.firstElementChild && box.firstElementChild.classList.contains("dim")) box.innerHTML = "";
    const d = document.createElement("div");
    d.className = "log-line " + (cls || "");
    const t = document.createElement("span");
    t.className = "t"; t.textContent = new Date().toLocaleTimeString();
    d.appendChild(t); d.appendChild(document.createTextNode(text));
    box.appendChild(d);
    box.scrollTop = box.scrollHeight;
  }
  $("clearLog").addEventListener("click", () => { $("logBox").innerHTML = '<div class="log-line dim">cleared.</div>'; });

  /* ---------- views ---------- */
  function showView(name) {
    ["overview", "issue", "list", "issuers"].forEach((v) => { $("view-" + v).hidden = v !== name; });
    document.querySelectorAll(".side-link").forEach((b) => b.classList.toggle("active", b.dataset.view === name));
    if (name === "list") loadCertificates();
  }
  document.querySelectorAll(".side-link").forEach((b) => b.addEventListener("click", () => showView(b.dataset.view)));

  /* ---------- wallet state ---------- */
  function setDisconnected() {
    CC.disconnectWallet();
    isIssuer = false; isOwner = false;
    $("walletDot").className = "dot";
    $("walletStatus").textContent = "Not connected";
    $("walletAddr").textContent = "—";
    $("roleText").textContent = "";
    $("connectBtn").hidden = false; $("disconnectBtn").hidden = true;
    $("connectHint").hidden = false; $("authBanner").hidden = true;
    $("issuersLink").hidden = true;
    $("issueBtn").disabled = true;
    $("tbody").innerHTML = '<tr><td colspan="6" class="dim">Connect your wallet to load certificates.</td></tr>';
    ["statTotal", "statValid", "statRevoked"].forEach((s) => { $(s).textContent = "0"; });
  }

  async function refreshRole(addr) {
    const c = CC.getReadContract();
    const [auth, owner] = await Promise.all([c.isAuthorizedIssuer(addr), c.owner()]);
    isIssuer = auth;
    isOwner = owner.toLowerCase() === addr.toLowerCase();
    $("roleText").textContent = isOwner ? "role: contract owner" : auth ? "role: authorized university" : "role: not authorized";
    $("authBanner").hidden = auth;
    $("issuersLink").hidden = !isOwner;
    $("issueBtn").disabled = !auth;
    log("role check → " + (isOwner ? "owner" : auth ? "authorized issuer" : "NOT authorized"), auth ? "ok" : "bad");
  }

  async function onConnected(addr) {
    $("walletDot").className = "dot on";
    $("walletStatus").textContent = "Connected";
    $("walletAddr").textContent = addr;
    $("connectBtn").hidden = true; $("disconnectBtn").hidden = false;
    $("connectHint").hidden = true;
    try {
      await refreshRole(addr);
      await loadCertificates();
    } catch (e) { CC.toast(CC.friendlyError(e), "error"); log(CC.friendlyError(e), "bad"); }
  }

  async function connect() {
    try {
      CC.requireConfigured();
      log("asking MetaMask for your account…", "wait");
      const a = await CC.connectWallet();
      log("connected as " + a, "ok");
      await onConnected(a);
      CC.toast("Wallet connected: " + CC.shortAddr(a), "success");
    } catch (e) { CC.toast(CC.friendlyError(e), "error"); log(CC.friendlyError(e), "bad"); }
  }
  $("connectBtn").addEventListener("click", connect);
  $("disconnectBtn").addEventListener("click", () => { setDisconnected(); log("disconnected from this page", "wait"); CC.toast("Disconnected here. Remove the site in MetaMask to fully disconnect.", "info"); });

  CC.watchWallet({
    onAccountsChanged: async (accs) => {
      if (!accs.length) { setDisconnected(); log("MetaMask locked or disconnected", "bad"); CC.toast("MetaMask disconnected", "info"); return; }
      CC.toast("Account changed to " + CC.shortAddr(accs[0]), "info");
      log("account switched to " + accs[0], "wait");
      try { await onConnected(await CC.connectWallet()); } catch (e) { CC.toast(CC.friendlyError(e), "error"); }
    },
    onChainChanged: async (chain) => {
      if (chain !== CC.cfg.CHAIN_ID) {
        CC.toast("Wrong network. Switch MetaMask to " + CC.cfg.CHAIN_NAME + ".", "error");
        log("network changed to chain " + chain + " (expected " + CC.cfg.CHAIN_ID + "). Issuing disabled.", "bad");
        $("issueBtn").disabled = true;
      } else if (CC.getAccount()) {
        log("back on the right network (" + CC.cfg.CHAIN_NAME + ")", "ok");
        try { await onConnected(await CC.connectWallet()); } catch (e) { CC.toast(CC.friendlyError(e), "error"); }
      }
    }
  });

  /* ---------- certificate ID generator ---------- */
  function generateId() {
    const bytes = new Uint8Array(5);
    crypto.getRandomValues(bytes);
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
    return "CERT-" + new Date().getFullYear() + "-" + hex;
  }
  $("genBtn").addEventListener("click", () => { $("fId").value = generateId(); });
  $("fId").value = generateId();
  $("fDate").value = new Date().toISOString().slice(0, 10);

  /* ---------- issue ---------- */
  $("issueForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("issueBtn"), out = $("issueResult");
    const v = (id) => $(id).value.trim();
    const args = [v("fId"), v("fName"), v("fReg"), v("fCourse"), v("fUni"), v("fGrade"), v("fDate")];
    if (args.some((x) => !x)) { CC.toast("Every field is required.", "error"); return; }
    btn.disabled = true;
    out.innerHTML = "";
    try {
      const contract = await CC.getWriteContract();
      log("checking that " + args[0] + " isn't taken…", "wait");
      const exists = (await contract.verifyCertificate(args[0])).exists;
      if (exists) throw new Error("That Certificate ID already exists. Roll a new one.");
      log("ID is free. Waiting for you to sign in MetaMask…", "wait");
      const tx = await contract.issueCertificate(...args);
      log("tx sent: " + tx.hash, "wait");
      out.innerHTML = '<div class="banner info"><span class="spinner"></span>&nbsp; Mining… <span class="mono">' + esc(tx.hash) + "</span></div>";
      const receipt = await tx.wait();
      if (!receipt || receipt.status !== 1) throw new Error("Transaction failed on-chain.");
      log("mined in block " + receipt.blockNumber + ". Certificate is live.", "ok");
      out.innerHTML = '<div class="tx-box"><b>Done. Mined in block ' + esc(receipt.blockNumber) + '.</b><br>Certificate ID: <span class="mono">' + esc(args[0]) +
        "</span><br>Transaction hash: " + CC.txLink(tx.hash) +
        '<div class="actions"><a class="btn btn-ghost btn-sm" href="verify.html?id=' + encodeURIComponent(args[0]) + '">Verify it</a><a class="btn btn-ghost btn-sm" href="certificate.html?id=' + encodeURIComponent(args[0]) + '">Open certificate</a></div></div>';
      CC.toast("Certificate issued", "success");
      $("fId").value = generateId();
      ["fName", "fReg", "fCourse", "fGrade"].forEach((id) => { $(id).value = ""; });
      await loadCertificates();
    } catch (err) {
      log("failed: " + CC.friendlyError(err), "bad");
      out.innerHTML = '<div class="banner err"><b>Nothing was recorded.</b> ' + esc(CC.friendlyError(err)) + "</div>";
      CC.toast(CC.friendlyError(err), "error");
    } finally { btn.disabled = !isIssuer; }
  });

  /* ---------- list + revoke ---------- */
  async function loadCertificates() {
    const addr = CC.getAccount();
    if (!addr) return;
    const body = $("tbody");
    body.innerHTML = '<tr><td colspan="6"><span class="spinner"></span>&nbsp; Reading the chain…</td></tr>';
    try {
      const c = CC.getReadContract();
      const ids = await c.getCertificatesByIssuer(addr);
      const certs = await Promise.all(ids.map(async (id) => (await CC.lookupCertificate(id, c)).cert));
      const revoked = certs.filter((x) => x.isRevoked).length;
      $("statTotal").textContent = certs.length;
      $("statRevoked").textContent = revoked;
      $("statValid").textContent = certs.length - revoked;
      $("contractAddr").textContent = CC.cfg.CONTRACT_ADDRESS;
      log("loaded " + certs.length + " certificate(s) for " + CC.shortAddr(addr), "ok");
      if (!certs.length) { body.innerHTML = '<tr><td colspan="6" class="dim">Nothing issued by this wallet yet.</td></tr>'; return; }
      body.innerHTML = certs.slice().reverse().map((x) =>
        '<tr><td class="mono">' + esc(x.certificateId) + "</td><td>" + esc(x.studentName) + "</td><td>" + esc(x.courseName) + "</td><td>" + esc(x.issueDate) + "</td><td>" +
        (x.isRevoked ? '<span class="badge revoked">REVOKED</span>' : '<span class="badge valid">VALID</span>') + '</td><td style="white-space:nowrap">' +
        '<a class="btn btn-ghost btn-sm" href="certificate.html?id=' + encodeURIComponent(x.certificateId) + '">View</a> ' +
        (x.isRevoked ? "" : '<button class="btn btn-danger btn-sm" data-revoke="' + esc(x.certificateId) + '">Revoke</button>') + "</td></tr>"
      ).join("");
    } catch (e) {
      body.innerHTML = '<tr><td colspan="6" style="color:var(--bad)">' + esc(CC.friendlyError(e)) + "</td></tr>";
      log(CC.friendlyError(e), "bad");
    }
  }

  // the viewer blocks window.confirm, so revoke asks inline: first click arms it, second click sends
  $("tbody").addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-revoke]");
    if (!btn) return;
    const id = btn.getAttribute("data-revoke");
    if (!btn.dataset.armed) {
      btn.dataset.armed = "1"; btn.textContent = "Sure? Click again";
      setTimeout(() => { if (btn.isConnected) { delete btn.dataset.armed; btn.textContent = "Revoke"; } }, 4000);
      return;
    }
    btn.disabled = true;
    try {
      const contract = await CC.getWriteContract();
      log("revoking " + id + "… confirm in MetaMask", "wait");
      const tx = await contract.revokeCertificate(id);
      log("tx sent: " + tx.hash, "wait");
      const receipt = await tx.wait();
      if (!receipt || receipt.status !== 1) throw new Error("Transaction failed on-chain.");
      log(id + " is now REVOKED (block " + receipt.blockNumber + ")", "ok");
      CC.toast("Certificate revoked", "success");
      await loadCertificates();
    } catch (err) {
      CC.toast(CC.friendlyError(err), "error");
      log("revoke failed: " + CC.friendlyError(err), "bad");
      btn.disabled = false; delete btn.dataset.armed; btn.textContent = "Revoke";
    }
  });
  $("refreshBtn").addEventListener("click", loadCertificates);

  /* ---------- issuer management (owner only) ---------- */
  async function issuerAction(kind) {
    const out = $("issuerResult");
    const addr = $("issuerAddr").value.trim();
    if (!ethers.isAddress(addr)) { CC.toast("That doesn't look like a wallet address.", "error"); return; }
    try {
      const contract = await CC.getWriteContract();
      log((kind === "authorize" ? "authorizing " : "removing ") + addr + "…", "wait");
      const tx = kind === "authorize" ? await contract.authorizeIssuer(addr) : await contract.removeIssuer(addr);
      out.innerHTML = '<div class="banner info"><span class="spinner"></span>&nbsp; Mining…</div>';
      await tx.wait();
      log("done: " + (kind === "authorize" ? "issuer authorized" : "issuer removed"), "ok");
      out.innerHTML = '<div class="tx-box">' + (kind === "authorize" ? "Issuer authorized." : "Issuer removed.") + " Tx: " + CC.txLink(tx.hash) + "</div>";
      CC.toast(kind === "authorize" ? "Issuer authorized" : "Issuer removed", "success");
    } catch (err) {
      out.innerHTML = '<div class="banner err">' + esc(CC.friendlyError(err)) + "</div>";
      log(CC.friendlyError(err), "bad");
      CC.toast(CC.friendlyError(err), "error");
    }
  }
  $("authBtn").addEventListener("click", () => issuerAction("authorize"));
  $("removeBtn").addEventListener("click", () => issuerAction("remove"));

  setDisconnected();
  $("contractAddr").textContent = CC.isConfigured() ? CC.cfg.CONTRACT_ADDRESS : "not linked yet";
})();
