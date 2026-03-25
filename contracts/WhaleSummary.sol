// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {SomniaEventHandler} from "@somnia-chain/reactivity-contracts/contracts/SomniaEventHandler.sol";
import {SomniaExtensions} from "@somnia-chain/reactivity-contracts/contracts/interfaces/ISomniaReactivityPrecompile.sol";

/// @title WhaleSummary - Periodic on-chain whale activity aggregator
/// @notice Uses BlockTick reactivity to compute rolling summaries of whale activity
/// @dev Receives two types of reactive events:
///   1. WhaleAlert from WhaleHandler (event subscription with emitter filter)
///   2. BlockTick from the Somnia Reactivity Precompile (system event)
contract WhaleSummary is SomniaEventHandler {
    address public owner;
    address public whaleHandler;

    // WhaleAlert(address indexed token, address indexed from, address indexed to, uint256 amount, uint64 blockNumber)
    bytes32 public constant WHALE_ALERT_TOPIC =
        keccak256("WhaleAlert(address,address,address,uint256,uint64)");

    // BlockTick(uint64 indexed blockNumber) — emitted by the precompile
    bytes32 public constant BLOCK_TICK_TOPIC =
        keccak256("BlockTick(uint64)");

    // --- Rolling window stats ---
    struct WindowStats {
        uint256 totalVolume;
        uint256 transferCount;
        address topWhaleAddress;
        uint256 topWhaleAmount;
        uint64 windowStartBlock;
        uint64 windowEndBlock;
        uint256 timestamp;
    }

    // Last 20 summary windows
    WindowStats[20] public summaryHistory;
    uint256 public summaryCount;

    // Current window accumulators
    uint256 public currentVolume;
    uint256 public currentTransferCount;
    address public currentTopWhale;
    uint256 public currentTopAmount;
    uint64 public currentWindowStart;

    // Track per-address volume in current window for leaderboard
    mapping(address => uint256) public currentWindowVolume;
    address[10] public topAddresses;
    uint256 public topAddressCount;

    event SummaryUpdated(
        uint256 indexed summaryIndex,
        uint256 totalVolume,
        uint256 transferCount,
        address topWhaleAddress,
        uint256 topWhaleAmount,
        uint64 windowStartBlock,
        uint64 windowEndBlock
    );

    event WindowAccumulated(
        address indexed from,
        uint256 amount,
        uint256 windowVolume,
        uint256 windowCount
    );

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor(address _whaleHandler) {
        owner = msg.sender;
        whaleHandler = _whaleHandler;
        currentWindowStart = uint64(block.number);
    }

    function setWhaleHandler(address _whaleHandler) external onlyOwner {
        whaleHandler = _whaleHandler;
    }

    function _onEvent(
        address emitter,
        bytes32[] calldata eventTopics,
        bytes calldata data
    ) internal override {
        if (eventTopics.length == 0) return;

        // Handle WhaleAlert events from the WhaleHandler contract
        if (
            emitter == whaleHandler &&
            eventTopics[0] == WHALE_ALERT_TOPIC &&
            eventTopics.length >= 4
        ) {
            _accumulateWhaleAlert(eventTopics, data);
            return;
        }

        // Handle BlockTick from the Somnia Reactivity Precompile (address 0x0100)
        if (
            emitter == SomniaExtensions.SOMNIA_REACTIVITY_PRECOMPILE_ADDRESS &&
            eventTopics[0] == BLOCK_TICK_TOPIC
        ) {
            _finalizeSummaryWindow();
            return;
        }
    }

    function _accumulateWhaleAlert(
        bytes32[] calldata eventTopics,
        bytes calldata data
    ) internal {
        address from = address(uint160(uint256(eventTopics[2])));
        (uint256 amount, ) = abi.decode(data, (uint256, uint64));

        currentVolume += amount;
        currentTransferCount++;

        // Track per-address volume
        currentWindowVolume[from] += amount;

        // Update top whale if this address now leads
        if (currentWindowVolume[from] > currentTopAmount) {
            currentTopWhale = from;
            currentTopAmount = currentWindowVolume[from];
        }

        // Track unique top addresses (simple approach: keep up to 10)
        _trackAddress(from);

        emit WindowAccumulated(from, amount, currentVolume, currentTransferCount);
    }

    function _trackAddress(address addr) internal {
        for (uint256 i = 0; i < topAddressCount; i++) {
            if (topAddresses[i] == addr) return;
        }
        if (topAddressCount < 10) {
            topAddresses[topAddressCount] = addr;
            topAddressCount++;
        }
    }

    function _finalizeSummaryWindow() internal {
        if (currentTransferCount == 0) {
            currentWindowStart = uint64(block.number);
            return;
        }

        uint256 idx = summaryCount % 20;
        summaryHistory[idx] = WindowStats({
            totalVolume: currentVolume,
            transferCount: currentTransferCount,
            topWhaleAddress: currentTopWhale,
            topWhaleAmount: currentTopAmount,
            windowStartBlock: currentWindowStart,
            windowEndBlock: uint64(block.number),
            timestamp: block.timestamp
        });

        emit SummaryUpdated(
            summaryCount,
            currentVolume,
            currentTransferCount,
            currentTopWhale,
            currentTopAmount,
            currentWindowStart,
            uint64(block.number)
        );

        summaryCount++;

        // Reset accumulators
        for (uint256 i = 0; i < topAddressCount; i++) {
            currentWindowVolume[topAddresses[i]] = 0;
            topAddresses[i] = address(0);
        }
        currentVolume = 0;
        currentTransferCount = 0;
        currentTopWhale = address(0);
        currentTopAmount = 0;
        topAddressCount = 0;
        currentWindowStart = uint64(block.number);
    }

    /// @notice Get recent summary windows
    function getRecentSummaries(uint256 count)
        external
        view
        returns (WindowStats[] memory)
    {
        if (count > 20) count = 20;
        if (count > summaryCount) count = summaryCount;

        WindowStats[] memory result = new WindowStats[](count);
        for (uint256 i = 0; i < count; i++) {
            uint256 idx = (summaryCount - count + i) % 20;
            result[i] = summaryHistory[idx];
        }
        return result;
    }

    /// @notice Get current window stats (live, not yet finalized)
    function getCurrentWindowStats()
        external
        view
        returns (
            uint256 volume,
            uint256 transferCount,
            address topWhale,
            uint256 topAmount,
            uint64 windowStart
        )
    {
        return (currentVolume, currentTransferCount, currentTopWhale, currentTopAmount, currentWindowStart);
    }
}
