/*
 * CertiChain configuration  (the ONLY file you edit after deploying in Remix)
 *
 * 1. CONTRACT_ADDRESS : paste the address of your deployed CertificateRegistry
 *                       (or skip this file and use connect.html, which saves it in the browser).
 * 2. CHAIN_ID         : 11155111 = Sepolia testnet (default).
 * 3. RPC_URL          : free public read-only endpoint, used by verify.html so the
 *                       public page works WITHOUT MetaMask.
 * 4. ABI              : human-readable ABI (Ethers v6 accepts this directly). It already
 *                       matches contracts/CertificateRegistry.sol. If you change the contract,
 *                       replace it with the JSON ABI copied from Remix
 *                       (Solidity Compiler tab -> "ABI" copy button).
 *
 * No private keys or seed phrases are stored anywhere in this project.
 */
window.CERTICHAIN_CONFIG = {
  CONTRACT_ADDRESS: "", // e.g. "0x1234...abcd"  <-- paste your deployed address here
  CHAIN_ID: 11155111,
  CHAIN_NAME: "Sepolia",
  RPC_URL: "https://ethereum-sepolia-rpc.publicnode.com",
  EXPLORER: "https://sepolia.etherscan.io",
  ABI: [
    "function owner() view returns (address)",
    "function totalCertificates() view returns (uint256)",
    "function isAuthorizedIssuer(address) view returns (bool)",
    "function authorizeIssuer(address issuer)",
    "function removeIssuer(address issuer)",
    "function transferOwnership(address newOwner)",
    "function issueCertificate(string certificateId, string studentName, string registrationNumber, string courseName, string universityName, string grade, string issueDate)",
    "function revokeCertificate(string certificateId)",
    "function verifyCertificate(string certificateId) view returns (bool exists, bool isValid)",
    "function getCertificate(string certificateId) view returns (tuple(string certificateId, string studentName, string registrationNumber, string courseName, string universityName, string grade, string issueDate, address issuerAddress, bool isRevoked, bool exists, uint256 issuedAtBlock, uint256 issuedAt))",
    "function getCertificatesByIssuer(address issuer) view returns (string[])",
    "event CertificateIssued(bytes32 indexed idHash, string certificateId, address indexed issuer, string studentName, uint256 timestamp)",
    "event CertificateRevoked(bytes32 indexed idHash, string certificateId, address indexed revokedBy, uint256 timestamp)",
    "event IssuerAuthorized(address indexed issuer, address indexed by)",
    "event IssuerRemoved(address indexed issuer, address indexed by)",
    "event OwnershipTransferred(address indexed previousOwner, address indexed newOwner)"
  ]
};
