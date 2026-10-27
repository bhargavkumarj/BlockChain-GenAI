// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

/// @title Pactum — milestone escrow with AI-adjudicated disputes
/// @notice A client funds an agreement up front. The provider is paid per milestone when the client
///         approves, or automatically once the review period lapses. Either side can open a dispute;
///         an arbiter (by default the Pactum AI Tribunal) then signs an EIP-712 ruling that splits the
///         milestone. Rulings can optionally be appealed to a human court within an appeal window.
/// @dev    Terms, deliveries, evidence and the tribunal's full reasoning live on IPFS; this contract
///         only stores their CIDs, so every decision it executes can be audited by anyone.
contract Pactum is EIP712, ReentrancyGuardTransient, Ownable2Step {
    using SafeERC20 for IERC20;

    // ─────────────────────────────────────────────────────────────── Types

    enum Status {
        Proposed, // funded by the client, waiting for the provider to accept
        Active, // accepted; milestones in progress
        Closed, // every milestone reached a terminal phase
        Cancelled // withdrawn or declined before acceptance; fully refunded
    }

    enum Phase {
        Pending, // awaiting delivery
        Delivered, // delivered; client review period running
        Disputed, // dispute open; evidence window running
        Ruled, // arbiter ruled; appeal window running
        Appealed, // escalated to the appeal court
        Released, // terminal: paid in full to the provider
        Refunded, // terminal: returned in full to the client
        Resolved // terminal: split by ruling, appeal or settlement
    }

    struct Milestone {
        uint128 amount;
        uint64 dueBy; // 0 = no deadline
        uint64 deliveredAt;
        uint64 disputedAt;
        uint64 ruledAt;
        uint64 closedAt; // when the milestone reached a terminal phase
        uint16 providerBps; // ruled (or final) share of `amount` owed to the provider
        Phase phase;
        uint8 evidence; // bit 0: client has filed, bit 1: provider has filed
        address disputant;
        string deliveryCID;
        string rulingCID;
    }

    struct Agreement {
        address client;
        address provider;
        address token; // address(0) = native ETH
        address arbiter; // EOA or ERC-1271 contract that signs rulings
        address appealCourt; // address(0) = rulings are final
        uint32 reviewPeriod;
        uint32 responseWindow;
        uint32 appealWindow;
        Status status;
        uint8 openMilestones;
        uint64 createdAt;
        uint64 createdBlock;
        uint64 acceptedAt;
        uint256 total;
        string termsCID;
    }

    /// @notice One filing in a dispute. The full case record lives in state, so it can be rebuilt without logs.
    struct Evidence {
        address by;
        uint64 at;
        string cid;
    }

    struct CreateParams {
        address provider;
        address token;
        address arbiter;
        address appealCourt;
        uint32 reviewPeriod;
        uint32 responseWindow;
        uint32 appealWindow;
        string termsCID;
        uint128[] amounts;
        uint64[] dueBy;
    }

    struct Offer {
        address by;
        uint16 providerBps;
    }

    /// @notice Portable, on-chain track record. Counts only — no amounts, so it is token-agnostic.
    struct Record {
        uint32 asClient;
        uint32 asProvider;
        uint32 completed;
        uint32 milestonesPaid;
        uint32 disputes;
        uint32 favorableRulings;
    }

    // ─────────────────────────────────────────────────────────────── Constants

    uint16 public constant BPS = 10_000;
    uint16 public constant MAX_FEE_BPS = 300;
    uint256 public constant MAX_MILESTONES = 20;
    uint256 public constant MAX_APPEAL_FEE = 1 ether;
    /// @dev Per party, so neither side can exhaust the record and silence the other.
    uint256 public constant MAX_FILINGS_PER_PARTY = 8;
    uint8 private constant CLIENT_FILED = 1;
    uint8 private constant PROVIDER_FILED = 2;

    bytes32 public constant RULING_TYPEHASH = keccak256(
        "Ruling(uint256 agreementId,uint256 milestone,uint16 providerBps,bytes32 rulingCIDHash,uint64 disputedAt,uint256 deadline)"
    );

    // ─────────────────────────────────────────────────────────────── Storage

    uint256 public agreementCount;
    uint16 public feeBps;
    address public feeRecipient;
    uint256 public appealFee;

    mapping(uint256 id => Agreement) private _agreements;
    mapping(uint256 id => Milestone[]) private _milestones;
    mapping(address party => uint256[]) private _byParty;
    mapping(uint256 id => mapping(uint256 milestone => Offer)) public offers;
    mapping(uint256 id => mapping(uint256 milestone => Evidence[])) private _evidence;
    mapping(address party => Record) public records;
    /// @notice Balances that could not be pushed (e.g. a reverting receiver). Claim with {withdraw}.
    mapping(address token => mapping(address account => uint256)) public owed;

    // ─────────────────────────────────────────────────────────────── Events

    event AgreementCreated(
        uint256 indexed id,
        address indexed client,
        address indexed provider,
        address token,
        uint256 total,
        string termsCID
    );
    event AgreementAccepted(uint256 indexed id);
    event AgreementCancelled(uint256 indexed id, address by);
    event AgreementClosed(uint256 indexed id);
    event MilestoneDelivered(uint256 indexed id, uint256 indexed milestone, string deliveryCID);
    event MilestoneReleased(uint256 indexed id, uint256 indexed milestone, uint256 toProvider, uint256 fee);
    event MilestoneRefunded(uint256 indexed id, uint256 indexed milestone, uint256 toClient);
    event DisputeOpened(uint256 indexed id, uint256 indexed milestone, address indexed by);
    event EvidenceSubmitted(uint256 indexed id, uint256 indexed milestone, address indexed by, string cid);
    event RulingIssued(
        uint256 indexed id, uint256 indexed milestone, uint16 providerBps, string rulingCID, bool isFinal
    );
    event RulingAppealed(uint256 indexed id, uint256 indexed milestone, address indexed by);
    event AppealResolved(uint256 indexed id, uint256 indexed milestone, uint16 providerBps, string rulingCID);
    event SettlementOffered(uint256 indexed id, uint256 indexed milestone, address indexed by, uint16 providerBps);
    event MilestoneResolved(
        uint256 indexed id, uint256 indexed milestone, uint16 providerBps, uint256 toProvider, uint256 toClient
    );
    event Credited(address indexed token, address indexed account, uint256 amount);
    event FeeUpdated(uint16 feeBps, address feeRecipient);
    event AppealFeeUpdated(uint256 appealFee);

    // ─────────────────────────────────────────────────────────────── Errors

    error UnknownAgreement();
    error NotClient();
    error NotProvider();
    error NotParty();
    error NotAppealCourt();
    error InvalidParams();
    error WrongStatus();
    error WrongPhase();
    error BadMilestone();
    error WrongValue();
    error UnsupportedToken();
    error TooEarly();
    error TooLate();
    error InvalidSignature();
    error SignatureExpired();
    error NoOffer();
    error NothingOwed();
    error TooManyFilings();
    error TransferFailed();

    // ─────────────────────────────────────────────────────────────── Setup

    constructor(address owner_, uint16 feeBps_, address feeRecipient_)
        EIP712("Pactum", "1")
        Ownable(owner_)
    {
        _setFee(feeBps_, feeRecipient_);
    }

    // ─────────────────────────────────────────────────────────────── Lifecycle

    /// @notice Fund a new agreement. ETH must be sent with the call; ERC-20s must be approved first.
    function create(CreateParams calldata p) external payable nonReentrant returns (uint256 id) {
        id = _create(p);
    }

    /// @notice Same as {create}, but approves an EIP-2612 token in the same transaction.
    /// @dev The permit is wrapped in try/catch so a front-run permit cannot grief the call.
    function createWithPermit(CreateParams calldata p, uint256 deadline, uint8 v, bytes32 r, bytes32 s)
        external
        nonReentrant
        returns (uint256 id)
    {
        if (p.token == address(0)) revert UnsupportedToken();
        try IERC20Permit(p.token).permit(msg.sender, address(this), _sum(p.amounts), deadline, v, r, s) {} catch {}
        id = _create(p);
    }

    /// @notice Provider accepts the terms; work can start.
    function accept(uint256 id) external nonReentrant {
        Agreement storage a = _agreement(id);
        if (msg.sender != a.provider) revert NotProvider();
        if (a.status != Status.Proposed) revert WrongStatus();
        a.status = Status.Active;
        a.acceptedAt = uint64(block.timestamp);
        records[a.provider].asProvider++;
        emit AgreementAccepted(id);
    }

    /// @notice Client withdraws, or provider declines, an agreement that was never accepted.
    function cancel(uint256 id) external nonReentrant {
        Agreement storage a = _agreement(id);
        if (msg.sender != a.client && msg.sender != a.provider) revert NotParty();
        if (a.status != Status.Proposed) revert WrongStatus();
        a.status = Status.Cancelled;
        Milestone[] storage ms = _milestones[id];
        for (uint256 i; i < ms.length; ++i) {
            ms[i].phase = Phase.Refunded;
            ms[i].closedAt = uint64(block.timestamp);
        }
        a.openMilestones = 0;
        _send(a.token, a.client, a.total);
        emit AgreementCancelled(id, msg.sender);
    }

    /// @notice Provider submits (or resubmits) a delivery for review.
    function deliver(uint256 id, uint256 index, string calldata deliveryCID) external nonReentrant {
        (Agreement storage a, Milestone storage m) = _active(id, index);
        if (msg.sender != a.provider) revert NotProvider();
        if (m.phase != Phase.Pending && m.phase != Phase.Delivered) revert WrongPhase();
        if (bytes(deliveryCID).length == 0) revert InvalidParams();
        m.deliveryCID = deliveryCID;
        m.deliveredAt = uint64(block.timestamp);
        m.phase = Phase.Delivered;
        emit MilestoneDelivered(id, index, deliveryCID);
    }

    /// @notice Client releases the milestone in full. Also works mid-dispute as a concession.
    function release(uint256 id, uint256 index) external nonReentrant {
        (Agreement storage a, Milestone storage m) = _active(id, index);
        if (msg.sender != a.client) revert NotClient();
        _requireOpen(m);
        _releaseToProvider(id, index, a, m);
    }

    /// @notice Provider collects a delivered milestone the client did not review in time.
    function claim(uint256 id, uint256 index) external nonReentrant {
        (Agreement storage a, Milestone storage m) = _active(id, index);
        if (msg.sender != a.provider) revert NotProvider();
        if (m.phase != Phase.Delivered) revert WrongPhase();
        if (block.timestamp < uint256(m.deliveredAt) + a.reviewPeriod) revert TooEarly();
        _releaseToProvider(id, index, a, m);
    }

    /// @notice Provider refunds the milestone in full. Also works mid-dispute as a concession.
    function refund(uint256 id, uint256 index) external nonReentrant {
        (Agreement storage a, Milestone storage m) = _active(id, index);
        if (msg.sender != a.provider) revert NotProvider();
        _requireOpen(m);
        _refundToClient(id, index, a, m);
    }

    /// @notice Client recovers a milestone that was never delivered by its deadline.
    function reclaim(uint256 id, uint256 index) external nonReentrant {
        (Agreement storage a, Milestone storage m) = _active(id, index);
        if (msg.sender != a.client) revert NotClient();
        if (m.phase != Phase.Pending) revert WrongPhase();
        if (m.dueBy == 0 || block.timestamp <= m.dueBy) revert TooEarly();
        _refundToClient(id, index, a, m);
    }

    // ─────────────────────────────────────────────────────────────── Disputes

    /// @notice Open a dispute. The opener's statement is their first piece of evidence.
    /// @dev A client must dispute a delivery inside the review period; after that the provider may claim.
    function dispute(uint256 id, uint256 index, string calldata statementCID) external nonReentrant {
        (Agreement storage a, Milestone storage m) = _active(id, index);
        uint8 role = _role(a);
        if (m.phase != Phase.Pending && m.phase != Phase.Delivered) revert WrongPhase();
        if (
            role == CLIENT_FILED && m.phase == Phase.Delivered
                && block.timestamp >= uint256(m.deliveredAt) + a.reviewPeriod
        ) revert TooLate();
        if (bytes(statementCID).length == 0) revert InvalidParams();

        m.phase = Phase.Disputed;
        m.disputedAt = uint64(block.timestamp);
        m.disputant = msg.sender;
        m.evidence = role;
        records[a.client].disputes++;
        records[a.provider].disputes++;

        emit DisputeOpened(id, index, msg.sender);
        _file(id, index, statementCID);
    }

    /// @notice Add evidence to an open dispute or appeal. Each filing is timestamped by its event.
    function submitEvidence(uint256 id, uint256 index, string calldata cid) external nonReentrant {
        (Agreement storage a, Milestone storage m) = _active(id, index);
        uint8 role = _role(a);
        if (m.phase != Phase.Disputed && m.phase != Phase.Appealed) revert WrongPhase();
        if (bytes(cid).length == 0) revert InvalidParams();
        m.evidence |= role;
        _file(id, index, cid);
    }

    /// @notice Execute a ruling signed by the agreement's arbiter. Callable by anyone (relayer friendly).
    /// @dev Due process: the ruling is only accepted once both sides have filed, or the response window
    ///      has elapsed. `disputedAt` is part of the signed payload so a ruling cannot be replayed.
    function rule(
        uint256 id,
        uint256 index,
        uint16 providerBps,
        string calldata rulingCID,
        uint256 deadline,
        bytes calldata signature
    ) external nonReentrant {
        (Agreement storage a, Milestone storage m) = _active(id, index);
        if (m.phase != Phase.Disputed) revert WrongPhase();
        if (providerBps > BPS || bytes(rulingCID).length == 0) revert InvalidParams();
        if (block.timestamp > deadline) revert SignatureExpired();
        if (!_evidenceClosed(a, m)) revert TooEarly();

        bytes32 digest = rulingDigest(id, index, providerBps, rulingCID, m.disputedAt, deadline);
        if (!SignatureChecker.isValidSignatureNow(a.arbiter, digest, signature)) revert InvalidSignature();

        m.providerBps = providerBps;
        m.rulingCID = rulingCID;
        m.ruledAt = uint64(block.timestamp);

        bool isFinal = a.appealWindow == 0;
        emit RulingIssued(id, index, providerBps, rulingCID, isFinal);
        if (isFinal) {
            _resolve(id, index, a, m, providerBps, true);
        } else {
            m.phase = Phase.Ruled;
        }
    }

    /// @notice Escalate a ruling to the human appeal court. Requires the protocol appeal fee in ETH.
    function appeal(uint256 id, uint256 index) external payable nonReentrant {
        (Agreement storage a, Milestone storage m) = _active(id, index);
        _role(a);
        if (m.phase != Phase.Ruled) revert WrongPhase();
        if (block.timestamp >= uint256(m.ruledAt) + a.appealWindow) revert TooLate();
        if (msg.value != appealFee) revert WrongValue();
        if (msg.value > 0) _credit(address(0), a.appealCourt, msg.value);
        m.phase = Phase.Appealed;
        emit RulingAppealed(id, index, msg.sender);
    }

    /// @notice The appeal court's final word.
    function resolveAppeal(uint256 id, uint256 index, uint16 providerBps, string calldata rulingCID)
        external
        nonReentrant
    {
        (Agreement storage a, Milestone storage m) = _active(id, index);
        if (msg.sender != a.appealCourt) revert NotAppealCourt();
        if (m.phase != Phase.Appealed) revert WrongPhase();
        if (providerBps > BPS || bytes(rulingCID).length == 0) revert InvalidParams();
        m.providerBps = providerBps;
        m.rulingCID = rulingCID;
        emit AppealResolved(id, index, providerBps, rulingCID);
        _resolve(id, index, a, m, providerBps, true);
    }

    /// @notice Execute an unappealed ruling once its appeal window has closed. Callable by anyone.
    function finalize(uint256 id, uint256 index) external nonReentrant {
        (Agreement storage a, Milestone storage m) = _active(id, index);
        if (m.phase != Phase.Ruled) revert WrongPhase();
        if (block.timestamp < uint256(m.ruledAt) + a.appealWindow) revert TooEarly();
        _resolve(id, index, a, m, m.providerBps, true);
    }

    /// @notice Propose a split to the counterparty. Replaces any previous offer on the milestone.
    function offerSettlement(uint256 id, uint256 index, uint16 providerBps) external nonReentrant {
        (Agreement storage a, Milestone storage m) = _active(id, index);
        _role(a);
        _requireOpen(m);
        if (providerBps > BPS) revert InvalidParams();
        offers[id][index] = Offer({by: msg.sender, providerBps: providerBps});
        emit SettlementOffered(id, index, msg.sender, providerBps);
    }

    /// @notice Accept the counterparty's offer. `providerBps` must match, so a swapped offer cannot be sniped.
    function acceptSettlement(uint256 id, uint256 index, uint16 providerBps) external nonReentrant {
        (Agreement storage a, Milestone storage m) = _active(id, index);
        _role(a);
        _requireOpen(m);
        Offer memory o = offers[id][index];
        if (o.by == address(0) || o.by == msg.sender || o.providerBps != providerBps) revert NoOffer();
        _resolve(id, index, a, m, providerBps, false);
    }

    /// @notice Pull any balance that could not be pushed earlier, plus protocol fees for the recipient.
    function withdraw(address token) external nonReentrant {
        uint256 amount = owed[token][msg.sender];
        if (amount == 0) revert NothingOwed();
        owed[token][msg.sender] = 0;
        if (token == address(0)) {
            (bool ok,) = msg.sender.call{value: amount}("");
            if (!ok) revert TransferFailed();
        } else {
            IERC20(token).safeTransfer(msg.sender, amount);
        }
    }

    // ─────────────────────────────────────────────────────────────── Admin

    function setFee(uint16 feeBps_, address feeRecipient_) external onlyOwner {
        _setFee(feeBps_, feeRecipient_);
    }

    function setAppealFee(uint256 appealFee_) external onlyOwner {
        if (appealFee_ > MAX_APPEAL_FEE) revert InvalidParams();
        appealFee = appealFee_;
        emit AppealFeeUpdated(appealFee_);
    }

    // ─────────────────────────────────────────────────────────────── Views

    function getAgreement(uint256 id) external view returns (Agreement memory, Milestone[] memory) {
        return (_agreement(id), _milestones[id]);
    }

    function getEvidence(uint256 id, uint256 index) external view returns (Evidence[] memory) {
        return _evidence[id][index];
    }

    function agreementsOf(address party) external view returns (uint256[] memory) {
        return _byParty[party];
    }

    function canRule(uint256 id, uint256 index) external view returns (bool) {
        Agreement storage a = _agreement(id);
        if (index >= _milestones[id].length) return false;
        Milestone storage m = _milestones[id][index];
        return m.phase == Phase.Disputed && _evidenceClosed(a, m);
    }

    /// @notice The EIP-712 digest an arbiter signs for a ruling.
    function rulingDigest(
        uint256 id,
        uint256 index,
        uint16 providerBps,
        string calldata rulingCID,
        uint64 disputedAt,
        uint256 deadline
    ) public view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(
                abi.encode(
                    RULING_TYPEHASH, id, index, providerBps, keccak256(bytes(rulingCID)), disputedAt, deadline
                )
            )
        );
    }

    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    // ─────────────────────────────────────────────────────────────── Internals

    function _create(CreateParams calldata p) private returns (uint256 id) {
        uint256 n = p.amounts.length;
        if (n == 0 || n > MAX_MILESTONES || p.dueBy.length != n) revert InvalidParams();
        if (p.provider == address(0) || p.provider == msg.sender || p.arbiter == address(0)) revert InvalidParams();
        if (p.reviewPeriod == 0 || p.responseWindow == 0 || bytes(p.termsCID).length == 0) revert InvalidParams();
        // Appeals need both a court and a window; without a court rulings are final immediately.
        if ((p.appealCourt == address(0)) != (p.appealWindow == 0)) revert InvalidParams();

        uint256 total = _sum(p.amounts);
        if (total == 0) revert InvalidParams();

        if (p.token == address(0)) {
            if (msg.value != total) revert WrongValue();
        } else {
            if (msg.value != 0) revert WrongValue();
            IERC20 token = IERC20(p.token);
            uint256 before = token.balanceOf(address(this));
            token.safeTransferFrom(msg.sender, address(this), total);
            // Reject fee-on-transfer and rebasing tokens: escrow must hold exactly what it owes.
            if (token.balanceOf(address(this)) - before != total) revert UnsupportedToken();
        }

        id = ++agreementCount;
        Agreement storage a = _agreements[id];
        a.client = msg.sender;
        a.provider = p.provider;
        a.token = p.token;
        a.arbiter = p.arbiter;
        a.appealCourt = p.appealCourt;
        a.reviewPeriod = p.reviewPeriod;
        a.responseWindow = p.responseWindow;
        a.appealWindow = p.appealWindow;
        // forge-lint: disable-next-line(unsafe-typecast) — n <= MAX_MILESTONES (20)
        a.openMilestones = uint8(n);
        a.createdAt = uint64(block.timestamp);
        a.createdBlock = uint64(block.number);
        a.total = total;
        a.termsCID = p.termsCID;

        Milestone[] storage ms = _milestones[id];
        for (uint256 i; i < n; ++i) {
            if (p.amounts[i] == 0) revert InvalidParams();
            Milestone storage m = ms.push();
            m.amount = p.amounts[i];
            m.dueBy = p.dueBy[i];
        }

        _byParty[msg.sender].push(id);
        _byParty[p.provider].push(id);
        records[msg.sender].asClient++;

        emit AgreementCreated(id, msg.sender, p.provider, p.token, total, p.termsCID);
    }

    function _releaseToProvider(uint256 id, uint256 index, Agreement storage a, Milestone storage m) private {
        m.phase = Phase.Released;
        m.providerBps = BPS;
        m.closedAt = uint64(block.timestamp);
        delete offers[id][index];
        uint256 fee = _fee(m.amount);
        records[a.provider].milestonesPaid++;
        _close(id, a);
        _send(a.token, a.provider, m.amount - fee);
        if (fee > 0) _credit(a.token, feeRecipient, fee);
        emit MilestoneReleased(id, index, m.amount - fee, fee);
    }

    function _refundToClient(uint256 id, uint256 index, Agreement storage a, Milestone storage m) private {
        m.phase = Phase.Refunded;
        m.providerBps = 0;
        m.closedAt = uint64(block.timestamp);
        delete offers[id][index];
        _close(id, a);
        _send(a.token, a.client, m.amount);
        emit MilestoneRefunded(id, index, m.amount);
    }

    function _resolve(
        uint256 id,
        uint256 index,
        Agreement storage a,
        Milestone storage m,
        uint16 providerBps,
        bool byRuling
    ) private {
        m.phase = Phase.Resolved;
        m.providerBps = providerBps;
        m.closedAt = uint64(block.timestamp);
        delete offers[id][index];

        uint256 gross = uint256(m.amount) * providerBps / BPS;
        uint256 toClient = m.amount - gross;
        uint256 fee = _fee(gross);
        uint256 toProvider = gross - fee;

        if (byRuling) {
            if (providerBps >= BPS / 2) records[a.provider].favorableRulings++;
            if (providerBps <= BPS / 2) records[a.client].favorableRulings++;
        }
        _close(id, a);
        _send(a.token, a.provider, toProvider);
        _send(a.token, a.client, toClient);
        if (fee > 0) _credit(a.token, feeRecipient, fee);
        emit MilestoneResolved(id, index, providerBps, toProvider, toClient);
    }

    function _file(uint256 id, uint256 index, string calldata cid) private {
        Evidence[] storage filings = _evidence[id][index];
        uint256 mine;
        for (uint256 i; i < filings.length; ++i) {
            if (filings[i].by == msg.sender) ++mine;
        }
        if (mine >= MAX_FILINGS_PER_PARTY) revert TooManyFilings();
        filings.push(Evidence({by: msg.sender, at: uint64(block.timestamp), cid: cid}));
        emit EvidenceSubmitted(id, index, msg.sender, cid);
    }

    function _close(uint256 id, Agreement storage a) private {
        if (--a.openMilestones == 0) {
            a.status = Status.Closed;
            records[a.client].completed++;
            records[a.provider].completed++;
            emit AgreementClosed(id);
        }
    }

    /// @dev Push the payment; if the receiver cannot take it, credit it for {withdraw} instead of
    ///      letting one bad receiver lock the counterparty's funds.
    function _send(address token, address to, uint256 amount) private {
        if (amount == 0) return;
        bool ok;
        if (token == address(0)) {
            (ok,) = to.call{value: amount}("");
        } else {
            bytes memory ret;
            (ok, ret) = token.call(abi.encodeCall(IERC20.transfer, (to, amount)));
            ok = ok && (ret.length == 0 || abi.decode(ret, (bool)));
        }
        if (!ok) _credit(token, to, amount);
    }

    function _credit(address token, address to, uint256 amount) private {
        owed[token][to] += amount;
        emit Credited(token, to, amount);
    }

    function _fee(uint256 amount) private view returns (uint256) {
        return amount * feeBps / BPS;
    }

    function _setFee(uint16 feeBps_, address feeRecipient_) private {
        if (feeBps_ > MAX_FEE_BPS || (feeBps_ > 0 && feeRecipient_ == address(0))) revert InvalidParams();
        feeBps = feeBps_;
        feeRecipient = feeRecipient_;
        emit FeeUpdated(feeBps_, feeRecipient_);
    }

    function _sum(uint128[] calldata amounts) private pure returns (uint256 total) {
        for (uint256 i; i < amounts.length; ++i) {
            total += amounts[i];
        }
    }

    function _evidenceClosed(Agreement storage a, Milestone storage m) private view returns (bool) {
        return m.evidence == (CLIENT_FILED | PROVIDER_FILED)
            || block.timestamp >= uint256(m.disputedAt) + a.responseWindow;
    }

    function _requireOpen(Milestone storage m) private view {
        if (m.phase >= Phase.Released) revert WrongPhase();
    }

    function _role(Agreement storage a) private view returns (uint8) {
        if (msg.sender == a.client) return CLIENT_FILED;
        if (msg.sender == a.provider) return PROVIDER_FILED;
        revert NotParty();
    }

    function _agreement(uint256 id) private view returns (Agreement storage a) {
        a = _agreements[id];
        if (a.client == address(0)) revert UnknownAgreement();
    }

    function _active(uint256 id, uint256 index) private view returns (Agreement storage a, Milestone storage m) {
        a = _agreement(id);
        if (a.status != Status.Active) revert WrongStatus();
        if (index >= _milestones[id].length) revert BadMilestone();
        m = _milestones[id][index];
    }
}
