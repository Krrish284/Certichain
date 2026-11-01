/* "Link Remix" page: point the site at whatever you deployed from Remix. */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = CC.esc;

  const PRESETS = {
    sepolia: { CHAIN_ID: 11155111, CHAIN_NAME: "Sepolia", RPC_URL: "https://ethereum-sepolia-rpc.publicnode.com", EXPLORER: "https://sepolia.etherscan.io" },
    ganache: { CHAIN_ID: 1337, CHAIN_NAME: "Local (Ganache)", RPC_URL: "", EXPLORER: "" },
    hardhat: { CHAIN_ID: 31337, CHAIN_NAME: "Local (Hardhat)", RPC_URL: "", EXPLORER: "" },
    custom: null
  };

  function fill(p) {
    $("fChain").value = p.CHAIN_ID; $("fName").value = p.CHAIN_NAME;
    $("fRpc").value = p.RPC_URL; $("fExplorer").value = p.EXPLORER;
  }

  function currentValues() {
    const abiText = $("fAbi").value.trim();
    let abi;
    if (abiText) {
      try {
        abi = JSON.parse(abiText);
        if (!Array.isArray(abi)) throw new Error("not an array");
        new ethers.Interface(abi); // validates it
      } catch (e) { throw new Error("The ABI box doesn't hold a valid ABI array. In Remix, use the ABI copy button on the Compiler tab."); }
    }
    const addr = $("fAddr").value.trim();
    if (!/^0x[0-9a-fA-F]{40}$/.test(addr)) throw new Error("Contract address should look like 0x followed by 40 hex characters.");
    const chain = Number($("fChain").value);
    if (!Number.isInteger(chain) || chain <= 0) throw new Error("Chain ID must be a positive whole number.");
    return {
      CONTRACT_ADDRESS: addr, CHAIN_ID: chain, CHAIN_NAME: $("fName").value.trim() || ("Chain " + chain),
      RPC_URL: $("fRpc").value.trim(), EXPLORER: $("fExplorer").value.trim().replace(/\/$/, ""), ABI: abi
    };
  }

  function renderChecks(list) {
    $("checks").innerHTML = list.map((c) => '<div class="log-line ' + (c.ok ? "ok" : "bad") + '">' + (c.ok ? "[ ok ] " : "[fail] ") + esc(c.text) + "</div>").join("");
  }

  $("fPreset").addEventListener("change", () => { const p = PRESETS[$("fPreset").value]; if (p) fill(p); });

  $("testBtn").addEventListener("click", async () => {
    try {
      const v = currentValues();
      $("checks").innerHTML = '<div class="log-line"><span class="spinner"></span> poking the node…</div>';
      renderChecks(await CC.testConnection(v));
    } catch (e) { renderChecks([{ ok: false, text: e.message }]); }
  });

  $("saveBtn").addEventListener("click", () => {
    try {
      const v = currentValues();
      if (!v.ABI) delete v.ABI;
      if (!CC.saveSettings(v)) throw new Error("Browser blocked storage. Edit frontend/js/config.js instead.");
      CC.toast("Saved. Reloading with your contract…", "success");
      setTimeout(() => location.reload(), 700);
    } catch (e) { CC.toast(e.message, "error"); }
  });

  $("resetBtn").addEventListener("click", () => {
    CC.clearSettings();
    CC.toast("Back to config.js defaults.", "info");
    setTimeout(() => location.reload(), 600);
  });

  $("copyCfg").addEventListener("click", async () => {
    try {
      const v = currentValues();
      const text = 'CONTRACT_ADDRESS: "' + v.CONTRACT_ADDRESS + '",\nCHAIN_ID: ' + v.CHAIN_ID + ',\nCHAIN_NAME: "' + v.CHAIN_NAME + '",\nRPC_URL: "' + v.RPC_URL + '",\nEXPLORER: "' + v.EXPLORER + '",';
      await navigator.clipboard.writeText(text);
      CC.toast("Copied. Paste over the matching lines in config.js to make it permanent.", "success");
    } catch (e) { CC.toast("Couldn't copy: " + e.message, "error"); }
  });

  // initial values = what the site is using right now
  $("fAddr").value = CC.cfg.CONTRACT_ADDRESS || "";
  fill({ CHAIN_ID: CC.cfg.CHAIN_ID, CHAIN_NAME: CC.cfg.CHAIN_NAME, RPC_URL: CC.cfg.RPC_URL, EXPLORER: CC.cfg.EXPLORER });
  $("curState").textContent = CC.isConfigured()
    ? "Linked to " + CC.cfg.CONTRACT_ADDRESS + " on " + CC.cfg.CHAIN_NAME + (CC.hasSavedSettings() ? " (from this browser's saved settings)" : " (from config.js)")
    : "Nothing linked yet.";
})();
