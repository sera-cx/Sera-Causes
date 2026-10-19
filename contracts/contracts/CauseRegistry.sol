// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity ^0.8.24;

/// @title Sera Causes: shared cause registry (v1.1)
/// @notice One list of causes for every front end that builds on Sera Causes. A cause listed
/// from one front end shows up in all of them. The registry holds no funds: each cause has its
/// own deposit address (`payout`), and gifts go straight to it. What the registry records is
/// who listed what, where gifts should go, which claims about the cause have been verified by
/// the community, and the public record of attestations, progress and help requests.
///
/// Roles:
///  - council:   a multisig. Manages finalisers, stewards and itself.
///  - finaliser: submits recomputable claim outcomes.
///  - steward:   can pause, reinstate and close a cause during phases 0 and 1.
///  - owner:     whoever listed the cause (or was given it). Updates the profile, deposit
///               address, progress and needs. Can close the cause.
///  - anyone:    lists causes, attests, pledges help, reads everything.
contract CauseRegistry {
    // ------------------------------------------------------------------ types

    enum Status {
        None,       // id not used
        Listed,     // anyone listed it; not yet verified
        Verified,   // every required claim is verified
        Suspended,  // a steward paused it or a required claim was overturned; no new activity
        Closed      // the owner or a steward closed it; no new activity
    }

    /// @notice The facts a cause is checked on, one at a time. C1 to C4 are always required.
    /// C6 is required only for causes flagged as needing a care licence. C5 and C7 are badges.
    enum ClaimType {
        C1_Registered,   // the organisation exists and is registered
        C2_Current,      // the registration is current
        C3_Payout,       // the deposit address belongs to the organisation
        C4_WorkReal,     // the work is real and current
        C5_TaxExempt,    // tax-exempt approval (badge)
        C6_CareLicence,  // care licence where the law needs one
        C7_Accounts      // accounts are published (badge)
    }

    enum ClaimOutcome {
        Open,          // nothing final yet
        Verified,
        NotVerified,
        NeedsMore      // reopened for more evidence; not a fail
    }

    struct Cause {
        address owner;         // lister: updates the profile, posts progress and needs
        address payout;        // the cause's deposit address; gifts go here directly
        Status status;
        uint64 listedAt;
        uint64 verifiedAt;
        bytes32 category;      // e.g. "turtles", "children", "relief"
        string uri;            // ipfs://<cid> of the profile JSON
    }

    struct Need {
        uint256 causeId;
        bool open;
        string uri;            // ipfs://<cid> describing what help is needed
    }

    // ------------------------------------------------------------------ storage

    address public council;                                   // multisig
    mapping(address => bool) public isFinaliser;              // submits recomputable results
    mapping(address => bool) public isSteward;                // pause, reinstate, close (phases 0 and 1)

    uint256 public causeCount;
    mapping(uint256 => Cause) private _causes;

    /// causeId => claim => final outcome
    mapping(uint256 => mapping(ClaimType => ClaimOutcome)) public claimOutcome;
    /// causeId => whether C6 (care licence) is required. Set at listing, steward can toggle.
    mapping(uint256 => bool) public requiresCareLicence;

    uint256 public needCount;
    mapping(uint256 => Need) public needs;

    // ------------------------------------------------------------------ events
    // Front ends and the indexer rebuild everything from these.

    event CauseListed(uint256 indexed causeId, address indexed owner, bytes32 indexed category, address payout, string uri, bytes32 frontend);
    event CauseUpdated(uint256 indexed causeId, string uri);
    event PayoutChanged(uint256 indexed causeId, address payout);
    event OwnerChanged(uint256 indexed causeId, address owner);
    event StatusChanged(uint256 indexed causeId, Status status, address indexed by, string note);
    event Attested(uint256 indexed causeId, address indexed attester, bytes32 indexed kind, string uri);
    event ProgressPosted(uint256 indexed causeId, bytes32 indexed kind, string uri);
    event NeedPosted(uint256 indexed needId, uint256 indexed causeId, string uri);
    event Pledged(uint256 indexed needId, address indexed helper, string uri);
    event NeedClosed(uint256 indexed needId, address indexed helper);
    event ClaimFinalised(uint256 indexed causeId, ClaimType indexed claim, ClaimOutcome outcome, bytes32 resultRoot, address by);
    event RequiresCareLicenceSet(uint256 indexed causeId, bool on);
    event FinaliserSet(address indexed who, bool on);
    event StewardSet(address indexed who, bool on);
    event CouncilChanged(address council);

    // ------------------------------------------------------------------ errors

    error NotCouncil();
    error NotFinaliser();
    error NotSteward();
    error NotOwner();
    error NoSuchCause();
    error NoSuchNeed();
    error BadInput();
    error WrongStatus(Status status);

    // ------------------------------------------------------------------ modifiers

    modifier onlyCouncil() {
        if (msg.sender != council) revert NotCouncil();
        _;
    }

    modifier onlyFinaliser() {
        if (!isFinaliser[msg.sender]) revert NotFinaliser();
        _;
    }

    modifier onlySteward() {
        if (!isSteward[msg.sender]) revert NotSteward();
        _;
    }

    modifier onlyCauseOwner(uint256 causeId) {
        if (_causes[causeId].status == Status.None) revert NoSuchCause();
        if (_causes[causeId].owner != msg.sender) revert NotOwner();
        _;
    }

    constructor(address council_) {
        if (council_ == address(0)) revert BadInput();
        council = council_;
        emit CouncilChanged(council_);
    }

    // ------------------------------------------------------------------ causes

    /// @notice List a cause. Anyone can. It starts as Listed.
    /// @param payout The cause's deposit address. Gifts are sent straight to it.
    /// @param frontend Which front end the listing came from, e.g. "causes.sera.cx".
    /// @param needsCareLicence True for children's homes and elderly care centres, where the law
    /// requires a care licence. Makes claim C6 required for Verified. A steward can change it later.
    function listCause(string calldata uri, address payout, bytes32 category, bytes32 frontend, bool needsCareLicence)
        external
        returns (uint256 causeId)
    {
        if (bytes(uri).length == 0 || payout == address(0)) revert BadInput();
        causeId = ++causeCount;
        _causes[causeId] = Cause({
            owner: msg.sender,
            payout: payout,
            status: Status.Listed,
            listedAt: uint64(block.timestamp),
            verifiedAt: 0,
            category: category,
            uri: uri
        });
        emit CauseListed(causeId, msg.sender, category, payout, uri, frontend);
        if (needsCareLicence) {
            requiresCareLicence[causeId] = true;
            emit RequiresCareLicenceSet(causeId, true);
        }
    }

    /// @notice Point the cause at a new profile version. Old versions stay readable on IPFS.
    function updateCause(uint256 causeId, string calldata uri) external onlyCauseOwner(causeId) {
        if (bytes(uri).length == 0) revert BadInput();
        _causes[causeId].uri = uri;
        emit CauseUpdated(causeId, uri);
    }

    /// @notice Change the deposit address. The "deposit address belongs to the organisation"
    /// claim (C3) goes back to Open, and a verified cause drops back to Listed until C3 is
    /// verified again. So a stolen owner key cannot quietly redirect gifts and keep the badge.
    function setPayout(uint256 causeId, address payout) external onlyCauseOwner(causeId) {
        if (payout == address(0)) revert BadInput();
        Cause storage c = _causes[causeId];
        c.payout = payout;
        emit PayoutChanged(causeId, payout);
        claimOutcome[causeId][ClaimType.C3_Payout] = ClaimOutcome.Open;
        if (c.status == Status.Verified) {
            _setStatus(causeId, Status.Listed, "payout changed, needs re-verification");
        }
    }

    function transferCauseOwnership(uint256 causeId, address newOwner) external onlyCauseOwner(causeId) {
        if (newOwner == address(0)) revert BadInput();
        _causes[causeId].owner = newOwner;
        emit OwnerChanged(causeId, newOwner);
    }

    /// @notice The owner can close a cause. It takes no further activity.
    function closeCause(uint256 causeId) external onlyCauseOwner(causeId) {
        Status s = _status(causeId);
        if (s == Status.Closed) revert WrongStatus(s);
        _setStatus(causeId, Status.Closed, "closed by owner");
    }

    // ------------------------------------------------------------------ verification

    /// @notice Record the final outcome of one claim. The finaliser only submits results that
    /// anyone can recompute from the published votes; `resultRoot` is the Merkle root of those
    /// inputs. The cause's status follows automatically:
    ///  - Listed and every required claim is now Verified: the cause becomes Verified.
    ///  - Verified and a required claim is set to NotVerified: the cause is Suspended.
    ///  - Verified and a required claim is reopened (Open or NeedsMore): the cause drops to
    ///    Listed, like a payout change. It is not a fail.
    ///  - Suspended: the outcome is recorded; a steward's `reinstate` re-evaluates it.
    ///  - Closed: refused.
    function finaliseClaim(uint256 causeId, ClaimType claimType, ClaimOutcome outcome, bytes32 resultRoot) external onlyFinaliser {
        Status s = _status(causeId);
        if (s == Status.Closed) revert WrongStatus(s);
        claimOutcome[causeId][claimType] = outcome;
        emit ClaimFinalised(causeId, claimType, outcome, resultRoot, msg.sender);

        if (!isRequired(causeId, claimType)) return;
        if (s == Status.Listed) {
            if (outcome == ClaimOutcome.Verified && requiredClaimsMet(causeId)) _verify(causeId);
        } else if (s == Status.Verified) {
            if (outcome == ClaimOutcome.NotVerified) {
                _setStatus(causeId, Status.Suspended, "required claim overturned");
            } else if (outcome != ClaimOutcome.Verified) {
                _setStatus(causeId, Status.Listed, "required claim reopened");
            }
        }
    }

    /// @notice Pause a cause on a credible report of fraud, harm or a legal notice.
    function suspend(uint256 causeId, string calldata reason) external onlySteward {
        Status s = _status(causeId);
        if (s != Status.Listed && s != Status.Verified) revert WrongStatus(s);
        _setStatus(causeId, Status.Suspended, reason);
    }

    /// @notice Lift a suspension. The cause goes back to Listed, and straight on to Verified if
    /// every required claim still holds.
    function reinstate(uint256 causeId) external onlySteward {
        Status s = _status(causeId);
        if (s != Status.Suspended) revert WrongStatus(s);
        _setStatus(causeId, Status.Listed, "reinstated by steward");
        if (requiredClaimsMet(causeId)) _verify(causeId);
    }

    /// @notice Close a cause for good, with a written reason.
    function closeBySteward(uint256 causeId, string calldata reason) external onlySteward {
        Status s = _status(causeId);
        if (s == Status.Closed) revert WrongStatus(s);
        _setStatus(causeId, Status.Closed, reason);
    }

    /// @notice Flag or unflag a cause as needing a care licence (claim C6). The status is
    /// re-evaluated: a Verified cause that now needs an unverified C6 drops to Listed; a Listed
    /// cause whose required claims are now all met becomes Verified.
    function setRequiresCareLicence(uint256 causeId, bool on) external onlySteward {
        Status s = _status(causeId);
        requiresCareLicence[causeId] = on;
        emit RequiresCareLicenceSet(causeId, on);
        if (s == Status.Verified && !requiredClaimsMet(causeId)) {
            _setStatus(causeId, Status.Listed, "care licence now required");
        } else if (s == Status.Listed && requiredClaimsMet(causeId)) {
            _verify(causeId);
        }
    }

    /// @notice Anyone can add evidence about a cause: a site visit, a document check, a news link,
    /// a concern. Each front end decides whose attestations it trusts. Nothing here moves money.
    function attest(uint256 causeId, bytes32 kind, string calldata uri) external {
        _status(causeId);
        emit Attested(causeId, msg.sender, kind, uri);
    }

    // ------------------------------------------------------------------ tracking

    /// @notice Post progress: kind = "report", "receipt", "photo", "stream" (a live stream link) ...
    function postProgress(uint256 causeId, bytes32 kind, string calldata uri) external onlyCauseOwner(causeId) {
        if (bytes(uri).length == 0) revert BadInput();
        emit ProgressPosted(causeId, kind, uri);
    }

    /// @notice Ask for non-money help: volunteers, items, skills, translation.
    function postNeed(uint256 causeId, string calldata uri) external onlyCauseOwner(causeId) returns (uint256 needId) {
        if (bytes(uri).length == 0) revert BadInput();
        needId = ++needCount;
        needs[needId] = Need({causeId: causeId, open: true, uri: uri});
        emit NeedPosted(needId, causeId, uri);
    }

    /// @notice Offer to help with a need. Anyone can.
    function pledge(uint256 needId, string calldata uri) external {
        Need storage n = needs[needId];
        if (n.causeId == 0) revert NoSuchNeed();
        if (!n.open) revert BadInput();
        emit Pledged(needId, msg.sender, uri);
    }

    /// @notice The cause marks a need met, crediting a helper (or address(0) for none).
    function closeNeed(uint256 needId, address helper) external {
        Need storage n = needs[needId];
        if (n.causeId == 0) revert NoSuchNeed();
        if (_causes[n.causeId].owner != msg.sender) revert NotOwner();
        n.open = false;
        emit NeedClosed(needId, helper);
    }

    // ------------------------------------------------------------------ council

    function setFinaliser(address who, bool on) external onlyCouncil {
        isFinaliser[who] = on;
        emit FinaliserSet(who, on);
    }

    function setSteward(address who, bool on) external onlyCouncil {
        isSteward[who] = on;
        emit StewardSet(who, on);
    }

    function setCouncil(address next) external onlyCouncil {
        if (next == address(0)) revert BadInput();
        council = next;
        emit CouncilChanged(next);
    }

    // ------------------------------------------------------------------ views

    function getCause(uint256 causeId) external view returns (Cause memory) {
        if (_causes[causeId].status == Status.None) revert NoSuchCause();
        return _causes[causeId];
    }

    /// @notice Whether a claim counts towards Verified for this cause: C1 to C4 always, C6 when flagged.
    function isRequired(uint256 causeId, ClaimType c) public view returns (bool) {
        if (c == ClaimType.C6_CareLicence) return requiresCareLicence[causeId];
        return c == ClaimType.C1_Registered || c == ClaimType.C2_Current || c == ClaimType.C3_Payout || c == ClaimType.C4_WorkReal;
    }

    /// @notice True when every required claim is Verified.
    function requiredClaimsMet(uint256 causeId) public view returns (bool) {
        (uint8 done, uint8 total) = verifiedRequiredCount(causeId);
        return done == total;
    }

    /// @notice How many required claims are Verified, out of how many are required. Front ends
    /// show this as "2 of 4".
    function verifiedRequiredCount(uint256 causeId) public view returns (uint8 done, uint8 total) {
        mapping(ClaimType => ClaimOutcome) storage o = claimOutcome[causeId];
        total = 4;
        if (o[ClaimType.C1_Registered] == ClaimOutcome.Verified) done++;
        if (o[ClaimType.C2_Current] == ClaimOutcome.Verified) done++;
        if (o[ClaimType.C3_Payout] == ClaimOutcome.Verified) done++;
        if (o[ClaimType.C4_WorkReal] == ClaimOutcome.Verified) done++;
        if (requiresCareLicence[causeId]) {
            total = 5;
            if (o[ClaimType.C6_CareLicence] == ClaimOutcome.Verified) done++;
        }
    }

    // ------------------------------------------------------------------ internals

    function _status(uint256 causeId) private view returns (Status s) {
        s = _causes[causeId].status;
        if (s == Status.None) revert NoSuchCause();
    }

    function _verify(uint256 causeId) private {
        _causes[causeId].verifiedAt = uint64(block.timestamp);
        _setStatus(causeId, Status.Verified, "all required claims verified");
    }

    function _setStatus(uint256 causeId, Status next, string memory note) private {
        _causes[causeId].status = next;
        emit StatusChanged(causeId, next, msg.sender, note);
    }
}
