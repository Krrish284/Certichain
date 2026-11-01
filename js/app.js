/* CertiChain shared helpers: settings, blockchain access, wallet handling, UI utilities. */
(function () {
  "use strict";
  const base = window.CERTICHAIN_CONFIG;
  const STORE_KEY = "certichain.settings";

  /* ---------- settings: config.js defaults, overridden by the Remix link page ---------- */
  function readSaved() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || "{}") || {}; } catch (e) { return {}; }
  }
  const saved = readSaved();
  const cfg = {
    CONTRACT_ADDRESS: saved.CONTRACT_ADDRESS != null ? saved.CONTRACT_ADDRESS : base.CONTRACT_ADDRESS,
    CHAIN_ID: saved.CHAIN_ID != null ? Number(saved.CHAIN_ID) : base.CHAIN_ID,
    CHAIN_NAME: saved.CHAIN_NAME != null ? saved.CHAIN_NAME : base.CHAIN_NAME,
    RPC_URL: saved.RPC_URL != null ? saved.RPC_URL : base.RPC_URL,
    EXPLORER: saved.EXPLORER != null ? saved.EXPLORER : base.EXPLORER,
    ABI: base.ABI
  };
  if (Array.isArray(saved.ABI) && saved.ABI.length) cfg.ABI = saved.ABI; // pasted from Remix

  function saveSettings(obj) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(obj)); return true; } catch (e) { return false; }
  }
  function clearSettings() { try { localStorage.removeItem(STORE_KEY); } catch (e) { /* ignore */ } }
  function hasSavedSettings() { return Object.keys(readSaved()).length > 0; }

  let readProvider = null;
  let signer = null;
  let account = null;

  /* ---------- UI utilities ---------- */
  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function shortAddr(a) { return a ? a.slice(0, 6) + "…" + a.slice(-4) : ""; }

  function toast(message, type) {
    let box = document.getElementById("toasts");
    if (!box) { box = document.createElement("div"); box.id = "toasts"; document.body.appendChild(box); }
    const t = document.createElement("div");
    t.className = "toast " + (type || "info");
    t.textContent = message;
    box.appendChild(t);
    setTimeout(() => { t.classList.add("hide"); setTimeout(() => t.remove(), 400); }, type === "error" ? 7000 : 4500);
  }

  function friendlyError(e) {
    if (!e) return "Unknown error";
    if (e.code === "ACTION_REJECTED" || e.code === 4001) return "You rejected the request in MetaMask.";
    const raw = (e.reason || (e.info && e.info.error && e.info.error.message) || e.shortMessage || e.message || String(e));
    const m = raw.match(/reverted with reason string '([^']+)'/);
    if (m) return m[1];
    if (/insufficient funds/i.test(raw)) return "Not enough ETH for gas on this network.";
    if (/BAD_DATA|could not decode result/i.test(raw)) return "No CertificateRegistry contract found at that address on this network. Re-check the Remix link page.";
    if (/failed to fetch|network error|ECONNREFUSED|could not detect network/i.test(raw)) return "Can't reach the RPC node. Is it running, and is the URL right?";
    return raw.length > 220 ? raw.slice(0, 220) + "…" : raw;
  }

  /** Link to a block explorer if one is set (local chains have none); otherwise plain text. */
  function txLink(hash) {
    if (!cfg.EXPLORER) return '<span class="mono">' + esc(hash) + "</span>";
    return '<a target="_blank" rel="noopener" class="mono" href="' + esc(cfg.EXPLORER + "/tx/" + hash) + '">' + esc(hash) + "</a>";
  }
  function addrLink(a) {
    if (!cfg.EXPLORER) return '<span class="mono">' + esc(a) + "</span>";
    return '<a target="_blank" rel="noopener" class="mono" href="' + esc(cfg.EXPLORER + "/address/" + a) + '">' + esc(a) + "</a>";
  }

  /* ---------- configuration checks ---------- */
  function isConfigured() { return /^0x[0-9a-fA-F]{40}$/.test(cfg.CONTRACT_ADDRESS || ""); }
  function requireConfigured() {
    if (!isConfigured()) throw new Error("No contract linked yet. Open the “Link Remix” page and paste your deployed address.");
  }
  function showConfigBanner() {
    if (isConfigured()) return;
    const b = document.getElementById("configBanner");
    if (b) b.hidden = false;
  }

  /* ---------- read access ---------- */
  function getReadProvider() {
    if (readProvider) return readProvider;
    if (cfg.RPC_URL) {
      readProvider = new ethers.JsonRpcProvider(cfg.RPC_URL, cfg.CHAIN_ID, { staticNetwork: true });
    } else if (window.ethereum) {
      readProvider = new ethers.BrowserProvider(window.ethereum); // local chain: read through MetaMask
    } else {
      throw new Error("No RPC URL set and no MetaMask found. Add an RPC URL on the Link Remix page.");
    }
    return readProvider;
  }
  function getReadContract() {
    requireConfigured();
    return new ethers.Contract(cfg.CONTRACT_ADDRESS, cfg.ABI, getReadProvider());
  }

  function normalize(c) {
    return {
      certificateId: c.certificateId, studentName: c.studentName, registrationNumber: c.registrationNumber,
      courseName: c.courseName, universityName: c.universityName, grade: c.grade, issueDate: c.issueDate,
      issuerAddress: c.issuerAddress, isRevoked: c.isRevoked, exists: c.exists,
      issuedAtBlock: Number(c.issuedAtBlock), issuedAt: Number(c.issuedAt)
    };
  }

  /** Returns {status: "VERIFIED"|"REVOKED"|"NOT_FOUND", cert?} using real contract data. */
  async function lookupCertificate(id, contract) {
    const c = contract || getReadContract();
    const res = await c.verifyCertificate(id);
    if (!res.exists) return { status: "NOT_FOUND" };
    const cert = normalize(await c.getCertificate(id));
    return { status: cert.isRevoked ? "REVOKED" : "VERIFIED", cert };
  }

  /** Finds issuance / revocation transaction hashes from the contract's event logs. */
  async function lookupTransactions(cert, contract) {
    const c = contract || getReadContract();
    const out = { issueTx: null, revokeTx: null };
    const idHash = ethers.id(cert.certificateId);
    try {
      const logs = await c.queryFilter(c.filters.CertificateIssued(idHash), cert.issuedAtBlock, cert.issuedAtBlock);
      if (logs.length) out.issueTx = logs[0].transactionHash;
    } catch (e) { /* some RPCs limit log queries */ }
    if (cert.isRevoked) {
      try {
        const latest = await c.runner.provider.getBlockNumber();
        const logs = await c.queryFilter(c.filters.CertificateRevoked(idHash), cert.issuedAtBlock, latest);
        if (logs.length) out.revokeTx = logs[logs.length - 1].transactionHash;
      } catch (e) { /* optional */ }
    }
    return out;
  }

  /** Used by the Remix link page: returns a list of {ok, text} checks. */
  async function testConnection(override) {
    const checks = [];
    const addr = override.CONTRACT_ADDRESS;
    let provider;
    try {
      provider = override.RPC_URL
        ? new ethers.JsonRpcProvider(override.RPC_URL, Number(override.CHAIN_ID), { staticNetwork: true })
        : new ethers.BrowserProvider(window.ethereum);
      const bn = await provider.getBlockNumber();
      checks.push({ ok: true, text: "Reached the node. Latest block: " + bn });
    } catch (e) { checks.push({ ok: false, text: "Can't reach the node: " + friendlyError(e) }); return checks; }
    try {
      const net = await provider.getNetwork();
      const same = Number(net.chainId) === Number(override.CHAIN_ID);
      checks.push({ ok: same, text: "Node chain ID is " + net.chainId + (same ? " (matches)" : ", but you entered " + override.CHAIN_ID) });
    } catch (e) { checks.push({ ok: false, text: "Couldn't read chain ID." }); }
    try {
      const code = await provider.getCode(addr);
      if (code === "0x") { checks.push({ ok: false, text: "No contract code at that address on this network." }); return checks; }
      checks.push({ ok: true, text: "Contract code found at the address." });
      const contract = new ethers.Contract(addr, override.ABI || cfg.ABI, provider);
      const [owner, total] = await Promise.all([contract.owner(), contract.totalCertificates()]);
      checks.push({ ok: true, text: "owner() = " + owner });
      checks.push({ ok: true, text: "totalCertificates() = " + total });
    } catch (e) { checks.push({ ok: false, text: "Contract call failed: " + friendlyError(e) }); }
    return checks;
  }

  /* ---------- wallet (MetaMask) ---------- */
  async function ensureNetwork() {
    const hex = "0x" + cfg.CHAIN_ID.toString(16);
    try {
      await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hex }] });
    } catch (err) {
      if (err && err.code === 4902) {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [{
            chainId: hex, chainName: cfg.CHAIN_NAME || ("Chain " + cfg.CHAIN_ID),
            rpcUrls: [cfg.RPC_URL || "http://127.0.0.1:8545"],
            blockExplorerUrls: cfg.EXPLORER ? [cfg.EXPLORER] : undefined,
            nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }
          }]
        });
      } else {
        throw new Error("Wrong network. Switch MetaMask to " + (cfg.CHAIN_NAME || "chain " + cfg.CHAIN_ID) + " (chain ID " + cfg.CHAIN_ID + ").");
      }
    }
  }

  async function currentChainId() {
    const net = await new ethers.BrowserProvider(window.ethereum).getNetwork();
    return Number(net.chainId);
  }

  async function connectWallet() {
    if (!window.ethereum) throw new Error("MetaMask not found. Install it, then reload.");
    const probe = new ethers.BrowserProvider(window.ethereum);
    await probe.send("eth_requestAccounts", []);
    if ((await currentChainId()) !== cfg.CHAIN_ID) await ensureNetwork();
    const bp = new ethers.BrowserProvider(window.ethereum); // fresh provider after a possible switch
    signer = await bp.getSigner();
    account = await signer.getAddress();
    return account;
  }

  function disconnectWallet() { signer = null; account = null; }
  function getAccount() { return account; }

  async function getWriteContract() {
    requireConfigured();
    if (!signer) throw new Error("Wallet not connected. Hit “Connect MetaMask”.");
    if ((await currentChainId()) !== cfg.CHAIN_ID) throw new Error("Wrong network. Switch MetaMask to " + (cfg.CHAIN_NAME || "chain " + cfg.CHAIN_ID) + ".");
    return new ethers.Contract(cfg.CONTRACT_ADDRESS, cfg.ABI, signer);
  }

  /** handlers: {onAccountsChanged(accounts), onChainChanged(chainIdNumber)} */
  function watchWallet(handlers) {
    if (!window.ethereum || !window.ethereum.on) return;
    window.ethereum.on("accountsChanged", (accs) => handlers.onAccountsChanged && handlers.onAccountsChanged(accs));
    window.ethereum.on("chainChanged", (hex) => handlers.onChainChanged && handlers.onChainChanged(parseInt(hex, 16)));
  }

  /* ---------- page chrome ---------- */
  function initChrome() {
    const y = document.getElementById("year");
    if (y) y.textContent = new Date().getFullYear();
    const burger = document.getElementById("burger");
    const links = document.getElementById("navLinks");
    if (burger && links) burger.addEventListener("click", () => links.classList.toggle("open"));
    const net = document.getElementById("netChip");
    if (net) {
      net.textContent = (isConfigured() ? "● " : "○ ") + (cfg.CHAIN_NAME || "chain " + cfg.CHAIN_ID) + (isConfigured() ? " · " + shortAddr(cfg.CONTRACT_ADDRESS) : " · not linked");
      net.classList.toggle("on", isConfigured());
    }
    showConfigBanner();
  }
  document.addEventListener("DOMContentLoaded", initChrome);

  function fmtDate(ts) { return ts ? new Date(ts * 1000).toLocaleString() : "—"; }

  window.CC = {
    cfg, esc, shortAddr, toast, friendlyError, txLink, addrLink, isConfigured, requireConfigured,
    getReadContract, lookupCertificate, lookupTransactions, testConnection,
    saveSettings, clearSettings, hasSavedSettings,
    connectWallet, disconnectWallet, getAccount, getWriteContract, watchWallet, currentChainId, fmtDate
  };
})();
