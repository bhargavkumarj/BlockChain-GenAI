// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Harness} from "./utils/Harness.sol";
import {Pactum} from "../src/Pactum.sol";
import {TestUSD} from "../src/TestUSD.sol";
import {IERC1271} from "@openzeppelin/contracts/interfaces/IERC1271.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @dev Receiver that can be switched between accepting and rejecting ETH, to exercise the pull fallback.
contract FlakyReceiver {
    bool public accepting;
    Pactum public immutable pactum;

    constructor(Pactum pactum_) {
        pactum = pactum_;
    }

    function setAccepting(bool on) external {
        accepting = on;
    }

    function accept(uint256 id) external {
        pactum.accept(id);
    }

    function deliver(uint256 id, uint256 index, string calldata cid) external {
        pactum.deliver(id, index, cid);
    }

    function withdraw() external {
        pactum.withdraw(address(0));
    }

    receive() external payable {
        require(accepting, "closed");
    }
}

/// @dev Provider that tries to re-enter Pactum when it is paid.
contract ReentrantProvider {
    Pactum public immutable pactum;
    uint256 public targetId;

    constructor(Pactum pactum_) {
        pactum = pactum_;
    }

    function prime(uint256 id) external {
        targetId = id;
        pactum.accept(id);
        pactum.deliver(id, 0, "ipfs://delivery");
        pactum.deliver(id, 1, "ipfs://delivery");
    }

    receive() external payable {
        // Attempt to grab the second milestone while the first payout is in flight.
        pactum.claim(targetId, 1);
    }
}

/// @dev ERC-1271 arbiter (e.g. a multisig or smart account) that approves digests signed by its owner key.
contract ContractArbiter is IERC1271 {
    address public immutable signer;

    constructor(address signer_) {
        signer = signer_;
    }

    function isValidSignature(bytes32 hash, bytes memory signature) external view returns (bytes4) {
        return ECDSA.recover(hash, signature) == signer ? IERC1271.isValidSignature.selector : bytes4(0);
    }
}

contract PactumTest is Harness {
    Pactum internal pactum;
    TestUSD internal usd;

    uint256 internal constant CLIENT_KEY = 0xC11E47;
    uint256 internal constant PROVIDER_KEY = 0xB0B;
    uint256 internal constant ARBITER_KEY = 0xA4B1;
    uint256 internal constant ROGUE_KEY = 0xBAD;

    address internal client;
    address internal provider;
    address internal arbiter;
    address internal court = address(0xC0DE);
    address internal treasury = address(0x7EA5);
    address internal owner = address(0x0A);
    address internal stranger = address(0x5757);

    uint16 internal constant FEE_BPS = 100; // 1%
    uint32 internal constant REVIEW = 3 days;
    uint32 internal constant RESPONSE = 2 days;
    uint32 internal constant APPEAL = 1 days;

    function setUp() public {
        client = makeAddr("client", CLIENT_KEY);
        provider = makeAddr("provider", PROVIDER_KEY);
        arbiter = makeAddr("arbiter", ARBITER_KEY);
        vm.warp(1_750_000_000);

        pactum = new Pactum(owner, FEE_BPS, treasury);
        usd = new TestUSD();
        usd.faucet(client);
        vm.prank(client);
        usd.approve(address(pactum), type(uint256).max);
        vm.deal(client, 100 ether);
    }

    // ───────────────────────────────────────────────────────── helpers

    function _params(uint128[] memory amounts, bool appeals)
        internal
        view
        returns (Pactum.CreateParams memory p)
    {
        uint64[] memory due = new uint64[](amounts.length);
        for (uint256 i; i < amounts.length; ++i) {
            due[i] = uint64(block.timestamp + (i + 1) * 7 days);
        }
        p = Pactum.CreateParams({
            provider: provider,
            token: address(usd),
            arbiter: arbiter,
            appealCourt: appeals ? court : address(0),
            reviewPeriod: REVIEW,
            responseWindow: RESPONSE,
            appealWindow: appeals ? APPEAL : 0,
            termsCID: "bafyterms",
            amounts: amounts,
            dueBy: due
        });
    }

    function _two() internal pure returns (uint128[] memory amounts) {
        amounts = new uint128[](2);
        amounts[0] = 300e6;
        amounts[1] = 700e6;
    }

    function _one(uint128 amount) internal pure returns (uint128[] memory amounts) {
        amounts = new uint128[](1);
        amounts[0] = amount;
    }

    function _create(uint128[] memory amounts, bool appeals) internal returns (uint256 id) {
        vm.prank(client);
        id = pactum.create(_params(amounts, appeals));
    }

    function _active(uint128[] memory amounts, bool appeals) internal returns (uint256 id) {
        id = _create(amounts, appeals);
        vm.prank(provider);
        pactum.accept(id);
    }

    function _milestone(uint256 id, uint256 index) internal view returns (Pactum.Milestone memory) {
        (, Pactum.Milestone[] memory ms) = pactum.getAgreement(id);
        return ms[index];
    }

    function _agreement(uint256 id) internal view returns (Pactum.Agreement memory a) {
        (a,) = pactum.getAgreement(id);
    }

    function _sign(uint256 key, uint256 id, uint256 index, uint16 bps, string memory cid, uint256 deadline)
        internal
        view
        returns (bytes memory)
    {
        uint64 disputedAt = _milestone(id, index).disputedAt;
        bytes32 digest = pactum.rulingDigest(id, index, bps, cid, disputedAt, deadline);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    function _disputeBothFiled(uint256 id, uint256 index) internal {
        vm.prank(provider);
        pactum.deliver(id, index, "bafydelivery");
        vm.prank(client);
        pactum.dispute(id, index, "bafyclaim");
        vm.prank(provider);
        pactum.submitEvidence(id, index, "bafydefense");
    }

    function _rule(uint256 id, uint256 index, uint16 bps) internal {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(ARBITER_KEY, id, index, bps, "bafyruling", deadline);
        vm.prank(stranger); // anyone can relay a signed ruling
        pactum.rule(id, index, bps, "bafyruling", deadline, sig);
    }

    // ───────────────────────────────────────────────────────── creation

    function test_CreateEscrowsTokenFunds() public {
        uint256 id = _create(_two(), false);

        vm.assertEq(id, 1, "first id");
        vm.assertEq(pactum.agreementCount(), 1, "count");
        vm.assertEq(usd.balanceOf(address(pactum)), 1_000e6, "escrowed");
        vm.assertEq(usd.balanceOf(client), 0, "client debited");

        Pactum.Agreement memory a = _agreement(id);
        vm.assertEq(a.client, client, "client");
        vm.assertEq(a.provider, provider, "provider");
        vm.assertEq(a.total, 1_000e6, "total");
        vm.assertEq(uint256(a.openMilestones), 2, "open");
        vm.assertEq(uint256(a.status), uint256(Pactum.Status.Proposed), "status");
        vm.assertEq(a.termsCID, "bafyterms", "terms");

        vm.assertEq(pactum.agreementsOf(client)[0], id, "indexed for client");
        vm.assertEq(pactum.agreementsOf(provider)[0], id, "indexed for provider");
        (uint32 asClient,,,,,) = pactum.records(client);
        vm.assertEq(uint256(asClient), 1, "client record");
    }

    function test_CreateWithNativeETH() public {
        Pactum.CreateParams memory p = _params(_one(1 ether), false);
        p.token = address(0);
        vm.prank(client);
        uint256 id = pactum.create{value: 1 ether}(p);
        vm.assertEq(address(pactum).balance, 1 ether, "eth escrowed");
        vm.assertEq(_agreement(id).token, address(0), "eth agreement");
    }

    function test_CreateWithPermitInOneTransaction() public {
        uint256 key = 0xFEED;
        address payer = vm.addr(key);
        usd.faucet(payer);
        Pactum.CreateParams memory p = _params(_one(250e6), false);

        uint256 deadline = block.timestamp + 1 hours;
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256(
                    "Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"
                ),
                payer,
                address(pactum),
                uint256(250e6),
                usd.nonces(payer),
                deadline
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", usd.DOMAIN_SEPARATOR(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);

        vm.prank(payer);
        uint256 id = pactum.createWithPermit(p, deadline, v, r, s);
        vm.assertEq(_agreement(id).client, payer, "payer is client");
        vm.assertEq(usd.balanceOf(address(pactum)), 250e6, "escrowed via permit");
    }

    function test_RevertWhen_CreateParamsInvalid() public {
        Pactum.CreateParams memory p = _params(_two(), false);

        p.provider = client;
        vm.prank(client);
        vm.expectRevert(Pactum.InvalidParams.selector);
        pactum.create(p);

        p = _params(_two(), false);
        p.arbiter = address(0);
        vm.prank(client);
        vm.expectRevert(Pactum.InvalidParams.selector);
        pactum.create(p);

        p = _params(_two(), false);
        p.dueBy = new uint64[](1);
        vm.prank(client);
        vm.expectRevert(Pactum.InvalidParams.selector);
        pactum.create(p);

        p = _params(_two(), false);
        p.appealWindow = 1 days; // window without a court
        vm.prank(client);
        vm.expectRevert(Pactum.InvalidParams.selector);
        pactum.create(p);

        p = _params(_one(0), false);
        vm.prank(client);
        vm.expectRevert(Pactum.InvalidParams.selector);
        pactum.create(p);

        p = _params(_one(1 ether), false);
        p.token = address(0);
        vm.prank(client);
        vm.expectRevert(Pactum.WrongValue.selector);
        pactum.create{value: 0.5 ether}(p);
    }

    // ───────────────────────────────────────────────────────── happy paths

    function test_CancelBeforeAcceptanceRefundsEverything() public {
        uint256 id = _create(_two(), false);
        vm.prank(client);
        pactum.cancel(id);
        vm.assertEq(usd.balanceOf(client), 1_000e6, "refunded");
        vm.assertEq(uint256(_agreement(id).status), uint256(Pactum.Status.Cancelled), "cancelled");

        vm.prank(provider);
        vm.expectRevert(Pactum.WrongStatus.selector);
        pactum.accept(id);
    }

    function test_ProviderCanDecline() public {
        uint256 id = _create(_two(), false);
        vm.prank(provider);
        pactum.cancel(id);
        vm.assertEq(usd.balanceOf(client), 1_000e6, "refunded on decline");
    }

    function test_DeliverAndReleaseEachMilestone() public {
        uint256 id = _active(_two(), false);

        vm.prank(provider);
        pactum.deliver(id, 0, "bafyd0");
        vm.prank(client);
        pactum.release(id, 0);

        vm.assertEq(usd.balanceOf(provider), 297e6, "paid minus 1% fee");
        vm.assertEq(pactum.owed(address(usd), treasury), 3e6, "fee accrued");
        vm.assertEq(uint256(_agreement(id).status), uint256(Pactum.Status.Active), "still active");

        vm.prank(provider);
        pactum.deliver(id, 1, "bafyd1");
        vm.prank(client);
        pactum.release(id, 1);

        vm.assertEq(usd.balanceOf(provider), 990e6, "both paid");
        vm.assertEq(uint256(_agreement(id).status), uint256(Pactum.Status.Closed), "closed");
        vm.assertEq(usd.balanceOf(address(pactum)), 10e6, "only fees remain");

        (,, uint32 completed, uint32 paid,,) = pactum.records(provider);
        vm.assertEq(uint256(completed), 1, "provider completed");
        vm.assertEq(uint256(paid), 2, "milestones paid");

        vm.prank(treasury);
        pactum.withdraw(address(usd));
        vm.assertEq(usd.balanceOf(treasury), 10e6, "fees withdrawn");
    }

    function test_ProviderClaimsAfterReviewPeriodLapses() public {
        uint256 id = _active(_two(), false);
        vm.prank(provider);
        pactum.deliver(id, 0, "bafyd0");

        vm.warp(block.timestamp + REVIEW - 1);
        vm.prank(provider);
        vm.expectRevert(Pactum.TooEarly.selector);
        pactum.claim(id, 0);

        vm.warp(block.timestamp + 1);
        vm.prank(provider);
        pactum.claim(id, 0);
        vm.assertEq(usd.balanceOf(provider), 297e6, "auto-released");
    }

    function test_ClientReclaimsMissedDeadline() public {
        uint256 id = _active(_two(), false);
        uint64 due = _milestone(id, 0).dueBy;

        vm.warp(due);
        vm.prank(client);
        vm.expectRevert(Pactum.TooEarly.selector);
        pactum.reclaim(id, 0);

        vm.warp(uint256(due) + 1);
        vm.prank(client);
        pactum.reclaim(id, 0);
        vm.assertEq(usd.balanceOf(client), 300e6, "refunded");
        vm.assertEq(uint256(_milestone(id, 0).phase), uint256(Pactum.Phase.Refunded), "phase");
    }

    function test_RevertWhen_StrangerActs() public {
        uint256 id = _active(_two(), false);
        vm.prank(stranger);
        vm.expectRevert(Pactum.NotProvider.selector);
        pactum.deliver(id, 0, "x");
        vm.prank(stranger);
        vm.expectRevert(Pactum.NotClient.selector);
        pactum.release(id, 0);
        vm.prank(stranger);
        vm.expectRevert(Pactum.NotParty.selector);
        pactum.dispute(id, 0, "x");
        vm.prank(provider);
        vm.expectRevert(Pactum.BadMilestone.selector);
        pactum.deliver(id, 9, "x");
    }

    // ───────────────────────────────────────────────────────── disputes

    function test_TribunalRulingSplitsMilestone() public {
        uint256 id = _active(_two(), false);
        _disputeBothFiled(id, 1);

        vm.assertTrue(pactum.canRule(id, 1), "evidence closed once both filed");
        _rule(id, 1, 6_000); // 60% to provider

        // 700 * 60% = 420 gross, 1% fee = 4.2, provider nets 415.8; client gets 280.
        vm.assertEq(usd.balanceOf(provider), 415_800_000, "provider share net of fee");
        vm.assertEq(usd.balanceOf(client), 280e6, "client share");
        vm.assertEq(pactum.owed(address(usd), treasury), 4_200_000, "fee");

        Pactum.Milestone memory m = _milestone(id, 1);
        vm.assertEq(uint256(m.phase), uint256(Pactum.Phase.Resolved), "resolved");
        vm.assertEq(uint256(m.providerBps), 6_000, "bps stored");
        vm.assertEq(m.rulingCID, "bafyruling", "ruling cid stored");

        (,,,, uint32 disputes, uint32 favorable) = pactum.records(provider);
        vm.assertEq(uint256(disputes), 1, "dispute counted");
        vm.assertEq(uint256(favorable), 1, "provider won majority");
        (,,,,, uint32 clientFavorable) = pactum.records(client);
        vm.assertEq(uint256(clientFavorable), 0, "client lost");
    }

    function test_CaseRecordLivesInState() public {
        uint256 id = _active(_two(), false);
        vm.assertEq(uint256(_agreement(id).acceptedAt), block.timestamp, "accepted at");
        _disputeBothFiled(id, 0);
        vm.warp(block.timestamp + 60);
        vm.prank(client);
        pactum.submitEvidence(id, 0, "bafyrebuttal");

        Pactum.Evidence[] memory filings = pactum.getEvidence(id, 0);
        vm.assertEq(filings.length, 3, "three filings");
        vm.assertEq(filings[0].by, client, "claim by client");
        vm.assertEq(filings[0].cid, "bafyclaim", "claim cid");
        vm.assertEq(filings[1].by, provider, "defense by provider");
        vm.assertEq(filings[2].cid, "bafyrebuttal", "rebuttal cid");
        vm.assertEq(uint256(filings[2].at), block.timestamp, "timestamped");

        _rule(id, 0, 5_000);
        vm.assertEq(uint256(_milestone(id, 0).closedAt), block.timestamp, "closed at");
    }

    function test_EvidenceCapIsPerParty() public {
        uint256 id = _active(_two(), false);
        _disputeBothFiled(id, 0); // one filing each
        for (uint256 i; i < 7; ++i) {
            vm.prank(provider);
            pactum.submitEvidence(id, 0, "bafyspam");
        }
        vm.prank(provider);
        vm.expectRevert(Pactum.TooManyFilings.selector);
        pactum.submitEvidence(id, 0, "bafyonetoomany");

        // The spammer's cap does not silence the other side.
        vm.prank(client);
        pactum.submitEvidence(id, 0, "bafyrebuttal");
        vm.assertEq(pactum.getEvidence(id, 0).length, 10, "client still heard");
    }

    function test_RulingWaitsForDueProcess() public {
        uint256 id = _active(_two(), false);
        vm.prank(provider);
        pactum.deliver(id, 0, "bafyd0");
        vm.prank(client);
        pactum.dispute(id, 0, "bafyclaim");

        vm.assertFalse(pactum.canRule(id, 0), "respondent has not filed");
        uint256 deadline = block.timestamp + 10 days;
        bytes memory sig = _sign(ARBITER_KEY, id, 0, 0, "bafyruling", deadline);
        vm.expectRevert(Pactum.TooEarly.selector);
        pactum.rule(id, 0, 0, "bafyruling", deadline, sig);

        vm.warp(block.timestamp + RESPONSE); // respondent stayed silent
        pactum.rule(id, 0, 0, "bafyruling", deadline, sig);
        vm.assertEq(usd.balanceOf(client), 300e6, "full refund by ruling");
    }

    function test_RevertWhen_RulingNotSignedByArbiter() public {
        uint256 id = _active(_two(), false);
        _disputeBothFiled(id, 0);
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(ROGUE_KEY, id, 0, 10_000, "bafyruling", deadline);
        vm.expectRevert(Pactum.InvalidSignature.selector);
        pactum.rule(id, 0, 10_000, "bafyruling", deadline, sig);
    }

    function test_RevertWhen_RulingTampered() public {
        uint256 id = _active(_two(), false);
        _disputeBothFiled(id, 0);
        _disputeBothFiled(id, 1);
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(ARBITER_KEY, id, 0, 2_000, "bafyruling", deadline);

        vm.expectRevert(Pactum.InvalidSignature.selector); // different split
        pactum.rule(id, 0, 9_000, "bafyruling", deadline, sig);
        vm.expectRevert(Pactum.InvalidSignature.selector); // different reasoning document
        pactum.rule(id, 0, 2_000, "bafyforged", deadline, sig);
        vm.expectRevert(Pactum.InvalidSignature.selector); // replayed on another milestone
        pactum.rule(id, 1, 2_000, "bafyruling", deadline, sig);

        vm.warp(deadline + 1);
        vm.expectRevert(Pactum.SignatureExpired.selector);
        pactum.rule(id, 0, 2_000, "bafyruling", deadline, sig);
    }

    function test_ContractArbiterViaERC1271() public {
        ContractArbiter multisig = new ContractArbiter(arbiter);
        Pactum.CreateParams memory p = _params(_two(), false);
        p.arbiter = address(multisig);
        vm.prank(client);
        uint256 id = pactum.create(p);
        vm.prank(provider);
        pactum.accept(id);
        _disputeBothFiled(id, 0);
        _rule(id, 0, 10_000);
        vm.assertEq(usd.balanceOf(provider), 297e6, "ERC-1271 ruling executed");
    }

    function test_ClientCannotDisputeAfterReviewPeriod() public {
        uint256 id = _active(_two(), false);
        vm.prank(provider);
        pactum.deliver(id, 0, "bafyd0");
        vm.warp(block.timestamp + REVIEW);
        vm.prank(client);
        vm.expectRevert(Pactum.TooLate.selector);
        pactum.dispute(id, 0, "bafylate");
    }

    function test_ConcessionDuringDispute() public {
        uint256 id = _active(_two(), false);
        _disputeBothFiled(id, 0);
        vm.prank(client);
        pactum.release(id, 0);
        vm.assertEq(usd.balanceOf(provider), 297e6, "client conceded");

        _disputeBothFiled(id, 1);
        vm.prank(provider);
        pactum.refund(id, 1);
        vm.assertEq(usd.balanceOf(client), 700e6, "provider conceded");
        vm.assertEq(uint256(_agreement(id).status), uint256(Pactum.Status.Closed), "closed");
    }

    // ───────────────────────────────────────────────────────── appeals

    function test_AppealToHumanCourt() public {
        vm.prank(owner);
        pactum.setAppealFee(0.01 ether);
        uint256 id = _active(_two(), true);
        _disputeBothFiled(id, 0);
        _rule(id, 0, 0);
        vm.assertEq(uint256(_milestone(id, 0).phase), uint256(Pactum.Phase.Ruled), "awaiting appeal window");

        vm.deal(provider, 1 ether);
        vm.prank(provider);
        vm.expectRevert(Pactum.WrongValue.selector);
        pactum.appeal(id, 0);
        vm.prank(provider);
        pactum.appeal{value: 0.01 ether}(id, 0);
        vm.assertEq(pactum.owed(address(0), court), 0.01 ether, "appeal fee to court");

        vm.prank(stranger);
        vm.expectRevert(Pactum.NotAppealCourt.selector);
        pactum.resolveAppeal(id, 0, 5_000, "bafyappeal");

        vm.prank(court);
        pactum.resolveAppeal(id, 0, 5_000, "bafyappeal");
        vm.assertEq(usd.balanceOf(client), 150e6, "half back to client");
        vm.assertEq(usd.balanceOf(provider), 148_500_000, "half to provider net of fee");
        vm.assertEq(_milestone(id, 0).rulingCID, "bafyappeal", "appeal reasoning replaces ruling");
    }

    function test_FinalizeAfterAppealWindow() public {
        uint256 id = _active(_two(), true);
        _disputeBothFiled(id, 0);
        _rule(id, 0, 10_000);

        vm.expectRevert(Pactum.TooEarly.selector);
        pactum.finalize(id, 0);

        vm.warp(block.timestamp + APPEAL);
        vm.prank(client);
        vm.expectRevert(Pactum.TooLate.selector);
        pactum.appeal(id, 0);

        pactum.finalize(id, 0);
        vm.assertEq(usd.balanceOf(provider), 297e6, "ruling executed");
    }

    // ───────────────────────────────────────────────────────── settlements

    function test_MutualSettlement() public {
        uint256 id = _active(_two(), false);
        _disputeBothFiled(id, 1);

        vm.prank(provider);
        pactum.offerSettlement(id, 1, 5_000);
        (address by, uint16 bps) = pactum.offers(id, 1);
        vm.assertEq(by, provider, "offer by");
        vm.assertEq(uint256(bps), 5_000, "offer bps");

        vm.prank(provider);
        vm.expectRevert(Pactum.NoOffer.selector); // cannot accept own offer
        pactum.acceptSettlement(id, 1, 5_000);
        vm.prank(client);
        vm.expectRevert(Pactum.NoOffer.selector); // must match the live offer exactly
        pactum.acceptSettlement(id, 1, 4_000);

        vm.prank(client);
        pactum.acceptSettlement(id, 1, 5_000);
        vm.assertEq(usd.balanceOf(client), 350e6, "half refunded");
        vm.assertEq(usd.balanceOf(provider), 346_500_000, "half paid net of fee");
        (by,) = pactum.offers(id, 1);
        vm.assertEq(by, address(0), "offer cleared");
        (,,,,, uint32 favorable) = pactum.records(provider);
        vm.assertEq(uint256(favorable), 0, "settlements are not rulings");
    }

    // ───────────────────────────────────────────────────────── payment safety

    function test_FailedPushIsCreditedForWithdrawal() public {
        FlakyReceiver flaky = new FlakyReceiver(pactum);
        Pactum.CreateParams memory p = _params(_one(1 ether), false);
        p.token = address(0);
        p.provider = address(flaky);
        vm.prank(client);
        uint256 id = pactum.create{value: 1 ether}(p);
        flaky.accept(id);
        flaky.deliver(id, 0, "bafyd0");

        vm.prank(client);
        pactum.release(id, 0); // must not revert even though the receiver rejects ETH
        vm.assertEq(pactum.owed(address(0), address(flaky)), 0.99 ether, "credited");

        flaky.setAccepting(true);
        flaky.withdraw();
        vm.assertEq(address(flaky).balance, 0.99 ether, "withdrawn");
    }

    function test_ReentrancyIsContained() public {
        ReentrantProvider attacker = new ReentrantProvider(pactum);
        Pactum.CreateParams memory p = _params(_two(), false);
        p.token = address(0);
        p.provider = address(attacker);
        vm.prank(client);
        uint256 id = pactum.create{value: 1_000e6}(p);
        attacker.prime(id);

        vm.warp(block.timestamp + REVIEW);
        vm.prank(client);
        pactum.release(id, 0);

        // The re-entrant claim reverted inside receive(), so the push failed and was credited instead.
        vm.assertEq(address(attacker).balance, 0, "no double payout");
        vm.assertEq(pactum.owed(address(0), address(attacker)), 297e6, "credited once");
        vm.assertEq(uint256(_milestone(id, 1).phase), uint256(Pactum.Phase.Delivered), "second untouched");
    }

    // ───────────────────────────────────────────────────────── admin

    function test_OnlyOwnerSetsCappedFee() public {
        vm.prank(stranger);
        vm.expectRevert();
        pactum.setFee(50, treasury);

        vm.prank(owner);
        vm.expectRevert(Pactum.InvalidParams.selector);
        pactum.setFee(301, treasury);

        vm.prank(owner);
        pactum.setFee(0, address(0));
        vm.assertEq(uint256(pactum.feeBps()), 0, "fee off");
    }

    // ───────────────────────────────────────────────────────── fuzz

    /// @dev Whatever the split, every unit of the milestone ends up with the provider, client or treasury.
    function testFuzz_RulingConservesFunds(uint128 amount, uint16 bps) public {
        amount = uint128(bound(amount, 1, 1_000e6));
        bps = uint16(bound(bps, 0, 10_000));
        uint256 id = _active(_one(amount), false);
        _disputeBothFiled(id, 0);
        _rule(id, 0, bps);

        uint256 total = usd.balanceOf(provider) + usd.balanceOf(client) - (1_000e6 - amount)
            + pactum.owed(address(usd), treasury);
        vm.assertEq(total, amount, "conserved");
        vm.assertEq(usd.balanceOf(address(pactum)), pactum.owed(address(usd), treasury), "nothing stranded");
    }

    function testFuzz_CreateManyMilestones(uint8 count, uint64 seed) public {
        uint256 n = bound(count, 1, 20);
        uint128[] memory amounts = new uint128[](n);
        uint256 sum;
        for (uint256 i; i < n; ++i) {
            amounts[i] = uint128(bound(uint256(keccak256(abi.encode(seed, i))), 1, 40e6));
            sum += amounts[i];
        }
        uint256 id = _create(amounts, false);
        (Pactum.Agreement memory a, Pactum.Milestone[] memory ms) = pactum.getAgreement(id);
        vm.assertEq(a.total, sum, "total");
        vm.assertEq(ms.length, n, "milestones");
        vm.assertEq(usd.balanceOf(address(pactum)), sum, "escrowed");
    }
}
