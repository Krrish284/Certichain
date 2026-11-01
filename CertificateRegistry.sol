// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title CertificateRegistry
 * @notice Issue, revoke and verify academic certificates on-chain (CertiChain).
 *
 * PRIVACY WARNING (academic demonstration only):
 * Everything stored in this contract (student name, registration number, grade...)
 * is PUBLICLY READABLE on the blockchain and can NEVER be erased. This is
 * acceptable for a classroom demo with fictional data. A production system
 * must NOT store personal data on-chain. Instead it would:
 *   1. keep the certificate data in an off-chain database / IPFS (encrypted),
 *   2. compute keccak256(canonicalised certificate data + random salt),
 *   3. store ONLY that hash (plus issuer, status, timestamp) on-chain,
 *   4. let a verifier recompute the hash from the document they were shown and
 *      compare it with the on-chain value.
 * That design keeps tamper-evidence while respecting privacy laws (GDPR / DPDP).
 */
contract CertificateRegistry {
    // ---------------------------------------------------------------- data
    struct Certificate {
        string certificateId;
        string studentName;
        string registrationNumber;
        string courseName;
        string universityName;
        string grade;
        string issueDate;
        address issuerAddress;
        bool isRevoked;
        bool exists;
        uint256 issuedAtBlock; // block in which it was issued (used to find the tx hash from logs)
        uint256 issuedAt;      // block timestamp
    }

    uint256 private constant MAX_FIELD_LENGTH = 200;

    address public owner;
    uint256 public totalCertificates;

    mapping(address => bool) public isAuthorizedIssuer;
    mapping(bytes32 => Certificate) private certificates;     // keccak256(certificateId) => certificate
    mapping(address => string[]) private issuerCertificates;  // issuer => certificate IDs

    // -------------------------------------------------------------- events
    event CertificateIssued(
        bytes32 indexed idHash,
        string certificateId,
        address indexed issuer,
        string studentName,
        uint256 timestamp
    );
    event CertificateRevoked(
        bytes32 indexed idHash,
        string certificateId,
        address indexed revokedBy,
        uint256 timestamp
    );
    event IssuerAuthorized(address indexed issuer, address indexed by);
    event IssuerRemoved(address indexed issuer, address indexed by);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    // ----------------------------------------------------------- modifiers
    modifier onlyOwner() {
        require(msg.sender == owner, "Only the contract owner can do this");
        _;
    }

    modifier onlyAuthorizedIssuer() {
        require(isAuthorizedIssuer[msg.sender], "Caller is not an authorized issuer");
        _;
    }

    // --------------------------------------------------------- constructor
    constructor() {
        owner = msg.sender;
        isAuthorizedIssuer[msg.sender] = true;
        emit OwnershipTransferred(address(0), msg.sender);
        emit IssuerAuthorized(msg.sender, msg.sender);
    }

    // ------------------------------------------------- admin: issuer control
    function authorizeIssuer(address issuer) external onlyOwner {
        require(issuer != address(0), "Invalid issuer address");
        require(!isAuthorizedIssuer[issuer], "Issuer already authorized");
        isAuthorizedIssuer[issuer] = true;
        emit IssuerAuthorized(issuer, msg.sender);
    }

    function removeIssuer(address issuer) external onlyOwner {
        require(issuer != owner, "Cannot remove the owner");
        require(isAuthorizedIssuer[issuer], "Issuer is not authorized");
        isAuthorizedIssuer[issuer] = false;
        emit IssuerRemoved(issuer, msg.sender);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid new owner");
        address previous = owner;
        owner = newOwner;
        isAuthorizedIssuer[newOwner] = true;
        emit OwnershipTransferred(previous, newOwner);
    }

    // ------------------------------------------------------- issue / revoke
    function issueCertificate(
        string memory certificateId,
        string memory studentName,
        string memory registrationNumber,
        string memory courseName,
        string memory universityName,
        string memory grade,
        string memory issueDate
    ) external onlyAuthorizedIssuer {
        _requireValid(certificateId, "Certificate ID");
        _requireValid(studentName, "Student name");
        _requireValid(registrationNumber, "Registration number");
        _requireValid(courseName, "Course name");
        _requireValid(universityName, "University name");
        _requireValid(grade, "Grade");
        _requireValid(issueDate, "Issue date");

        bytes32 key = keccak256(bytes(certificateId));
        require(!certificates[key].exists, "Certificate ID already exists");

        Certificate storage c = certificates[key];
        c.certificateId = certificateId;
        c.studentName = studentName;
        c.registrationNumber = registrationNumber;
        c.courseName = courseName;
        c.universityName = universityName;
        c.grade = grade;
        c.issueDate = issueDate;
        c.issuerAddress = msg.sender;
        c.isRevoked = false;
        c.exists = true;
        c.issuedAtBlock = block.number;
        c.issuedAt = block.timestamp;

        issuerCertificates[msg.sender].push(certificateId);
        totalCertificates += 1;

        _emitIssued(key, certificateId, studentName);
    }

    function revokeCertificate(string memory certificateId) external onlyAuthorizedIssuer {
        bytes32 key = keccak256(bytes(certificateId));
        Certificate storage c = certificates[key];
        require(c.exists, "Certificate not found");
        require(!c.isRevoked, "Certificate already revoked");
        require(
            c.issuerAddress == msg.sender || msg.sender == owner,
            "Only the issuing wallet or owner can revoke"
        );

        c.isRevoked = true; // one-way: there is no function that restores or edits a certificate
        emit CertificateRevoked(key, certificateId, msg.sender, block.timestamp);
    }

    // ----------------------------------------------------------- read-only
    /// @return exists    true if a certificate with this ID was ever issued
    /// @return isValid   true if it exists AND has not been revoked
    function verifyCertificate(string memory certificateId)
        external
        view
        returns (bool exists, bool isValid)
    {
        Certificate storage c = certificates[keccak256(bytes(certificateId))];
        exists = c.exists;
        isValid = c.exists && !c.isRevoked;
    }

    /// @dev Reverts with "Certificate not found" for unknown IDs; call verifyCertificate first.
    function getCertificate(string memory certificateId) external view returns (Certificate memory) {
        Certificate storage c = certificates[keccak256(bytes(certificateId))];
        require(c.exists, "Certificate not found");
        return c;
    }

    function getCertificatesByIssuer(address issuer) external view returns (string[] memory) {
        return issuerCertificates[issuer];
    }

    // ------------------------------------------------------------ internal
    function _requireValid(string memory value, string memory) private pure {
        uint256 len = bytes(value).length;
        require(len > 0, "Certificate fields must not be empty");
        require(len <= MAX_FIELD_LENGTH, "Certificate field too long");
    }

    function _emitIssued(bytes32 key, string memory certificateId, string memory studentName) private {
        emit CertificateIssued(key, certificateId, msg.sender, studentName, block.timestamp);
    }
}
