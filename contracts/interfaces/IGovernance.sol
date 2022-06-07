// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/IAccessControlEnumerable.sol";

interface IGovernance is IAccessControlEnumerable {
    function treasury() external view returns (address);

    function verifier() external view returns (address);

    function manager() external view returns (address);

    function acceptedPayments(address _token) external view returns (bool);
}
