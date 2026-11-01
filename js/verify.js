/* Public verification: reads the real contract through a read-only RPC provider. */
(function () {
  "use strict";
  const form = document.getElementById("verifyForm");
  const input = document.getElementById("certId");
  const btn = document.getElementById("verifyBtn");
  const out = document.getElementById("out");
  const esc = CC.esc;

  function row(k, v) { return '<dl class="kv"><dt>' + esc(k) + "</dt><dd>" + v + "</dd></dl>"; }

  function render(res, id, tx) {
    if (res.status === "NOT_FOUND") {
      out.innerHTML =
        '<div class="result nf"><div class="result-head"><span class="mark">?</span><div><div class="big">NOT FOUND</div>' +
        "<div>No certificate with this ID exists on the blockchain.</div></div></div>" +
        '<div class="result-body"><p>Checked ID: <b class="mono">' + esc(id) + "</b></p>" +
        "<p>Check the ID for typos. If it is correct, the certificate was never issued by CertiChain and should not be trusted.</p></div></div>";
      return;
    }
    const c = res.cert;
    const ok = res.status === "VERIFIED";
    const head = ok
      ? '<span class="mark">✔</span><div><div class="big">VERIFIED</div><div>This certificate is authentic and has not been revoked.</div></div>'
      : '<span class="mark">✖</span><div><div class="big">REVOKED</div><div>This certificate was issued but has since been revoked by the issuer. It is no longer valid.</div></div>';
    let txHtml = "Not available";
    if (tx && tx.issueTx) txHtml = CC.txLink(tx.issueTx);
    let body = row("Certificate ID", '<span class="mono">' + esc(c.certificateId) + "</span>") +
      row("Student name", esc(c.studentName)) +
      row("Registration no.", esc(c.registrationNumber)) +
      row("Course / degree", esc(c.courseName)) +
      row("University", esc(c.universityName)) +
      row("Grade", esc(c.grade)) +
      row("Issue date", esc(c.issueDate)) +
      row("Status", ok ? '<span class="badge valid">VALID</span>' : '<span class="badge revoked">REVOKED</span>') +
      row("Issuing wallet", CC.addrLink(c.issuerAddress)) +
      row("Recorded in block", esc(c.issuedAtBlock) + " (" + esc(CC.fmtDate(c.issuedAt)) + ")") +
      row("Issuance transaction", txHtml);
    if (!ok && tx && tx.revokeTx) body += row("Revocation transaction", CC.txLink(tx.revokeTx));
    body += '<div class="actions"><a class="btn btn-ghost btn-sm" href="certificate.html?id=' + encodeURIComponent(c.certificateId) + '">View printable certificate</a></div>';
    out.innerHTML = '<div class="result ' + (ok ? "ok" : "bad") + '"><div class="result-head">' + head + '</div><div class="result-body">' + body + "</div></div>";
  }

  async function verify(id) {
    id = id.trim();
    if (!id) return;
    btn.disabled = true;
    out.innerHTML = '<div class="card" style="margin-top:26px"><span class="spinner"></span>&nbsp; Reading the blockchain…</div>';
    try {
      const contract = CC.getReadContract();
      const res = await CC.lookupCertificate(id, contract);
      const tx = res.cert ? await CC.lookupTransactions(res.cert, contract) : null;
      render(res, id, tx);
    } catch (e) {
      out.innerHTML = '<div class="banner err" style="margin-top:26px"><b>Verification failed.</b> ' + esc(CC.friendlyError(e)) + "</div>";
      CC.toast(CC.friendlyError(e), "error");
    } finally {
      btn.disabled = false;
    }
  }

  form.addEventListener("submit", (e) => { e.preventDefault(); verify(input.value); });

  const preset = new URLSearchParams(location.search).get("id");
  if (preset) { input.value = preset; verify(preset); }
})();
