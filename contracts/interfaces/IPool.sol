// SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

interface IPool {
    event TokenLock(address indexed wallet, uint256 oldAmt, uint256 newAmt);
    event TokenWithdrawal(
        address indexed wallet,
        uint256 oldAmt,
        uint256 newAmt
    );

    function lock(uint256 _amount) external;

    function withdraw(uint256 _amount) external;

    function getLockedAmounts(address[] calldata _users)
        external
        view
        returns (uint256[] memory);
}
