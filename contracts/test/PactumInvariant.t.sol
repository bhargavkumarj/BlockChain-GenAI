// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Harness, Vm} from "./utils/Harness.sol";
import {Pactum} from "../src/Pactum.sol";
import {TestUSD} from "../src/TestUSD.sol";

/// @dev Drives Pactum through random sequences of real user actions. Every call is made by the actor
///      allowed to make it, so the fuzzer explores deep states instead of bouncing off access checks.
contract Handler {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    Pactum public immutable pactum;
    TestUSD public immutable usd;
    address public immutable client;
    address public immutable provider;
    address public immutable treasury;
    uint256 internal immutable arbiterKey;
    address internal immutable arbiter;

    uint256 public calls;

    constructor(
        Pactum pactum_,
        TestUSD usd_,
        address client_,
        address provider_,
        address treasury_,
        uint256 key
    ) {
        pactum = pactum_;
        usd = usd_;
        client = client_;
        provider = provider_;
        treasury = treasury_;
        arbiterKey = key;
        arbiter = vm.addr(key);
    }

    function create(uint8 count, uint64 seed) external {
        uint256 n = 1 + (uint256(count) % 3);
        uint128[] memory amounts = new uint128[](n);
        uint64[] memory due = new uint64[](n);
        for (uint256 i; i < n; ++i) {
            amounts[i] = uint128(1 + (uint256(keccak256(abi.encode(seed, i))) % 50e6));
            due[i] = uint64(block.timestamp + 1 days * (i + 1));
        }
        try usd.faucet(client) {} catch {} // top up whenever the cooldown allows
        vm.prank(client);
        pactum.create(
            Pactum.CreateParams({
                provider: provider,
                token: address(usd),
                arbiter: arbiter,
                appealCourt: address(0),
                reviewPeriod: 1 days,
                responseWindow: 1 days,
                appealWindow: 0,
                termsCID: "terms",
                amounts: amounts,
                dueBy: due
            })
        );
        calls++;
    }

    function accept(uint256 seed) external {
        uint256 id = _id(seed);
        vm.prank(provider);
        pactum.accept(id);
        calls++;
    }

    function cancel(uint256 seed, bool byProvider) external {
        uint256 id = _id(seed);
        vm.prank(byProvider ? provider : client);
        pactum.cancel(id);
        calls++;
    }

    function deliver(uint256 seed, uint256 index) external {
        uint256 id = _id(seed);
        vm.prank(provider);
        pactum.deliver(id, index % 3, "delivery");
        calls++;
    }

    function release(uint256 seed, uint256 index) external {
        uint256 id = _id(seed);
        vm.prank(client);
        pactum.release(id, index % 3);
        calls++;
    }

    function claim(uint256 seed, uint256 index) external {
        uint256 id = _id(seed);
        vm.prank(provider);
        pactum.claim(id, index % 3);
        calls++;
    }

    function reclaim(uint256 seed, uint256 index) external {
        uint256 id = _id(seed);
        vm.prank(client);
        pactum.reclaim(id, index % 3);
        calls++;
    }

    function dispute(uint256 seed, uint256 index, bool byProvider) external {
        uint256 id = _id(seed);
        vm.prank(byProvider ? provider : client);
        pactum.dispute(id, index % 3, "statement");
        calls++;
    }

    function respond(uint256 seed, uint256 index, bool byProvider) external {
        uint256 id = _id(seed);
        vm.prank(byProvider ? provider : client);
        pactum.submitEvidence(id, index % 3, "evidence");
        calls++;
    }

    function rule(uint256 seed, uint256 index, uint16 bps) external {
        uint256 id = _id(seed);
        index %= 3;
        bps = uint16(bps % 10_001);
        (, Pactum.Milestone[] memory ms) = pactum.getAgreement(id);
        if (index >= ms.length) return;
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 digest = pactum.rulingDigest(id, index, bps, "ruling", ms[index].disputedAt, deadline);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(arbiterKey, digest);
        pactum.rule(id, index, bps, "ruling", deadline, abi.encodePacked(r, s, v));
        calls++;
    }

    function settle(uint256 seed, uint256 index, uint16 bps, bool providerOffers) external {
        uint256 id = _id(seed);
        index %= 3;
        bps = uint16(bps % 10_001);
        vm.prank(providerOffers ? provider : client);
        pactum.offerSettlement(id, index, bps);
        vm.prank(providerOffers ? client : provider);
        pactum.acceptSettlement(id, index, bps);
        calls++;
    }

    function wait(uint32 secondsAhead) external {
        vm.warp(block.timestamp + (secondsAhead % 3 days));
    }

    function _id(uint256 seed) internal view returns (uint256) {
        uint256 count = pactum.agreementCount();
        return count == 0 ? 1 : 1 + (seed % count);
    }
}

contract PactumInvariantTest is Harness {
    Pactum internal pactum;
    TestUSD internal usd;
    Handler internal handler;
    address internal treasury = address(0x7EA5);

    function setUp() public {
        vm.warp(1_750_000_000);
        pactum = new Pactum(address(this), 150, treasury);
        usd = new TestUSD();
        address client = vm.addr(0xC1);
        address provider = vm.addr(0xB2);
        handler = new Handler(pactum, usd, client, provider, treasury, 0xA3);
        // Pre-fund the client with 40 faucet drips so balance never limits exploration.
        for (uint256 i; i < 40; ++i) {
            usd.faucet(client);
            vm.warp(block.timestamp + 1 hours);
        }
        vm.prank(client);
        usd.approve(address(pactum), type(uint256).max);
        targetContract(address(handler));
    }

    /// @notice Solvency: the escrow holds exactly the open milestones plus accrued fees — never less, never more.
    function invariant_EscrowIsExactlyBacked() public view {
        uint256 open;
        uint256 count = pactum.agreementCount();
        for (uint256 id = 1; id <= count; ++id) {
            (Pactum.Agreement memory a, Pactum.Milestone[] memory ms) = pactum.getAgreement(id);
            uint256 live;
            for (uint256 i; i < ms.length; ++i) {
                if (ms[i].phase < Pactum.Phase.Released) {
                    open += ms[i].amount;
                    live++;
                }
            }
            vm.assertEq(live, uint256(a.openMilestones), "open milestone counter in sync");
            if (a.status == Pactum.Status.Closed || a.status == Pactum.Status.Cancelled) {
                vm.assertEq(live, 0, "terminal agreements hold nothing");
            }
        }
        vm.assertEq(
            usd.balanceOf(address(pactum)),
            open + pactum.owed(address(usd), treasury),
            "escrow exactly backed"
        );
    }

    /// @notice Every executed split stays within bounds.
    function invariant_SharesAreBounded() public view {
        uint256 count = pactum.agreementCount();
        for (uint256 id = 1; id <= count; ++id) {
            (, Pactum.Milestone[] memory ms) = pactum.getAgreement(id);
            for (uint256 i; i < ms.length; ++i) {
                vm.assertLe(ms[i].providerBps, 10_000, "bps <= 100%");
            }
        }
    }
}
