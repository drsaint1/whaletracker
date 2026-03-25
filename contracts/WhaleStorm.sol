// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {SomniaEventHandler} from "@somnia-chain/reactivity-contracts/contracts/SomniaEventHandler.sol";

/// @title WhaleStorm - Reactive whale activity spike detector
/// @notice Subscribes to WhaleAlert events from WhaleHandler.
///         Tracks rolling volume and increments stormCount when volume
///         crosses the storm threshold within a window — demonstrating
///         a 3rd reactive contract in the pipeline.
contract WhaleStorm is SomniaEventHandler {
    address public owner;
    address public whaleHandler;

    // WhaleAlert(address indexed token, address indexed from, address indexed to, uint256 amount, uint64 blockNumber)
    bytes32 public constant WHALE_ALERT_TOPIC =
        keccak256("WhaleAlert(address,address,address,uint256,uint64)");

    // Storm detection
    uint256 public stormThreshold;    // volume threshold to trigger a storm
    uint256 public windowVolume;      // accumulated volume in current window
    uint256 public windowAlertCount;  // alerts in current window
    uint256 public stormCount;        // total storms detected
    uint64  public lastStormBlock;    // block of last storm
    uint64  public windowStartBlock;  // current window start

    event StormDetected(
        uint256 indexed stormIndex,
        uint256 windowVolume,
        uint256 alertCount,
        uint64  blockNumber
    );

    event AlertAccumulated(
        uint256 amount,
        uint256 windowVolume,
        uint256 windowAlertCount
    );

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor(address _whaleHandler, uint256 _stormThreshold) {
        owner = msg.sender;
        whaleHandler = _whaleHandler;
        stormThreshold = _stormThreshold;
        windowStartBlock = uint64(block.number);
    }

    function setStormThreshold(uint256 _newThreshold) external onlyOwner {
        stormThreshold = _newThreshold;
    }

    function _onEvent(
        address emitter,
        bytes32[] calldata eventTopics,
        bytes calldata data
    ) internal override {
        if (emitter != whaleHandler) return;
        if (eventTopics.length < 4) return;
        if (eventTopics[0] != WHALE_ALERT_TOPIC) return;

        (uint256 amount, ) = abi.decode(data, (uint256, uint64));

        windowVolume += amount;
        windowAlertCount++;

        emit AlertAccumulated(amount, windowVolume, windowAlertCount);

        // Check if storm threshold crossed
        if (windowVolume >= stormThreshold) {
            stormCount++;
            lastStormBlock = uint64(block.number);

            emit StormDetected(stormCount, windowVolume, windowAlertCount, uint64(block.number));

            // Reset window
            windowVolume = 0;
            windowAlertCount = 0;
            windowStartBlock = uint64(block.number);
        }
    }
}
