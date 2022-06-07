// SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

interface ISwap {
    event Treasury(address indexed _oldTreasury, address indexed _newTreasury);
    event Verifier(address indexed _oldVerifier, address indexed _newVerifier);
    event Swap(
        uint256 indexed _eventID,
        address indexed _buyer,
        address indexed _holder,
        uint256 _inAmt,
        uint256 _outAmt,
        address _inToken,
        address _outToken
    );

    struct Allocation {
        uint256 availableAmt;
        bool locked;
    }

    function updateVerifier(address _newVerifier) external;

    function updateTreasury(address _newTreasury) external;

    function swap(
        uint256 _eventID,
        uint256 _inAmt,
        uint256 _outAmt,
        uint256 _maxAllocation,
        address _inToken,
        address _outToken,
        address _holder,
        bytes calldata _signature
    ) external payable;
}
